"""
PROJECT AEGIS-SAR (SIH26143)
main.py — FastAPI service exposing the dual-layered detection pipeline.

Endpoints
---------
GET  /                          Health check + sensor status
GET  /api/v1/sectors            List operational coastal surveillance sectors
POST /api/v1/analyze-slick      Run SAR segmentation + AIS correlation, seal block
GET  /api/v1/vault/verify/{id}  Validate a stored sealed block by hash id
POST /api/v1/vault/verify       Validate an arbitrary supplied sealed block

Security
--------
Every state-changing / intelligence endpoint enforces the zero-trust header
`X-ZeroTrust-Token` against the value in config.ZERO_TRUST_TOKEN.
"""

from __future__ import annotations

import json
import random
from typing import Dict, List, Optional

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import config
from ais_correlator import AISCorrelator
from crypto_vault import CryptoVault
from models import (
    CoordinateQuery,
    CryptoSeal,
    DriftVector,
    SlickGeoJSON,
    SlickMorphology,
    SpillPayload,
    VaultVerifyRequest,
    VaultVerifyResponse,
    VesselRecord,
    utc_now_iso,
)
from sar_engine import SAREngine

# ---------------------------------------------------------------------------
# Application bootstrap
# ---------------------------------------------------------------------------
app = FastAPI(
    title="AEGIS-SAR // NTRO Maritime Intelligence API",
    description="Automated SAR oil slick segmentation & AIS vessel attribution system.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sar_engine = SAREngine()
ais_correlator = AISCorrelator()

# ---------------------------------------------------------------------------
# Vault registry — immutable sealed blocks indexed by SHA-256 block id.
# ---------------------------------------------------------------------------
VAULT_REGISTRY: Dict[str, Dict] = {}
_seed_counter = 0


def _next_seed() -> int:
    """Deterministic-yet-varied seed per request (still pseudo-random overall)."""
    global _seed_counter
    _seed_counter += 1
    return random.randint(100000, 10 ** 9) + _seed_counter


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
    # Manual coordinates — search for the nearest registered sector for context.
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
# HEALTH CHECK
# ---------------------------------------------------------------------------
@app.get("/")
def health(zero_trust_token: Optional[str] = Header(default=None, alias="X-ZeroTrust-Token")):
    _require_zero_trust(zero_trust_token)
    return {
        "status": "OPERATIONAL",
        "service": "AEGIS-SAR Maritime Intelligence Core",
        "version": "1.0.0",
        "sensors": {
            "sentinel1_uplink": "LIVE",
            "sar_polarimetry": "CO-POL (VV/VH)",
            "ais_stream": "ARMED",
            "crypto_vault": "SEALED-OPERATIONAL",
        },
        "configured_sectors": len(sar_engine.SECTORS),
        "config": config.describe(),
        "server_time_utc": utc_now_iso(),
    }


# ---------------------------------------------------------------------------
# SECTOR CATALOGUE
# ---------------------------------------------------------------------------
@app.get("/api/v1/sectors")
def list_sectors(zero_trust_token: Optional[str] = Header(default=None, alias="X-ZeroTrust-Token")):
    _require_zero_trust(zero_trust_token)
    return {"count": len(sar_engine.SECTORS), "sectors": sar_engine.list_sectors()}
# ---------------------------------------------------------------------------
# DUAL-LAYERED SLICK ANALYSIS PIPELINE
# ---------------------------------------------------------------------------
@app.post("/api/v1/analyze-slick")
def analyze_slick(
    query: CoordinateQuery,
    request: Request,
    zero_trust_token: Optional[str] = Header(default=None, alias="X-ZeroTrust-Token"),
):
    _require_zero_trust(zero_trust_token)

    resolved = _resolve_coordinates(query)
    window_hours = query.analysis_window_hours or config.TRAJECTORY_LOOKBACK_HOURS
    radius_km = query.surveillance_radius_km or config.DEFAULT_SURVEILLANCE_RADIUS_KM

    # --- LAYER 1 | SAR slick segmentation ---------------------------------
    slick = sar_engine.synthetic_slick(resolved["lat"], resolved["lon"], seed=_next_seed())
    telemetry = sar_engine.telemetry(acquisition_time_utc=utc_now_iso())

    # --- LAYER 2 | AIS trajectory correlation ------------------------------
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

    # --- ASSEMBLE + SEAL ----------------------------------------------------
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

    # Seal the EXACT serialized payload so a returned block can be re-verified
    # byte-for-byte by any audit client.
    payload_dict = payload_model.model_dump(exclude={"vault"})
    sealed = CryptoVault.seal(payload_dict)
    VAULT_REGISTRY[sealed["vault"]["block_id"]] = sealed

    # Final schema validation of the sealed product before release.
    valid = SpillPayload.model_validate(sealed)
    return JSONResponse(content=valid.model_dump(), status_code=201)


# ---------------------------------------------------------------------------
# CRYPTOGRAPHIC VAULT VERIFICATION
# ---------------------------------------------------------------------------
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
# LOCAL LAUNCH
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=config.HOST, port=config.PORT)