"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ShieldCheck,
  FileJson,
  Search,
  Download,
} from "lucide-react";
import { useLiveAIS } from "@/context/LiveAISContext";
import CryptographicProofModal from "@/components/CryptographicProofModal";

const TOKEN = process.env.NEXT_PUBLIC_AEGIS_TOKEN ?? "";

function formatTimestamp(ts) {
  if (!ts) return "—";
  return String(ts).replace("T", " ").slice(0, 19);
}

export default function AnomalyLogsPage() {
  const { slicks } = useLiveAIS();
  const [query, setQuery] = useState("");
  const [selectedProof, setSelectedProof] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return slicks;
    return slicks.filter(
      (s) =>
        `${s.proof_id} ${s.anomaly_id} ${s.suspect_vessel_mmsi} ${s.slick_area_sq_km}`
          .toLowerCase()
          .includes(q)
    );
  }, [slicks, query]);

  const handleExport = useCallback(
    async (format) => {
      setExporting(true);
      setExportMsg(null);
      try {
        const res = await fetch(
          `/api/v1/sar/detections?format=${format}&token=${encodeURIComponent(TOKEN)}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `aegis-sar-detections.${format}`;
        a.click();
        URL.revokeObjectURL(url);
        setExportMsg(`Exported ${slicks.length} detections as ${format.toUpperCase()}`);
      } catch (e) {
        setExportMsg(`Export failed: ${e.message}`);
      } finally {
        setExporting(false);
        setTimeout(() => setExportMsg(null), 4000);
      }
    },
    [slicks.length]
  );

  return (
    <div className="space-y-5 pb-16 lg:pb-0">
      <div>
        <p className="text-[10px] font-mono tracking-[0.26em] text-emerald-400 uppercase">
          Cryptographic Evidence Vault
        </p>
        <h1 className="text-xl md:text-2xl font-extrabold text-slate-50">
          Immutable Audit Trail and Legal Reports
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Every sealed SAR spill incident is logged with a SHA3-512 proof — tamper-evident
          and court-admissible as maritime forensic evidence.
        </p>
      </div>

      <div className="glass-card p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search proof ID, MMSI, area"
            className="w-full pl-8 pr-3 py-2 rounded-md bg-navy-900/70 border border-white/10 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-radar-400/40"
          />
        </div>
        <button
          onClick={() => handleExport("json")}
          disabled={exporting || slicks.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-radar-400/25 bg-radar-400/10 text-radar-300 text-[10px] font-mono hover:bg-radar-400/20 disabled:opacity-40 transition-colors"
        >
          <Download className="w-3.5 h-3.5" /> GEOJSON
        </button>
        <button
          onClick={() => handleExport("csv")}
          disabled={exporting || slicks.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono hover:bg-emerald-500/20 disabled:opacity-40 transition-colors"
        >
          <FileJson className="w-3.5 h-3.5" /> CSV
        </button>
        {exportMsg && (
          <span className="text-[10px] font-mono text-slate-400">{exportMsg}</span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "TOTAL INCIDENTS", value: slicks.length, tone: "text-radar-300" },
          { label: "HIGH CONFIDENCE", value: slicks.filter((s) => (s.confidence_score ?? 0) >= 80).length, tone: "text-crimson-400" },
          { label: "ATTRIBUTED", value: slicks.filter((s) => s.suspect_vessel_mmsi).length, tone: "text-hazard-400" },
          { label: "CHAIN HEIGHT", value: slicks.length > 0 ? Math.max(...slicks.map((s) => s.chain_block ?? 0)) : 0, tone: "text-emerald-400" },
        ].map((c) => (
          <div key={c.label} className="glass-card px-4 py-3">
            <p className="text-[8px] font-mono tracking-[0.2em] text-slate-500 uppercase">{c.label}</p>
            <p className={`text-lg font-extrabold telemetry-mono ${c.tone}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="glass-card overflow-hidden">
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono tracking-[0.24em] text-crimson-400">SEALED INCIDENTS</p>
            <p className="text-sm font-bold text-slate-200">{filtered.length} of {slicks.length} records</p>
          </div>
          <span className="text-[10px] font-mono text-slate-500">SHA3-512 SEALED</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-y border-white/10 bg-white/[0.02]">
                {["PROOF ID", "TIME (UTC)", "AREA km²", "CONF %", "SUSPECT MMSI", "VOL m³", "CHAIN", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-[9px] font-mono tracking-[0.18em] text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-xs font-mono text-slate-500">
                    {slicks.length === 0 ? "NO SEALED INCIDENTS YET — AWAITING SAR ACQUISITION" : "NO RECORDS MATCH FILTER"}
                  </td>
                </tr>
              )}
              {filtered.slice(0, 50).map((s) => (
                <tr key={s.proof_id || s.anomaly_id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 font-mono text-[11px] text-radar-300">{s.proof_id || s.anomaly_id}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-slate-400">{formatTimestamp(s.timestamp)}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-slate-300">{s.slick_area_sq_km?.toFixed?.(1) ?? "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px]">
                    <span className={`px-2 py-0.5 rounded ${(s.confidence_score ?? 0) >= 80 ? "bg-crimson-500/15 text-crimson-400" : "bg-amber-500/10 text-amber-400"}`}>
                      {s.confidence_score?.toFixed?.(0) ?? "—"}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-hazard-400">{s.suspect_vessel_mmsi ?? "UNATTRIBUTED"}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-slate-300">{s.estimated_discharge_volume_m3?.toFixed?.(1) ?? "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-emerald-400">#{s.chain_block ?? "—"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <button
                      onClick={() => setSelectedProof(s)}
                      className="px-2.5 py-1 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[9px] font-mono hover:bg-emerald-500/20 transition-colors"
                    >
                      <ShieldCheck className="inline w-3 h-3 mr-1" />
                      VERIFY
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <CryptographicProofModal block={selectedProof} onClose={() => setSelectedProof(null)} />
    </div>
  );
}
