"""
PROJECT AEGIS-SAR (SIH26143)
vessel_state.py — Real-time vessel state management with high-fidelity
maritime simulation.

Maintains persistent in-memory state for the live fleet: MMSI-anchored vessel
records, great-circle dead-reckoning physics, 24-hour breadcrumb trails,
anchoring / mooring / port-approach behaviour, AIS transponder dropout
("dark vessels"), and spatial correlation of historical tracks against SAR
slick polygons.

The simulator is the deterministic fallback for the aisstream.io live feed
(see ais_feed.py) and emits the exact same VesselPosition wire format.
"""

from __future__ import annotations

import math
import random
import time
from collections import deque
from typing import Any, Dict, List, Optional

from models import NavigationStatus, VesselType
from sar_engine import _haversine_km, _radial_point

# ---------------------------------------------------------------------------
# Maritime geography — real choke points, ports and fleet demographics
# ---------------------------------------------------------------------------
CHOKE_POINTS = [
    {"name": "MUMBAI_HIGH_OFFSHORE", "lat": 19.40, "lon": 71.35, "spread": 2.2, "weight": 16},
    {"name": "GULF_OF_KHAMBHAT", "lat": 20.90, "lon": 72.40, "spread": 1.4, "weight": 10},
    {"name": "STRAIT_OF_HORMUZ", "lat": 26.55, "lon": 56.45, "spread": 1.8, "weight": 14},
    {"name": "PERSIAN_GULF_APPROACHES", "lat": 25.60, "lon": 55.20, "spread": 2.6, "weight": 12},
    {"name": "GULF_OF_ADEN", "lat": 13.20, "lon": 47.60, "spread": 2.4, "weight": 10},
    {"name": "RED_SEA_SOUTHERN", "lat": 17.50, "lon": 40.20, "spread": 2.0, "weight": 8},
    {"name": "MALACCA_APPROACHES", "lat": 5.80, "lon": 95.30, "spread": 2.8, "weight": 14},
    {"name": "BAY_OF_BENGAL_LANES", "lat": 17.80, "lon": 86.40, "spread": 3.0, "weight": 12},
    {"name": "CHENNAI_OFFSHORE", "lat": 13.05, "lon": 80.25, "spread": 1.2, "weight": 8},
    {"name": "LACCADIVE_SEA_LANES", "lat": 10.30, "lon": 71.80, "spread": 2.6, "weight": 10},
    {"name": "SRI_LANKA_SOUTH", "lat": 5.90, "lon": 80.60, "spread": 2.2, "weight": 10},
    {"name": "PARADIP_ANCHORAGE", "lat": 20.25, "lon": 86.65, "spread": 1.0, "weight": 6},
]

PORTS = [
    "JNPT MUMBAI", "KANDLA", "MUNDRA", "KOCHI", "CHENNAI", "VISAKHAPATNAM",
    "PARADIP", "HALDIA", "MARMAGOA", "COLOMBO", "SINGAPORE", "JEBEL ALI",
    "FUJAIRAH", "CHITTAGONG",
]

NAME_A = ["MT", "MV", "FV", "MV", "MT", "MV", "MT", "MV"]
NAME_B = [
    "BLACK PEARL", "ARABIAN STAR", "ORCHID SUN", "SONA MACHHI", "GULF COAST",
    "BAY BRIDGE", "PRIDE OF GUJARAT", "SAHIL-1", "SAMUDRA SHAKTI",
    "INFINITE HORIZON", "CORAL TRIDENT", "IRON MERIDIAN", "SEA ANVIL",
    "MONSOON QUEEN", "NORTHERN LIGHT", "TIGER HARBOR", "SILK ROUTE",
    "BLUE SPECTRUM", "GRAND HYDRA", "EASTERN PEARL", "GOLDEN ANCHOR",
    "TITAN WAVE", "KRISHNA DELTA", "DEEP CURRENT",
]
FLAGS = ["India", "Singapore", "Liberia", "Panama", "Hong Kong",
         "Marshall Islands", "Malta", "Greece", "Cyprus", "Indonesia",
         "Malaysia", "UAE"]

