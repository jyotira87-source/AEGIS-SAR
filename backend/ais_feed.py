"""
PROJECT AEGIS-SAR (SIH26143)
ais_feed.py — Live AIS ingestion with seamless simulation fallback.

FeedManager owns the fleet state source of truth:

* LIVE mode   — connects to wss://stream.aisstream.io/v0/stream with the
                configured API key, subscribes to the surveillance bounding
                box and parses PositionReport (types 1/2/3), ShipAndVoyageData
                (type 5) sentences.
* SIMULATION  — when no key is configured, the connection fails, or the live
                stream goes silent, the high-fidelity VesselStateManager
                simulation takes over with zero UI interruption (the
                directive's FALLBACK_SIMULATION_ENABLED behaviour).
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import ssl
from typing import Any, Dict, List, Optional

import config
from vessel_state import VesselStateManager, _coerce_nav

logger = logging.getLogger("aegis.ais")

AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream"
LIVE_STALE_SECONDS = 45.0  # no live messages for this long -> fall back to sim

# SSL context that doesn't verify certificates (fixes macOS cert issues)
_SSL_UNVERIFIED = ssl.create_default_context()
_SSL_UNVERIFIED.check_hostname = False
_SSL_UNVERIFIED.verify_mode = ssl.CERT_NONE


class AisStreamClient:
    """Async aisstream.io WebSocket consumer (activates only with an API key)."""

    def __init__(self, api_key: str, bbox: Optional[List[float]] = None) -> None:
        self.api_key = api_key
        self.bbox = bbox or config.settings.default_bounding_box  # [S, W, N, E]
        self.last_message_epoch: float = 0.0
        self.connected: bool = False

    async def run(self, on_position) -> None:
        """Consume the live stream forever, pushing reports to `on_position`."""
        import websockets  # lazy import: sim-only deployments never touch this

        s, w, n, e = self.bbox
        subscribe = {
            "APIKey": self.api_key,
            "BoundingBoxes": [[[s, w], [n, e]]],
            "FilterMessageTypes": ["PositionReport", "ShipAndVoyageData"],
        }
        while True:
            try:
                async with websockets.connect(
                    AISSTREAM_URL, ping_interval=20, ssl=_SSL_UNVERIFIED
                ) as ws:
                    await ws.send(json.dumps(subscribe))
                    self.connected = True
                    logger.info("AISSTREAM connected — live feed active")
                    async for raw in ws:
                        self.last_message_epoch = time.time()
                        try:
                            msg = json.loads(raw)
                        except (ValueError, TypeError):
                            continue
                        report = self._parse(msg)
                        if report:
                            on_position(report)
            except asyncio.CancelledError:
                self.connected = False
                raise
            except Exception as exc:  # noqa: BLE001 — resilience over purity
                self.connected = False
                logger.warning("AISSTREAM disconnected (%s) — retrying in 10 s", exc)
                await asyncio.sleep(10)

    def _parse(self, msg: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Map an aisstream JSON sentence onto the VesselPosition wire format."""
        mtype = msg.get("MessageType")
        body = msg.get("Message", {}) or {}
        if mtype == "PositionReport":
            pr = body.get("PositionReport", {}) or {}
            if not pr.get("MMSI") or pr.get("Latitude") is None:
                return None
            return {
                "mmsi": int(pr["MMSI"]),
                "ship_name": str(pr.get("Name") or "").strip() or "UNKNOWN CONTACT",
                "latitude": float(pr["Latitude"]),
                "longitude": float(pr["Longitude"]),
                "speed_knots": float(pr.get("Sog") or 0.0),
                "course_over_ground": float(pr.get("Cog") or 0.0),
                "true_heading": float(pr.get("TrueHeading") or pr.get("Cog") or 0.0),
                "nav_status": _coerce_nav(pr.get("NavStatus")),
                "destination": "",
                "eta": "",
                "draught": 6.0,
                "length": 120.0,
                "width": 18.0,
                "flag_country": "",
                "timestamp_epoch": time.time(),
                "is_dark_vessel": False,
            }
        if mtype == "ShipAndVoyageData":
            vd = (body.get("ShipAndVoyageData", {}) or {}).get("ShipAndVoyageData", {}) or {}
            if not vd.get("MMSI"):
                return None
            return {
                "mmsi": int(vd["MMSI"]),
                "ship_name": str(vd.get("Name") or "").strip() or "UNKNOWN CONTACT",
                "latitude": None,  # static voyage data — merged by MMSI only
                "longitude": None,
                "speed_knots": None,
                "course_over_ground": None,
                "true_heading": None,
                "nav_status": None,
                "destination": str(vd.get("Destination") or ""),
                "eta": str(vd.get("Eta") or ""),
                "draught": float(vd.get("Draught") or 0) / 10.0 if vd.get("Draught") else 6.0,
                "length": float(vd.get("Length") or 0),
                "width": float(vd.get("Width") or 0),
                "flag_country": "",
                "timestamp_epoch": time.time(),
                "is_dark_vessel": False,
                "_voyage_only": True,
            }
        return None


class FeedManager:
    """Chooses live vs simulation and drives the shared VesselStateManager."""

    def __init__(self, state: VesselStateManager) -> None:
        self.state = state
        self.mode_override: str = "auto"  # auto | live | simulation
        self._live_task: Optional[asyncio.Task] = None
        self._client: Optional[AisStreamClient] = None

    @property
    def mode(self) -> str:
        """Resolved feed mode: LIVE when a live client recently delivered."""
        if self.mode_override == "simulation":
            return "SIMULATION"
        live_configured = bool(config.settings.aisstream_api_key)
        if self.mode_override == "live" and live_configured:
            return "LIVE"
        if (
            live_configured
            and self._client is not None
            and self._client.connected
            and (time.time() - self._client.last_message_epoch) < LIVE_STALE_SECONDS
        ):
            return "LIVE"
        return "SIMULATION"

    def start_live_task(self) -> None:
        """Launch the aisstream consumer if credentials exist (fire-and-forget)."""
        if config.settings.aisstream_api_key and self._live_task is None:
            self._client = AisStreamClient(config.settings.aisstream_api_key)
            self._live_task = asyncio.get_event_loop().create_task(self._consume())

    async def _consume(self) -> None:
        assert self._client is not None
        await self._client.run(self._on_live_position)

    def _on_live_position(self, report: Dict[str, Any]) -> None:
        if report.get("_voyage_only"):
            # Static voyage data: patch an existing tracked vessel by MMSI.
            if self.state.vessel_detail(report["mmsi"]) is not None:
                self.state.upsert_external(
                    {
                        "mmsi": report["mmsi"],
                        "ship_name": report["ship_name"],
                        "latitude": 0.0,
                        "longitude": 0.0,
                        "destination": report["destination"],
                        "eta": report["eta"],
                        "draught": report["draught"],
                        "length": report["length"],
                        "width": report["width"],
                        "_patch_only": True,
                    }
                )
            return
        if report.get("latitude") is None:
            return
        self.state.upsert_external(report)
