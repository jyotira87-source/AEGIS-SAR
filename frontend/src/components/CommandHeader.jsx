"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Volume2, VolumeX, Radar, Search, Activity, Eye } from "lucide-react";
import { useLiveAIS } from "@/context/LiveAISContext";
import { useAlertSound } from "@/context/AlertSoundContext";

/**
 * CommandHeader — live tactical command strip.
 * UTC maritime clock, active target count, dark-target alert pill, audio mute
 * toggle and a global fuzzy quick-search (MMSI / callsign / name / destination).
 */

function useUtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now.toISOString().slice(0, 19).replace("T", " ") + " UTC";
}

const STATUS_META = {
  LIVE: {
    text: "LIVE STREAMING",
    cls: "text-emerald-400 border-emerald-500/25 bg-emerald-500/10",
    dot: "bg-emerald-500 shadow-glow-emerald",
  },
  CONNECTING: {
    text: "ACQUIRING",
    cls: "text-amber-400 border-amber-500/25 bg-amber-500/10",
    dot: "bg-amber-400 animate-pulse",
  },
  RECONNECTING: {
    text: "RECONNECTING",
    cls: "text-crimson-400 border-crimson-500/30 bg-crimson-500/10",
    dot: "bg-crimson-500 shadow-glow-crimson animate-pulse",
  },
};

export default function CommandHeader() {
  const router = useRouter();
  const { vessels, stats, connection } = useLiveAIS();
  const { muted, toggleMute, beep } = useAlertSound();
  const clock = useUtcClock();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [show, setShow] = useState(false);

  const darkCount = stats.dark_vessels ?? 0;
  const status = STATUS_META[connection] || STATUS_META.CONNECTING;

  const runSearch = (q) => {
    const needle = q.trim().toLowerCase();
    if (!needle) {
      setResults([]);
      return;
    }
    setResults(
      vessels
        .filter((v) =>
          `${v.mmsi} ${v.ship_name} ${v.callsign} ${v.destination} ${v.flag_country}`
            .toLowerCase()
            .includes(needle)
        )
        .slice(0, 8)
    );
    setShow(true);
  };

  const handleSelect = (mmsi) => {
    setQuery("");
    setShow(false);
    router.push(`/tracking?vessel=${mmsi}`);
  };

  return (
    <header className="sticky top-0 z-40 glass-card rounded-none border-x-0 border-t-0 border-b border-white/10">
      <div className="max-w-[1600px] mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-xl bg-radar-400/10 border border-radar-400/25 flex items-center justify-center">
            <Radar className="w-5 h-5 text-radar-400" style={{ strokeWidth: 1.4 }} />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-glow-emerald animate-pulse" />
          </div>
          <div>
            <p className="text-sm md:text-base font-extrabold tracking-[0.14em] text-slate-100">
              AEGIS-SAR <span className="text-radar-400">//</span> NTRO MARITIME
            </p>
            <p className="text-[9px] font-mono tracking-[0.26em] text-slate-500 uppercase">
              Live Vessel Tracking & SAR Intelligence
            </p>
          </div>
        </div>

        {/* Live status + target counts */}
        <div className="hidden xl:flex items-center gap-2">
          <span className={`flex items-center gap-1.5 px-3 py-1 rounded-md border text-[10px] font-mono ${status.cls}`}>
            <span className={`w-2 h-2 rounded-full ${status.dot}`} />
            {status.text}
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-md border border-cyan-400/20 bg-cyan-400/5 text-cyan-300 text-[10px] font-mono">
            <Activity className="w-3.5 h-3.5" /> {stats.total_ships ?? 0} TARGETS ACTIVE
          </span>
          {darkCount > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-md border border-hazard-400/40 bg-hazard-400/10 text-hazard-400 text-[10px] font-mono">
              <Eye className="w-3.5 h-3.5" />
              <span className="relative flex w-2 h-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-hazard-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full w-2 h-2 bg-hazard-400" />
              </span>
              {darkCount} DARK TARGETS
            </span>
          )}
        </div>

        {/* Quick search */}
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              runSearch(e.target.value);
            }}
            onFocus={() => query && setShow(true)}
            onBlur={() => setTimeout(() => setShow(false), 180)}
            placeholder="Search MMSI · callsign · vessel · destination"
            className="w-full pl-8 pr-3 py-1.5 rounded-md bg-navy-900/70 border border-white/10 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-radar-400/40"
          />
          {show && results.length > 0 && (
            <div className="absolute top-full mt-1 w-full rounded-md border border-white/10 bg-navy-900/95 backdrop-blur-md shadow-glow-soft overflow-hidden z-50">
              {results.map((r) => (
                <button
                  key={r.mmsi}
                  onMouseDown={() => handleSelect(r.mmsi)}
                  className="w-full text-left px-3 py-2 text-[11px] font-mono text-slate-300 hover:bg-radar-400/10 hover:text-radar-300 transition-colors border-b border-white/5 last:border-0"
                >
                  <span className="text-radar-400">{r.mmsi}</span>
                  <span className="mx-1.5 text-slate-500">·</span>
                  {r.ship_name}
                  <span className="mx-1.5 text-slate-600">→</span>
                  <span className="text-slate-400">{r.destination || "—"}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Audio toggle */}
        <button
          onClick={() => {
            toggleMute();
            if (muted) beep(880, 0.12);
          }}
          title={muted ? "Unmute alarms" : "Mute alarms"}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[10px] font-mono transition-colors ${
            muted
              ? "border-white/10 bg-white/[0.03] text-slate-500 hover:text-slate-300"
              : "border-emerald-500/25 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
          }`}
        >
          {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          {muted ? "SOUND OFF" : "ALARMS ON"}
        </button>

        {/* UTC clock */}
        <span className="hidden lg:block px-3 py-1 rounded-md border border-white/10 bg-navy-900/60 text-[10px] font-mono text-radar-300">
          {clock}
        </span>
      </div>
    </header>
  );
}