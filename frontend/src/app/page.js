"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Satellite,
  Radar,
  Signal,
  ShieldCheck,
  Crosshair,
  Radio,
  FileLock2,
  Activity,
  ShieldAlert,
} from "lucide-react";

import HeaderStamp from "@/components/HeaderStamp";
import RadarScanOverlay from "@/components/RadarScanOverlay";
import SpillIntelligenceConsole from "@/components/SpillIntelligenceConsole";
import InteractiveVesselMap from "@/components/InteractiveVesselMap";
import SpillMorphologyChart from "@/components/SpillMorphologyChart";
import VesselCorrelationTable from "@/components/VesselCorrelationTable";
import AnomalyGaugeGrid from "@/components/AnomalyGaugeGrid";
import CryptographicProofModal from "@/components/CryptographicProofModal";

// Loaded from frontend/.env.local (NEXT_PUBLIC_AEGIS_TOKEN) — never hardcode.
const ZERO_TRUST_TOKEN = process.env.NEXT_PUBLIC_AEGIS_TOKEN ?? "";

const STATUS_CHANNELS = [
  { label: "SATELLITE UPLINK", value: "LIVE", icon: Satellite, color: "text-emerald-400", dot: "bg-emerald-400" },
  { label: "RADAR POLARIMETRY", value: "CO-POL", icon: Radar, color: "text-cyan-400", dot: "bg-cyan-400" },
  { label: "AIS STREAM", value: "ARMED", icon: Radio, color: "text-emerald-400", dot: "bg-emerald-400" },
  { label: "CRYPTO VAULT", value: "SEALED", icon: FileLock2, color: "text-amber-400", dot: "bg-amber-400" },
];

