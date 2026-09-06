"""
PROJECT AEGIS-SAR (SIH26143)
models.py — Strict Pydantic v2 schemas for the dual-layered detection pipeline.

Encapsulates the complete intelligence lifecycle: an analyst CoordinateQuery is
expanded into SatelliteTelemetry, SlickMorphology + SlickGeoJSON geometry,
drift vectors, correlated VesselRecords, and finally sealed by the CryptoVault
into an immutable SpillPayload block.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ===========================================================================
# ANALYST INPUT
# ===========================================================================
class CoordinateQuery(BaseModel):
    """Analyst-supplied surveillance centre in WGS84."""

    model_config = ConfigDict(extra="forbid")

    lat: float = Field(description="WGS84 latitude, -90.0 to 90.0")
    lon: float = Field(description="WGS84 longitude, -180.0 to 180.0")
    sector_id: Optional[str] = Field(
        default=None,
        description='Preset sector slug, e.g. "mumbai_high_offshore"',
    )
    surveillance_radius_km: Optional[float] = Field(
        default=None,
        ge=5.0,
        le=250.0,
        description="Reconnaissance radius in kilometres",
    )
    analysis_window_hours: Optional[float] = Field(
        default=6.0, ge=1.0, le=24.0, description="Historical AIS lookback window"
    )

    @field_validator("lat")
    @classmethod
    def _lat_in_range(cls, v: float) -> float:
        if not -90.0 <= v <= 90.0:
            raise ValueError(f"lat {v} out of WGS84 range [-90, 90]")
        return v

    @field_validator("lon")
    @classmethod
    def _lon_in_range(cls, v: float) -> float:
        if not -180.0 <= v <= 180.0:
            raise ValueError(f"lon {v} out of WGS84 range [-180, 180]")
        return v


# ===========================================================================
# SATELLITE TELEMETRY
# ===========================================================================
class SatelliteTelemetry(BaseModel):
    """Simulated Sentinel-1 C-band acquisition metadata."""

    model_config = ConfigDict(extra="forbid")

    satellite: str = "Sentinel-1"
    sensor_mode: str = "IW"  # Interferometric Wide swath
    polarizations: List[str] = ["VV", "VH"]
    acquisition_time_utc: str
    look_angle_degrees: float
    range_resolution_m: float
    azimuth_resolution_m: float
    incidence_angle_deg: float
    orbit_direction: str  # ascending / descending


# ===========================================================================
# SLICK MORPHOLOGY (SAR Derivation)
# ===========================================================================
class DriftVector(BaseModel):
    """Oceanographic forcing acting on the slick patch."""

    model_config = ConfigDict(extra="forbid")

    current_speed_knots: float
    current_bearing_deg: float
    wind_speed_knots: float
    wind_bearing_deg: float
    tidal_stage: str  # e.g. "ebbing", "flooding"
    resultant_speed_knots: float
    resultant_bearing_deg: float


class SlickMorphology(BaseModel):
    """Quantitative shape/radar descriptors of the detected dark patch."""

    model_config = ConfigDict(extra="forbid")

    area_sq_km: float = Field(ge=4.0, le=30.0)
    perimeter_km: float
    circularity_index: float
    major_axis_orientation_deg: float
    mean_contrast_dB: float = Field(ge=-9.0, le=-3.0)
    max_attenuation_dB: float
    core_area_sq_km: float
    sheen_area_sq_km: float
    centroid_lat: float
    centroid_lon: float
    slicing_algorithm: str


class SlickGeoJSON(BaseModel):
    """Multi-polygon GeoJSON FeatureCollection for the slick."""

    model_config = ConfigDict(extra="forbid")

    type: str = "FeatureCollection"
    crs: dict
    features: list[dict]


# ===========================================================================
# VESSEL CORRELATION
# ===========================================================================
class VesselRecord(BaseModel):
    """A vessel interrogated against the spatio-temporal slick hypothesis."""

    model_config = ConfigDict(extra="forbid")

    mmsi: str
    vessel_name: str
    flag_state: str
    vessel_type: str
    speed_over_ground_knots: float
    course_over_ground_deg: float
    distance_to_centroid_km: float
    correlation_confidence_pct: float
    anomalous_behavior_flag: bool
    risk_factor_type: float
    maneuver_suspicion_flag: bool
    guilt_score: int = Field(ge=0, le=100)
    trail: List[Dict[str, float]] = Field(
        default_factory=list, description="SLERP-reconstructed [[lat, lon, t_hr], ...]"
    )


# ===========================================================================
# SEALED INTELLIGENCE BLOCK
# ===========================================================================
class CryptoSeal(BaseModel):
    """SHA-256 vault seal attached to every payload."""

    model_config = ConfigDict(extra="forbid")

    block_id: str
    hash_algorithm: str = "SHA-256"
    canonical_json_digest: str
    sealed_at_utc: str
    signer: str = "AEGIS-CRYPTO-VAULT/NTRO"


class SpillPayload(BaseModel):
    """Complete sealed intelligence product returned to the analyst."""

    model_config = ConfigDict(extra="forbid")

    request: CoordinateQuery
    sector_name: str
    sector_id: str
    jurisdiction: str = ""
    surveillance_radius_km: float
    telemetry: SatelliteTelemetry
    morphology: SlickMorphology
    slick_geojson: SlickGeoJSON
    drift: DriftVector
    vessels: List[VesselRecord]
    prime_suspect_mmsi: Optional[str]
    pipeline: dict
    vault: CryptoSeal


class VaultVerifyRequest(BaseModel):
    """Arbitrary block submitted for integrity verification."""

    model_config = ConfigDict(extra="forbid")

    block: Dict[str, Union[str, int, float, bool, list, dict, None]]


class VaultVerifyResponse(BaseModel):
    """Result of cryptographic integrity verification."""

    model_config = ConfigDict(extra="forbid")

    block_id: str
    hash_algorithm: str
    verified: bool
    sealed_at_utc: Optional[str] = None
    matched_original_hash: bool = False
    report: str


def utc_now_iso() -> str:
    """UTC ISO-8601 with microseconds, e.g. 2026-05-09T12:34:56.789012+00:00."""
    return datetime.now(timezone.utc).isoformat()