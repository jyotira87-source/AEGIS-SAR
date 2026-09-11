"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Map as ReactMap,
  Source,
  Layer,
  Marker,
  NavigationControl,
  ScaleControl,
} from "react-map-gl/maplibre";
import { Crosshair, Navigation, Layers, Maximize2, Target, Ship } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";
import { useLiveAIS } from "@/context/LiveAISContext";

/**
 * LiveVesselMap — real-time maritime satellite tracking map.
 *
 * Definitely-not-static: consumes the /ws/live-feed stream via LiveAISContext,
 * interpolates marker positions between batches (rAF, no jitter), colour-codes
 * by vessel class, flashes dark targets, draws SAR slick polygons, live trails
 * and predict-intercept vectors on click, and supports full layer toggles.
 */

const SATELLITE_STYLE = {
  version: 8,
  sources: {
    "esri-imagery": {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: 'Imagery © <a href="https://www.esri.com/" target="_blank" rel="noreferrer">Esri</a>, Maxar, Earthstar Geographics',
    },
    "dark-labels": {
      type: "raster",
      tiles: ["https://basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png"],
      tileSize: 256,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OSM</a> © CARTO',
    },
    "shipping-lanes": {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: { name: "Hormuz Gulf Lane" }, geometry: { type: "LineString", coordinates: [[56.4, 26.5], [55.5, 26.3], [54.7, 25.8]] } },
          { type: "Feature", properties: { name: "Mumbai–Aden Lane" }, geometry: { type: "LineString", coordinates: [[72.8, 18.9], [64.0, 17.5], [57.0, 15.5], [48.5, 13.2]] } },
          { type: "Feature", properties: { name: "Malacca Approach" }, geometry: { type: "LineString", coordinates: [[95.5, 5.8], [97.2, 4.9], [99.3, 3.4]] } },
          { type: "Feature", properties: { name: "Bay of Bengal Lane" }, geometry: { type: "LineString", coordinates: [[91.0, 12.5], [86.4, 17.8], [81.5, 18.6]] } },
        ],
      },
    },
  },
  layers: [
    { id: "esri-imagery", type: "raster", source: "esri-imagery" },
    { id: "dark-labels", type: "raster", source: "dark-labels", paint: { "raster-opacity": 0.55 } },
    {
      id: "shipping-lanes",
      type: "line",
      source: "shipping-lanes",
      paint: { "line-color": "#94a3b8", "line-width": 1.4, "line-dasharray": [4, 2], "line-opacity": 0.35 },
      layout: { visibility: "visible" },
    },
  ],
};

const TYPE_COLORS = {
  CARGO: "#22D3EE",
  TANKER: "#F59E0B",
  CONTAINER: "#818CF8",
  FISHING: "#10B981",
  PASSENGER: "#E879F9",
  MILITARY: "#94A3B8",
  TUG: "#38BDF8",
  UNKNOWN: "#64748B",
};

const DEFAULT_CENTER = { lat: 15.0, lon: 75.0 };
const FLEET_ZOOM = 4.8;
const VESSEL_ZOOM = 11.0;
const INTERCEPT_LOOKAHEAD_MIN = 30;

