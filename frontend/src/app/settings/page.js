"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Radio,
  Gauge,
  Eye,
  RotateCcw,
  Save,
  CheckCircle2,
  AlertTriangle,
  Satellite,
  Globe,
} from "lucide-react";
import { useSettings } from "@/context/SettingsContext";

const TOKEN = process.env.NEXT_PUBLIC_AEGIS_TOKEN ?? "";

function Section({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-radar-400/10 border border-radar-400/25 flex items-center justify-center">
          <Icon className="w-4 h-4 text-radar-400" />
        </div>
        <div>
          <p className="text-[10px] font-mono tracking-[0.22em] text-slate-400 uppercase">
            {title}
          </p>
          <p className="text-sm font-bold text-slate-200">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function Slider({ label, value, min, max, step, unit, onChange }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 mb-1.5">
        <span className="tracking-[0.16em] uppercase">{label}</span>
        <span className="text-radar-300">
          {value?.toFixed?.(step < 1 ? 1 : 0)} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full accent-radar-400"
      />
      <div className="flex justify-between text-[8px] font-mono text-slate-600 mt-0.5">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex items-center justify-between w-full"
    >
      <span className="text-[10px] font-mono tracking-[0.16em] text-slate-400 uppercase">
        {label}
      </span>
      <span
        className={`ml-3 relative w-10 h-5 rounded-full p-0.5 transition-colors ${
          value ? "bg-radar-400/40" : "bg-white/10"
        }`}
      >
        <span
          className={`block w-4 h-4 rounded-full transition-transform ${
            value ? "translate-x-5 bg-radar-400" : "bg-slate-500"
          }`}
        />
      </span>
    </button>
  );
}

export default function SettingsPage() {
  const { settings, loaded, saving, error, updateSettings } = useSettings();
  const [local, setLocal] = useState(null);
  const [status, setStatus] = useState("idle");
  const [testMsg, setTestMsg] = useState(null);

  useEffect(() => {
    if (loaded && !local) setLocal(settings);
  }, [settings, loaded, local]);

  const patch = useCallback((key, value) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
    setStatus("idle");
  }, []);

  const handleSave = useCallback(async () => {
    setStatus("saving");
    try {
      await updateSettings(local);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setStatus("error");
    }
  }, [local, updateSettings]);

  const handleTestConnection = useCallback(async () => {
    setTestMsg("Testing connection...");
    try {
      const res = await fetch("/api/v1/health");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTestMsg(`Backend ONLINE - ${data.active_vessels_tracked ?? "?"} vessels tracked`);
    } catch (e) {
      setTestMsg(`Connection failed: ${e.message}`);
    }
    setTimeout(() => setTestMsg(null), 5000);
  }, []);

  const handleReset = useCallback(async () => {
    if (!confirm("Reset simulation seed and clear cached telemetry history?")) return;
    try {
      await fetch("/api/v1/settings/reset", {
        method: "POST",
        headers: { "X-ZeroTrust-Token": TOKEN },
      });
      window.location.reload();
    } catch {
      setStatus("error");
    }
  }, []);

  if (!loaded || !local) {
    return (
      <div className="text-xs font-mono text-slate-500 p-10 text-center">
        LOADING SYSTEM CONFIG...
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-16 lg:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono tracking-[0.26em] text-radar-400 uppercase">
            System Config
          </p>
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-50">
            Runtime Controls and Sensor Parameters
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            All settings are persisted server-side and take effect immediately.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status === "saved" && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono">
              <CheckCircle2 className="w-3.5 h-3.5" /> SAVED
            </span>
          )}
          {status === "error" && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-crimson-500/25 bg-crimson-500/10 text-crimson-400 text-[10px] font-mono">
              <AlertTriangle className="w-3.5 h-3.5" /> ERROR
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md border border-radar-400/30 bg-radar-400/10 text-radar-300 text-[10px] font-mono font-bold hover:bg-radar-400/20 disabled:opacity-40 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "SAVING..." : "APPLY CHANGES"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Section icon={Radio} title="Data Feeds" subtitle="Live AIS and simulation">
          <div>
            <p className="text-[9px] font-mono tracking-[0.16em] text-slate-500 mb-1.5">
              FEED MODE
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {["auto", "live", "simulation"].map((m) => (
                <button
                  key={m}
                  onClick={() => patch("feed_mode", m)}
                  className={`px-2 py-1.5 rounded border text-[9px] font-mono uppercase transition-colors ${
                    local.feed_mode === m
                      ? "border-radar-400/50 bg-radar-400/10 text-radar-300"
                      : "border-white/10 text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[9px] font-mono tracking-[0.16em] text-slate-500 mb-1.5">
              AISSTREAM API KEY
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={local.aisstream_api_key_configured ? "............" : ""}
                placeholder="Enter AISStream token"
                readOnly={local.aisstream_api_key_configured}
                className="flex-1 px-3 py-1.5 rounded-md bg-navy-900/70 border border-white/10 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-radar-400/40"
              />
              <button
                onClick={handleTestConnection}
                className="px-3 py-1.5 rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-300 text-[9px] font-mono hover:bg-cyan-400/20 transition-colors"
              >
                TEST
              </button>
            </div>
            {testMsg && (
              <p className="mt-1.5 text-[10px] font-mono text-slate-400">{testMsg}</p>
            )}
          </div>
          <Slider
            label="Simulation Vessels"
            value={local.simulation_vessel_count}
            min={50}
            max={1000}
            step={50}
            unit="ships"
            onChange={(v) => patch("simulation_vessel_count", v)}
          />
          <Slider
            label="Broadcast Interval"
            value={local.broadcast_interval_ms}
            min={250}
            max={2000}
            step={250}
            unit="ms"
            onChange={(v) => patch("broadcast_interval_ms", v)}
          />
        </Section>

        <Section icon={Gauge} title="Detection and Correlation" subtitle="SAR sensitivity and lookback">
          <Slider
            label="Dark Patch Sensitivity"
            value={local.dark_patch_sensitivity}
            min={0.1}
            max={1.0}
            step={0.05}
            unit=""
            onChange={(v) => patch("dark_patch_sensitivity", v)}
          />
          <Slider
            label="Correlation Radius"
            value={local.correlation_radius_nm}
            min={1}
            max={50}
            step={1}
            unit="NM"
            onChange={(v) => patch("correlation_radius_nm", v)}
          />
          <Slider
            label="Lookback Window"
            value={local.lookback_hours}
            min={1}
            max={24}
            step={1}
            unit="hrs"
            onChange={(v) => patch("lookback_hours", v)}
          />
        </Section>

        <Section icon={Eye} title="Display and Rendering" subtitle="Chart style and units">
          <div>
            <p className="text-[9px] font-mono tracking-[0.16em] text-slate-500 mb-1.5">
              CHART STYLE
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: "tactical_dark", label: "TACTICAL" },
                { id: "bathymetry", label: "BATHY" },
                { id: "high_contrast", label: "RADAR" },
              ].map((s) => (
                <button
                  key={s.id}
                  onClick={() => patch("chart_style", s.id)}
                  className={`px-2 py-1.5 rounded border text-[9px] font-mono transition-colors ${
                    local.chart_style === s.id
                      ? "border-radar-400/50 bg-radar-400/10 text-radar-300"
                      : "border-white/10 text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Toggle label="Vessel Labels" value={local.show_vessel_labels} onChange={(v) => patch("show_vessel_labels", v)} />
            <Toggle label="SAR Overlay" value={local.show_sar_overlay} onChange={(v) => patch("show_sar_overlay", v)} />
            <Toggle label="Shipping Lanes" value={local.show_shipping_lanes} onChange={(v) => patch("show_shipping_lanes", v)} />
            <Toggle label="Animate Radar" value={local.animate_radar} onChange={(v) => patch("animate_radar", v)} />
          </div>
          <div>
            <p className="text-[9px] font-mono tracking-[0.16em] text-slate-500 mb-1.5">
              COORDINATE FORMAT
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {[{ id: "dd", label: "DECIMAL DEGREES" }, { id: "dms", label: "DEG MIN SEC" }].map((f) => (
                <button
                  key={f.id}
                  onClick={() => patch("coordinate_format", f.id)}
                  className={`px-2 py-1.5 rounded border text-[9px] font-mono transition-colors ${
                    local.coordinate_format === f.id
                      ? "border-radar-400/50 bg-radar-400/10 text-radar-300"
                      : "border-white/10 text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[9px] font-mono tracking-[0.16em] text-slate-500 mb-1.5">
              SPEED UNIT
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {["knots", "kmh", "mph"].map((u) => (
                <button
                  key={u}
                  onClick={() => patch("speed_unit", u)}
                  className={`px-2 py-1.5 rounded border text-[9px] font-mono uppercase transition-colors ${
                    local.speed_unit === u
                      ? "border-radar-400/50 bg-radar-400/10 text-radar-300"
                      : "border-white/10 text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section icon={RotateCcw} title="Export and Reset" subtitle="Database tools">
          <p className="text-[10px] font-mono text-slate-400">
            Export the active surveillance database or reset the simulation seed.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => updateSettings({ export_format: "json" })}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-radar-400/25 bg-radar-400/10 text-radar-300 text-[10px] font-mono hover:bg-radar-400/20 transition-colors"
            >
              <Globe className="w-3.5 h-3.5" /> EXPORT GEOJSON
            </button>
            <button
              onClick={() => updateSettings({ export_format: "csv" })}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono hover:bg-emerald-500/20 transition-colors"
            >
              <Satellite className="w-3.5 h-3.5" /> EXPORT CSV
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-crimson-500/25 bg-crimson-500/10 text-crimson-400 text-[10px] font-mono hover:bg-crimson-500/20 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> RESET SIMULATION
            </button>
          </div>
          {error && (
            <p className="text-[10px] font-mono text-crimson-400">
              <AlertTriangle className="inline w-3 h-3 mr-1" />
              {error}
            </p>
          )}
        </Section>
      </div>
    </div>
  );
}
