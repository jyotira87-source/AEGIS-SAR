"""
PROJECT AEGIS-SAR (SIH26143)
sar_engine.py — Synthetic Sentinel-1 C-band oil slick segmentation engine.

Generates realistic SAR dark-patch morphology for offshore Indian sectors:
slick core + sheen periphery multi-polygon GeoJSON, quantitative shape metrics
(area, perimeter, circularity index, major-axis orientation), radar contrast
attenuation, and an oceanographic drift vector built from tidal + wind forcing.
"""

from __future__ import annotations

import math
import random
from typing import Dict, List, Tuple

from models import utc_now_iso


# ---------------------------------------------------------------------------
# Coordinate helpers (WGS84, equirectangular approximations sufficient for the
# operational zones < 0.5 deg span).
# ---------------------------------------------------------------------------
def _deg_to_km(deg_lat: float, deg_lon: float, ref_lat: float) -> Tuple[float, float]:
    """Convert a lat/lon delta into (km_east, km_north)."""
    km_per_deg_lat = 111.32
    km_per_deg_lon = 111.32 * math.cos(math.radians(ref_lat))
    return deg_lon * km_per_deg_lon, deg_lat * km_per_deg_lat


def _km_to_deg(x_km: float, y_km: float, ref_lat: float) -> Tuple[float, float]:
    """Inverse of _deg_to_km."""
    km_per_deg_lat = 111.32
    km_per_deg_lon = 111.32 * math.cos(math.radians(ref_lat))
    return y_km / km_per_deg_lat, x_km / km_per_deg_lon


def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _bearing_deg(lat1, lon1, lat2, lon2) -> float:
    """Initial great-circle bearing from point 1 to point 2 (0-360)."""
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    x = math.sin(dl) * math.cos(p2)
    y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(x, y)) + 360.0) % 360.0


def _radial_point(lat: float, lon: float, dist_km: float, bearing_deg: float) -> Tuple[float, float]:
    """Destination WGS84 point given origin, distance (km) and bearing (deg)."""
    r = 6371.0088
    p1 = math.radians(lat)
    l1 = math.radians(lon)
    theta = math.radians(bearing_deg)
    d = dist_km / r

    p2 = math.asin(
        math.sin(p1) * math.cos(d) + math.cos(p1) * math.sin(d) * math.cos(theta)
    )
    l2 = l1 + math.atan2(
        math.sin(theta) * math.sin(d) * math.cos(p1),
        math.cos(d) - math.sin(p1) * math.sin(p2),
    )
    return math.degrees(p2), ((math.degrees(l2) + 540.0) % 360.0) - 180.0


class SAREngine:
    """Synthetic radar slick generator for Southern-Asia maritime sectors."""

    SECTORS = [
        {
            "id": "mumbai_high_offshore",
            "name": "Mumbai High Offshore Oil Fields",
            "lat": 19.4167,
            "lon": 71.3833,
            "jurisdiction": "Western Offshore / Arabian Sea",
            "risk_rating": "Critical - active crude production",
        },
        {
            "id": "gulf_of_khambhat",
            "name": "Gulf of Khambhat",
            "lat": 21.3120,
            "lon": 72.3610,
            "jurisdiction": "Gujarat Coast / Arabian Sea",
            "risk_rating": "High - tanker lane + tidal flats",
        },
        {
            "id": "chennai_port_corridor",
            "name": "Chennai Port Corridor",
            "lat": 13.0827,
            "lon": 80.2707,
            "jurisdiction": "Tamil Nadu / Bay of Bengal",
            "risk_rating": "High - dense container traffic",
        },
        {
            "id": "paradip_anchorage",
            "name": "Paradip Anchorage & Approaches",
            "lat": 20.2644,
            "lon": 86.6712,
            "jurisdiction": "Odisha / Bay of Bengal",
            "risk_rating": "High - crude terminal + anchorage",
        },
    ]

    # Range specifications drawn from the mission brief.
    AREA_RANGE_KM2 = (4.2, 28.5)
    CONTRAST_RANGE_DB = (-8.2, -3.5)
    SLICING_ALGORITHM = "U-Net Deep Segmentation + Morphological Edge-Flow"

    # ------------------------------------------------------------------
    def __init__(self, seed: int | None = None) -> None:
        self._rng = random.Random(seed)

    # ------------------------------------------------------------------
    def list_sectors(self) -> List[Dict]:
        return [dict(s) for s in self.SECTORS]

    def resolve_sector(self, sector_id: str) -> Dict | None:
        for s in self.SECTORS:
            if s["id"] == sector_id:
                return dict(s)
        return None
