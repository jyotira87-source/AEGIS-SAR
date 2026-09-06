"use client";

import { motion } from "framer-motion";
import { Activity } from "lucide-react";

/**
 * RadarScanOverlay — tactical multi-ring radar disc with 4 concentric range
 * rings, a rotating 360° conic-gradient sweep beam (cyan/emerald), a vertical
 * scanline sweeping every 2.4 s, and 5 pulsing contacts (AIS vessels + slick
 * clusters). Bottom readout identifies the SAR satellite radar synchronization.
 */
const BLIPS = [
  { x: "62%", y: "38%", tone: "cyan", label: "AIS-04" },
  { x: "44%", y: "56%", tone: "emerald", label: "AIS-09" },
  { x: "58%", y: "66%", tone: "crimson", label: "SLICK-CORE" },
  { x: "71%", y: "55%", tone: "emerald", label: "AIS-12" },
  { x: "38%", y: "42%", tone: "cyan", label: "AIS-17" },
];

const RING_SIZES = [96, 72, 48, 24]; // percent of container

export default function RadarScanOverlay({ className = "" }) {
  return (
    <div className={`glass-card relative overflow-hidden ${className}`}>
      <div className="px-5 pt-4 pb-2 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-mono tracking-[0.24em] text-cyan-400">TACTICAL RADAR SWEEP</p>
          <p className="text-sm font-bold text-slate-200">SAR GROUND-STATION MONITOR</p>
        </div>
        <span className="flex items-center gap-2 text-[10px] font-mono text-emerald-400">
          <Activity className="w-3.5 h-3.5 animate-pulse" /> 3.2 RPM
        </span>
      </div>

      <div className="relative aspect-square m-6 my-4 mx-auto max-w-[420px]">
        {/* Ocean base */}
        <div className="absolute inset-0 rounded-full bg-[#0d1524] border border-cyan-400/20 shadow-[inset_0_0_60px_rgba(34,211,238,0.06)] overflow-hidden" />

        {/* Concentric range rings */}
        {RING_SIZES.map((size, i) => (
          <div
            key={size}
            className="radar-disc"
            style={{
              width: `${size}%`,
              height: `${size}%`,
              left: `${(100 - size) / 2}%`,
              top: `${(100 - size) / 2}%`,
            }}
          >
            {i === 0 && (
              <span className="absolute top-1/2 -translate-y-1/2 -translate-x-full left-[-6px] text-[8px] font-mono text-cyan-400/60" />
            )}
          </div>
        ))}

        {/* Cross radials */}
        <div className="absolute inset-0 rounded-full overflow-hidden opacity-60">
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-cyan-400/15" />
          <div className="absolute top-1/2 right-0 left-0 h-px bg-cyan-400/15" />
          <div className="absolute left-0 top-0 bottom-0 right-0 rotate-45">
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-cyan-400/8" />
          </div>
          <div className="absolute left-0 top-0 bottom-0 right-0 -rotate-45">
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-cyan-400/8" />
          </div>
        </div>

        {/* Rotating conic sweep */}
        <div className="radar-sweep rounded-full" />

        {/* Vertical scanline */}
        <div className="radar-scanline" />

        {/* Center reticle */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-emerald-400/80 shadow-glow-emerald" />

        {/* Contacts */}
        {BLIPS.map((b, i) => (
          <div
            key={b.label}
            className="absolute"
            style={{ left: b.x, top: b.y, transform: "translate(-50%, -50%)", zIndex: 5 }}
          >
            <div
              className={`radar-blip w-3 h-3 ${
                b.tone === "cyan" ? "radar-blip--cyan" : b.tone === "crimson" ? "radar-blip--crimson" : ""
              }`}
              style={{ animationDelay: `${i * 0.3}s` }}
            />
            <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[7px] font-mono tracking-widest text-slate-400 whitespace-nowrap">
              {b.label}
            </span>
          </div>
        ))}

        {/* Range chips */}
        <span className="absolute bottom-1 left-2 text-[8px] font-mono text-cyan-400/50">10KM</span>
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-mono text-cyan-400/50">25KM</span>
        <span className="absolute bottom-1 right-2 text-[8px] font-mono text-cyan-400/50">50KM</span>
      </div>

      {/* Bottom status readout */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="px-5 pb-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3"
      >
        <p className="font-mono text-[9px] tracking-[0.18em] text-slate-400">
          SAR SATELLITE RADAR SYNCHRONIZATION <span className="text-cyan-400">//</span> C-BAND
        </p>
        <p className="font-mono text-[9px] text-emerald-400 tracking-widest flex items-center gap-1.5">
          <span className="status-dot inline-block" /> SWEEP ACTIVE
        </p>
      </motion.div>
    </div>
  );
}