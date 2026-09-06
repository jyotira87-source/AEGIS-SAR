# PROJECT AEGIS-SAR (SIH26143)

**Automated SAR Oil Spill Detection & AIS Vessel Correlation Platform**

A dual-layered maritime intelligence system — sponsored capability prototype for the
**National Technical Research Organisation (NTRO)** — that detects oil slicks in Synthetic
Aperture Radar (SAR) satellite imagery and attributes offending vessels from Automatic
Identification System (AIS) trajectory data.

---

## Architecture

```
aegis-sar/
├── backend/                          # FastAPI intelligence service (Python 3.11)
│   ├── runtime.txt                   # python-3.11.9
│   ├── requirements.txt
│   ├── config.py                     # Zero-trust token, host/port, CORS
│   ├── models.py                     # Strict Pydantic v2 schemas
│   ├── sar_engine.py                 # Synthetic Sentinel-1 C-band slick generator
│   ├── ais_correlator.py             # AIS simulation, SLERP trails, guilt scoring
│   ├── crypto_vault.py               # Canonical JSON → SHA-256 sealing
│   └── main.py                       # Routes, CORS, zero-trust auth
└── frontend/                         # Next.js 14 command dashboard
    ├── public/data/sample_detection.json
    └── src/
        ├── app/                      # layout.js, page.js, globals.css
        └── components/               # 9 tactical UI widgets incl. MapLibre satellite map
```

## Detection Pipeline

1. **SAR Layer** — Synthetic Sentinel-1 C-band (VV/VH, IW swath) dark-patch generation with
   slick area (4.2–28.5 km²), perimeter, circularity index, major-axis orientation, radar
   contrast (−3.5 to −8.2 dB) and a tidal+wind driven centroid drift model. Slick geometry is
   emitted as WGS84 GeoJSON multi-polygons (core + sheen rings) centred on the request point.
2. **AIS Layer** — Simulated transponder streams within a 50 km reconnaissance radius,
   6-hour trajectory reconstruction using SLERP (Spherical Linear Interpolation), and a
   weighted spatio-temporal intersection guilt heuristic:

   ```
   G = 0.45·D_spatial + 0.30·S_anomaly + 0.15·T_type + 0.10·C_maneuver
   ```
   - `D_spatial` — proximity score (95 pts inside 2.5 km)
   - `S_anomaly` — cruise→discharge speed collapse penalty
   - `T_type` — vessel class risk (tanker 1.0, cargo 0.6, fishing 0.2)
   - `C_maneuver` — course zigzag / loop detection
3. **Vault Layer** — Deterministic canonical JSON (sorted keys, compact separators) hashed
   with SHA-256; every payload is sealed into an immutable intelligence block with a UTC
   ISO-8601 timestamp and can be re-verified byte-for-byte by any audit client.

## Backend API

| Method | Endpoint                        | Purpose                                    |
| ------ | ------------------------------- | ------------------------------------------ |
| GET    | `/`                             | Health check + sensor status               |
| GET    | `/api/v1/sectors`               | List operational coastal surveillance sectors |
| POST   | `/api/v1/analyze-slick`         | Run SAR segmentation + AIS correlation, seal and return block |
| GET    | `/api/v1/vault/verify/{hash_id}`| Validate a stored sealed block by hash id  |
| POST   | `/api/v1/vault/verify`          | Validate an arbitrary supplied sealed block |

Every request must carry:

```
X-ZeroTrust-Token: <AEGIS_ZERO_TRUST_TOKEN>
```

### Environment Variables

Secrets are **never committed**. Copy the provided templates before running:

```bash
# Backend
cp backend/.env.example backend/.env        # then set AEGIS_ZERO_TRUST_TOKEN

# Frontend
cp frontend/.env.local.example frontend/.env.local   # must match the backend token
```

| Variable                  | Location                | Purpose                                        |
| ------------------------- | ----------------------- | ---------------------------------------------- |
| `AEGIS_ZERO_TRUST_TOKEN`  | `backend/.env`          | Zero-trust token verified on every API request |
| `AEGIS_HOST` / `AEGIS_PORT` | `backend/.env`        | Server binding overrides (optional)            |
| `AEGIS_ALLOWED_ORIGINS`   | `backend/.env`          | CORS allow-list (optional)                     |
| `NEXT_PUBLIC_AEGIS_TOKEN` | `frontend/.env.local`   | Token sent by the dashboard                    |
| `AEGIS_API_URL`           | `frontend/.env.local`   | Backend target for the `/api/*` proxy (optional) |

