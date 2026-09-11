"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/** Default runtime settings mirrored from backend RuntimeSettingsPayload. */
const DEFAULT_SETTINGS = {
  feed_mode: "auto",
  broadcast_interval_ms: 1000,
  simulation_vessel_count: 350,
  simulation_speed: 1.0,
  dark_patch_sensitivity: 0.5,
  correlation_radius_nm: 50.0,
  lookback_hours: 6.0,
  filter: {
    min_speed: 0,
    max_speed: 60,
    vessel_types: [],
    search_query: "",
    show_dark_targets_only: false,
    bbox: null,
  },
  chart_style: "tactical_dark",
  show_vessel_labels: true,
  show_sar_overlay: true,
  show_shipping_lanes: false,
  animate_radar: true,
  coordinate_format: "dd",
  speed_unit: "knots",
  aisstream_api_key_configured: false,
  feed_resolved: "SIMULATION",
  bounding_box: [8.0, 65.0, 31.5, 92.0],
};

/** Keys the backend RuntimeSettingsPayload actually accepts. Read-only display
 * metadata (aisstream_api_key_configured, bounding_box, feed_resolved, …) is
 * stripped before POSTing so the strict Pydantic model never rejects the save. */
const RUNTIME_PAYLOAD_KEYS = [
  "feed_mode",
  "broadcast_interval_ms",
  "simulation_vessel_count",
  "simulation_speed",
  "dark_patch_sensitivity",
  "correlation_radius_nm",
  "lookback_hours",
  "filter",
  "chart_style",
  "show_vessel_labels",
  "show_sar_overlay",
  "show_shipping_lanes",
  "animate_radar",
  "coordinate_format",
  "speed_unit",
];

/** Return a plain object containing only runtime-control keys. */
export function toRuntimePayload(settings) {
  const out = {};
  for (const key of RUNTIME_PAYLOAD_KEYS) {
    if (key in settings) out[key] = settings[key];
  }
  return out;
}

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/settings");
      if (!res.ok) throw new Error(`settings HTTP ${res.status}`);
      const data = await res.json();
      // Normalise feed_mode (backend returns display-caps "SIMULATION", the UI
      // toggles compare lowercased "auto|live|simulation").
      if (data.feed_mode) data.feed_mode = String(data.feed_mode).toLowerCase();
      setSettings((prev) => ({ ...prev, ...data }));
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateSettings = useCallback(
    async (patch) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/v1/settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-ZeroTrust-Token": process.env.NEXT_PUBLIC_AEGIS_TOKEN ?? "",
          },
          body: JSON.stringify(toRuntimePayload(patch)),
        });
        if (!res.ok) throw new Error(`settings POST HTTP ${res.status}`);
        const data = await res.json();
        setSettings((prev) => ({ ...prev, ...data }));
        return data;
      } catch (e) {
        setError(e.message);
        throw e;
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const value = useMemo(
    () => ({ settings, loaded, saving, error, refresh, updateSettings }),
    [settings, loaded, saving, error, refresh, updateSettings]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within <SettingsProvider>");
  return ctx;
}

/** Expose the raw settings object shape to other modules. */
export const AEGIS_DEFAULT_SETTINGS = DEFAULT_SETTINGS;