export default function Page() {
  const [sectors, setSectors] = useState([]);
  const [block, setBlock] = useState(null);
  const [running, setRunning] = useState(false);
  const [hasResult, setHasResult] = useState(false);
  const [pipelineStep, setPipelineStep] = useState(-1);
  const [focusedMmsi, setFocusedMmsi] = useState(null);
  const [proofOpen, setProofOpen] = useState(false);
  const [backendMode, setBackendMode] = useState("CONNECTING");
  const timerRef = useRef(null);

  const loadSectors = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/sectors", {
        headers: { "X-ZeroTrust-Token": ZERO_TRUST_TOKEN },
      });
      if (!res.ok) throw new Error("sectors unavailable");
      const data = await res.json();
      setSectors(data.sectors ?? []);
      setBackendMode("LIVE");
    } catch {
      // Offline fallback — static catalog mirrors the backend presets.
      setSectors([
        { id: "mumbai_high_offshore", name: "Mumbai High Offshore Oil Fields", lat: 19.4167, lon: 71.3833, risk_rating: "Critical" },
        { id: "gulf_of_khambhat", name: "Gulf of Khambhat", lat: 21.312, lon: 72.361, risk_rating: "High" },
        { id: "chennai_port_corridor", name: "Chennai Port Corridor", lat: 13.0827, lon: 80.2707, risk_rating: "High" },
        { id: "paradip_anchorage", name: "Paradip Anchorage & Approaches", lat: 20.2644, lon: 86.6712, risk_rating: "High" },
      ]);
      setBackendMode("STANDBY-DEMO");
    }
  }, []);

  useEffect(() => {
    loadSectors();
  }, [loadSectors]);

  const runAnalysis = useCallback(
    async (params) => {
      setRunning(true);
      setHasResult(false);
      setFocusedMmsi(null);
      setBlock(null);
      setPipelineStep(0);

      // Animate stepper cadence while the engine computes.
      timerRef.current = setInterval(() => {
        setPipelineStep((s) => Math.min(3, s + 1));
      }, 620);

      let result = null;
      let demo = false;
      try {
        const res = await fetch("/api/v1/analyze-slick", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-ZeroTrust-Token": ZERO_TRUST_TOKEN,
          },
          body: JSON.stringify(params),
        });
        if (!res.ok) throw new Error(`API ${res.status}`);
        result = await res.json();
      } catch {
        // Backend offline → replay the bundled sealed intelligence block.
        const demoRes = await fetch("/data/sample_detection.json");
        result = await demoRes.json();
        demo = true;
      }

      clearInterval(timerRef.current);
      setPipelineStep(3);
      setBlock(result);
      setHasResult(true);
      setRunning(false);
      setBackendMode(demo ? "STANDBY-DEMO" : "LIVE");
    },
    []
  );

  const activeCenter = block
    ? { lat: block.request.lat, lon: block.request.lon, sectorId: block.sector_id }
    : sectors[0]
    ? { lat: sectors[0].lat, lon: sectors[0].lon, sectorId: sectors[0].id }
    : { lat: 19.4167, lon: 71.3833, sectorId: "mumbai_high_offshore" };

  const vessels = block?.vessels ?? [];
  const slick = block?.morphology
    ? { ...block.morphology, features: block.slick_geojson?.features ?? [] }
    : null;
  const drift = block?.drift ?? null;

  return (
    <main className="min-h-screen relative">
      <div className="pointer-events-none fixed inset-0 bg-grid-pattern bg-grid opacity-40" />

      {/* ============ TOP NAV ============ */}
      <header className="sticky top-0 z-40 glass-card rounded-none border-x-0 border-t-0 border-b border-white/10">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative w-11 h-11 rounded-xl bg-cyan-400/10 border border-cyan-400/25 flex items-center justify-center">
              <Radar className="w-6 h-6 text-cyan-400" style={{ strokeWidth: 1.4 }} />
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 shadow-glow-emerald animate-pulse" />
            </div>
            <div>
              <p className="text-base md:text-lg font-extrabold tracking-[0.14em] text-slate-100">
                AEGIS-SAR <span className="text-cyan-400">//</span> NTRO MARITIME INTELLIGENCE
              </p>
              <p className="text-[9px] font-mono tracking-[0.3em] text-slate-500 uppercase">
                National Technical Research Organisation · SIH26143
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono">
              <ShieldCheck className="w-3.5 h-3.5" /> ZERO-TRUST ENFORCED
            </span>
            {/* Live API Connection Status — pulsing emerald when the backend
                ping succeeds, glowing red when unreachable. */}
            <span
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md border text-[10px] font-mono ${
                backendMode === "LIVE"
                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                  : "border-crimson-500/30 bg-crimson-500/10 text-crimson-400"
              }`}
              title={
                backendMode === "LIVE"
                  ? "FastAPI backend reachable"
                  : "Backend unreachable — running on bundled demo block"
              }
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  backendMode === "LIVE"
                    ? "bg-emerald-500 shadow-glow-emerald animate-pulse"
                    : "bg-crimson-500 shadow-glow-crimson animate-pulse"
                }`}
              />
              <Activity className="w-3.5 h-3.5" />
              {backendMode === "LIVE" ? "LIVE API CONNECTED" : backendMode === "CONNECTING" ? "API PENDING" : "API OFFLINE · DEMO"}
            </span>
          </div>
        </div>
      </header>

      {/* ============ STATUS BAR ============ */}
      <div className="max-w-[1600px] mx-auto px-6 pt-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {STATUS_CHANNELS.map((ch, i) => (
            <motion.div
              key={ch.label}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="glass-card px-4 py-2.5 flex items-center gap-3"
            >
              <ch.icon className={`w-4 h-4 ${ch.color}`} />
              <div className="flex-1">
                <p className="text-[8px] font-mono tracking-[0.22em] text-slate-500">{ch.label}</p>
                <p className={`text-[11px] font-mono font-bold ${ch.color}`}>{ch.value}</p>
              </div>
              <span className={`w-2 h-2 rounded-full ${ch.dot} shadow-glow-emerald animate-pulse`} />
            </motion.div>
          ))}
        </div>
      </div>

      {/* ============ HERO BANNER ============ */}
      <div className="max-w-[1600px] mx-auto px-6 pt-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7 }}
          className="relative overflow-hidden glass-card px-8 py-10 md:py-12"
        >
          <div className="absolute -right-24 -top-24 w-80 h-80 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="absolute right-40 bottom-0 w-56 h-56 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="relative">
            <p className="flex items-center gap-2 text-[10px] font-mono tracking-[0.3em] text-amber-400 uppercase">
              <Crosshair className="w-3.5 h-3.5" /> Coastal Surveillance Grid · Arabian Sea / Bay of Bengal
            </p>
            <h1 className="mt-3 text-3xl md:text-5xl font-extrabold leading-tight text-slate-50 max-w-4xl">
              Automated <span className="text-gradient">SAR Oil Slick Segmentation</span> & AIS Vessel
              Attribution System
            </h1>
            <p className="mt-4 text-sm text-slate-400 max-w-2xl leading-relaxed">
              Dual-layer forensic chain — Sentinel-1 C-band dark patch detection fused with 6-hour
              AIS trajectory reconstruction and weighted spatio-temporal guilt scoring, sealed into
              immutable SHA-256 intelligence blocks.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              {["SENTINEL-1 IW · VV/VH", "U-NET SEGMENTATION", "SLERP AIS RECONSTRUCTION", "SHA-256 VAULTED"].map((tag) => (
                <span key={tag} className="px-3 py-1.5 rounded-full border border-cyan-400/20 bg-cyan-400/5 text-[10px] font-mono tracking-widest text-cyan-300">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ============ INTELLIGENCE GRID ============ */}
      <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-1 space-y-5">
            <SpillIntelligenceConsole
              sectors={sectors}
              onAnalyze={runAnalysis}
              running={running}
              pipelineStep={pipelineStep}
              hasResult={hasResult}
            />
            <RadarScanOverlay className="hidden lg:block" />
          </div>

          <div className="lg:col-span-2 relative">
            <InteractiveVesselMap
              center={activeCenter}
              sectorName={block?.sector_name ?? undefined}
              slick={slick}
              vessels={vessels}
              focusedMmsi={focusedMmsi}
              sectors={sectors}
            />

            {/* Radar scan overlay — covers the satellite map while the
                pipeline executes, then fades out revealing the result. */}
            <motion.div
              initial={false}
              animate={{ opacity: running ? 1 : 0 }}
              transition={{ duration: 0.7 }}
              className={`absolute inset-0 z-20 rounded-2xl overflow-hidden bg-[#0b0f19]/80 backdrop-blur-sm ${
                running ? "pointer-events-auto" : "pointer-events-none"
              }`}
            >
              {running && <RadarScanOverlay className="h-full !rounded-2xl" />}
            </motion.div>
          </div>
        </div>

        <div className="relative z-10">
          <AnomalyGaugeGrid slick={slick} drift={drift} vessels={vessels} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <SpillMorphologyChart slick={slick} vessels={vessels} />
          </div>
          <div>
            <VesselCorrelationTable
              vessels={vessels}
              focusedMmsi={focusedMmsi}
              onInspect={(mmsi) => setFocusedMmsi(mmsi)}
              onOpenProof={block ? () => setProofOpen(true) : null}
            />
          </div>
        </div>
      </div>

      {/* ============ FOOTER ============ */}
      <footer className="border-t border-white/10 mt-4">
        <div className="max-w-[1600px] mx-auto px-6 py-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-[10px] font-mono tracking-[0.24em] text-slate-500 uppercase">
              Cryptographic Verification Stamps
            </p>
            {block ? (
              <div className="flex flex-wrap gap-2">
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[10px] font-mono">
                  <ShieldCheck className="w-3 h-3" /> BLOCK {block.vault?.block_id ?? "-"}
                </span>
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-400/10 border border-cyan-400/25 text-cyan-400 text-[10px] font-mono">
                  <Signal className="w-3 h-3" /> UTC {block.vault?.sealed_at_utc ?? ""}
                </span>
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/25 text-amber-400 text-[10px] font-mono">
                  <ShieldAlert className="w-3 h-3" /> SIGNER {block.vault?.signer ?? "--"}
                </span>
              </div>
            ) : (
              <p className="text-[10px] font-mono text-slate-600">AWAITING FIRST SEALED INTELLIGENCE BLOCK</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-[10px] font-mono tracking-widest text-slate-600">
              PROJECT AEGIS-SAR (SIH26143) — SENSOR-FUSION SIMULATION, TACTICAL EVALUATION ONLY
            </p>
            <p className="text-[9px] font-mono text-slate-700 mt-1">
              NTRO SPONSORED CAPABILITY PROTOTYPE · NEXT.JS 14 / FASTAPI / PYTORCH-ORIENTED PIPELINE
            </p>
          </div>
        </div>
      </footer>

      <CryptographicProofModal block={proofOpen ? block : null} onClose={() => setProofOpen(false)} />
    </main>
  );
}