# ------------------------------------------------------------------
    def synthetic_slick(self, lat: float, lon: float, seed: int | None = None) -> Dict:
        """
        Generate a full synthetic SAR slick observation anchored at (lat, lon)
        with drift applied from the acquisition instant.
        """
        rng = random.Random(seed if seed is not None else self._rng.randint(0, 2 ** 31))

        # --- 1 | Area & core/sheen split ----------------------------------
        area_km2 = rng.uniform(*self.AREA_RANGE_KM2)
        core_frac = rng.uniform(0.45, 0.62)  # dense crude core fraction
        core_km2 = area_km2 * core_frac
        sheen_km2 = area_km2 - core_km2

        # --- 2 | Shape geometry -------------------------------------------
        # Elliptical approximation perturbed radially to mimic natural slicks.
        major_axis_km = 2.0 * math.sqrt(area_km2 / math.pi)
        eccentricity = rng.uniform(0.35, 0.75)
        minor_axis_km = major_axis_km * math.sqrt(1.0 - eccentricity ** 2)
        orientation_deg = rng.uniform(0.0, 180.0)  # major axis orientation

        # Perimeter via Ramanujan approximation for the ellipse.
        a2, b2 = major_axis_km / 2.0, minor_axis_km / 2.0
        h = ((a2 - b2) ** 2) / ((a2 + b2) ** 2)
        perimeter_km = math.pi * (a2 + b2) * (1 + (3 * h) / (10 + math.sqrt(4 - 3 * h)))
        circularity = (4 * math.pi * area_km2) / (perimeter_km ** 2)

        # --- 3 | Radar contrast -------------------------------------------
        mean_contrast_db = rng.uniform(*self.CONTRAST_RANGE_DB)
        max_contrast_db = mean_contrast_db - rng.uniform(0.8, 1.9)  # core darker

        # --- 4 | Drift vector (tidal + wind) ------------------------------
        wind_speed = rng.uniform(6.0, 22.0)
        wind_bearing = rng.uniform(0.0, 360.0)
        current_speed = rng.uniform(0.6, 2.4)
        current_bearing = rng.uniform(0.0, 360.0)

        # Vector sum of forcing (bearing -> (east, north)).
        def _vectorize(speed, bearing):
            br = math.radians(bearing)
            return speed * math.sin(br), speed * math.cos(br)

        wx, wy = _vectorize(wind_speed, wind_bearing)
        cx, cy = _vectorize(current_speed, current_bearing)
        rx, ry = 0.80 * wx / 100.0 + 0.65 * cx, 0.80 * wy / 100.0 + 0.65 * cy
        resultant_speed = math.hypot(rx, ry)
        resultant_bearing = (math.degrees(math.atan2(rx, ry)) + 360.0) % 360.0

        # --- 5 | Drift-displaced slick centroid ---------------------------
        drift_dist_km = resultant_speed * rng.uniform(1.2, 2.0)  # drift hours
        slick_lat, slick_lon = _radial_point(lat, lon, drift_dist_km, resultant_bearing)

        # --- 6 | Multi-polygon contours -----------------------------------
        contours = self._build_contours(
            slick_lat, slick_lon, major_axis_km, minor_axis_km,
            orientation_deg, core_frac, rng,
        )

        return {
            "area_sq_km": round(area_km2, 3),
            "perimeter_km": round(perimeter_km, 3),
            "circularity_index": round(circularity, 4),
            "major_axis_orientation_deg": round(orientation_deg, 1),
            "mean_contrast_dB": round(mean_contrast_db, 2),
            "max_attenuation_dB": round(max_contrast_db, 2),
            "core_area_sq_km": round(core_km2, 3),
            "sheen_area_sq_km": round(sheen_km2, 3),
            "centroid_lat": round(slick_lat, 6),
            "centroid_lon": round(slick_lon, 6),
            "slicing_algorithm": self.SLICING_ALGORITHM,
            "drift": {
                "current_speed_knots": round(current_speed, 2),
                "current_bearing_deg": round(current_bearing, 1),
                "wind_speed_knots": round(wind_speed, 2),
                "wind_bearing_deg": round(wind_bearing, 1),
                "tidal_stage": "flooding" if rng.random() < 0.5 else "ebbing",
                "resultant_speed_knots": round(resultant_speed, 3),
                "resultant_bearing_deg": round(resultant_bearing, 1),
            },
            "contours": contours,
        }
