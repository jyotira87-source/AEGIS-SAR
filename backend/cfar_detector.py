"""
PROJECT AEGIS-SAR (SIH26143)
cfar_detector.py — Adaptive CFAR dark-patch detection over synthetic
Sentinel-1 C-band backscatter.

Pipeline:
  1. Backscatter tile synthesis — speckled (Gamma-distributed) VV/VH sigma0
     field with physical dark patches (oil dampens capillary waves => ~ -3 to
     -9 dB negative contrast ellipses with wind-streak texture).
  2. Cell-Averaging CFAR — sliding guard + training windows (vectorised via
     scipy.ndimage.uniform_filter), threshold factor alpha from the target
     false-alarm probability P_fa: alpha = N * (Pfa^(-1/N) - 1).
  3. Morphological cleaning — binary opening/closing to de-speckle detections.
  4. Connected-component analysis — slick blobs -> shapely polygons (convex
     hull of pixel centroids) with area, volume and contrast-derived confidence.
"""

from __future__ import annotations

import math
import random
import time
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from scipy import ndimage
from shapely.geometry import MultiPoint, Polygon


# ---------------------------------------------------------------------------
# Step 1 — Synthetic Sentinel-1 backscatter tile
# ---------------------------------------------------------------------------
def synthesize_backscatter(
    lat: float,
    lon: float,
    sensitivity: float = 0.5,
    rng: Optional[random.Random] = None,
    grid: int = 160,
    tile_km: float = 40.0,
) -> Tuple[np.ndarray, List[Dict[str, Any]], Dict[str, float]]:
    """
    Generate a sigma0 (dB) tile centred on (lat, lon).

    Returns (sigma0_grid, ground_truth_patches, geo_meta).
    """
    rng = rng or random.Random()
    meta = {
        "lat": lat,
        "lon": lon,
        "tile_km": tile_km,
        "grid": grid,
        "polarization": "VV",
        "sensor": "SENTINEL-1 IW GRD (synthetic)",
    }

    # Sea clutter: Gamma speckle around a wind-roughened -7.5 dB background.
    wind = rng.uniform(4.0, 9.0)
    background = -7.5 + (wind - 6.0) * 0.35
    np_rng = np.random.default_rng(rng.randint(0, 2**31 - 1))
    speckle = np_rng.gamma(4.0, 0.55, size=(grid, grid))
    sigma0 = background + (speckle - speckle.mean()) * 1.6

    # Wind streak texture (sinusoidal rows, typical of IW GRD scenes).
    xs = np.arange(grid)
    streaks = 0.5 * np.sin((xs / grid) * math.pi * rng.randint(6, 14))
    sigma0 += np.tile(streaks, (grid, 1))

    # Embed 1-3 dark slick patches (ellipses with soft edges).
    n_patches = rng.randint(1, 3)
    patches: List[Dict[str, Any]] = []
    for _ in range(n_patches):
        cx = rng.uniform(grid * 0.2, grid * 0.8)
        cy = rng.uniform(grid * 0.2, grid * 0.8)
        ax = rng.uniform(grid * 0.06, grid * 0.16)
        bx = ax * rng.uniform(0.35, 0.7)
        theta = rng.uniform(0.0, math.pi)
        depth = -(6.0 + (1.0 - sensitivity) * 3.0 + rng.uniform(1.5, 4.5))
        yy, xx = np.mgrid[0:grid, 0:grid]
        ct, st = math.cos(theta), math.sin(theta)
        ell = ((xx - cx) * ct + (yy - cy) * st) ** 2 / ax**2 + (
            (xx - cx) * st - (yy - cy) * ct
        ) ** 2 / bx**2
        mask = np.clip(1.0 - ell, 0.0, 1.0) ** 1.5
        sigma0 += mask * depth

        px_km = tile_km / grid
        area_px = math.pi * ax * bx
        area_sq_km = area_px * px_km * px_km
        glat = lat + (cy - grid / 2) * px_km / 111.32
        glon = lon + (cx - grid / 2) * px_km / (111.32 * math.cos(math.radians(lat)))
        patches.append(
            {
                "cx": float(cx), "cy": float(cy), "ax": float(ax), "bx": float(bx),
                "theta": float(theta), "depth_db": round(depth, 2),
                "area_sq_km": round(area_sq_km, 2),
                "lat": round(glat, 5), "lon": round(glon, 5),
            }
        )

    return sigma0, patches, meta