## Quick Start

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                # set AEGIS_ZERO_TRUST_TOKEN
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local    # must match the backend token
npm run dev          # http://localhost:3000
```

The Next.js dev server proxies `/api/*` to `http://127.0.0.1:8000/api/*`. If the backend
is offline the dashboard automatically falls back to a bundled sample intelligence block
(`public/data/sample_detection.json`) so the full UI can be evaluated independently.

### Satellite Map (token-free)

`InteractiveVesselMap.jsx` renders **real satellite imagery** via MapLibre GL with free
**Esri World Imagery** raster tiles — no Mapbox token or account is required. It draws the
crimson slick polygon, dashed historical AIS trails, hover popups (MMSI / speed / guilt),
a flashing red target marker on the high-guilt offender, and `flyTo` choreography when a
new sector is analysed or a vessel is selected via **INSPECT TELEMETRY**.

## Operational Sectors

| Sector ID                 | Centre                | Jurisdiction                        |
| ------------------------- | --------------------- | ----------------------------------- |
| `mumbai_high_offshore`    | 19.4167°N, 71.3833°E  | Bombay High offshore oil fields     |
| `gulf_of_khambhat`        | 21.3120°N, 72.3610°E  | Gujarat coast                       |
| `chennai_port_corridor`   | 13.0827°N, 80.2707°E  | Tamil Nadu / Bay of Bengal          |
| `paradip_anchorage`       | 20.2644°N, 86.6712°E  | Odisha crude terminal approaches    |

## Security & Disclaimer

- **Zero-trust** token enforcement on all endpoints.
- **Canonical JSON + SHA-256** sealing with tamper-evidence verification.
- This is a sensor-fusion **simulation** for tactical evaluation and capability
  demonstration — not an operational interception system.

---

## Deployment

The project is configured for **backend on Render** + **frontend on Vercel**.

### 1. Backend → Render (Blueprint deploy)

The repository includes a [`render.yaml`](render.yaml) blueprint. To deploy:

1. Push this repo to GitHub (done) and go to the
   [Render Dashboard](https://dashboard.render.com) → **New → Blueprint** →
   select `jyotira87-source/AEGIS-SAR`.
2. Render reads `render.yaml` and creates the `aegis-sar-backend` web service
   (root dir `backend`, build `pip install -r requirements.txt`,
   start `uvicorn main:app --host 0.0.0.0 --port $PORT`, health check `/`).
3. Fill in the prompted environment variables:

   | Variable | Value |
   | -------- | ----- |
   | `AEGIS_ZERO_TRUST_TOKEN` | The token from `backend/.env` (must match the frontend) |
   | `AEGIS_ALLOWED_ORIGINS` | `https://<your-vercel-app>.vercel.app` (comma-separate extra preview domains) |

4. Deploy and copy the service URL, e.g. `https://aegis-sar-backend.onrender.com`.

> **Note (free tier):** the service sleeps after ~15 minutes of inactivity; the
> first request afterwards takes ~30–50 s to wake it up. The in-memory vault
> registry is cleared whenever the instance restarts.

### 2. Frontend → Vercel

1. Go to the [Vercel Dashboard](https://vercel.com/new) → **Import** the
   `jyotira87-source/AEGIS-SAR` repository.
2. In **Settings → General → Root Directory**, set `frontend`
   (Vercel auto-detects Next.js 14; no extra build settings needed).
3. In **Settings → Environment Variables**, add:

   | Variable | Value |
   | -------- | ----- |
   | `AEGIS_API_URL` | `https://aegis-sar-backend.onrender.com` (your Render URL from step 1.4) |
   | `NEXT_PUBLIC_AEGIS_TOKEN` | The same zero-trust token set on Render |

4. Deploy. The `next.config.js` rewrite proxies dashboard calls from
   `/api/*` → `$AEGIS_API_URL/api/*`, so the backend must be reachable before
   the build caches the rewrite target (`NEXT_PUBLIC_*` and rewrite values are
   inlined at build time — redeploy after changing them).

### 3. Post-deploy smoke test

```bash
curl https://aegis-sar-backend.onrender.com/        # health check
curl -X POST https://aegis-sar-backend.onrender.com/api/v1/analyze-slick \
  -H "Content-Type: application/json" \
  -H "X-ZeroTrust-Token: <token>" \
  -d '{"sector_id": "mumbai_high_offshore"}'
```

---

_Project AEGIS-SAR (SIH26143) · NTRO Maritime Intelligence · Next.js 14 / FastAPI / PyTorch-oriented pipeline._