export default function LiveVesselMap({ className = "", selectedMmsi, onSelectVessel }) {
  const mapRef = useRef(null);
  const { vessels, slicks, latestBatchRef, prevBatchRef, batchTimeRef, batchIntervalMsRef } = useLiveAIS();

  const [mapReady, setMapReady] = useState(false);
  const [display, setDisplay] = useState([]);
  const [hovered, setHovered] = useState(null); // interpolated position under cursor
  const [showLabels, setShowLabels] = useState(true);
  const [showSlicks, setShowSlicks] = useState(true);
  const [showLanes, setShowLanes] = useState(false);
  const [showTrails, setShowTrails] = useState(false);
  const [trailData, setTrailData] = useState(null);
  const [intercept, setIntercept] = useState(null);
  const [dossier, setDossier] = useState(null);
  const [notice, setNotice] = useState(null); // tactical feedback banner
  const [dir, setDir] = useState(null); // interpolated dir between batches
  const [center, setCenter] = useState(DEFAULT_CENTER);

  // ---- Smooth rAF interpolation between WebSocket batches ------------------
  useEffect(() => {
    let raf;
    const frame = () => {
      const latest = latestBatchRef.current;
      const prev = prevBatchRef.current;
      const t0 = batchTimeRef.current;
      let next;
      if (latest.length && prev.length && t0 > 0) {
        const t = Math.min(1, Math.max(0, (Date.now() - t0) / batchIntervalMsRef.current));
        const prevMap = new Map(prev.map((p) => [p.mmsi, p]));
        next = latest.map((v) => {
          const p = prevMap.get(v.mmsi);
          if (!p) return v;
          return {
            ...v,
            latitude: p.latitude + (v.latitude - p.latitude) * t,
            longitude: p.longitude + (v.longitude - p.longitude) * t,
          };
        });
        setDir(Math.max(0, Math.min(1, t)));
      } else {
        next = latest;
      }
      setDisplay(next);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [latestBatchRef, prevBatchRef, batchTimeRef, batchIntervalMsRef]);

  // ---- GeoJSON builders -----------------------------------------------------
  const slickGeo = useMemo(
    () => ({
      type: "FeatureCollection",
      features: (showSlicks ? slicks : [])
        .filter((s) => Array.isArray(s?.polygon_coordinates) && s.polygon_coordinates.length >= 3)
        .map((s, i) => ({
          type: "Feature",
          properties: { id: s.anomaly_id || s.proof_id || `slick-${i}`, confidence: s.confidence_score },
          geometry: { type: "Polygon", coordinates: [s.polygon_coordinates] },
        })),
    }),
    [slicks, showSlicks]
  );

  const trailGeo = useMemo(
    () =>
      trailData?.trail?.length > 1
        ? {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: { mmsi: trailData.mmsi },
                geometry: {
                  type: "LineString",
                  coordinates: trailData.trail.map((p) => [p.lon, p.lat]),
                },
              },
            ],
          }
        : null,
    [trailData]
  );

  const interceptGeo = useMemo(
    () =>
      intercept?.from?.length === 2
        ? {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: [intercept.from, intercept.to] },
              },
            ],
          }
        : null,
    [intercept]
  );

  // ---- Vessel interactions -------------------------------------------------
  const noticeTimer = useRef(null);
  const flashNotice = useCallback((text) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4500);
  }, []);

  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);

  const openDossier = useCallback((v) => {
    setDossier(v);
    setIntercept(null);
    setTrailData(null);
    onSelectVessel?.(v.mmsi);
    try {
      mapRef.current?.flyTo?.({ center: [v.longitude, v.latitude], zoom: VESSEL_ZOOM, duration: 1200, essential: true });
    } catch {
      /* noop */
    }
  }, [onSelectVessel]);

  const loadTrail = useCallback(async (mmsi) => {
    try {
      const res = await fetch(`/api/v1/vessels/${mmsi}`);
      if (!res.ok) throw new Error("trail unavailable");
      const data = await res.json();
      const pts = Array.isArray(data?.trail) ? data.trail : [];
      const nm = data?.trail_length_nm ?? 0;
      if (pts.length > 1) {
        setTrailData(data);
        setShowTrails(true);
        flashNotice(`TRACK TRAIL RESTORED // ${pts.length} BREADCRUMBS · ${nm} NM RUN`);
        const lats = pts.map((p) => p.lat);
        const lons = pts.map((p) => p.lon);
        try {
          mapRef.current?.fitBounds?.(
            [
              [Math.min(...lons), Math.min(...lats)],
              [Math.max(...lons), Math.max(...lats)],
            ],
            { padding: 70, duration: 1400, essential: true }
          );
        } catch {
          /* noop */
        }
      } else {
        setTrailData(null);
        setShowTrails(false);
        flashNotice("TRAIL INSUFFICIENT — SENSOR STILL ACCUMULATING BREADCRUMBS");
      }
    } catch {
      setTrailData(null);
      setShowTrails(false);
      flashNotice("TRAIL UNAVAILABLE — BACKEND LINK FAILED");
    }
  }, [flashNotice]);

  const toggleTrails = useCallback(() => {
    if (showTrails) {
      setShowTrails(false);
      setTrailData(null);
      return;
    }
    setShowTrails(true);
    if (dossier) {
      loadTrail(dossier.mmsi);
    } else {
      const mover = display.find((v) => (v.speed_knots ?? 0) >= 1);
      if (mover) loadTrail(mover.mmsi);
      else flashNotice("SELECT A VESSEL TO RESTORE ITS HISTORY");
    }
  }, [showTrails, dossier, display, loadTrail, flashNotice]);

  const computeIntercept = useCallback((v) => {
    const speedKts = v.speed_knots || 0;
    const cog = v.course_over_ground || 0;
    if (speedKts < 1) {
      setIntercept(null);
      flashNotice("TARGET STATIONARY — NO INTERCEPT VECTOR AVAILABLE");
      return;
    }
    const distNm = (speedKts * INTERCEPT_LOOKAHEAD_MIN) / 60.0;
    const dKm = distNm * 1.852;
    const rad = (cog * Math.PI) / 180;
    const dLat = (dKm * Math.cos(rad)) / 111.32;
    const dLon = (dKm * Math.sin(rad)) / (111.32 * Math.cos((v.latitude * Math.PI) / 180));
    setIntercept({
      from: [v.longitude, v.latitude],
      to: [v.longitude + dLon, v.latitude + dLat],
    });
    setTrailData(null);
    flashNotice(`INTERCEPT VECTOR // ${INTERCEPT_LOOKAHEAD_MIN} MIN LEAD · BEARING ${cog.toFixed(0)}° · ${distNm.toFixed(1)} NM`);
  }, [flashNotice]);

  const flyTo = useCallback((lat, lon, zoom) => {
    mapRef.current?.flyTo?.({ center: [lon, lat], zoom: zoom ?? FLEET_ZOOM, duration: 1600, essential: true });
  }, []);

  // ---- Render layer defs ----------------------------------------------------
  const layerDefs = useMemo(() => ({
    slickFill: {
      id: "slick-fill", type: "fill", source: "slicks",
      paint: { "fill-color": "rgba(239,68,68,0.38)" },
    },
    slickLine: {
      id: "slick-line", type: "line", source: "slicks",
      paint: { "line-color": "#EF4444", "line-width": 1.8 },
    },
    trails: {
      id: "trails", type: "line", source: "trails",
      paint: { "line-color": "#22D3EE", "line-width": 2.4, "line-dasharray": [2, 1.2], "line-opacity": 0.9 },
    },
    events: {
      id: "events", type: "line", source: "events",
      paint: { "line-color": "#00F2DE", "line-width": 2, "line-opacity": 0.85 },
    },
  }), []);

  return (
    <div className={`glass-card overflow-hidden ${className}`}>
      {/* Header strip */}
      <div className="px-5 pt-4 pb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-mono tracking-[0.24em] text-radar-400">GLOBAL MARITIME SITUATIONAL AWARENESS</p>
          <p className="text-sm font-bold text-slate-200">Live Fleet Tracking — Satellite Imagery</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => { setShowSlicks(!showSlicks); }}
            className={`px-2.5 py-1 rounded-md border text-[9px] font-mono tracking-wider transition-colors ${
              showSlicks ? "border-crimson-500/40 bg-crimson-500/10 text-crimson-400" : "border-white/10 text-slate-500"
            }`}
          >
            SAR SLICKS
          </button>
          <button
            onClick={toggleTrails}
            className={`px-2.5 py-1 rounded-md border text-[9px] font-mono tracking-wider transition-colors ${
              showTrails ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300" : "border-white/10 text-slate-500"
            }`}
          >
            AIS TRAILS
          </button>
          <button
            onClick={() => { setShowLabels(!showLabels); }}
            className={`px-2.5 py-1 rounded-md border text-[9px] font-mono tracking-wider transition-colors ${
              showLabels ? "border-radar-400/40 bg-radar-400/10 text-radar-300" : "border-white/10 text-slate-500"
            }`}
          >
            LABELS
          </button>
          <button
            onClick={() => { setShowLanes(!showLanes); }}
            className={`px-2.5 py-1 rounded-md border text-[9px] font-mono tracking-wider transition-colors ${
              showLanes ? "border-slate-400/40 bg-slate-400/10 text-slate-300" : "border-white/10 text-slate-500"
            }`}
          >
            LANES
          </button>
        </div>
      </div>

      <div className="relative h-[480px] md:h-[600px] target-grid">
        <ReactMap
          ref={mapRef}
          initialViewState={{ longitude: center.lon, latitude: center.lat, zoom: FLEET_ZOOM }}
          mapStyle={SATELLITE_STYLE}
          style={{ width: "100%", height: "100%" }}
          attributionControl={{ compact: true }}
          onLoad={() => setMapReady(true)}
        >
          <NavigationControl showCompass={false} position="bottom-right" />
          <ScaleControl unit="metric" position="bottom-left" maxWidth={120} />

          {/* SAR slick polygons */}
          {showSlicks && slickGeo.features.length > 0 && (
            <Source id="slicks" type="geojson" data={slickGeo}>
              <Layer {...layerDefs.slickFill} />
              <Layer {...layerDefs.slickLine} />
            </Source>
          )}

          {/* Historical AIS trail — only when the AIS TRAILS layer is armed */}
          {showTrails && trailGeo && (
            <Source id="trails" type="geojson" data={trailGeo}>
              <Layer {...layerDefs.trails} />
            </Source>
          )}

          {/* Predict-intercept vector */}
          {interceptGeo && (
            <Source id="events" type="geojson" data={interceptGeo}>
              <Layer {...layerDefs.events} />
            </Source>
          )}

          {/* Intercept endpoint marker */}
          {intercept && intercept.to?.length === 2 && (
            <Marker longitude={intercept.to[0]} latitude={intercept.to[1]} anchor="center">
              <span className="relative flex items-center justify-center">
                <span className="absolute w-6 h-6 rounded-full border-2 border-cyan-300/70 animate-ping" />
                <span className="relative w-2.5 h-2.5 rounded-full bg-cyan-300 border border-white shadow-glow-cyan" />
              </span>
            </Marker>
          )}

          {/* Vessel markers */}
          {display.map((v) => (
            <Marker
              key={v.mmsi}
              longitude={v.longitude}
              latitude={v.latitude}
              anchor="center"
            >
              <button
                type="button"
                onMouseEnter={() => setHovered(v)}
                onMouseLeave={() => setHovered(null)}
                onClick={(e) => { e.stopPropagation(); openDossier(v); }}
                className={`relative flex items-center justify-center outline-none cursor-pointer transition-transform ${
                  hovered?.mmsi === v.mmsi ? "scale-150" : "scale-100"
                }`}
                aria-label={`Vessel ${v.mmsi}`}
              >
                {v.is_dark_vessel ? (
                  <DarkMarker />
                ) : (
                  <ShipIcon color={TYPE_COLORS[v.vessel_type] || TYPE_COLORS.UNKNOWN} heading={v.course_over_ground || v.true_heading || 0} />
                )}
                {showLabels && (
                  <span className="absolute top-full mt-0.5 left-1/2 -translate-x-1/2 whitespace-nowrap px-1 py-px rounded-sm bg-navy-950/70 text-[8px] font-mono text-slate-300 border border-white/5">
                    {v.ship_name}{v.is_dark_vessel ? " ⚠" : ""}
                  </span>
                )}
              </button>
            </Marker>
          ))}
        </ReactMap>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 z-10 hidden sm:block px-3 py-2 rounded-md border border-white/10 bg-navy-950/85 backdrop-blur-md">
          <p className="text-[8px] font-mono tracking-[0.18em] text-slate-500 mb-1">VESSEL CLASS</p>
          {Object.entries(TYPE_COLORS).map(([k, c]) => (
            <p key={k} className="flex items-center gap-1.5 text-[9px] font-mono text-slate-300">
              <span className="w-2 h-2 rotate-45 rounded-[2px]" style={{ background: c }} /> {k}
            </p>
          ))}
          <p className="flex items-center gap-1.5 text-[9px] font-mono text-hazard-400 mt-1">
            <span className="relative flex w-2 h-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-hazard-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full w-2 h-2 bg-hazard-400" />
            </span>
            DARK
          </p>
        </div>

        {/* Tactical feedback banner */}
        {notice && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 max-w-[92%] px-3.5 py-2 rounded-md border border-cyan-400/30 bg-navy-950/90 backdrop-blur-md shadow-glow-cyan">
            <p className="text-[9px] font-mono tracking-[0.18em] text-cyan-300 whitespace-nowrap overflow-hidden text-ellipsis">
              {notice}
            </p>
          </div>
        )}

        {/* Reset-view control */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
          <button
            onClick={() => flyTo(15.0, 75.0, FLEET_ZOOM)}
            className="p-2 rounded-md border border-white/10 bg-navy-950/85 text-slate-300 hover:text-radar-300 transition-colors"
            title="Reset global view"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        {/* Tactical Vessel Dossier */}
        {dossier && (
          <DossierCard
            vessel={dossier}
            onClose={() => setDossier(null)}
            onTrail={() => loadTrail(dossier.mmsi)}
            onIntercept={() => computeIntercept(dossier)}
          />
        )}
      </div>

      {/* Footer */}
      <div className="px-5 pb-4 pt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="coord-readout flex items-center gap-2">
          <Navigation className="w-3.5 h-3.5 text-radar-400" />
          IMAGERY ESRI WORLD-IMAGERY · LIVE AIS STREAM
        </p>
        <p className="coord-readout">
          {display.length} VESSELS RENDERED <span className="text-slate-600">|</span> rAF SMOOTHED
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function ShipIcon({ color, heading }) {
  return (
    <span
      className="relative flex items-center justify-center"
      style={{ transform: `rotate(${heading}deg)` }}
    >
      <span className="w-0 h-0 border-l-[5px] border-r-[5px] border-b-[10px] border-l-transparent border-r-transparent" style={{ borderBottomColor: color, filter: `drop-shadow(0 0 3px ${color})` }} />
    </span>
  );
}

function DarkMarker() {
  return (
    <span className="relative flex items-center justify-center">
      <span className="absolute w-7 h-7 rounded-full bg-hazard-400/25 animate-ping" />
      <span className="relative w-3.5 h-3.5 rounded-full bg-hazard-400 border-2 border-white shadow-glow-amber flex items-center justify-center">
        <span className="w-1 h-1 rounded-full bg-white" />
      </span>
    </span>
  );
}

function DossierCard({ vessel, onClose, onTrail, onIntercept }) {
  const isDark = vessel.is_dark_vessel;
  return (
    <div className="absolute top-3 left-3 z-20 w-72 max-w-[85%] rounded-lg border border-white/10 bg-navy-900/95 backdrop-blur-md shadow-glow-soft overflow-hidden">
      <div className="flex items-start justify-between px-3.5 py-2.5 border-b border-white/10 bg-white/[0.02]">
        <div className="min-w-0">
          <p className="text-[9px] font-mono tracking-[0.18em] text-radar-400">TACTICAL VESSEL DOSSIER</p>
          <p className="text-sm font-bold text-slate-100 truncate">{vessel.ship_name}</p>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3.5 space-y-2 text-[11px] font-mono">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {[
            ["MMSI", vessel.mmsi],
            ["CLASS", vessel.vessel_type],
            ["FLAG", vessel.flag_country || "—"],
            ["CALLSIGN", vessel.callsign || "—"],
            ["SOG", `${vessel.speed_knots?.toFixed?.(1) ?? "--"} kn`],
            ["COG", `${vessel.course_over_ground?.toFixed?.(0) ?? "--"}°`],
            ["LENGTH", `${vessel.length ?? "--"} m`],
            ["DRAUGHT", `${vessel.draught ?? "--"} m`],
            ["DEST", vessel.destination || "—"],
            ["ETA", vessel.eta ? String(vessel.eta).slice(0, 10) : "—"],
          ].map(([k, val]) => (
            <div key={k}>
              <p className="text-[8px] tracking-[0.16em] text-slate-500 uppercase">{k}</p>
              <p className={`text-slate-200 truncate ${isDark && k === "MMSI" ? "text-hazard-400 font-bold" : ""}`}>
                {val}
              </p>
            </div>
          ))}
        </div>

        {isDark && (
          <p className="px-2 py-1 rounded border border-hazard-400/40 bg-hazard-400/10 text-hazard-400 text-[9px] tracking-wider">
            ⚠ DARK TARGET — TRANSPONDER INTERMITTENT
          </p>
        )}

        <div className="flex gap-1.5 pt-1">
          <button
            onClick={onTrail}
            className="flex-1 px-2 py-1.5 rounded border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 text-[9px] font-mono hover:bg-cyan-400/20 transition-colors"
          >
            TRACK TRAIL
          </button>
          <button
            onClick={onIntercept}
            className="flex-1 px-2 py-1.5 rounded border border-radar-400/30 bg-radar-400/10 text-radar-300 text-[9px] font-mono hover:bg-radar-400/20 transition-colors"
          >
            PREDICT INTERCEPT
          </button>
        </div>
      </div>
    </div>
  );
}

function X({ className }) {
  return <span className={className}>✕</span>;
}