"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, MapPin, ZoomIn, ZoomOut, Maximize2, ChevronLeft, ChevronRight, Navigation } from "lucide-react";

/**
 * InteractiveVesselMap — HTML5/SVG tactical radar map.
 *
 * Ocean coordinate grid, center crosshair with target lat/lon, a pulsating
 * crimson slick polygon, dashed historical AIS trails, cyan transit triangles
 * with velocity vectors, and a target-locked suspect with a flashing
 * "SUSPECT IDENTIFIED" tooltip. Supports zoom, pan, and viewpoint presets.
 */
export default function InteractiveVesselMap({ center, sectorName, slick, vessels, focusedMmsi, sectors = [] }) {
  const VIEW_W = 1000;
  const VIEW_H = 700;

  const [viewCenter, setViewCenter] = useState(center ?? { lat: 19.4167, lon: 71.3833 });
  const [radiusKm, setRadiusKm] = useState(40);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState(null);
  const [presetOpen, setPresetOpen] = useState(false);
  const svgRef = useRef(null);

  // Sync view center whenever the parent issues a new acquisition.
  useEffect(() => {
    if (center?.lat && center?.lon) setViewCenter({ lat: center.lat, lon: center.lon });
  }, [center]);

  const c = viewCenter;

  const pxPerDegLat = useMemo(() => (VIEW_H / 2) / (radiusKm / 111.32), [radiusKm]);
  const pxPerDegLon = useMemo(
    () => (VIEW_W / 2) / (radiusKm / (111.32 * Math.cos((c.lat * Math.PI) / 180))),
    [radiusKm, c]
  );

  const project = (lat, lon) => ({
    x: VIEW_W / 2 + (lon - c.lon) * pxPerDegLon + offset.x,
    y: VIEW_H / 2 - (lat - c.lat) * pxPerDegLat + offset.y,
  });

  const resetView = () => {
    setOffset({ x: 0, y: 0 });
    setRadiusKm(40);
  };

  const swapView = (sector) => {
    setViewCenter({ lat: sector.lat, lon: sector.lon });
    setOffset({ x: 0, y: 0 });
    setPresetOpen(false);
  };

  // Coordinate grid lines
  const grid = useMemo(() => {
    const lines = [];
    const spanLat = (VIEW_H / 2) / pxPerDegLat;
    const spanLon = (VIEW_W / 2) / pxPerDegLon;
    for (let d = -Math.ceil(spanLat); d <= Math.ceil(spanLat); d++) {
      const p = project(c.lat + d, c.lon);
      lines.push({ key: `hlat${d}`, y: p.y, label: (c.lat + d).toFixed(2) });
    }
    for (let d = -Math.ceil(spanLon); d <= Math.ceil(spanLon); d++) {
      const p = project(c.lat, c.lon + d);
      lines.push({ key: `vlon${d}`, x: p.x, label: (c.lon + d).toFixed(2) });
    }
    return lines;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pxPerDegLat, pxPerDegLon, c, offset]);

  // Wheel zoom
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleWheel = (e) => {
      e.preventDefault();
      setRadiusKm((r) => Math.min(140, Math.max(8, r + e.deltaY * 0.012)));
    };
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, []);

  const centerPt = project(c.lat, c.lon);
  const suspect = (vessels ?? []).filter((v) => v.guilt_score > 85)[0] ?? null;
  const focusTrailMmsi = focusedMmsi ?? null;

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-mono tracking-[0.24em] text-cyan-400">GEOSPATIAL FUSION VIEW</p>
          <p className="text-sm font-bold text-slate-200">{sectorName ?? "Surveillance Zone"}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="coord-readout hidden md:inline">
            LCK {c.lat.toFixed(4)}°N / {c.lon.toFixed(4)}°E
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setRadiusKm((r) => Math.max(8, r - 8))} className="p-1.5 rounded-md bg-white/5 hover:bg-cyan-400/15 border border-white/10 text-slate-300 hover:text-cyan-300 transition-colors" title="Zoom in">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setRadiusKm((r) => Math.min(140, r + 8))} className="p-1.5 rounded-md bg-white/5 hover:bg-cyan-400/15 border border-white/10 text-slate-300 hover:text-cyan-300 transition-colors" title="Zoom out">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button onClick={resetView} className="p-1.5 rounded-md bg-white/5 hover:bg-emerald-400/15 border border-white/10 text-slate-300 hover:text-emerald-300 transition-colors" title="Reset view">
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="relative">
            <button
              onClick={() => setPresetOpen((o) => !o)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-400/10 border border-cyan-400/25 text-cyan-400 text-[11px] font-mono hover:bg-cyan-400/20 transition-colors"
            >
              <Crosshair className="w-3.5 h-3.5" /> VIEWPOINT {presetOpen ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
            {presetOpen && (
              <div className="absolute right-0 mt-2 w-64 z-20 glass-card p-2 space-y-1">
                {sectors.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => swapView(s)}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-cyan-400/10 text-xs text-slate-300 hover:text-cyan-300 transition-colors flex items-center gap-2"
                  >
                    <MapPin className="w-3.5 h-3.5 text-cyan-400/70" />
                    <span className="font-medium">{s.name}</span>
                    <span className="ml-auto font-mono text-[9px] text-slate-500">
                      {s.lat.toFixed(2)},{s.lon.toFixed(2)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-4">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="w-full rounded-lg border border-cyan-400/15 bg-[#0d1524] select-none"
          style={{ touchAction: "none", cursor: drag ? "grabbing" : "grab" }}
          onPointerDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setDrag({ sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y, scale: VIEW_W / rect.width });
          }}
          onPointerMove={(e) => {
            if (drag) {
              setOffset({
                x: drag.ox + (e.clientX - drag.sx) * drag.scale,
                y: drag.oy + (e.clientY - drag.sy) * drag.scale,
              });
            }
          }}
          onPointerUp={() => setDrag(null)}
          onPointerLeave={() => setDrag(null)}
        >
          <defs>
            <pattern id="mapgrid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(34,211,238,0.06)" strokeWidth="1" />
            </pattern>
            <linearGradient id="slickCore" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgba(239,68,68,0.35)" />
              <stop offset="100%" stopColor="rgba(244,63,94,0.7)" />
            </linearGradient>
            <radialGradient id="slickGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(244,63,94,0.28)" />
              <stop offset="55%" stopColor="rgba(244,63,94,0.10)" />
              <stop offset="100%" stopColor="rgba(244,63,94,0.0)" />
            </radialGradient>
          </defs>

          {/* Ocean base + grid */}
          <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="#0d1524" />
          <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#mapgrid)" />
          {grid.map((l) =>
            l.x !== undefined ? (
              <line key={l.key} x1={l.x} y1="0" x2={l.x} y2={VIEW_H} stroke="rgba(34,211,238,0.07)" strokeWidth="1" />
            ) : (
              <line key={l.key} x1="0" y1={l.y} x2={VIEW_W} y2={l.y} stroke="rgba(34,211,238,0.07)" strokeWidth="1" />
            )
          )}
          {grid.map((l) =>
            l.x !== undefined ? (
              <text key={`${l.key}t`} x={l.x + 4} y={14} fill="rgba(148,163,184,0.5)" fontSize="10" fontFamily="JetBrains Mono, monospace">
                {l.label}
              </text>
            ) : (
              <text key={`${l.key}t`} x={10} y={l.y + 4} fill="rgba(148,163,184,0.5)" fontSize="10" fontFamily="JetBrains Mono, monospace">
                {l.label}
              </text>
            )
          )}

          {/* Slick radial glow + polygons */}
          {slick?.features && (
            <ellipse
              cx={project(slick.centroid_lat, slick.centroid_lon).x}
              cy={project(slick.centroid_lat, slick.centroid_lon).y}
              rx={radiusKm > 55 ? 260 : 190}
              ry={radiusKm > 55 ? 200 : 150}
              fill="url(#slickGlow)"
            />
          )}
          {slick?.features?.map((feat, i) => {
            const ring = feat.geometry?.coordinates?.[0] ?? [];
            const pts = ring.map(([lon, lat]) => {
              const p = project(lat, lon);
              return `${p.x},${p.y}`;
            });
            if (!pts.length) return null;
            if (feat.properties?.layer === "slick_core") {
              return (
                <path
                  key={`core${i}`}
                  d={`M ${pts.join(" L ")} Z`}
                  fill="url(#slickCore)"
                  stroke="#f43f5e"
                  strokeWidth="1.5"
                  className="slick-pulse"
                />
              );
            }
            return (
              <path
                key={`sheen${i}`}
                d={`M ${pts.join(" L ")} Z`}
                fill="rgba(244,63,94,0.12)"
                stroke="rgba(244,63,94,0.5)"
                strokeWidth="1"
                strokeDasharray="6 4"
                className="slick-pulse"
                style={{ animationDelay: "0.6s" }}
              />
            );
          })}
          <circle
            cx={project(slick?.centroid_lat ?? c.lat, slick?.centroid_lon ?? c.lon).x}
            cy={project(slick?.centroid_lat ?? c.lat, slick?.centroid_lon ?? c.lon).y}
            r="3.5"
            fill="#f43f5e"
            className="blink"
          />

          {/* Historical AIS trails (dashed polylines) */}
          {(vessels ?? []).map((v) => {
            const points = (v.trail ?? []).map((p) => {
              const pp = project(p.lat, p.lon);
              return `${pp.x},${pp.y}`;
            });
            if (!points.length) return null;
            const isFocused = focusTrailMmsi && v.mmsi === focusTrailMmsi;
            const isSuspect = v.guilt_score > 85;
            const dimmed = focusTrailMmsi && !isFocused;
            return (
              <polyline
                key={`trail${v.mmsi}`}
                points={points.join(" ")}
                fill="none"
                stroke={isSuspect ? "#f43f5e" : "#22d3ee"}
                strokeWidth={isFocused ? 2.5 : 1.4}
                strokeDasharray={isSuspect ? "8 5" : "6 6"}
                strokeOpacity={dimmed ? 0.15 : isFocused ? 0.95 : 0.6}
                strokeLinecap="round"
              />
            );
          })}

          {/* Vessel markers — cyan triangles with velocity vectors */}
          {(vessels ?? []).map((v) => {
            const last = (v.trail ?? [])[v.trail?.length - 1];
            if (!last) return null;
            const pos = project(last.lat, last.lon);
            const isSuspect = v.guilt_score > 85;
            const isFocused = focusTrailMmsi && v.mmsi === focusTrailMmsi;
            const dimmed = focusTrailMmsi && !isFocused;
            const heading = v.course_over_ground_deg ?? 0;
            const velLen = Math.min(90, 6 + (v.speed_over_ground_knots ?? 10) * 3.2);
            const vx = pos.x + velLen * Math.sin((heading * Math.PI) / 180);
            const vy = pos.y - velLen * Math.cos((heading * Math.PI) / 180);
            if (isSuspect) {
              return (
                <g key={`marker${v.mmsi}`} opacity={dimmed ? 0.2 : 1}>
                  <circle cx={pos.x} cy={pos.y} r="13" fill="none" stroke="#f43f5e" className="suspect-lock" />
                  <circle cx={pos.x} cy={pos.y} r="22" fill="none" stroke="rgba(244,63,94,0.35)" strokeWidth="1" strokeDasharray="3 4" className="suspect-lock" style={{ animationDelay: "0.4s" }} />
                  <circle cx={pos.x} cy={pos.y} r="3.5" fill="#f43f5e" />
                  <text x={pos.x} y={pos.y - 30} textAnchor="middle" fill="#f43f5e" fontSize="11" fontWeight="700" fontFamily="JetBrains Mono, monospace" className="blink">
                    SUSPECT IDENTIFIED
                  </text>
                  <text x={pos.x} y={pos.y - 19} textAnchor="middle" fill="#fda4af" fontSize="9" fontFamily="JetBrains Mono, monospace">
                    {v.mmsi}
                  </text>
                  <line x1={pos.x} y1={pos.y} x2={vx} y2={vy} stroke="#f43f5e" strokeWidth="1.5" strokeOpacity="0.8" />
                </g>
              );
            }
            // Rotate triangle to heading (bearing CW from north; SVG y-down).
            return (
              <g
                key={`marker${v.mmsi}`}
                opacity={dimmed ? 0.2 : 0.95}
                transform={`translate(${pos.x} ${pos.y}) rotate(${heading})`}
              >
                <line x1="0" y1="-8" x2={velLen} y2="-8" stroke="#22d3ee" strokeWidth="1" strokeOpacity="0.85" strokeDasharray="4 3" transform="translate(-8 8)" />
                <polygon points="0,-6 5,4 -5,4" fill="#22d3ee" />
                <circle cx="0" cy="-6" r="1.6" fill="#67e8f9" />
              </g>
            );
          })}

          {/* Center crosshair + target readout */}
          <g>
            <line x1={centerPt.x - 22} y1={centerPt.y} x2={centerPt.x + 22} y2={centerPt.y} stroke="rgba(34,211,238,0.75)" strokeWidth="1" />
            <line x1={centerPt.x} y1={centerPt.y - 22} x2={centerPt.x} y2={centerPt.y + 22} stroke="rgba(34,211,238,0.75)" strokeWidth="1" />
            <circle cx={centerPt.x} cy={centerPt.y} r="9" fill="none" stroke="rgba(34,211,238,0.9)" strokeWidth="1.2" />
            <circle cx={centerPt.x} cy={centerPt.y} r="1.6" fill="#22d3ee" />
            <text x={centerPt.x + 14} y={centerPt.y - 14} fill="#67e8f9" fontSize="11" fontFamily="JetBrains Mono, monospace">
              {c.lat.toFixed(4)}°N {c.lon.toFixed(4)}°E
            </text>
            <text x={centerPt.x - 24} y={20} textAnchor="end" fill="rgba(148,163,184,0.6)" fontSize="11" fontFamily="JetBrains Mono, monospace">
              RNG {radiusKm} KM
            </text>
          </g>

          {/* Right-edge vessel legend */}
          <g transform={`translate(${VIEW_W - 128}, 24)`}>
            <rect x="-4" y="-6" width="140" height="150" rx="6" fill="rgba(11,15,25,0.78)" stroke="rgba(148,163,184,0.15)" />
            <text x="4" y="10" fill="#94a3b8" fontSize="9" fontFamily="JetBrains Mono, monospace" letterSpacing="1.5">CONTACTS</text>
            <polygon points="6,20 11,30 1,30" fill="#22d3ee" />
            <text x="18" y="29" fill="#cbd5e1" fontSize="9" fontFamily="JetBrains Mono, monospace">TRANSIT</text>
            <rect x="4" y="42" width="14" height="8" rx="2" fill="rgba(244,63,94,0.7)" className="slick-pulse" />
            <text x="22" y="50" fill="#cbd5e1" fontSize="9" fontFamily="JetBrains Mono, monospace">SLICK</text>
            <circle cx="8" cy="66" r="4" fill="none" stroke="#f43f5e" strokeWidth="1.5" className="suspect-lock" />
            <text x="18" y="70" fill="#fda4af" fontSize="9" fontFamily="JetBrains Mono, monospace">SUSPECT</text>
            <line x1="4" y1="85" x2="20" y2="85" stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="4 3" />
            <text x="26" y="89" fill="#cbd5e1" fontSize="9" fontFamily="JetBrains Mono, monospace">AIS TRL</text>
            <circle cx="8" cy="104" r="3" fill="#10b981" />
            <text x="18" y="108" fill="#cbd5e1" fontSize="9" fontFamily="JetBrains Mono, monospace">ORIGIN</text>
          </g>

          {/* North indicator */}
          <g transform="translate(40, 32)">
            <path d="M 0 14 L -7 0 L 0 6 L 7 0 Z" fill="#67e8f9" />
            <text x="0" y="30" textAnchor="middle" fill="#67e8f9" fontSize="11" fontFamily="JetBrains Mono, monospace" fontWeight="700">N</text>
          </g>
        </svg>
      </div>

      {/* Footer strip */}
      <div className="px-5 pb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="coord-readout flex items-center gap-2">
          <Navigation className="w-3.5 h-3.5 text-cyan-400" />
          SLICK ORIGIN {slick?.centroid_lat?.toFixed(4) ?? "--"}°N / {slick?.centroid_lon?.toFixed(4) ?? "--"}°E
        </p>
        <p className="coord-readout">
          CONTACTS {vessels?.length ?? 0} <span className="text-slate-600">|</span> OFFSET {radiusKm.toFixed(0)} KM
        </p>
      </div>
    </div>
  );
}