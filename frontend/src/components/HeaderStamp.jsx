"use client";

import { motion } from "framer-motion";
import { Satellite, Radar, ShieldCheck } from "lucide-react";

/**
 * HeaderStamp — Defense agency masthead above every console section.
 * Renders a monospaced classification stamp, service identity and live
 * system badges.
 */
export default function HeaderStamp({ title, subtitle, status = "CLASSIFIED" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="glass-card px-5 py-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-6"
    >
      <div className="hidden md:flex items-center gap-3">
        <div className="relative w-10 h-10 rounded-lg bg-cyan-400/10 border border-cyan-400/25 flex items-center justify-center">
          <Radar className="w-5 h-5 text-cyan-400" style={{ strokeWidth: 1.5 }} />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-glow-emerald" />
        </div>
        <div>
          <p className="text-[10px] tracking-[0.28em] text-slate-400 font-mono">NTRO // MARITIME DIVISION</p>
          <p className="text-sm font-bold tracking-[0.18em] text-slate-100">
            AEGIS-SAR <span className="text-cyan-400">SECURE CONSOLE</span>
          </p>
        </div>
      </div>

      <div className="flex-1">
        <h2 className="text-lg md:text-xl font-extrabold text-slate-100 leading-tight">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-4">
        <span className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-emerald-400">
          <ShieldCheck className="w-4 h-4" /> CHAIN VERIFIED
        </span>
        <span className="px-3 py-1 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-400 text-[10px] font-mono tracking-[0.2em]">
          {status}
        </span>
        <span className="hidden lg:flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
          <Satellite className="w-3.5 h-3.5 text-emerald-400" /> UPLINK LIVE
        </span>
      </div>
    </motion.div>
  );
}