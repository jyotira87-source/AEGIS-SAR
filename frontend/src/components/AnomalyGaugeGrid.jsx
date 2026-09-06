"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Droplets, Waves, Target, AlertOctagon } from "lucide-react";

/**
 * AnomalyGaugeGrid — headline metrics for the detected slick + attribution:
 * coverage area & estimated volume, attenuation damping factor, ocean drift
 * vector, and vessel attribution confidence gauge.
 */
export default function AnomalyGaugeGrid({ slick, drift, vessels }) {
  // Sleek fallback states: missing payload fields degrade to "---" instead of 0.
  const fmt = (v, digits = 2) =>
    v === null || v === undefined || Number.isNaN(v) ? "---" : Number(v).toFixed(digits);

  const area = slick?.area_sq_km ?? null;
  // Volume estimate: slick area × representative thickness (mean ~0.9 mm).
  const volumeLitres = useMemo(() => (area ?? 0) * 1e6 * 0.0009, [area]);
  const volumeBarrels = volumeLitres / 158.987;

  const topConfidence = vessels?.length
    ? Math.max(...vessels.map((v) => v.correlation_confidence_pct ?? 0))
    : null;
  const atten = slick?.mean_contrast_dB != null ? Math.abs(slick.mean_contrast_dB) : null;
  const maxAtten = slick?.max_attenuation_dB != null ? Math.abs(slick.max_attenuation_dB) : null;
  const driftSpeed = drift?.resultant_speed_knots ?? null;
  const driftBearing = drift?.resultant_bearing_deg ?? null;

  const cards = [
    {
      icon: Droplets,
      label: "SLICK COVERAGE",
      accent: "text-crimson-400",
      border: "border-crimson-500/25",
      bg: "bg-crimson-500/8",
      primary: fmt(area),
      unit: "km²",
      secondary:
        area != null
          ? `VOL ~ ${volumeBarrels.toFixed(0)} bbl · ${(volumeLitres / 1000).toFixed(0)} m³`
          : "AWAITING SAR SEGMENTATION",
    },
    {
      icon: Waves,
      label: "ATTENUATION FACTOR",
      accent: "text-amber-400",
      border: "border-amber-500/25",
      bg: "bg-amber-500/8",
      primary: fmt(atten),
      unit: "-dB",
      secondary: maxAtten != null ? `CORE ${fmt(maxAtten)} dB` : "NO RADAR CONTRAST DATA",
    },
    {
      icon: Target,
      label: "OCEAN DRIFT VECTOR",
      accent: "text-cyan-400",
      border: "border-cyan-400/25",
      bg: "bg-cyan-400/8",
      primary: fmt(driftSpeed),
      unit: "kn",
      secondary:
        driftBearing != null
          ? `@ ${driftBearing.toFixed(0)}° BEARING · ${drift?.tidal_stage ?? "--"}`
          : "NO OCEANOGRAPHIC FEED",
    },
  ];

  const r = 40;
  const circumference = 2 * Math.PI * r;
  const dash = ((topConfidence ?? 0) / 100) * circumference;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, i) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08 }}
          className={`glass-card p-4 border ${card.border} ${card.bg}`}
        >
          <div className="flex items-center gap-2 mb-3">
            <card.icon className={`w-4 h-4 ${card.accent}`} />
            <p className="text-[9px] font-mono tracking-[0.2em] text-slate-500">{card.label}</p>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-2xl md:text-3xl font-extrabold ${card.accent} telemetry-mono`}>{card.primary}</span>
            <span className="text-xs font-mono text-slate-500">{card.unit}</span>
          </div>
          <p className="mt-2 text-[10px] font-mono text-slate-400 leading-relaxed">{card.secondary}</p>
        </motion.div>
      ))}

      {/* Attribution confidence radial gauge */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.32 }}
        className="glass-card p-4 flex flex-col"
      >
        <div className="flex items-center gap-2 mb-3">
          <AlertOctagon className={`w-4 h-4 ${topConfidence > 80 ? "text-crimson-400" : topConfidence > 30 ? "text-amber-400" : "text-emerald-400"}`} />
          <p className="text-[9px] font-mono tracking-[0.2em] text-slate-500">ATTRIBUTION CONFIDENCE</p>
        </div>
        <div className="flex items-center gap-3">
          <svg width="86" height="86" viewBox="0 0 100 100" className="-rotate-90">
            <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="9" />
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={topConfidence > 80 ? "#f43f5e" : topConfidence > 30 ? "#f59e0b" : "#10b981"}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
              style={{ filter: `drop-shadow(0 0 6px ${topConfidence > 80 ? "rgba(244,63,94,0.6)" : topConfidence > 30 ? "rgba(245,158,11,0.6)" : "rgba(16,185,129,0.6)"})`, transition: "stroke-dasharray 0.9s ease" }}
            />
          </svg>
          <div>
            <p className="text-2xl font-extrabold text-slate-100 telemetry-mono">
              {topConfidence != null ? topConfidence.toFixed(1) : "---"}
              <span className="text-sm text-slate-500">%</span>
            </p>
            <p className="text-[10px] font-mono text-slate-500">
              {topConfidence > 80 ? "HIGH-ALERT — GUILT LOCKED" : topConfidence > 30 ? "MODERATE — REVIEW" : "LOW RISK"}
            </p>
            <p className="mt-1 text-[9px] font-mono text-slate-600">MAX(OFFENDER)</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}