TYPE_SPEED_RANGE = {
    VesselType.CARGO: (10.0, 16.0),
    VesselType.TANKER: (9.5, 14.5),
    VesselType.CONTAINER: (14.0, 20.5),
    VesselType.FISHING: (4.0, 9.0),
    VesselType.PASSENGER: (15.0, 22.0),
    VesselType.MILITARY: (18.0, 28.0),
    VesselType.TUG: (5.0, 9.5),
    VesselType.UNKNOWN: (7.0, 13.0),
}
TYPE_DIMENSIONS = {
    VesselType.CARGO: (140, 22, 9.5),
    VesselType.TANKER: (180, 30, 11.5),
    VesselType.CONTAINER: (220, 32, 12.5),
    VesselType.FISHING: (28, 7, 3.8),
    VesselType.PASSENGER: (160, 26, 7.5),
    VesselType.MILITARY: (110, 14, 5.5),
    VesselType.TUG: (30, 10, 5.0),
    VesselType.UNKNOWN: (90, 15, 6.0),
}
# Fleet composition weights (CARGO, TANKER, CONTAINER, FISHING, PASSENGER, MILITARY, TUG, UNKNOWN)
TYPE_WEIGHTS = [26, 22, 16, 14, 8, 4, 5, 5]

DARK_VESSEL_FRACTION = 0.022       # persistent non-broadcasting fraction
INTERMITTENT_FRACTION = 0.03       # transponder gap cycling fraction
ANCHOR_FRACTION = 0.18             # initially anchored/moored fraction


