"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Waves, Gauge } from "lucide-react";

/**
 * SpillMorphologyChart — dual Recharts panels:
 *   1. AreaChart  : SAR radar cross-section (dB attenuation) across the slick
 *   2. BarChart   : vessel proximity (km) vs groundspeed (knots) during window
 */
export default function SpillMorphologyChart({ slick, vessels }) {
  const crossSection = useMemo(() => {
    const minDb = slick?.max_attenuation_dB ?? -8.2;
    const meanDb = slick?.mean_contrast_dB ?? -5.5;
    const coreIdx = 24;
    const n = 49;
    const out = [];
    for (let i = 0; i < n; i++) {
      const dist = Math.abs(i - coreIdx) / coreIdx; // 0 core .. 1 edge
      // Smooth radar backscatter curve: deepest at core, recovering at edges.
      const depth = dist <= 1 ? meanDb + (minDb - meanDb) * Math.pow(1 - dist, 1.6) * Math.cos(dist * 1.2) : meanDb;
      out.push({
        idx: i,
        km: (((i - coreIdx) * 2.6) / 5).toFixed(1),
        attenuationDb: Number(depth.toFixed(2)),
      });
    }
    return out;
  }, [slick]);

  const vesselBars = useMemo(
    () =>
      (vessels ?? []).map((v) => ({
        name: v.mmsi?.slice(-4),
        mmsi: v.mmsi,
        distance: Number((v.distance_to_centroid_km ?? 0).toFixed(2)),
        speed: Number((v.speed_over_ground_knots ?? 0).toFixed(1)),
        guilt: v.guilt_score ?? 0,
      })),
    [vessels]
  );

  const barColors = (entry) => (entry.guilt > 85 ? "#f43f5e" : entry.guilt > 30 ? "#f59e0b" : "#22d3ee");

  const tooltipStyle = {
    background: "rgba(11,15,25,0.96)",
    border: "1px solid rgba(148,163,184,0.25)",
    borderRadius: "8px",
    fontSize: "11px",
    fontFamily: "JetBrains Mono, monospace",
  };

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 pt-4 pb-2">
        <p className="text-[10px] font-mono tracking-[0.24em] text-cyan-400">RADAR BACKSCATTER ANALYSIS</p>
        <p className="text-sm font-bold text-slate-200">Slick Morphology & Vessel Kinematics</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
        {/* Area chart — dB cross-section */}
        <div className="rounded-lg border border-white/10 bg-black/25 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Waves className="w-4 h-4 text-emerald-400" />
            <p className="text-[10px] font-mono tracking-widest text-slate-400 uppercase">SAR Cross-Section — dB Attenuation</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={crossSection} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="attenGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.85} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(148,163,184,0.1)" strokeDasharray="3 3" />
              <XAxis dataKey="km" stroke="#475569" tick={{ fill: "#64748b", fontSize: 10, fontFamily: "JetBrains Mono" }} label={{ value: "km", position: "insideBottomRight", fill: "#334155", fontSize: 10 }} />
              <YAxis stroke="#475569" tick={{ fill: "#64748b", fontSize: 10, fontFamily: "JetBrains Mono" }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} dB`, "Attenuation"]} />
              <Area type="monotone" dataKey="attenuationDb" stroke="#f43f5e" strokeWidth={2} fill="url(#attenGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Bar chart — proximity vs speed */}
        <div className="rounded-lg border border-white/10 bg-black/25 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Gauge className="w-4 h-4 text-amber-400" />
            <p className="text-[10px] font-mono tracking-widest text-slate-400 uppercase">Proximity vs Speed — Discharge Window</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={vesselBars} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="rgba(148,163,184,0.1)" strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke="#475569" tick={{ fill: "#64748b", fontSize: 10, fontFamily: "JetBrains Mono" }} />
              <YAxis stroke="#475569" tick={{ fill: "#64748b", fontSize: 10, fontFamily: "JetBrains Mono" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace" }} iconType="circle" />
              <Bar dataKey="distance" name="distance (km)" radius={[4, 4, 0, 0]} fill="#22d3ee" />
              <Bar dataKey="speed" name="speed (kn)" radius={[4, 4, 0, 0]}>
                {vesselBars.map((e, i) => (
                  <Cell key={i} fill={barColors(e)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}