# ---------------------------------------------------------------------------
# Step 2 — Cell-Averaging CFAR (negative contrast / dark targets)
# ---------------------------------------------------------------------------
def ca_cfar_dark(
    sigma0: np.ndarray, pfa: float = 1e-3, guard: int = 2, train: int = 8
) -> np.ndarray:
    """
    Vectorised CA-CFAR tuned for DARK targets (slicks suppress backscatter).

    A cell is flagged when signal < background - alpha * noise_scale, with
    alpha = N * (Pfa^(-1/N) - 1) and N the number of training cells.
    """
    kernel = 2 * (train + guard) + 1

    # Background: mean over the training annulus = full window minus guard box.
    full = ndimage.uniform_filter(sigma0, size=kernel, mode="nearest")
    inner = ndimage.uniform_filter(sigma0, size=2 * guard + 1, mode="nearest")
    full_cells = kernel * kernel
    guard_cells = (2 * guard + 1) ** 2
    n_train = full_cells - guard_cells
    background = (full * full_cells - inner * guard_cells) / n_train

    # Noise scale: local standard deviation via second moment.
    sq_full = ndimage.uniform_filter(sigma0**2, size=kernel, mode="nearest")
    sq_inner = ndimage.uniform_filter(sigma0**2, size=2 * guard + 1, mode="nearest")
    background_sq = (sq_full * full_cells - sq_inner * guard_cells) / n_train
    variance = np.maximum(background_sq - background**2, 1e-6)
    noise = np.sqrt(variance)

    alpha = n_train * (pfa ** (-1.0 / n_train) - 1.0)
    return sigma0 < (background - alpha * noise * 0.35)  # dark-target polarity


# ---------------------------------------------------------------------------
# Steps 3 + 4 — Morphology, connected components, polygon extraction
# ---------------------------------------------------------------------------
def extract_anomalies(
    sigma0: np.ndarray,
    meta: Dict[str, float],
    sensitivity: float = 0.5,
) -> List[Dict[str, Any]]:
    """CFAR seeds -> morphology -> region growing -> polygons.

    Standard SAR dark-patch chain: the CFAR flags the sharp rim of each
    negative-contrast patch, then a masked region-growing pass (constrained
    flood fill) expands those seeds across the full connected dark area so the
    slick's true extent is recovered, not just its edge.
    """
    pfa = 1e-2 * sensitivity
    seeds = ca_cfar_dark(sigma0, pfa=pfa)
    # Thicken the CFAR rim seeds (a dilated closing, no erosion — the rim is
    # often a broken thin ring that a 3x3 opening would erase).
    seeds = ndimage.binary_dilation(seeds, structure=np.ones((3, 3)))
    seeds = ndimage.binary_closing(seeds, structure=np.ones((5, 5)))

    # Sea-surface clutter level (robust estimate) — the region-growing mask.
    sea_level = float(np.median(sigma0))
    sea_std = float(np.std(sigma0))
    # Slicks are damped by several dB below the modal sea clutter.
    dark_mask = sigma0 < (sea_level - max(0.7, 0.35 * sea_std))
    grown = ndimage.binary_propagation(seeds, mask=dark_mask)

    labels, n_components = ndimage.label(grown)
    grid = sigma0.shape[0]
    tile_km = meta["tile_km"]
    lat, lon = meta["lat"], meta["lon"]
    px_km = tile_km / grid

    anomalies: List[Dict[str, Any]] = []
    for idx in range(1, n_components + 1):
        ys, xs = np.where(labels == idx)
        if len(ys) < 60:  # reject speckle blobs after growth
            continue

        # Confidence input: mean negative contrast inside the blob.
        contrast = float(np.mean(sigma0[ys, xs])) - sea_level
        area_px = len(ys)
        area_sq_km = area_px * px_km * px_km
        if area_sq_km < 1.2 or area_sq_km > 120.0:
            continue
        if contrast >= -1.5:  # require a genuine dark signature
            continue

        # Pixel centroids -> geographic convex hull polygon (lon, lat).
        points = []
        step = max(1, len(ys) // 60)
        for y, x in zip(ys[::step], xs[::step]):
            plat = lat + (y - grid / 2) * px_km / 111.32
            plon = lon + (x - grid / 2) * px_km / (111.32 * math.cos(math.radians(lat)))
            points.append([plon, plat])
        hull: Polygon = MultiPoint(points).convex_hull
        ring = list(hull.exterior.coords)
        centroid = [round(hull.centroid.x, 5), round(hull.centroid.y, 5)]

        mean_depth = round(min(contrast, -1.0), 2)
        confidence = round(min(99.0, 40.0 + abs(mean_depth) * 7.0 + min(area_sq_km, 25.0)), 1)
        volume_m3 = round(area_sq_km * 1e6 * 0.0009, 1)  # mean film thickness ~0.9 mm

        anomalies.append(
            {
                "polygon_coordinates": [[round(p[0], 5), round(p[1], 5)] for p in ring],
                "centroid": centroid,
                "slick_area_sq_km": round(area_sq_km, 2),
                "estimated_discharge_volume_m3": volume_m3,
                "confidence_score": confidence,
                "mean_contrast_db": mean_depth,
                "pixel_count": int(area_px),
                "sar_meta": meta,
            }
        )

    anomalies.sort(key=lambda a: a["confidence_score"], reverse=True)
    return anomalies


def detect_region(
    lat: float,
    lon: float,
    sensitivity: float = 0.5,
    seed: Optional[int] = None,
) -> Dict[str, Any]:
    """Full CFAR pass over one region — used by POST /api/v1/sar/analyze-region."""
    rng = random.Random(seed if seed is not None else int(time.time() * 1000) % (2**31))
    sigma0, truth, meta = synthesize_backscatter(lat, lon, sensitivity, rng)
    anomalies = extract_anomalies(sigma0, meta, sensitivity)
    return {
        "acquired_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sar_meta": meta,
        "ground_truth_patches": truth,
        "anomalies": anomalies,
    }