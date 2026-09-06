"use client";

import { useMemo, useState } from "react";
import { SlidersHorizontal, Filter, Ship, Eye } from "lucide-react";

/**
 * VesselFilterMatrix — speed range, type multi-select, dark-target toggle and
 * region quick-jumps. Applies an immediate client-side filter over the live
 * vessel feed (the backend filter is bound via Settings on the settings page).
 */

const VESSEL_TYPES = ["CARGO", "TANKER", "CONTAINER", "FISHING", "PASSENGER", "MILITARY", "TUG"];

const REGION_QUICK_JUMPS = [
  { label: "PERSIAN GULF", bbox: [24.0, 52.0, 27.5, 58.0] },
  { label: "MUMBAI OFFSHORE", bbox: [17.5, 69.5, 21.5, 73.0] },
  { label: "MALACCA", bbox: [3.0, 94.0, 8.0, 101.0] },
  { label: "RED SEA", bbox: [14.0, 39.0, 20.0, 43.0] },
  { label: "GLOBAL", bbox: null },
];

export default function VesselFilterMatrix({ onFilterChange }) {
  const [minSpeed, setMinSpeed] = useState(0);
  const [maxSpeed, setMaxSpeed] = useState(60);
  const [types, setTypes] = useState([]);
  const [darkOnly, setDarkOnly] = useState(false);
  const [region, setRegion] = useState(null);

  const toggleType = (t) =>
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const applyPatch = (patch) => {
    const next = {
      min_speed: minSpeed,
      max_speed: maxSpeed,
      vessel_types: types,
      show_dark_targets_only: darkOnly,
      bbox: region,
      ...patch,
    };
    onFilterChange?.(next);
  };

  const counts = useMemo(() => {
    return Object.fromEntries(VESSEL_TYPES.map((t) => [t, 0]));
  }, []);

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-radar-400" />
        <p className="text-[10px] font-mono tracking-[0.2em] text-slate-400">VESSEL FILTER MATRIX</p>
      </div>

      {/* Speed range */}
      <div>
        <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
          <span>SPEED {minSpeed}–{maxSpeed} kn</span>
          <SlidersHorizontal className="w-3 h-3 text-slate-600" />
        </div>
        <div className="flex items-center gap-2 mt-2">
          <input
            type="range" min="0" max="40" value={minSpeed}
            onChange={(e) => { setMinSpeed(+e.target.value); applyPatch({ min_speed: +e.target.value }); }}
            className="w-full accent-radar-400"
          />
          <input
            type="range" min="1" max="60" value={maxSpeed}
            onChange={(e) => { setMaxSpeed(+e.target.value); applyPatch({ max_speed: +e.target.value }); }}
            className="w-full accent-radar-400"
          />
        </div>
      </div>

      {/* Type multi-select */}
      <div>
        <p className="text-[9px] font-mono tracking-[0.18em] text-slate-500 mb-2">VESSEL CLASS</p>
        <div className="flex flex-wrap gap-1.5">
          {VESSEL_TYPES.map((t) => {
            const active = types.includes(t);
            return (
              <button
                key={t}
                onClick={() => {
                  const next = active ? types.filter((x) => x !== t) : [...types, t];
                  setTypes(next);
                  onFilterChange?.({
                    min_speed: minSpeed,
                    max_speed: maxSpeed,
                    vessel_types: next,
                    show_dark_targets_only: darkOnly,
                    bbox: region,
                  });
                }}
                className={`px-2.5 py-1 rounded-md border text-[9px] font-mono tracking-wide transition-colors ${
                  active
                    ? "border-radar-400/50 bg-radar-400/10 text-radar-300"
                    : "border-white/10 text-slate-500 hover:text-slate-300"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      {/* Dark targets toggle */}
      <button
        onClick={() => { setDarkOnly(!darkOnly); applyPatch({ show_dark_targets_only: !darkOnly }); }}
        className={`flex items-center gap-2 px-3 py-2 w-full rounded-md border text-[10px] font-mono transition-colors ${
          darkOnly
            ? "border-hazard-400/50 bg-hazard-400/10 text-hazard-400"
            : "border-white/10 text-slate-500 hover:text-slate-300"
        }`}
      >
        <Eye className="w-3.5 h-3.5" />
        DARK TARGETS ONLY
        <span className={`ml-auto w-8 h-4 rounded-full p-0.5 transition-colors ${darkOnly ? "bg-hazard-400/40" : "bg-white/10"}`}>
          <span className={`block w-3 h-3 rounded-full transition-transform ${darkOnly ? "translate-x-4 bg-hazard-400" : "bg-slate-500"}`} />
        </span>
      </button>

      {/* Region quick-jumps */}
      <div>
        <p className="text-[9px] font-mono tracking-[0.18em] text-slate-500 mb-2">REGION JUMP</p>
        <div className="grid grid-cols-2 gap-1.5">
          {REGION_QUICK_JUMPS.map((r) => (
            <button
              key={r.label}
              onClick={() => { setRegion(r.bbox); applyPatch({ bbox: r.bbox }); }}
              className={`px-2 py-1.5 rounded-md border text-[9px] font-mono tracking-wide transition-colors ${
                region === r.bbox
                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                  : "border-white/10 text-slate-500 hover:text-slate-300"
              }`}
            >
              <Ship className="inline w-2.5 h-2.5 mr-1" />
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}