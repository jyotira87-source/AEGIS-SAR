"""
PROJECT AEGIS-SAR (SIH26143)
main.py — FastAPI maritime surveillance core with a real-time WebSocket hub.

REST
----
GET  /                              Legacy health probe (Render healthCheckPath)
GET  /health                        Real-time health: ONLINE + fleet stats
GET  /api/v1/vessels                Paginated, filterable live fleet snapshot
GET  /api/v1/vessels/{mmsi}         Full vessel dossier + breadcrumb trail
GET  /api/v1/sar/detections         All detected slicks + correlated targets
POST /api/v1/sar/analyze-region     Fresh CFAR processing on a Lat/Lon region
GET  /api/v1/crypto/verify/{id}     SHA3-512 proof-chain receipt validation
GET  /api/v1/crypto/proofs          Sealed evidence chain (newest first)
GET  /api/v1/settings               Runtime controls
POST /api/v1/settings               Update runtime controls (feeds, filters)
GET  /api/v1/sectors                Sector catalogue            (zero-trust)
POST /api/v1/analyze-slick          Legacy sealed-payload pipeline (zero-trust)
GET/POST /api/v1/vault/verify...    Legacy SHA-256 block verification

WEBSOCKET
---------
WS   /ws/live-feed                  {VESSEL_UPDATE_BATCH | SPILL_ALERT |
                                     TELEMETRY_STATS | pong} frames with
                                     client "ping" keep-alive support.
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
import time
from typing import Any, Dict, List, Optional

from fastapi import (
    FastAPI,
    Header,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import config
from ais_correlator import AISCorrelator
from ais_feed import FeedManager
from cfar_detector import detect_region
from crypto_vault import CryptoVault, ProofChain
from models import (
    CoordinateQuery,
    CryptoSeal,
    DriftVector,
    FilterSettings,
    RuntimeSettingsPayload,
    SlickGeoJSON,
    SlickMorphology,
    SpillPayload,
    SARAnomalyRecord,
    VaultVerifyRequest,
    VaultVerifyResponse,
    VesselRecord,
    utc_now_iso,
)
from sar_engine import SAREngine
from vessel_state import VesselStateManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("aegis.core")

# ---------------------------------------------------------------------------
# Application bootstrap
# ---------------------------------------------------------------------------
app = FastAPI(
    title="AEGIS-SAR // NTRO Maritime Surveillance API",
    description=(
        "Real-time AIS vessel tracking, CFAR SAR spill detection and "
        "cryptographic evidence vaulting."
    ),
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Singletons — fleet state, feed manager, proof chain, runtime settings
# ---------------------------------------------------------------------------
state = VesselStateManager(
    vessel_count=config.settings.simulation_vessel_count,
    sample_seconds=config.settings.vessel_tick_sample_seconds,
    seed=20260906,
)
feed = FeedManager(state)
proof_chain = ProofChain(config.settings.jwt_vault_secret)
runtime = RuntimeSettingsPayload()

sar_engine = SAREngine()
ais_correlator = AISCorrelator()

VAULT_REGISTRY: Dict[str, Dict] = {}
ANOMALIES: List[Dict] = []
_seed_counter = 0


def _next_seed() -> int:
    global _seed_counter
    _seed_counter += 1
    return random.randint(100000, 10**9) + _seed_counter


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail="ZERO-TRUST-AUTH-FAILED :: missing or invalid X-ZeroTrust-Token",
        headers={"WWW-Authenticate": "AEGIS-ZeroTrust"},
    )


def _require_zero_trust(zero_trust_token: Optional[str]) -> None:
    if zero_trust_token != config.ZERO_TRUST_TOKEN:
        raise _unauthorized()


def _resolve_coordinates(query: CoordinateQuery) -> Dict:
    """Resolve analytics coordinates from sector preset or manual WGS84 pair."""
    if query.sector_id:
        sector = sar_engine.resolve_sector(query.sector_id)
        if sector is None:
            raise HTTPException(status_code=404, detail=f"UNKNOWN SECTOR :: {query.sector_id}")
        return {
            "lat": sector["lat"],
            "lon": sector["lon"],
            "sector_id": sector["id"],
            "sector_name": sector["name"],
            "jurisdiction": sector["jurisdiction"],
            "risk_rating": sector["risk_rating"],
        }
    nearest, best = None, float("inf")
    for s in sar_engine.SECTORS:
        d = abs(s["lat"] - query.lat) + abs(s["lon"] - query.lon)
        if d < best:
            nearest, best = s, d
    return {
        "lat": query.lat,
        "lon": query.lon,
        "sector_id": nearest["id"] if nearest else "custom_zone",
        "sector_name": nearest["name"] if nearest else "Custom Surveillance Zone",
        "jurisdiction": nearest["jurisdiction"] if nearest else "Open Sea / Custom",
        "risk_rating": nearest["risk_rating"] if nearest else "Custom analytic parcel",
    }


# ---------------------------------------------------------------------------
# WebSocket connection hub — real-time broadcast
# ---------------------------------------------------------------------------
class ConnectionManager:
    """Tracks live WebSocket clients with safe async broadcast."""

    def __init__(self) -> None:
        self.active: List[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self.active.append(websocket)
        logger.info("WS client connected (%d active)", len(self.active))

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            if websocket in self.active:
                self.active.remove(websocket)
        logger.info("WS client disconnected (%d active)", len(self.active))

    async def broadcast(self, frame: Dict[str, Any]) -> None:
        """Send a frame to every live client, dropping dead sockets."""
        if not self.active:
            return
        payload = json.dumps(frame, default=str)
        dead = []
        async with self._lock:
            for ws in list(self.active):
                try:
                    await ws.send_text(payload)
                except Exception:  # noqa: BLE001
                    dead.append(ws)
            for ws in dead:
                if ws in self.active:
                    self.active.remove(ws)


manager = ConnectionManager()
_last_slick_epoch = 0.0
_tick_count = 0


async def _maybe_spawn_slick_event() -> None:
    """
    Simulated SAR acquisition cycle: every ~90 s of runtime, run a fresh CFAR
    pass over a random monitored choke point, correlate the live fleet,
    seal the incident into the SHA3-512 proof chain and push a SPILL_ALERT.
    """
    global _last_slick_epoch
    if time.time() - _last_slick_epoch < 90.0:
        return
    _last_slick_epoch = time.time()

    anchor = next(iter(state._vessels.values()))["home"]
    lat, lon = anchor["lat"], anchor["lon"]

    result = detect_region(lat, lon, sensitivity=runtime.dark_patch_sensitivity)
    if not result["anomalies"]:
        return
    anomaly = result["anomalies"][0]

    correlation = state.correlate_slick(
        anomaly["polygon_coordinates"],
        lookback_hours=runtime.lookback_hours,
        radius_nm=runtime.correlation_radius_nm,
    )

    incident = {
        "sar_tile_id": f"S1A_IW_GRDH_1SDV_{int(time.time())}",
        "slick_centroid": anomaly["centroid"],
        "slick_area_sq_km": anomaly["slick_area_sq_km"],
        "estimated_discharge_volume_m3": anomaly["estimated_discharge_volume_m3"],
        "confidence_score": anomaly["confidence_score"],
        "suspect_mmsi": correlation["suspect_mmsi"],
        "correlation": correlation,
        "region": {"lat": lat, "lon": lon},
        "detection": anomaly,
    }
    proof = proof_chain.seal_incident(incident)

    record = {
        "anomaly_id": proof["proof_id"],
        "timestamp": proof["timestamp_iso"],
        "polygon_coordinates": anomaly["polygon_coordinates"],
        "centroid": anomaly["centroid"],
        "slick_area_sq_km": anomaly["slick_area_sq_km"],
        "estimated_discharge_volume_m3": anomaly["estimated_discharge_volume_m3"],
        "confidence_score": anomaly["confidence_score"],
        "suspect_vessel_mmsi": correlation["suspect_mmsi"],
        "cryptographic_hash": proof["immutable_hash"],
        "signature": proof["signature"],
        "correlation_candidates": correlation["candidates"],
        "sar_meta": result["sar_meta"],
        "proof_id": proof["proof_id"],
        "chain_block": proof["chain_block"],
        "previous_hash": proof["previous_hash"],
        "immutable_hash": proof["immutable_hash"],
        "hash_algorithm": proof["hash_algorithm"],
        "signer": proof["signer"],
    }
    ANOMALIES.insert(0, record)
    del ANOMALIES[50:]  # rolling evidence window

    await manager.broadcast({"type": "SPILL_ALERT", "data": record})


async def _broadcast_loop() -> None:
    """Core real-time loop: tick physics, broadcast vessel batches + stats."""
    global _tick_count
    logger.info("Real-time broadcast loop started")
    while True:
        try:
            interval = max(0.25, runtime.broadcast_interval_ms / 1000.0)
            await asyncio.sleep(interval)
            _tick_count += 1

            state.tick(dt_seconds=interval * runtime.simulation_speed)
            batch = state.positions(runtime.filter)
            await manager.broadcast({"type": "VESSEL_UPDATE_BATCH", "data": batch})

            await _maybe_spawn_slick_event()

            if _tick_count % 5 == 0:
                stats = state.stats(active_slicks=len(ANOMALIES), feed_mode=feed.mode)
                stats["update_interval_seconds"] = interval
                await manager.broadcast({"type": "TELEMETRY_STATS", "data": stats})
        except asyncio.CancelledError:
            logger.info("Broadcast loop cancelled")
            raise
        except Exception:  # noqa: BLE001 — the stream must never die
            logger.exception("Broadcast loop error — continuing")


@app.on_event("startup")
async def on_startup() -> None:
    feed.start_live_task()
    asyncio.get_event_loop().create_task(_broadcast_loop())


# ---------------------------------------------------------------------------
# WEBSOCKET /ws/live-feed
# ---------------------------------------------------------------------------
@app.websocket("/ws/live-feed")
async def ws_live_feed(websocket: WebSocket):
    """
    Real-time maritime stream. Server pushes:
      {"type": "VESSEL_UPDATE_BATCH", "data": [VesselPosition, ...]}
      {"type": "SPILL_ALERT",         "data": SARAnomalyRecord}
      {"type": "TELEMETRY_STATS",     "data": {total_ships, dark_vessels, ...}}
    Clients send "ping" text frames to receive {"type": "pong"} keep-alives.
    """
    await manager.connect(websocket)
    # Immediate greeting so clients can bind within 2 s of connection.
    try:
        await websocket.send_text(
            json.dumps(
                {
                    "type": "TELEMETRY_STATS",
                    "data": state.stats(active_slicks=len(ANOMALIES), feed_mode=feed.mode),
                }
            )
        )
        while True:
            message = await websocket.receive_text()
            if message.strip().lower() == "ping":
                await websocket.send_text(
                    json.dumps({"type": "pong", "epoch": time.time()})
                )
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception:  # noqa: BLE001
        await manager.disconnect(websocket)


# ---------------------------------------------------------------------------
# HEALTH (both the Render probe and the directive's /health contract)
# ---------------------------------------------------------------------------
@app.get("/health")
def health_realtime():
    stats = state.stats(active_slicks=len(ANOMALIES), feed_mode=feed.mode)
    return {
        "status": "ONLINE",
        "timestamp": utc_now_iso(),
        "active_vessels_tracked": stats["total_ships"],
        "dark_vessels": stats["dark_vessels"],
        "active_slicks": stats["active_slicks"],
        "feed_mode": feed.mode,
        "ws_clients": len(manager.active),
        "sar_readiness": True,
    }


@app.get("/")
def health():
    """Legacy liveness probe (unauthenticated — Render healthCheckPath)."""
    return {
        "status": "OPERATIONAL",
        "service": "AEGIS-SAR Maritime Surveillance Core",
        "version": "2.0.0",
        "detail": "Use /health for real-time fleet telemetry.",
        "server_time_utc": utc_now_iso(),
    }


# ---------------------------------------------------------------------------
# LIVE FLEET — REST
# ---------------------------------------------------------------------------
def _filter_from_query(
    min_speed: float,
    max_speed: float,
    types: str,
    search: str,
    dark_only: bool,
    bbox: Optional[str],
) -> FilterSettings:
    type_list = [t.strip().upper() for t in types.split(",") if t.strip()]
    box: Optional[List[float]] = None
    if bbox:
        try:
            parts = [float(p) for p in bbox.split(",")]
            if len(parts) == 4:
                box = parts
        except ValueError:
            box = None
    return FilterSettings(
        min_speed=min_speed,
        max_speed=max_speed,
        vessel_types=type_list,
        search_query=search,
        show_dark_targets_only=dark_only,
        bbox=box,
    )


@app.get("/api/v1/vessels")
def list_vessels(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=1000),
    min_speed: float = 0.0,
    max_speed: float = 60.0,
    types: str = "",
    search: str = "",
    dark_only: bool = False,
    bbox: Optional[str] = None,
):
    """Paginated, filterable live fleet snapshot (simulation or live AIS)."""
    flt = _filter_from_query(min_speed, max_speed, types, search, dark_only, bbox)
    all_positions = state.positions(flt)
    start = (page - 1) * page_size
    slice_ = all_positions[start : start + page_size]
    return {
        "page": page,
        "page_size": page_size,
        "total": len(all_positions),
        "feed_mode": feed.mode,
        "count": len(slice_),
        "vessels": slice_,
    }


@app.get("/api/v1/vessels/{mmsi}")
def vessel_dossier(mmsi: int):
    """Full vessel metadata, breadcrumb track, speed profile, voyage info."""
    detail = state.vessel_detail(mmsi)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"VESSEL NOT TRACKED :: {mmsi}")
    return detail


# ---------------------------------------------------------------------------
# SAR ANALYTICS — REST
# ---------------------------------------------------------------------------
@app.get("/api/v1/sar/detections")
def sar_detections():
    """All detected slicks with correlated suspects and proof ids."""
    return {"count": len(ANOMALIES), "detections": ANOMALIES}


@app.post("/api/v1/sar/analyze-region")
def sar_analyze_region(
    body: Dict[str, Any],
    zero_trust_token: Optional[str] = Header(default=None, alias="X-ZeroTrust-Token"),
):
    """Trigger fresh CFAR processing on the given Lat/Lon and seal results."""
    _require_zero_trust(zero_trust_token)
    try:
        lat = float(body["lat"])
        lon = float(body["lon"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=422, detail="BODY must include numeric 'lat' and 'lon'")

    sensitivity = float(body.get("sensitivity", runtime.dark_patch_sensitivity))
    result = detect_region(lat, lon, sensitivity=sensitivity)
    if not result["anomalies"]:
        return {"count": 0, "detections": [], "message": "NO DARK PATCHES ABOVE CFAR THRESHOLD"}

    sealed = []
    for anomaly in result["anomalies"][:5]:
        correlation = state.correlate_slick(
            anomaly["polygon_coordinates"],
            lookback_hours=runtime.lookback_hours,
            radius_nm=runtime.correlation_radius_nm,
        )
        incident = {
            "sar_tile_id": f"S1A_IW_GRDH_1SDV_{int(time.time())}",
            "slick_centroid": anomaly["centroid"],
            "slick_area_sq_km": anomaly["slick_area_sq_km"],
            "estimated_discharge_volume_m3": anomaly["estimated_discharge_volume_m3"],
            "confidence_score": anomaly["confidence_score"],
            "suspect_mmsi": correlation["suspect_mmsi"],
            "correlation": correlation,
            "region": {"lat": lat, "lon": lon},
            "detection": anomaly,
        }
        proof = proof_chain.seal_incident(incident)
        record = {
            "anomaly_id": proof["proof_id"],
            "timestamp": proof["timestamp_iso"],
            "polygon_coordinates": anomaly["polygon_coordinates"],
            "centroid": anomaly["centroid"],
            "slick_area_sq_km": anomaly["slick_area_sq_km"],
            "estimated_discharge_volume_m3": anomaly["estimated_discharge_volume_m3"],
            "confidence_score": anomaly["confidence_score"],
            "suspect_vessel_mmsi": correlation["suspect_mmsi"],
            "cryptographic_hash": proof["immutable_hash"],
            "signature": proof["signature"],
            "correlation_candidates": correlation["candidates"],
            "sar_meta": result["sar_meta"],
            "proof_id": proof["proof_id"],
            "chain_block": proof["chain_block"],
            "previous_hash": proof["previous_hash"],
            "immutable_hash": proof["immutable_hash"],
            "hash_algorithm": proof["hash_algorithm"],
            "signer": proof["signer"],
        }
        ANOMALIES.insert(0, record)
        sealed.append(record)
    del ANOMALIES[50:]

    return {"count": len(sealed), "detections": sealed, "acquired_at_utc": result["acquired_at_utc"]}


# ---------------------------------------------------------------------------
# SECTOR CATALOGUE + LEGACY SEALED PIPELINE (unchanged wire contract)
# ---------------------------------------------------------------------------
@app.get("/api/v1/sectors")
def list_sectors(zero_trust_token: Optional[str] = Header(default=None, alias="X-ZeroTrust-Token")):
    _require_zero_trust(zero_trust_token)
    return {"count": len(sar_engine.SECTORS), "sectors": sar_engine.list_sectors()}


@app.post("/api/v1/analyze-slick")
def analyze_slick(
    query: CoordinateQuery,
    request: Request,
    zero_trust_token: Optional[str] = Header(default=None, alias="X-ZeroTrust-Token"),
):
    """Legacy dual-layer pipeline: SAR segmentation + AIS correlation + seal."""
    _require_zero_trust(zero_trust_token)

    resolved = _resolve_coordinates(query)
    window_hours = query.analysis_window_hours or config.TRAJECTORY_LOOKBACK_HOURS
    radius_km = query.surveillance_radius_km or config.DEFAULT_SURVEILLANCE_RADIUS_KM

    slick = sar_engine.synthetic_slick(resolved["lat"], resolved["lon"], seed=_next_seed())
    telemetry = sar_engine.telemetry(acquisition_time_utc=utc_now_iso())

    correlated = ais_correlator.analyze(
        center_lat=resolved["lat"],
        center_lon=resolved["lon"],
        slick_lat=slick["centroid_lat"],
        slick_lon=slick["centroid_lon"],
        window_hours=window_hours,
    )

    vessels = []
    prime_suspect_mmsi = None
    for v in correlated:
        record = {
            "mmsi": v["profile"]["mmsi"],
            "vessel_name": v["profile"]["name"],
            "flag_state": v["profile"]["flag"],
            "vessel_type": v["profile"]["type"],
            "speed_over_ground_knots": v["speed_over_ground_knots"],
            "course_over_ground_deg": v["course_over_ground_deg"],
            "distance_to_centroid_km": v["min_distance_to_slick_km"],
            "correlation_confidence_pct": v.get("correlation_confidence_pct", 0.0),
            "anomalous_behavior_flag": bool(v.get("anomalous")),
            "maneuver_suspicion_flag": bool(v.get("maneuver_suspicion")),
            "risk_factor_type": v["profile"].get("risk", 0.3),
            "guilt_score": int(v.get("guilt_score", 0)),
            "trail": v["trail"],
        }
        if record["guilt_score"] > 85:
            prime_suspect_mmsi = v["profile"]["mmsi"]
        vessels.append(record)

    morphology_data = {k: v for k, v in slick.items() if k not in ("contours", "drift")}
    payload_model = SpillPayload(
        request=query,
        sector_name=resolved["sector_name"],
        sector_id=resolved["sector_id"],
        jurisdiction=resolved.get("jurisdiction", ""),
        surveillance_radius_km=radius_km,
        telemetry=telemetry,
        morphology=SlickMorphology(**morphology_data),
        slick_geojson=SlickGeoJSON(**slick["contours"]),
        drift=DriftVector(**slick["drift"]),
        vessels=[VesselRecord(**v) for v in vessels],
        prime_suspect_mmsi=prime_suspect_mmsi,
        pipeline={
            "layer_1_sar_segmentation": "COMPLETE",
            "layer_2_ais_correlation": "COMPLETE",
            "attribution_model": "WEIGHTED-SPATIO-TEMPORAL-INTERSECTION v1.0",
        },
        vault=CryptoSeal(block_id="", canonical_json_digest="", sealed_at_utc=""),
    )

    payload_dict = payload_model.model_dump(exclude={"vault"})
    sealed = CryptoVault.seal(payload_dict)
    VAULT_REGISTRY[sealed["vault"]["block_id"]] = sealed

    valid = SpillPayload.model_validate(sealed)
    return JSONResponse(content=valid.model_dump(), status_code=201)


@app.get("/api/v1/vault/verify/{hash_id}")
def verify_by_hash(
    hash_id: str,
    zero_trust_token: Optional[str] = Header(default=None, alias="X-ZeroTrust-Token"),
):
    _require_zero_trust(zero_trust_token)
    block = VAULT_REGISTRY.get(hash_id)
    if block is None:
        raise HTTPException(status_code=404, detail=f"BLOCK NOT FOUND IN VAULT :: {hash_id}")
    result = CryptoVault.verify(block)
    return VaultVerifyResponse(**result).model_dump()


@app.post("/api/v1/vault/verify")
def verify_arbitrary(
    body: VaultVerifyRequest,
    zero_trust_token: Optional[str] = Header(default=None, alias="X-ZeroTrust-Token"),
):
    _require_zero_trust(zero_trust_token)
    result = CryptoVault.verify(dict(body.block))
    return VaultVerifyResponse(**result).model_dump()


# ---------------------------------------------------------------------------
# CRYPTOGRAPHIC EVIDENCE VAULT — SHA3-512 proof chain
# ---------------------------------------------------------------------------
@app.get("/api/v1/crypto/proofs")
def crypto_proofs():
    """Sealed evidence chain, newest block first."""
    return {"count": len(proof_chain.list_proofs()), "proofs": proof_chain.list_proofs()}


@app.get("/api/v1/crypto/verify/{proof_id}")
def crypto_verify(proof_id: str):
    """Cryptographic integrity validation of one audit receipt."""
    proof = proof_chain.get_proof(proof_id)
    if proof is None:
        raise HTTPException(status_code=404, detail=f"PROOF NOT FOUND :: {proof_id}")
    return proof_chain.verify_proof(proof)


# ---------------------------------------------------------------------------
# RUNTIME SETTINGS — GET/POST /api/v1/settings
# ---------------------------------------------------------------------------
@app.get("/api/v1/settings")
def get_settings():
    """Current runtime controls + environment feed status."""
    data = runtime.model_dump()
    data["aisstream_api_key_configured"] = bool(config.settings.aisstream_api_key)
    data["feed_mode"] = feed.mode
    data["bounding_box"] = config.settings.default_bounding_box
    return data


@app.post("/api/v1/settings")
def post_settings(
    payload: RuntimeSettingsPayload,
    zero_trust_token: Optional[str] = Header(default=None, alias="X-ZeroTrust-Token"),
):
    """Update runtime controls (feed toggles, sim parameters, filters, UI)."""
    _require_zero_trust(zero_trust_token)
    global runtime
    old_count = runtime.simulation_vessel_count
    runtime = payload
    if payload.simulation_vessel_count != old_count:
        state.resize(payload.simulation_vessel_count)
    feed.mode_override = payload.feed_mode
    return get_settings()

@app.post("/api/v1/settings/reset")
def reset_simulation(
    zero_trust_token: Optional[str] = Header(default=None, alias="X-ZeroTrust-Token"),
):
    """Settings → RESET SIMULATION: re-seed the fleet (fresh identities,
    positions and trails), clear pending SAR anomaly records and restart the
    feed override in simulation mode. Returns the active settings snapshot."""
    _require_zero_trust(zero_trust_token)
    global runtime
    default_runtime = RuntimeSettingsPayload(feed_mode="simulation")
    runtime = default_runtime
    state.reseed()
    state.resize(default_runtime.simulation_vessel_count)
    ANOMALIES.clear()
    VAULT_REGISTRY.clear()
    feed.mode_override = "simulation"
    return get_settings()


# ---------------------------------------------------------------------------
# LOCAL LAUNCH
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=config.HOST, port=config.PORT)
