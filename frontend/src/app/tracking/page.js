"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import LiveVesselMap from "@/components/LiveVesselMap";
import VesselFilterMatrix from "@/components/VesselFilterMatrix";
import { useLiveAIS } from "@/context/LiveAISContext";

/**
 * Live Fleet Tracking (/tracking) — full-screen satellite tracking matrix with
 * the vessel filter matrix and an inspectable fleet table.
 */

function TrackingContent() {
  const params = useSearchParams();
  const initialMmsi = params.get("vessel");
  const { vessels } = useLiveAIS();
  const [filters, setFilters] = useState({});
  const [selected, setSelected] = useState(initialMmsi ? Number(initialMmsi) : null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    let out = vessels;
    if (filters.min_speed) out = out.filter((v) => v.speed_knots >= filters.min_speed);
    if (filters.max_speed && filters.max_speed < 60) out = out.filter((v) => v.speed_knots <= filters.max_speed);
    if (filters.vessel_types?.length) out = out.filter((v) => filters.vessel_types.includes(v.vessel_type));
    if (filters.show_dark_targets_only) out = out.filter((v) => v.is_dark_vessel);
    if (filters.bbox) {
      const [s, w, n, e] = filters.bbox;
      out = out.filter((v) => s <= v.latitude && v.latitude <= n && w <= v.longitude && v.longitude <= e);
    }
    if (query) {
      const q = query.toLowerCase();
      out = out.filter((v) =>
        `${v.mmsi} ${v.ship_name} ${v.callsign} ${v.destination}`.toLowerCase().includes(q)
      );
    }
    return out;
  }, [vessels, filters, query]);

  return (
    <div className="space-y-5 pb-16 lg:pb-0">
      <div>
        <p className="text-[10px] font-mono tracking-[0.26em] text-radar-400 uppercase">Live Fleet Tracking</p>
        <h1 className="text-xl md:text-2xl font-extrabold text-slate-50">Maritime Vessel Tracking Matrix</h1>
        <p className="text-xs text-slate-400 mt-1">
          {filtered.length} vessels visible · click a marker or use INSPECT to open the tactical dossier.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        <div className="lg:col-span-1">
          <VesselFilterMatrix onFilterChange={setFilters} />
        </div>
        <div className="lg:col-span-3">
          <LiveVesselMap selectedMmsi={selected} onSelectVessel={setSelected} />
        </div>
      </div>

      {/* Fleet table */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 pt-4 pb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-slate-200">Visible Contacts</p>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name · MMSI · destination"
            className="px-3 py-1.5 rounded-md bg-navy-900/70 border border-white/10 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-radar-400/40"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[860px]">
            <thead>
              <tr className="border-y border-white/10 bg-white/[0.02]">
                {["MMSI", "Vessel", "Class", "Flag", "SOG", "COG", "Dest", "Status", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-[9px] font-mono tracking-[0.18em] text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-xs font-mono text-slate-500">NO CONTACTS MATCH FILTER</td>
                </tr>
              )}
              {filtered.slice(0, 60).map((v) => (
                <tr key={v.mmsi} className={`border-b border-white/5 hover:bg-white/[0.02] ${selected === v.mmsi ? "bg-radar-400/[0.06]" : ""}`}>
                  <td className="px-4 py-2 font-mono text-[11px] text-radar-300 whitespace-nowrap">{v.mmsi}</td>
                  <td className="px-4 py-2 text-xs text-slate-200 whitespace-nowrap">
                    {v.ship_name}{v.is_dark_vessel && <span className="ml-1 text-hazard-400 font-bold">⚡DARK</span>}
                  </td>
                  <td className="px-4 py-2 text-[11px] text-slate-400 whitespace-nowrap">{v.vessel_type}</td>
                  <td className="px-4 py-2 text-[11px] text-slate-400 whitespace-nowrap">{v.flag_country || "—"}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-slate-300 whitespace-nowrap">{v.speed_knots?.toFixed?.(1) ?? "--"}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-slate-300 whitespace-nowrap">{v.course_over_ground?.toFixed?.(0) ?? "--"}°</td>
                  <td className="px-4 py-2 text-[11px] text-slate-400 truncate max-w-[140px]">{v.destination || "—"}</td>
                  <td className="px-4 py-2 text-[10px] font-mono text-slate-500 whitespace-nowrap">
                    {v.nav_status === "UNDER_WAY_ENGINE" ? "UNDER WAY" : v.nav_status === "AT_ANCHOR" ? "ANCHORED" : v.nav_status}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <button
                      onClick={() => setSelected(v.mmsi)}
                      className="px-2.5 py-1 rounded border border-radar-400/30 bg-radar-400/10 text-radar-300 text-[9px] font-mono hover:bg-radar-400/20 transition-colors"
                    >
                      INSPECT
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function TrackingPage() {
  return (
    <Suspense fallback={<div className="text-xs font-mono text-slate-500">LOADING TRACKING…</div>}>
      <TrackingContent />
    </Suspense>
  );
}