"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Satellite, Network, Radar, FileLock2, Play, Loader2, CheckCircle2, MapPin, Lock } from "lucide-react";

/**
 * SpillIntelligenceConsole — dual coordinate input + execution console.
 * Sector presets (Mumbai High, Gulf of Khambhat, Chennai, Paradip), manual
 * WGS84 + radius inputs, a 4-stage live pipeline stepper, and the execution
 * trigger that drives the backend analysis chain.
 */
const PIPELINE_STAGES = [
  { key: "sar", label: "Sentinel-1 SAR Imagery Pull", icon: Satellite, detail: "C-Band VV/VH · IW swath" },
  { key: "unet", label: "U-Net Dark Slick Segmentation", icon: Network, detail: "Core + sheen morphology" },
  { key: "ais", label: "AIS Historical Trajectory Matching", icon: Radar, detail: "SLERP · 6h spatio-temporal window" },
  { key: "seal", label: "SHA-256 Cryptographic Sealing", icon: FileLock2, detail: "Canonical JSON · immutable block" },
];

export default function SpillIntelligenceConsole({ sectors = [], onAnalyze, running = false, pipelineStep = -1, hasResult = false }) {
  const [selectedId, setSelectedId] = useState("mumbai_high_offshore");
  const [lat, setLat] = useState("19.4167");
  const [lon, setLon] = useState("71.3833");
  const [radius, setRadius] = useState("50");
  const [mode, setMode] = useState("preset"); // preset | manual

  const selectedSector = sectors.find((s) => s.id === selectedId);

  useEffect(() => {
    if (selectedSector && mode === "preset") {
      setLat(selectedSector.lat.toFixed(4));
      setLon(selectedSector.lon.toFixed(4));
    }
  }, [selectedId, mode, selectedSector]);

  const execute = () => {
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    const radiusNum = parseFloat(radius);
    if (Number.isNaN(latNum) || Number.isNaN(lonNum)) return;
    onAnalyze({
      lat: latNum,
      lon: lonNum,
      surveillance_radius_km: Number.isNaN(radiusNum) ? 50 : radiusNum,
      analysis_window_hours: 6,
    });
  };

  const stageIconColor = (idx) => {
    if (running && pipelineStep === idx) return "text-cyan-400 border-cyan-400/40 bg-cyan-400/10";
    if (pipelineStep > idx || (hasResult && !running)) return "text-emerald-400 border-emerald-500/40 bg-emerald-500/10";
    return "text-slate-500 border-white/10 bg-white/5";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-5 space-y-5"
    >
      <div>
        <p className="text-[10px] font-mono tracking-[0.24em] text-cyan-400">ANALYST QUERY CONSOLE</p>
        <p className="text-sm font-bold text-slate-200">Target Sector & Acquisition Params</p>
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-lg border border-white/10 bg-black/25 p-1 max-w-xs">
        {["preset", "manual"].map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 px-3 py-1.5 rounded-md text-[11px] font-mono tracking-wider transition-colors ${
              mode === m ? "bg-cyan-400/15 text-cyan-300 border border-cyan-400/30" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {m === "preset" ? "SECTOR PRESET" : "MANUAL WGS84"}
          </button>
        ))}
      </div>

      {/* Sector presets */}
      {mode === "preset" ? (
        <div className="grid grid-cols-2 gap-2">
          {sectors.map((s) => {
            const active = s.id === selectedId;
            return (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className={`rounded-lg border p-3 text-left transition-all ${
                  active
                    ? "border-cyan-400/45 bg-cyan-400/10 shadow-glow-cyan"
                    : "border-white/10 bg-white/[0.02] hover:border-cyan-400/20 hover:bg-white/[0.05]"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <MapPin className={`w-3.5 h-3.5 ${active ? "text-cyan-400" : "text-slate-500"}`} />
                  <p className={`text-[11px] font-semibold truncate ${active ? "text-cyan-300" : "text-slate-300"}`}>{s.name}</p>
                </div>
                <p className="font-mono text-[9px] text-slate-500">
                  {s.lat.toFixed(4)}°N / {s.lon.toFixed(4)}°E
                </p>
                <p className="mt-1 text-[8px] font-mono tracking-wider text-amber-400/70 uppercase truncate">{s.risk_rating}</p>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "LATITUDE", value: lat, set: setLat, unit: "°N", step: "0.0001" },
            { label: "LONGITUDE", value: lon, set: setLon, unit: "°E", step: "0.0001" },
            { label: "RADIUS", value: radius, set: setRadius, unit: "km", step: "1" },
          ].map((f) => (
            <div key={f.label} className="rounded-lg border border-white/10 bg-black/25 p-2.5">
              <p className="text-[8px] font-mono tracking-[0.2em] text-slate-500 mb-1">{f.label}</p>
              <input
                type="number"
                step={f.step}
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                className="w-full bg-transparent outline-none text-sm font-mono text-cyan-300 placeholder-slate-600"
              />
            </div>
          ))}
        </div>
      )}

      {/* Pipeline stepper */}
      <div className="rounded-lg border border-white/10 bg-black/25 p-4">
        <p className="text-[9px] font-mono tracking-[0.2em] text-slate-500 mb-3">DETECTION PIPELINE</p>
        <div className="space-y-3">
          {PIPELINE_STAGES.map((stage, idx) => {
            const done = pipelineStep > idx || (hasResult && !running);
            const active = running && pipelineStep === idx;
            return (
              <div key={stage.key} className="flex items-center gap-3">
                <div className={`shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center ${stageIconColor(idx)}`}>
                  {done && !active ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : active ? (
                    <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  ) : (
                    <stage.icon className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1">
                  <p className={`text-xs font-semibold ${active ? "text-cyan-300" : done ? "text-emerald-400" : "text-slate-400"}`}>
                    {idx + 1}. {stage.label}
                  </p>
                  <p className="text-[9px] font-mono text-slate-600">{stage.detail}</p>
                </div>
                {active && <span className="text-[9px] font-mono text-cyan-400 blink">PROCESSING</span>}
                {done && !active && <span className="text-[9px] font-mono text-emerald-500/70">COMPLETE</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Execute */}
      <button
        onClick={execute}
        disabled={running}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-lg bg-gradient-to-r from-emerald-500/20 via-cyan-500/15 to-emerald-500/20 border border-emerald-500/35 text-emerald-400 text-xs font-mono tracking-[0.22em] hover:border-emerald-400/60 hover:shadow-glow-emerald transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {running ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> EXECUTING FULL ANALYSIS CHAIN…
          </>
        ) : (
          <>
            <Play className="w-4 h-4" /> EXECUTE DUAL-LAYER DETECTION
            <Lock className="w-3.5 h-3.5 opacity-60" />
          </>
        )}
      </button>
    </motion.div>
  );
}