"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Crosshair, Waves, AlertTriangle } from "lucide-react";
import LiveVesselMap from "@/components/LiveVesselMap";
import { useLiveAIS } from "@/context/LiveAISContext";

/**
 * Exec Cockpit (/) — global situational awareness: live satellite fleet map,
 * telemetry summary cards and the most recent correlated spill threat board.
 */

export default function ExecCockpit() {
  const { vessels, stats, slicks, connection } = useLiveAIS();
  const [selectedMmsi, setSelectedMmsi] = useState(null);

  const summary = useMemo(() => {
    const byType = {};
    let dark = 0;
    for (const v of vessels) {
      byType[v.vessel_type || "UNKNOWN"] = (byType[v.vessel_type || "UNKNOWN"] || 0) + 1;
      if (v.is_dark_vessel) dark += 1;
    }
    return { byType, dark };
  }, [vessels]);

  const feedLabel =
    connection === "LIVE"
      ? "LIVE STREAM"
      : connection === "CONNECTING"
        ? "ACQUIRING"
        : "RECONNECTING";

  const cards = [
    { icon: null, label: "TRACKED VESSELS", primary: String(stats.total_ships ?? 0), accent: "text-radar-300", sub: feedLabel },
    { icon: AlertTriangle, label: "DARK TARGETS", primary: String(summary.dark ?? 0), accent: "text-hazard-400", sub: "TRANSPONDER ANOMALIES" },
    { icon: Waves, label: "ACTIVE SLICKS", primary: String(stats.active_slicks ?? slicks.length ?? 0), accent: "text-crimson-400", sub: "SAR DETECTIONS" },
    { icon: Crosshair, label: "PROOF CHAIN", primary: String(slicks.length), accent: "text-emerald-400", sub: "SHA3-512 SEALS" },
  ];

  return (
    <div className="space-y-5 pb-16 lg:pb-0">
      {/* Hero banner */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden glass-card px-6 py-5">
        <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-radar-400/10 blur-3xl" />
        <div className="relative">
          <p className="flex items-center gap-2 text-[10px] font-mono tracking-[0.28em] text-hazard-400 uppercase">
            <Crosshair className="w-3.5 h-3.5" /> Executive Maritime Command Cockpit
          </p>
          <h1 className="mt-2 text-xl md:text-2xl font-extrabold text-slate-50">
            Global Situational Awareness — <span className="text-gradient">Live AIS Fleet & SAR Spill Intelligence</span>
          </h1>
          <p className="mt-1 text-xs text-slate-400 max-w-3xl">
            Real-time vessel tracking over satellite imagery with type-class colour coding, dark-target
            detection, CFAR spill segmentation and SHA3-512 forensic evidence sealing.
          </p>
        </div>
      </motion.div>

      {/* Telemetry summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card px-4 py-3 flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-lg bg-white/[0.03] border border-white/10 flex items-center justify-center">
              {c.icon && <c.icon className={`w-4 h-4 ${c.accent}`} />}
            </div>
            <div className="min-w-0">
              <p className="text-[8px] font-mono tracking-[0.2em] text-slate-500 uppercase">{c.label}</p>
              <p className={`text-lg font-extrabold telemetry-mono ${c.accent} truncate`}>{c.primary}</p>
              {c.sub && <p className="text-[8px] font-mono text-slate-600">{c.sub}</p>}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Live fleet map */}
      <LiveVesselMap selectedMmsi={selectedMmsi} onSelectVessel={setSelectedMmsi} />

      {/* Threat board — recent correlated spills */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono tracking-[0.24em] text-crimson-400">THREAT BOARD</p>
            <p className="text-sm font-bold text-slate-200">Recent Correlated Spill Alerts</p>
          </div>
          <span className="text-[10px] font-mono text-slate-500">{slicks.length} EVENTS</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[720px]">
            <thead>
              <tr className="border-y border-white/10 bg-white/[0.02]">
                {["PROOF ID", "TIME (UTC)", "AREA km²", "CONF %", "SUSPECT MMSI", "VOL m³"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-[9px] font-mono tracking-[0.18em] text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slicks.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-xs font-mono text-slate-500">
                    NO SLICK ALERTS YET — AWAITING INITIAL SAR ACQUISITION
                  </td>
                </tr>
              )}
              {slicks.slice(0, 10).map((s) => (
                <tr key={s.anomaly_id || s.proof_id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 font-mono text-[11px] text-radar-300">{s.proof_id || s.anomaly_id}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-slate-400">{String(s.timestamp || "").replace("T", " ").slice(0, 19)}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-slate-300">{s.slick_area_sq_km?.toFixed?.(1) ?? "--"}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px]">
                    <span className={`px-2 py-0.5 rounded ${(s.confidence_score ?? 0) >= 80 ? "bg-crimson-500/15 text-crimson-400" : "bg-amber-500/10 text-amber-400"}`}>
                      {s.confidence_score?.toFixed?.(0) ?? "--"}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-hazard-400">{s.suspect_vessel_mmsi ?? "UNATTRIBUTED"}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-slate-300">{s.estimated_discharge_volume_m3?.toFixed?.(1) ?? "--"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Fleet composition strip */}
      <div className="glass-card px-5 py-3 flex flex-wrap items-center gap-4">
        <p className="text-[9px] font-mono tracking-[0.2em] text-slate-500 uppercase">FLEET COMPOSITION</p>
        {Object.entries(summary.byType)
          .sort((a, b) => b[1] - a[1])
          .map(([t, n]) => (
            <span key={t} className="flex items-center gap-1.5 text-[10px] font-mono text-slate-300">
              <span className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/10">{t}</span>
              <span className="text-radar-300 font-bold">{n}</span>
            </span>
          ))}
      </div>
    </div>
  );
}