# ------------------------------------------------------------------
    def _build_contours(self, lat, lon, major_km, minor_km, orientation, core_frac, rng):
        """
        Build multi-polygon GeoJSON contours:
          1. "core"   — high-density crude slick (inner ellipse, perturbed)
          2. "sheen"  — low-density peripheral sheen (outer ellipse, perturbed)
        Coordinates are [lon, lat] GeoJSON rings.
        """
        rad = math.radians(orientation)
        cos_o, sin_o = math.cos(rad), math.sin(rad)

        def _ring(axis_a_km, axis_b_km, wobble):
            pts = []
            n = 40
            for i in range(n):
                theta = 2 * math.pi * i / n
                r_pert = 1.0 + wobble * (rng.random() - 0.5) * 2.0
                ex = (axis_a_km / 2.0) * math.cos(theta) * r_pert
                ny = (axis_b_km / 2.0) * math.sin(theta) * r_pert
                gx = ex * cos_o - ny * sin_o  # rotate to orientation
                gy = ex * sin_o + ny * cos_o
                dlat, dlon = _km_to_deg(gx, gy, lat)
                pts.append([round(lon + dlon, 6), round(lat + dlat, 6)])
            pts.append(pts[0])  # close ring
            return pts

        core_ring = _ring(major_km, minor_km, wobble=0.10)
        # Sheen polygon encloses the core with a relative expansion.
        expand = (1.0 / math.sqrt(max(core_frac, 0.05))) * 1.15
        sheen_ring = _ring(major_km * expand, minor_km * expand, wobble=0.16)

        return {
            "type": "FeatureCollection",
            "crs": {
                "type": "name",
                "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"},
            },
            "features": [
                {
                    "type": "Feature",
                    "properties": {
                        "layer": "slick_core",
                        "density": "high-density crude",
                        "estimated_thickness_mm": round(rng.uniform(1.2, 4.5), 2),
                    },
                    "geometry": {"type": "Polygon", "coordinates": [core_ring]},
                },
                {
                    "type": "Feature",
                    "properties": {
                        "layer": "slick_sheen",
                        "density": "low-density sheen",
                        "estimated_thickness_mm": round(rng.uniform(0.1, 0.9), 2),
                    },
                    "geometry": {"type": "Polygon", "coordinates": [sheen_ring]},
                },
            ],
        }

    # ------------------------------------------------------------------
    @staticmethod
    def telemetry(acquisition_time_utc: str | None = None) -> Dict:
        """Simulated Sentinel-1 C-band acquisition metadata."""
        return {
            "satellite": "Sentinel-1",
            "sensor_mode": "IW",
            "polarizations": ["VV", "VH"],
            "acquisition_time_utc": acquisition_time_utc or utc_now_iso(),
            "look_angle_degrees": round(29.1 + (random.random() - 0.5) * 6.0, 2),
            "range_resolution_m": 2.7,
            "azimuth_resolution_m": 11.9,
            "incidence_angle_deg": round(30.7 + (random.random() - 0.5) * 6.0, 2),
            "orbit_direction": random.choice(["ascending", "descending"]),
        }