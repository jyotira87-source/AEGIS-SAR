"use client";

import { motion } from "framer-motion";
import { Radar, Eye, AlertTriangle } from "lucide-react";

/**
 * VesselCorrelationTable — all vessels detected inside the spatio-temporal
 * envelope, ranked by guilt probability with colour-coded threat badges.
 */
export default function VesselCorrelationTable({ vessels = [], focusedMmsi = null, onInspect, onOpenProof }) {
  const sorted = [...vessels].sort((a, b) => (b.guilt_score ?? 0) - (a.guilt_score ?? 0));

  const badge = (g) => {
    if (g > 80)
      return (
        <span className="relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-crimson-500/15 border border-crimson-500/40 text-crimson-400 text-[11px] font-mono">
          <span className="absolute -inset-0.5 rounded-md border border-crimson-500/50 [animation:pulse_1.6s_ease-in-out_infinite]" />
          <AlertTriangle className="w-3 h-3" /> HIGH · {g}%
        </span>
      );
    if (g >= 30)
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-glow-amber" /> MOD · {g}%
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[11px] font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-glow-emerald" /> LOW · {g}%
      </span>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card overflow-hidden"
    >
      <div className="px-5 pt-4 pb-2 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-mono tracking-[0.24em] text-cyan-400">ATTRIBUTION MATRIX</p>
          <p className="text-sm font-bold text-slate-200">Vessel Correlation — Spatio-Temporal Bounds</p>
        </div>
        <span className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
          <Radar className="w-3.5 h-3.5 text-emerald-400" /> {sorted.length} CONTACTS
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[820px]">
          <thead>
            <tr className="border-y border-white/10 bg-white/[0.02]">
              {["MMSI", "Vessel Name", "Flag", "Type", "Speed (kn)", "Dist. to Slick (km)", "Guilt Probability", "Action"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-[9px] font-mono tracking-[0.18em] text-slate-500 uppercase whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-xs font-mono text-slate-500">
                  NO AIS CONTACTS IN ENVELOPE — AWAITING ANALYSIS FEED
                </td>
              </tr>
            )}
            {sorted.map((v, i) => (
              <tr
                key={v.mmsi}
                className={`border-b border-white/5 transition-colors hover:bg-white/[0.03] ${
                  v.guilt_score > 85 ? "bg-crimson-500/[0.06]" : ""
                } ${focusedMmsi === v.mmsi ? "!bg-cyan-400/[0.09] ring-1 ring-inset ring-cyan-400/40" : ""}`}
              >
                <td className="px-4 py-3 font-mono text-[11px] text-cyan-300 whitespace-nowrap">{v.mmsi}</td>
                <td className="px-4 py-3 text-xs font-medium text-slate-200 whitespace-nowrap">
                  {v.guilt_score > 85 && <span className="mr-1.5 text-crimson-400">●</span>}
                  {v.vessel_name}
                </td>
                <td className="px-4 py-3 text-[11px] text-slate-400 whitespace-nowrap">{v.flag_state}</td>
                <td className="px-4 py-3 text-[11px] text-slate-300 whitespace-nowrap">{v.vessel_type}</td>
                <td className="px-4 py-3 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                  {v.speed_over_ground_knots?.toFixed?.(1) ?? "--"}
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                  {v.distance_to_centroid_km?.toFixed?.(2) ?? "--"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{badge(v.guilt_score ?? 0)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <button
                    onClick={() => onInspect?.(v.mmsi)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-400 text-[10px] font-mono hover:bg-cyan-400/20 transition-colors"
                  >
                    <Eye className="w-3 h-3" /> INSPECT TELEMETRY
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {onOpenProof && (
        <div className="px-5 py-3 border-t border-white/10 flex items-center justify-end">
          <button
            onClick={onOpenProof}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-mono tracking-wider hover:bg-emerald-500/20 transition-colors"
          >
            <Radar className="w-4 h-4" /> OPEN CRYPTOGRAPHIC PROOF
          </button>
        </div>
      )}
    </motion.div>
  );
}