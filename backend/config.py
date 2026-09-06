"""
PROJECT AEGIS-SAR (SIH26143)
config.py — System-level configuration for the NTRO maritime intelligence stack.

Pydantic-settings driven: every operational value is read from the environment
(or a local .env file) with hardened defaults. Legacy module-level exports
(ZERO_TRUST_TOKEN, HOST, PORT, ALLOWED_ORIGINS, ...) are preserved so existing
modules keep working unchanged.
"""

from __future__ import annotations

import os
from typing import List

from dotenv import load_dotenv
from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv()


class Settings(BaseSettings):
    """Master runtime settings (env-prefixed AEGIS_ where legacy names apply)."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "AEGIS-SAR Maritime Surveillance Engine"

    # --- Server binding (legacy AEGIS_HOST / AEGIS_PORT) -------------------
    host: str = Field(default="0.0.0.0", validation_alias=AliasChoices("AEGIS_HOST", "HOST"))
    port: int = Field(default=8000, validation_alias=AliasChoices("AEGIS_PORT", "PORT"))

    # --- Zero-trust security (legacy AEGIS_ZERO_TRUST_TOKEN) ---------------
    zero_trust_token: str = Field(
        default="",
        validation_alias=AliasChoices("AEGIS_ZERO_TRUST_TOKEN", "ZERO_TRUST_TOKEN"),
    )
    allowed_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000",
        validation_alias=AliasChoices("AEGIS_ALLOWED_ORIGINS", "ALLOWED_ORIGINS"),
    )

    # --- Live data feeds (optional credentials) -----------------------------
    aisstream_api_key: str = ""
    sentinel_hub_client_id: str = ""
    sentinel_hub_client_secret: str = ""

    # --- Surveillance corridor (Arabian Sea / Bay of Bengal / Indian Ocean) --
    default_bounding_box: List[float] = [23.0, 67.0, 31.5, 88.5]  # [S, W, N, E]

    # --- Real-time simulation fallback ---------------------------------------
    fallback_simulation_enabled: bool = True
    simulation_vessel_count: int = 350
    update_interval_seconds: float = 1.0
    vessel_tick_sample_seconds: float = 150.0  # breadcrumb decimation interval

    # --- Cryptographic vault --------------------------------------------------
    jwt_vault_secret: str = "AEGIS_TOP_SECRET_SHA512_SALT_KEY_2026"

    # --- Legacy analytic constants --------------------------------------------
    default_surveillance_radius_km: float = 50.0
    trajectory_lookback_hours: float = 6.0
    slerp_sample_minutes: float = 5.0


settings = Settings()

# ---------------------------------------------------------------------------
# Zero-Trust Security — hard requirement for the intelligence API.
# ---------------------------------------------------------------------------
ZERO_TRUST_TOKEN = settings.zero_trust_token
if not ZERO_TRUST_TOKEN:
    raise RuntimeError(
        "AEGIS_ZERO_TRUST_TOKEN is not set. "
        "Copy backend/.env.example to backend/.env and configure the "
        "zero-trust token before starting the API."
    )

# ---------------------------------------------------------------------------
# Legacy exports (backwards compatible with sar_engine / main imports)
# ---------------------------------------------------------------------------
HOST = settings.host
PORT = settings.port
ALLOWED_ORIGINS = [
    origin.strip() for origin in settings.allowed_origins.split(",") if origin.strip()
]
DEFAULT_SURVEILLANCE_RADIUS_KM = settings.default_surveillance_radius_km
TRAJECTORY_LOOKBACK_HOURS = settings.trajectory_lookback_hours
SLERP_SAMPLE_MINUTES = settings.slerp_sample_minutes


def describe() -> dict:
    """Return a JSON-serialisable summary of the active configuration."""
    return {
        "host": HOST,
        "port": PORT,
        "allowed_origins": ALLOWED_ORIGINS,
        "surveillance_radius_km": DEFAULT_SURVEILLANCE_RADIUS_KM,
        "trajectory_lookback_hours": TRAJECTORY_LOOKBACK_HOURS,
        "zero_trust_header": "X-ZeroTrust-Token",
        "validate_endpoint_security": True,
        "bounding_box": settings.default_bounding_box,
        "fallback_simulation_enabled": settings.fallback_simulation_enabled,
        "simulation_vessel_count": settings.simulation_vessel_count,
        "update_interval_seconds": settings.update_interval_seconds,
        "aisstream_configured": bool(settings.aisstream_api_key),
        "sentinel_hub_configured": bool(settings.sentinel_hub_client_id),
        "vault_hash_algorithm": "SHA3-512",
    }