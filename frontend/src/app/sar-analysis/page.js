"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { Satellite, Radar, MapPin, Activity } from "lucide-react";
import { useLiveAIS } from "@/context/LiveAISContext";

/**
 * SAR Spill Intelligence Lab (/sar-analysis) — trigger CFAR analysis on a
 * region, view detected slick morphology, confidence gauges and volume models.
 */

const TOKEN = process.env.NEXT_PUBLIC_AEGIS_TOKEN ?? "";

const SECTOR_PRESETS = [
  { name: "Mumbai High", lat: 19.4, lon: 71.35 },
  { name: "Gulf of Khambhat", lat: 21.31, lon: 72.36 },
  { name: "Chennai Corridor", lat: 13.05, lon: 80.27 },
  { name: "Paradip Anchorage", lat: 20.26, lon: 86.67 },
];

export default function SarAnalysisPage() {
  const { slicks } = useLiveAIS();
  const [lat, setLat] = useState(19.4);
  const [lon, setLon] = useState(71.35);
  const [sensitivity, setSensitivity] = useState(0.5);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const runRegion = useCallback(async (la, lo, sens) => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/v1/sar/analyze-region", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-ZeroTrust-Token": TOKEN },
        body: JSON.stringify({ lat: la, lon: lo, sensitivity: sens }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        if (res.status === 404) {
          throw new Error("SAR endpoint not found — is the AEGIS backend running on port 8000?");
        }
        if (res.status === 401) {
          throw new Error("Zero-trust token rejected — check NEXT_PUBLIC_AEGIS_TOKEN");
        }
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 120)}`);
      }
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }, []);

  const detections = result?.detections ?? [];

  return (
    <div className="space-y-5 pb-16 lg:pb-0">
      <div>
        <p className="text-[10px] font-mono tracking-[0.26em] text-radar-400 uppercase">SAR Spill Intelligence Lab</p>
        <h1 className="text-xl md:text-2xl font-extrabold text-slate-50">CFAR Radar & Spill Analytics</h1>
        <p className="text-xs text-slate-400 mt-1">
          Run an adaptive CFAR detection pass over a synthetic Sentinel-1 IW backscatter tile.
        </p>
      </div>

      {/* Controls */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-crimson-400" />
          <p className="text-[10px] font-mono tracking-[0.2em] text-slate-400">ANALYSIS REGION</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {SECTOR_PRESETS.map((s) => (
            <button
              key={s.name}
              onClick={() => { setLat(s.lat); setLon(s.lon); }}
              className="px-3 py-2 rounded-md border border-white/10 text-[10px] font-mono text-slate-300 hover:border-radar-400/40 hover:text-radar-300 transition-colors"
            >
              {s.name.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="space-y-1.5">
            <span className="text-[9px] font-mono tracking-[0.16em] text-slate-500">LATITUDE</span>
            <input
              type="number" step="0.01" value={lat}
              onChange={(e) => setLat(+e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-navy-900/70 border border-white/10 font-mono text-sm text-slate-200 focus:border-radar-400/40 focus:outline-none"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[9px] font-mono tracking-[0.16em] text-slate-500">LONGITUDE</span>
            <input
              type="number" step="0.01" value={lon}
              onChange={(e) => setLon(+e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-navy-900/70 border border-white/10 font-mono text-sm text-slate-200 focus:border-radar-400/40 focus:outline-none"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[9px] font-mono tracking-[0.16em] text-slate-500">CFAR SENSITIVITY {sensitivity.toFixed(2)}</span>
            <input
              type="range" min="0.1" max="1" step="0.05" value={sensitivity}
              onChange={(e) => setSensitivity(+e.target.value)}
              className="w-full accent-crimson-500"
            />
          </label>
        </div>

        <button
          onClick={() => runRegion(lat, lon, sensitivity)}
          disabled={running}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-crimson-500/15 border border-crimson-500/40 text-crimson-400 text-[11px] font-mono tracking-wider hover:bg-crimson-500/25 transition-colors disabled:opacity-50"
        >
          <Satellite className={`w-4 h-4 ${running ? "animate-pulse" : ""}`} />
          {running ? "PROCESSING CFAR…" : "TRIGGER SAR ANALYSIS"}
        </button>

        {error && <p className="text-[11px] font-mono text-crimson-400">ERROR: {error}</p>}
        {result && !detections.length && (
          <p className="text-[11px] font-mono text-amber-400">NO DARK PATCHES ABOVE CFAR THRESHOLD.</p>
        )}
      </div>

      {/* Detection results */}
      {detections.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-mono tracking-[0.2em] text-slate-400">
            {detections.length} SLICKS SEALED · {result.acquired_at_utc}
          </p>
          {detections.map((d, i) => (
            <motion.div
              key={d.proof_id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="glass-card p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-mono tracking-[0.2em] text-crimson-400 uppercase">{d.proof_id}</p>
                  <p className="text-sm font-bold text-slate-100 mt-0.5">
                    Slick · {d.slick_area_sq_km.toFixed(1)} km² · centroid {d.centroid[0].toFixed(3)}, {d.centroid[1].toFixed(3)}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {[
                    { label: "CONFIDENCE", value: `${d.confidence_score.toFixed(0)}%`, tone: "text-crimson-400" },
                    { label: "VOLUME", value: `${d.estimated_discharge_volume_m3.toFixed(0)} m³`, tone: "text-hazard-400" },
                    { label: "CONTOUR PTS", value: `${d.polygon_coordinates.length}`, tone: "text-radar-300" },
                  ].map((s) => (
                    <div key={s.label} className="text-left">
                      <p className="text-[8px] font-mono tracking-[0.16em] text-slate-500 uppercase">{s.label}</p>
                      <p className={`text-base font-extrabold telemetry-mono ${s.tone}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3 rounded-md border border-white/5 bg-white/[0.02]">
                  <p className="text-[9px] font-mono tracking-[0.16em] text-slate-500 uppercase">CORRELATED SUSPECT</p>
                  {d.suspect_vessel_mmsi ? (
                    <p className="text-sm font-mono text-hazard-400 mt-1">MMSI {d.suspect_vessel_mmsi}</p>
                  ) : (
                    <p className="text-sm font-mono text-slate-500 mt-1">UNATTRIBUTED</p>
                  )}
                  {d.correlation_candidates?.slice(0, 3).map((c) => (
                    <p key={c.mmsi} className="text-[10px] font-mono text-slate-400 truncate">
                      {c.mmsi} · {c.min_distance_km.toFixed(2)} km · {c.confidence.toFixed(0)}%
                    </p>
                  ))}
                </div>

                <div className="p-3 rounded-md border border-white/5 bg-white/[0.02] col-span-1 md:col-span-2">
                  <p className="text-[9px] font-mono tracking-[0.16em] text-slate-500 uppercase">SHA3-512 PROOF CHAIN</p>
                  <p className="text-[10px] font-mono text-slate-400 break-all mt-1">{d.cryptographic_hash}</p>
                  <div className="flex items-center gap-2 mt-2 text-[10px] font-mono">
                    <RowTip label="SIGNATURE" value={d.signature ? `${d.signature.slice(0, 24)}…` : "—"} />
                    <Activity className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">CHAINED</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Live detection stream */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono tracking-[0.24em] text-radar-400">LIVE SAR STREAM</p>
            <p className="text-sm font-bold text-slate-200">Auto-Spawned Detections</p>
          </div>
          <span className="text-[10px] font-mono text-slate-500">{slicks.length} SEALED</span>
        </div>
        <div className="p-5">
          {slicks.length === 0 ? (
            <p className="text-xs font-mono text-slate-500">AWAITING AUTO-ACQUISITION CYCLE…</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slicks.slice(0, 12).map((s) => (
                <span key={s.anomaly_id || s.proof_id} className="px-2.5 py-1 rounded-md border border-crimson-500/25 bg-crimson-500/5 text-[10px] font-mono text-slate-300">
                  <Radar className="inline w-3 h-3 text-crimson-400 mr-1" />
                  {s.proof_id} · {s.slick_area_sq_km?.toFixed?.(1) ?? "--"} km²
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RowTip({ label, value }) {
  return (
    <span className="flex items-center gap-1.5 text-slate-400">
      <span className="text-slate-600 text-[8px]">{label}:</span>
      <span className="text-slate-300">{value}</span>
    </span>
  );
}