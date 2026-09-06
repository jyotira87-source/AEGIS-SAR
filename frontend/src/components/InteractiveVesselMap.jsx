"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Map as ReactMap,
  Source,
  Layer,
  Marker,
  Popup,
  NavigationControl,
  ScaleControl,
} from "react-map-gl/maplibre";
import { Crosshair, Navigation, Layers, Crosshair as Target } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * InteractiveVesselMap — real-time satellite tile map (MapLibre GL).
 *
 * Base layer: free Esri World Imagery satellite raster tiles (no token needed),
 * overlaid with dark CARTO place labels. Renders the SAR slick polygon
 * (crimson fill + border), dashed historical AIS trails, live vessel markers
 * (flashing red target for the offender, cyan for benign contacts) and a hover
 * Popup with MMSI / speed / guilt score. The viewport flies to each new sector
 * acquisition and zooms onto the vessel selected via "INSPECT TELEMETRY".
 */

// Esri World Imagery — free satellite raster tiles, no API key required.
const SATELLITE_STYLE = {
  version: 8,
  sources: {
    "esri-imagery": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution:
        'Imagery © <a href="https://www.esri.com/" target="_blank" rel="noreferrer">Esri</a>, Maxar, Earthstar Geographics',
    },
    "dark-labels": {
      type: "raster",
      tiles: ["https://basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png"],
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors © CARTO',
    },
  },
  layers: [
    { id: "esri-imagery", type: "raster", source: "esri-imagery" },
    { id: "dark-labels", type: "raster", source: "dark-labels", paint: { "raster-opacity": 0.55 } },
  ],
};

const DEFAULT_CENTER = { lat: 19.4167, lon: 71.3833 };
const SECTOR_ZOOM = 10.2;
const VESSEL_ZOOM = 12.6;

