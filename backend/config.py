"""
PROJECT AEGIS-SAR (SIH26143)
config.py — System-level configuration for the NTRO maritime intelligence stack.

All sensitive operational values are pulled from the environment first and fall
back to hardened defaults documented in the mission brief. Loaded via
python-dotenv so a local `.env` file can override the defaults in deployment.
"""

import os

from dotenv import load_dotenv

# Load local environment overrides if present (ignored silently if absent).
load_dotenv()

# ---------------------------------------------------------------------------
# Zero-Trust Security
# ---------------------------------------------------------------------------
# Read from the environment (backend/.env) — never hardcode this value.
ZERO_TRUST_TOKEN = os.getenv("AEGIS_ZERO_TRUST_TOKEN", "")
if not ZERO_TRUST_TOKEN:
    raise RuntimeError(
        "AEGIS_ZERO_TRUST_TOKEN is not set. "
        "Copy backend/.env.example to backend/.env and configure the "
        "zero-trust token before starting the API."
    )

# ---------------------------------------------------------------------------
# Network / Server Binding
# ---------------------------------------------------------------------------
HOST = os.getenv("AEGIS_HOST", "0.0.0.0")
PORT = int(os.getenv("AEGIS_PORT", "8000"))

# ---------------------------------------------------------------------------
# CORS — only the local Next.js dev server may talk to this API.
# ---------------------------------------------------------------------------
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "AEGIS_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if origin.strip()
]

# ---------------------------------------------------------------------------
# Operational Constants
# ---------------------------------------------------------------------------
# Default reconnaissance radius (km) around a requested coordinate centre.
DEFAULT_SURVEILLANCE_RADIUS_KM = 50.0

# Historical trajectory reconstruction window (hours) prior to SAR acquisition.
TRAJECTORY_LOOKBACK_HOURS = 6.0

# Reconstructed path sampling step (minutes) used for SLERP interpolation.
SLERP_SAMPLE_MINUTES = 5.0


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
    }