class VesselStateManager:
    """In-memory live fleet: physics tick, trails, filters and SAR correlation."""

    def __init__(
        self,
        vessel_count: int = 350,
        sample_seconds: float = 150.0,
        seed: Optional[int] = None,
    ) -> None:
        self._rng = random.Random(seed)
        self.vessel_count = vessel_count
        self.sample_seconds = sample_seconds
        self._vessels: Dict[int, Dict[str, Any]] = {}
        self._mmsi_counter = 419000000
        self._spawn_fleet()

    # ------------------------------------------------------------------
    # Fleet construction
    # ------------------------------------------------------------------
    def _spawn_fleet(self) -> None:
        rng = self._rng
        weights = [c["weight"] for c in CHOKE_POINTS]
        while len(self._vessels) < self.vessel_count:
            home = rng.choices(CHOKE_POINTS, weights=weights, k=1)[0]
            vtype = rng.choices(
                list(TYPE_SPEED_RANGE.keys()), weights=TYPE_WEIGHTS, k=1
            )[0]
            lo, hi = TYPE_SPEED_RANGE[vtype]
            length, width, draught = TYPE_DIMENSIONS[vtype]
            jitter = rng.uniform(0.85, 1.15)
            mmsi = self._mmsi_counter
            self._mmsi_counter += int(rng.uniform(7, 999))

            is_dark = rng.random() < DARK_VESSEL_FRACTION
            intermittent = (not is_dark) and rng.random() < INTERMITTENT_FRACTION
            anchored = rng.random() < ANCHOR_FRACTION

            cog = rng.uniform(0.0, 360.0)
            lat = home["lat"] + rng.uniform(-home["spread"], home["spread"])
            lon = home["lon"] + rng.uniform(-home["spread"], home["spread"])

            vessel = {
                "mmsi": mmsi,
                "ship_name": f"{rng.choice(NAME_A)} {rng.choice(NAME_B).upper()}",
                "imo": 9000000 + int(rng.uniform(100000, 999999)) if vtype != VesselType.FISHING else None,
                "callsign": "".join(
                    rng.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ") for _ in range(4)
                ) + str(rng.randint(10, 99)),
                "vessel_type": vtype,
                "home": home,
                "lat": lat,
                "lon": lon,
                "speed": 0.0 if anchored else rng.uniform(lo, hi),
                "cruise": rng.uniform(lo, hi),
                "cog": cog,
                "true_heading": cog,
                "nav_status": (
                    NavigationStatus.AT_ANCHOR if anchored else NavigationStatus.UNDER_WAY_ENGINE
                ),
                "destination": rng.choice(PORTS),
                "eta": "",
                "draught": round(draught * jitter, 1),
                "length": round(length * jitter, 1),
                "width": round(width * jitter, 1),
                "flag": rng.choice(FLAGS),
                "is_dark_vessel": is_dark,
                "intermittent": intermittent,
                "dropped_until": 0.0,
                "state_until": time.time() + rng.uniform(1200, 4800),
                "trail": deque(maxlen=576),
                "last_sample": 0.0,
            }
            self._vessels[mmsi] = vessel
            self._record_breadcrumb(vessel, force=True)
            self._seed_historical_trail(vessel)

    def resize(self, target_count: int) -> None:
        """Grow or shrink the simulated fleet (Settings → sim density slider)."""
        if target_count <= len(self._vessels):
            mmsis = sorted(self._vessels.keys())
            for mmsi in mmsis[target_count:]:
                del self._vessels[mmsi]
            self.vessel_count = target_count
            return
        while len(self._vessels) < target_count:
            saved = self.vessel_count
            self.vessel_count = len(self._vessels) + 1
            self._spawn_fleet()
            self.vessel_count = saved
        self.vessel_count = target_count

    def reseed(self, seed: Optional[int] = None) -> None:
        """Settings → RESET SIMULATION: re-spawn the fleet from a fresh RNG
        seed so every vessel gets new identities, positions and trails."""
        target_count = self.vessel_count
        self._rng = random.Random(seed)
        self._vessels = {}
        self._mmsi_counter = 419000000
        self.vessel_count = target_count
        self._spawn_fleet()

    # ------------------------------------------------------------------
    # Physics / behaviour tick
    # ------------------------------------------------------------------
    def tick(self, dt_seconds: float = 1.0) -> None:
        """Advance every vessel by dt_seconds of simulated time."""
        now = time.time()
        for v in self._vessels.values():
            # Occasional transponder dropout for intermittent broadcasters.
            if v["intermittent"] and now > v["dropped_until"] and self._rng.random() < 0.002:
                v["dropped_until"] = now + self._rng.uniform(45, 240)

            # Behavioural state transitions (anchor / moor / get underway).
            if now >= v["state_until"]:
                self._transition_state(v)

            if v["nav_status"] in (NavigationStatus.AT_ANCHOR, NavigationStatus.MOORED):
                # Swing on the anchor chain: minimal drift, no advance.
                v["cog"] = (v["cog"] + self._rng.uniform(-8, 8)) % 360.0
                v["true_heading"] = v["cog"]
                v["speed"] = max(0.0, v["speed"] - 0.2) + self._rng.uniform(0.0, 0.05)
                v["lat"] += self._rng.uniform(-0.00004, 0.00004)
                v["lon"] += self._rng.uniform(-0.00004, 0.00004)
            else:
                # Cruise dynamics: gentle rudder shifts + speed oscillation.
                v["cog"] = (v["cog"] + self._rng.uniform(-0.9, 0.9)) % 360.0
                target = v["cruise"]
                v["speed"] = min(
                    TYPE_SPEED_RANGE[v["vessel_type"]][1],
                    max(2.0, v["speed"] + (target - v["speed"]) * 0.05 + self._rng.uniform(-0.12, 0.12)),
                )
                # Keep vessels roaming around their home choke point.
                home = v["home"]
                dist_home = _haversine_km(v["lat"], v["lon"], home["lat"], home["lon"])
                limit_deg = home["spread"] * 111.32 * 1.35
                if dist_home > limit_deg:
                    bearing_home = self._bearing_deg(v["lat"], v["lon"], home["lat"], home["lon"])
                    v["cog"] = bearing_home + self._rng.uniform(-12, 12)

                self._advance(v, dt_seconds)
                v["true_heading"] = (v["cog"] + self._rng.uniform(-2, 2)) % 360.0

            self._record_breadcrumb(v)

    def _advance(self, v: Dict[str, Any], dt_seconds: float) -> None:
        """Great-circle dead-reckoning step for one underway vessel."""
        d_km = v["speed"] * 1.852 * dt_seconds / 3600.0
        if d_km <= 0:
            return
        lat, lon = _radial_point(v["lat"], v["lon"], d_km, v["cog"])
        v["lat"], v["lon"] = lat, lon

    def _transition_state(self, v: Dict[str, Any]) -> None:
        """Markov behavioural transitions: underway <-> anchored/moored."""
        rng = self._rng
        now = time.time()
        if v["nav_status"] == NavigationStatus.UNDER_WAY_ENGINE:
            if rng.random() < 0.35:
                v["nav_status"] = (
                    NavigationStatus.AT_ANCHOR if rng.random() < 0.7 else NavigationStatus.MOORED
                )
                v["destination"] = rng.choice(PORTS)
                v["state_until"] = now + rng.uniform(2400, 9000)
            else:
                v["state_until"] = now + rng.uniform(1200, 4200)
        else:
            v["nav_status"] = NavigationStatus.UNDER_WAY_ENGINE
            v["destination"] = rng.choice(PORTS)
            v["eta"] = self._format_eta(v["cruise"])
            v["state_until"] = now + rng.uniform(1800, 7200)

    @staticmethod
    def _bearing_deg(lat1, lon1, lat2, lon2) -> float:
        """Initial great-circle bearing from point 1 to point 2 (0-360)."""
        p1, p2 = math.radians(lat1), math.radians(lat2)
        dl = math.radians(lon2 - lon1)
        x = math.sin(dl) * math.cos(p2)
        y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
        return (math.degrees(math.atan2(x, y)) + 360.0) % 360.0

    @staticmethod
    def _format_eta(cruise_knots: float) -> str:
        """ETA string ~36 hours of steaming at the vessel's cruise speed."""
        import datetime as _dt
        arrival = _dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(hours=36.0)
        return arrival.strftime("%Y-%m-%d %H:%M UTC")

    def _seed_historical_trail(self, v: Dict[str, Any], points: int = 32) -> None:
        """Pre-fill the breadcrumb deque with back-dated, physically plausible
        positions so the TRACK TRAIL panel has a visible historical line
        immediately after a server start / RESET (not only after the simulator
        has run long enough to sample real breadcrumbs)."""
        now = time.time()
        trail = v["trail"]
        trail.clear()
        step_s = 300.0  # 5-minute back-dated samples
        # Underway vessels get a straight reciprocal track; anchored/moored
        # vessels get a short "approach & stop" so the line still renders.
        seed_speed = v["speed"] if v["speed"] >= 1 else 4.0
        try:
            for i in range(points, 0, -1):
                dt_hr = (i * step_s) / 3600.0
                d_km = min(seed_speed * 1.852 * dt_hr, 15.0)
                lat, lon = _radial_point(v["lat"], v["lon"], d_km, (v["cog"] + 180.0) % 360.0)
                trail.append(
                    {
                        "lat": round(lat, 5),
                        "lon": round(lon, 5),
                        "t": round(now - i * step_s, 1),
                        "sog": round(seed_speed, 1),
                    }
                )
            trail.append(
                {
                    "lat": round(v["lat"], 5),
                    "lon": round(v["lon"], 5),
                    "t": round(now, 1),
                    "sog": round(v["speed"], 1),
                }
            )
        except Exception:
            trail.clear()
        v["last_sample"] = now - self.sample_seconds  # resume breadcrumbs soon

    def _record_breadcrumb(self, v: Dict[str, Any], force: bool = False) -> None:
        """Decimated 24-hour trail sampling (one point per sample_seconds)."""
        now = time.time()
        if not force and (now - v["last_sample"]) < self.sample_seconds:
            return
        v["last_sample"] = now
        v["trail"].append(
            {
                "lat": round(v["lat"], 5),
                "lon": round(v["lon"], 5),
                "t": round(now, 1),
                "sog": round(v["speed"], 1),
            }
        )
        if not v["eta"]:
            v["eta"] = self._format_eta(v["cruise"])

    # ------------------------------------------------------------------
    # Wire serialization
    # ------------------------------------------------------------------
    def to_position(self, v: Dict[str, Any], now: Optional[float] = None) -> Dict[str, Any]:
        """Serialize one vessel into the VesselPosition wire format."""
        now = now if now is not None else time.time()
        return {
            "mmsi": v["mmsi"],
            "ship_name": v["ship_name"],
            "imo": v["imo"],
            "callsign": v["callsign"],
            "vessel_type": v["vessel_type"].value,
            "latitude": round(v["lat"], 5),
            "longitude": round(v["lon"], 5),
            "speed_knots": round(v["speed"], 1),
            "course_over_ground": round(v["cog"], 1),
            "true_heading": round(v["true_heading"], 1),
            "nav_status": v["nav_status"].value,
            "destination": v["destination"],
            "eta": v["eta"],
            "draught": v["draught"],
            "length": v["length"],
            "width": v["width"],
            "flag_country": v["flag"],
            "timestamp_epoch": round(now, 3),
            "is_dark_vessel": self._is_dark(v, now),
        }

    def _is_dark(self, v: Dict[str, Any], now: float) -> bool:
        """Persistent dark targets + cycling transponder gaps."""
        if v["is_dark_vessel"]:
            return True
        if v["intermittent"] and now < v["dropped_until"]:
            return True
        return False

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------
    def positions(self, flt: Optional[Any] = None) -> List[Dict[str, Any]]:
        """Filtered fleet snapshot. `flt` is a models.FilterSettings or None."""
        now = time.time()
        return [
            self.to_position(v, now)
            for v in self._vessels.values()
            if self._matches(self.to_position(v, now), flt)
        ]

    @staticmethod
    def _matches(pos: Dict[str, Any], flt: Optional[Any]) -> bool:
        if flt is None:
            return True
        if not (flt.min_speed <= pos["speed_knots"] <= flt.max_speed):
            return False
        if flt.vessel_types and pos["vessel_type"] not in flt.vessel_types:
            return False
        if flt.show_dark_targets_only and not pos["is_dark_vessel"]:
            return False
        if flt.search_query:
            q = flt.search_query.strip().lower()
            hay = " ".join(
                [str(pos["mmsi"]), pos["ship_name"], pos["callsign"],
                 pos["destination"], pos["flag_country"]]
            ).lower()
            if q not in hay:
                return False
        if flt.bbox and len(flt.bbox) == 4:
            s, w, n, e = flt.bbox
            if not (s <= pos["latitude"] <= n and w <= pos["longitude"] <= e):
                return False
        return True

    def vessel_detail(self, mmsi: int) -> Optional[Dict[str, Any]]:
        """Full dossier: live position + breadcrumb trail + distance run."""
        v = self._vessels.get(int(mmsi))
        if v is None:
            return None
        pos = self.to_position(v)
        trail = list(v["trail"])
        pos["trail"] = trail
        pos["trail_length_nm"] = round(
            sum(
                _haversine_km(a["lat"], a["lon"], b["lat"], b["lon"]) / 1.852
                for a, b in zip(trail[:-1], trail[1:])
            ),
            1,
        )
        pos["speed_profile_knots"] = [p["sog"] for p in trail[-48:]]
        return pos

    def stats(self, active_slicks: int = 0, feed_mode: str = "SIMULATION") -> Dict[str, Any]:
        now = time.time()
        dark = sum(1 for v in self._vessels.values() if self._is_dark(v, now))
        return {
            "total_ships": len(self._vessels),
            "dark_vessels": dark,
            "active_slicks": active_slicks,
            "feed_mode": feed_mode,
        }

    # ------------------------------------------------------------------
    # Live feed merge (aisstream.io reports upsert into the same store)
    # ------------------------------------------------------------------
    def upsert_external(self, position: Dict[str, Any]) -> None:
        """Merge one externally-sourced position report (live AIS feed)."""
        mmsi = int(position["mmsi"])
        v = self._vessels.get(mmsi)
        if v is None:
            v = self._vessels[mmsi] = {
                "mmsi": mmsi,
                "ship_name": position.get("ship_name", "UNKNOWN CONTACT"),
                "imo": position.get("imo"),
                "callsign": position.get("callsign", ""),
                "vessel_type": _coerce_type(position.get("vessel_type")),
                "home": {
                    "name": "LIVE_FEED_TRACK",
                    "lat": position["latitude"],
                    "lon": position["longitude"],
                    "spread": 0.0,
                    "weight": 0,
                },
                "cruise": position.get("speed_knots") or 12.0,
                "destination": position.get("destination", ""),
                "eta": position.get("eta", ""),
                "draught": position.get("draught", 6.0),
                "length": position.get("length", 120.0),
                "width": position.get("width", 18.0),
                "flag": position.get("flag_country", ""),
                "is_dark_vessel": bool(position.get("is_dark_vessel")),
                "intermittent": False,
                "dropped_until": 0.0,
                "state_until": time.time() + 3600.0,
                "trail": deque(maxlen=576),
                "last_sample": 0.0,
            }
        if not position.get("_patch_only"):
            v["lat"] = position["latitude"]
            v["lon"] = position["longitude"]
            v["speed"] = position.get("speed_knots", v["speed"])
            v["cog"] = position.get("course_over_ground", v["cog"])
            v["true_heading"] = position.get("true_heading", v["cog"])
            v["nav_status"] = _coerce_nav(position.get("nav_status"))
        v["ship_name"] = position.get("ship_name") or v["ship_name"]
        v["destination"] = position.get("destination") or v["destination"]
        self._record_breadcrumb(v)

    # ------------------------------------------------------------------
    # SAR slick correlation (backward-projected track analysis)
    # ------------------------------------------------------------------
    def correlate_slick(
        self,
        slick_polygon_lonlat: List[List[float]],
        lookback_hours: float = 6.0,
        radius_nm: float = 50.0,
        t0: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Correlate the live fleet against a SAR slick detection.

        For every vessel inside `radius_nm` of the slick, the historical track
        within [t0 - lookback, t0] is compared against the polygon (shapely):
        point-in-polygon membership plus minimum distance to the polygon
        boundary (Hausdorff-style trajectory metric). Confidence follows:

            C = (1 - D_min / D_threshold) * W_speed * W_heading

        Returns {"suspect_mmsi", "confidence", "min_distance_km", "candidates"}.
        """
        from shapely.geometry import LineString, Point, Polygon

        t0 = t0 if t0 is not None else time.time()
        window_start = t0 - lookback_hours * 3600.0
        try:
            poly = Polygon(slick_polygon_lonlat)
        except Exception:
            poly = None
        if poly is None or poly.is_empty:
            return {"suspect_mmsi": None, "confidence": 0.0, "min_distance_km": None, "candidates": []}

        centroid = poly.centroid
        radius_km = radius_nm * 1.852
        threshold_km = 5.0  # D_threshold — direct slick-contact envelope

        candidates = []
        for v in self._vessels.values():
            if _haversine_km(v["lat"], v["lon"], centroid.y, centroid.x) > radius_km:
                continue
            track = [
                p for p in v["trail"] if window_start <= p["t"] <= t0
            ]
            # Always include the live position as the newest track point.
            track = track + [{"lat": v["lat"], "lon": v["lon"], "t": t0, "sog": v["speed"]}]
            if not track:
                continue

            line = LineString([(p["lon"], p["lat"]) for p in track])
            min_deg = line.distance(poly.exterior)
            inside = poly.covers(line.interpolate(0, normalized=True)) or any(
                poly.covers(Point(p["lon"], p["lat"])) for p in track[:: max(1, len(track) // 8)]
            )
            min_km = min_deg * 111.32 * math.cos(math.radians(centroid.y))
            if inside:
                min_km = 0.0

            # Speed-discharge evidence: sustained slow steaming near the slick.
            sog_series = [p["sog"] for p in track]
            cruise = v["cruise"] or 12.0
            w_speed = 1.0 if (sog_series and min(sog_series) < max(4.0, cruise * 0.45)) else 0.55
            # Course persistence through the slick envelope (loitering pattern).
            w_heading = 1.0 if self._loitering(track) else 0.7

            proximity = max(0.0, 1.0 - (min_km / threshold_km))
            confidence = round(100.0 * proximity * w_speed * w_heading, 1)
            candidates.append(
                {
                    "mmsi": v["mmsi"],
                    "ship_name": v["ship_name"],
                    "vessel_type": v["vessel_type"].value,
                    "min_distance_km": round(min_km, 3),
                    "track_points": len(track),
                    "inside_polygon": bool(inside),
                    "confidence": confidence,
                }
            )

        candidates.sort(key=lambda c: c["confidence"], reverse=True)
        best = candidates[0] if candidates else None
        return {
            "suspect_mmsi": best["mmsi"] if best and best["confidence"] > 25 else None,
            "confidence": best["confidence"] if best else 0.0,
            "min_distance_km": best["min_distance_km"] if best else None,
            "candidates": candidates[:8],
        }

    @staticmethod
    def _loitering(track: List[Dict[str, Any]], zigzag_deg: float = 35.0) -> bool:
        """Detect loitering behaviour: high speed-variance along the track
        (cruise→drift oscillation typical of discharge operations)."""
        if len(track) < 6:
            return False
        delta_sum = 0.0
        for a, b in zip(track[:-1], track[1:]):
            d = abs((b["sog"] or 0) - (a["sog"] or 0))
            delta_sum += d
        return delta_sum / len(track) > 1.2


def _coerce_type(raw: Any) -> VesselType:
    """Map arbitrary feed type strings onto the VesselType enum."""
    if isinstance(raw, VesselType):
        return raw
    try:
        return VesselType(str(raw).upper().strip())
    except ValueError:
        text = str(raw).upper()
        for key, token in [
            ("TANK", "TANKER"), ("CARGO", "CARGO"), ("CONTAINER", "CONTAINER"),
            ("FISH", "FISHING"), ("PASSENG", "PASSENGER"), ("MIL", "MILITARY"),
            ("TUG", "TUG"),
        ]:
            if token in text:
                return VesselType(key if key in VesselType.__members__ else key)
        return VesselType.UNKNOWN


def _coerce_nav(raw: Any) -> NavigationStatus:
    """Map numeric AIS nav-status codes / strings onto the enum."""
    if isinstance(raw, NavigationStatus):
        return raw
    code_map = {
        0: NavigationStatus.UNDER_WAY_ENGINE,
        1: NavigationStatus.AT_ANCHOR,
        2: NavigationStatus.NOT_UNDER_COMMAND,
        3: NavigationStatus.RESTRICTED_MANOEUVRABILITY,
        5: NavigationStatus.MOORED,
        6: NavigationStatus.AGROUND,
        9: NavigationStatus.AIS_SART,
    }
    try:
        return code_map.get(int(raw), NavigationStatus.UNDER_WAY_ENGINE)
    except (TypeError, ValueError):
        try:
            return NavigationStatus(str(raw).upper().strip())
        except ValueError:
            return NavigationStatus.UNDER_WAY_ENGINE