export default function InteractiveVesselMap({
  center,
  sectorName,
  slick,
  vessels,
  focusedMmsi,
  sectors = [],
}) {
  const mapRef = useRef(null);
  const [hovered, setHovered] = useState(null); // { v, pos } vessel under cursor
  const [presetOpen, setPresetOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const c = center?.lat && center?.lon ? center : DEFAULT_CENTER;

  // ---- GeoJSON sources -----------------------------------------------------
  const slickGeo = useMemo(
    () => ({
      type: "FeatureCollection",
      features: Array.isArray(slick?.features) ? slick.features : [],
    }),
    [slick]
  );

  const trailsGeo = useMemo(
    () => ({
      type: "FeatureCollection",
      features: (vessels ?? [])
        .filter((v) => Array.isArray(v.trail) && v.trail.length > 1)
        .map((v) => ({
          type: "Feature",
          properties: {
            mmsi: v.mmsi,
            vessel_name: v.vessel_name,
            guilt_score: v.guilt_score ?? 0,
            offender: (v.guilt_score ?? 0) > 85,
          },
          geometry: {
            type: "LineString",
            coordinates: v.trail.map((p) => [p.lon, p.lat]),
          },
        })),
    }),
    [vessels]
  );

  const suspect = useMemo(
    () => (vessels ?? []).filter((v) => (v.guilt_score ?? 0) > 85)[0] ?? null,
    [vessels]
  );

  const vesselPos = useCallback((v) => {
    if (!Array.isArray(v?.trail) || v.trail.length === 0) return null;
    const last = v.trail[v.trail.length - 1];
    return { lat: last.lat, lon: last.lon };
  }, []);

  // ---- Viewport choreography ------------------------------------------------
  // Fly to a new sector / acquisition centre when the parent re-acquires.
  useEffect(() => {
    if (!mapReady || !c?.lat) return;
    mapRef.current?.flyTo?.({
      center: [c.lon, c.lat],
      zoom: SECTOR_ZOOM,
      duration: 1800,
      essential: true,
    });
  }, [mapReady, c.lat, c.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zoom onto the vessel selected via "INSPECT TELEMETRY".
  useEffect(() => {
    if (!mapReady || !focusedMmsi) return;
    const target = (vessels ?? []).find((v) => v.mmsi === focusedMmsi);
    const pos = vesselPos(target);
    if (!pos) return;
    mapRef.current?.flyTo?.({
      center: [pos.lon, pos.lat],
      zoom: VESSEL_ZOOM,
      duration: 1600,
      essential: true,
    });
  }, [mapReady, focusedMmsi, vessels, vesselPos]);

  // ---- Layer definitions (Dark War Room palette) ----------------------------
  const slickSheenLayer = {
    id: "slick-sheen",
    type: "fill",
    source: "slick",
    filter: ["==", ["get", "layer"], "slick_sheen"],
    paint: { "fill-color": "rgba(239, 68, 68, 0.18)" },
  };
  const slickFillLayer = {
    id: "slick-fill",
    type: "fill",
    source: "slick",
    filter: ["==", ["get", "layer"], "slick_core"],
    paint: { "fill-color": "rgba(239, 68, 68, 0.45)" },
  };
  const slickOutlineLayer = {
    id: "slick-outline",
    type: "line",
    source: "slick",
    paint: {
      "line-color": "#EF4444",
      "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.2, 13, 2.6],
    },
  };
  const trailGlowLayer = {
    id: "ais-trails-glow",
    type: "line",
    source: "ais-trails",
    paint: {
      "line-color": "#22D3EE",
      "line-width": 7,
      "line-blur": 6,
      "line-opacity": 0.25,
    },
  };
  const trailLineLayer = {
    id: "ais-trails",
    type: "line",
    source: "ais-trails",
    paint: {
      "line-color": "#22D3EE",
      "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.4, 13, 2.6],
      "line-dasharray": [2, 1.6],
      "line-opacity": 0.9,
    },
  };

  const flyToSector = (sector) => {
    mapRef.current?.flyTo?.({
      center: [sector.lon, sector.lat],
      zoom: SECTOR_ZOOM,
      duration: 1800,
      essential: true,
    });
    setPresetOpen(false);
  };

  return (
    <div className="glass-card overflow-hidden">
      {/* ---- Header strip ---- */}
      <div className="px-5 pt-4 pb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-mono tracking-[0.24em] text-cyan-400">GEOSPATIAL FUSION VIEW</p>
          <p className="text-sm font-bold text-slate-200">
            {sectorName ? sectorName.toUpperCase() : "SATELLITE RECONNAISSANCE"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Sector viewpoint presets */}
          <div className="relative">
            <button
              onClick={() => setPresetOpen((o) => !o)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-300 text-[10px] font-mono hover:bg-cyan-400/20 transition-colors"
            >
              <Layers className="w-3.5 h-3.5" /> VIEWPOINTS
            </button>
            {presetOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-64 rounded-md border border-white/10 bg-[#0d1524]/95 backdrop-blur-md shadow-glow-soft overflow-hidden">
                {sectors.length === 0 && (
                  <p className="px-3 py-2.5 text-[10px] font-mono text-slate-500">NO SECTORS AVAILABLE</p>
                )}
                {sectors.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => flyToSector(s)}
                    className="w-full text-left px-3 py-2 text-[11px] font-mono text-slate-300 hover:bg-cyan-400/10 hover:text-cyan-300 transition-colors border-b border-white/5 last:border-0"
                  >
                    <span className="text-cyan-400 mr-1.5">▸</span>
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
            <span
              className={`w-2 h-2 rounded-full ${
                mapReady ? "bg-emerald-400 shadow-glow-emerald animate-pulse" : "bg-amber-400 animate-pulse"
              }`}
            />
            {mapReady ? "SAT LINK LIVE" : "ACQUIRING"}
          </span>
        </div>
      </div>

      {/* ---- Satellite map ---- */}
      <div className="relative h-[480px] md:h-[560px] target-grid">
        <ReactMap
          ref={mapRef}
          initialViewState={{
            longitude: c.lon,
            latitude: c.lat,
            zoom: SECTOR_ZOOM,
          }}
          mapStyle={SATELLITE_STYLE}
          style={{ width: "100%", height: "100%" }}
          attributionControl={{ compact: true }}
          onLoad={() => setMapReady(true)}
          dragPan
          scrollZoom
          doubleClickZoom
        >
          <NavigationControl showCompass={false} position="bottom-right" />
          <ScaleControl unit="metric" position="bottom-left" maxWidth={120} />

          {/* SAR slick polygon — sheen + core (crimson) */}
          <Source id="slick" type="geojson" data={slickGeo}>
            <Layer {...slickSheenLayer} />
            <Layer {...slickFillLayer} />
            <Layer {...slickOutlineLayer} />
          </Source>

          {/* Historical AIS trails — dashed cyan with glow underlay */}
          <Source id="ais-trails" type="geojson" data={trailsGeo}>
            <Layer {...trailGlowLayer} />
            <Layer {...trailLineLayer} />
          </Source>

          {/* Hover popup — MMSI / speed / guilt */}
          {hovered && (
            <Popup
              longitude={hovered.pos.lon}
              latitude={hovered.pos.lat}
              anchor="bottom"
              offset={[0, -26]}
              closeButton={false}
              maxWidth="260px"
            >
              <div className="font-mono text-[11px] leading-relaxed min-w-[170px]">
                <p className="flex items-center gap-1.5 font-bold text-slate-100">
                  <Target className="w-3 h-3 text-cyan-400" /> {hovered.v.vessel_name}
                </p>
                <p className="text-slate-400 mt-1">
                  MMSI <span className="text-cyan-300">{hovered.v.mmsi}</span> · {hovered.v.flag_state}
                </p>
                <p className="text-slate-400">
                  SPEED{" "}
                  <span className="text-cyan-300">
                    {hovered.v.speed_over_ground_knots?.toFixed?.(1) ?? "--"} kn
                  </span>
                </p>
                <p
                  className={
                    hovered.v.guilt_score > 85 ? "text-crimson-400 font-bold" : "text-emerald-400 font-bold"
                  }
                >
                  GUILT SCORE {hovered.v.guilt_score ?? 0}%
                </p>
                <p className="text-slate-500">
                  SLICK RANGE {hovered.v.distance_to_centroid_km?.toFixed?.(2) ?? "--"} km
                </p>
              </div>
            </Popup>
          )}

          {/* Vessel markers — suspect flashing red, benign cyan */}
          {(vessels ?? []).map((v) => {
            const pos = vesselPos(v);
            if (!pos) return null;
            const isSuspect = (v.guilt_score ?? 0) > 85;
            return (
              <Marker key={v.mmsi} longitude={pos.lon} latitude={pos.lat} anchor="center">
                <button
                  type="button"
                  onMouseEnter={() => setHovered({ v, pos })}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered({ v, pos })}
                  onBlur={() => setHovered(null)}
                  className="relative flex items-center justify-center outline-none cursor-pointer"
                  aria-label={`Vessel ${v.vessel_name} MMSI ${v.mmsi}`}
                >
                  {isSuspect ? (
                    <span className="relative flex items-center justify-center">
                      <span className="absolute w-10 h-10 rounded-full bg-crimson-500/25 animate-ping" />
                      <span className="absolute w-9 h-9 rounded-full border-2 border-crimson-500 shadow-glow-crimson suspect-ring" />
                      <span className="relative w-5 h-5 rounded-full bg-crimson-500 border-2 border-white/90 shadow-glow-crimson flex items-center justify-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      </span>
                    </span>
                  ) : (
                    <span className="relative flex items-center justify-center">
                      <span className="w-3.5 h-3.5 rounded-full bg-cyan-400/90 border border-white/80 shadow-glow-cyan" />
                      <span className="absolute w-5 h-5 rounded-full border border-cyan-400/40" />
                    </span>
                  )}
                </button>
              </Marker>
            );
          })}
        </ReactMap>

        {/* Suspect lock banner */}
        {suspect && (
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2 px-3 py-2 rounded-md border border-crimson-500/40 bg-[#0d1524]/85 backdrop-blur-md shadow-glow-crimson">
            <span className="relative flex items-center justify-center">
              <span className="absolute w-3.5 h-3.5 rounded-full bg-crimson-500/30 animate-ping" />
              <Crosshair className="w-4 h-4 text-crimson-400 relative" />
            </span>
            <div>
              <p className="text-[9px] font-mono tracking-[0.22em] text-crimson-400 blink">SUSPECT IDENTIFIED</p>
              <p className="text-[11px] font-mono font-bold text-slate-100">
                {suspect.vessel_name} <span className="text-slate-500">·</span>{" "}
                <span className="text-crimson-300">GUILT {suspect.guilt_score}%</span>
              </p>
            </div>
          </div>
        )}

        {/* North indicator + centre coordinates */}
        <div className="absolute top-3 right-3 z-10 flex flex-col items-center px-2.5 py-2 rounded-md border border-white/10 bg-[#0d1524]/85 backdrop-blur-md">
          <Navigation className="w-4 h-4 text-cyan-400" />
          <p className="text-[9px] font-mono text-cyan-300 font-bold mt-0.5">N</p>
          <p className="text-[8px] font-mono text-slate-400 mt-1 whitespace-nowrap">{c.lat.toFixed(4)}°N</p>
          <p className="text-[8px] font-mono text-slate-400 whitespace-nowrap">{c.lon.toFixed(4)}°E</p>
        </div>

        {/* Contacts legend */}
        <div className="absolute bottom-3 left-3 z-10 hidden sm:block px-3 py-2 rounded-md border border-white/10 bg-[#0d1524]/85 backdrop-blur-md">
          <p className="text-[8px] font-mono tracking-[0.18em] text-slate-500 mb-1">CONTACTS</p>
          <p className="flex items-center gap-1.5 text-[9px] font-mono text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-crimson-500 border border-white/80" /> SUSPECT
          </p>
          <p className="flex items-center gap-1.5 text-[9px] font-mono text-slate-300 mt-0.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 border border-white/60" /> TRANSIT
          </p>
          <p className="flex items-center gap-1.5 text-[9px] font-mono text-slate-300 mt-0.5">
            <span className="inline-block w-3.5 h-0 border-t-2 border-dashed border-cyan-400" /> AIS TRAIL
          </p>
          <p className="flex items-center gap-1.5 text-[9px] font-mono text-slate-300 mt-0.5">
            <span className="w-3 h-2 rounded-sm bg-crimson-500/60 border border-crimson-500" /> SLICK
          </p>
        </div>
      </div>

      {/* ---- Footer strip ---- */}
      <div className="px-5 pb-4 pt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="coord-readout flex items-center gap-2">
          <Navigation className="w-3.5 h-3.5 text-cyan-400" />
          SLICK ORIGIN {slick?.centroid_lat?.toFixed(4) ?? "--"}°N / {slick?.centroid_lon?.toFixed(4) ?? "--"}°E
        </p>
        <p className="coord-readout">
          CONTACTS {vessels?.length ?? 0} <span className="text-slate-600">|</span> IMAGERY ESRI WORLD-IMAGERY
        </p>
      </div>
    </div>
  );
}
