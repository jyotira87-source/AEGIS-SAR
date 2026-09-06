"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Radar,
  Ship,
  Waves,
  ShieldCheck,
  SlidersHorizontal,
  ShieldAlert,
} from "lucide-react";

/**
 * TacticalSidebar — collapsible vertical command rail.
 * Glowing active-tab states, operator badge footer.
 */

const NAV_ITEMS = [
  { href: "/", label: "OVERVIEW", sub: "EXEC COCKPIT", icon: Radar },
  { href: "/tracking", label: "LIVE FLEET", sub: "TRACKING", icon: Ship },
  { href: "/sar-analysis", label: "SAR SPILL", sub: "INTELLIGENCE", icon: Waves },
  { href: "/anomaly-logs", label: "EVIDENCE", sub: "VAULT", icon: ShieldCheck },
  { href: "/settings", label: "SYSTEM", sub: "CONFIG", icon: SlidersHorizontal },
];

export default function TacticalSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 h-screen z-30 hidden lg:flex flex-col w-44 shrink-0 border-r border-white/10 bg-navy-950/70 backdrop-blur-md">
      <div className="px-4 py-4 border-b border-white/10">
        <p className="text-[9px] font-mono tracking-[0.22em] text-slate-500 uppercase">
          Command Rail
        </p>
      </div>

      <nav className="flex-1 flex flex-col gap-1 p-2">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex items-center gap-2.5 px-3 py-2.5 rounded-md border text-[10px] font-mono tracking-wider transition-all ${
                active
                  ? "border-radar-400/40 bg-radar-400/10 text-radar-300 shadow-glow-cyan"
                  : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-7 rounded-r bg-radar-400 shadow-glow-cyan" />
              )}
              <item.icon
                className={`w-4 h-4 ${active ? "text-radar-300" : "text-slate-600 group-hover:text-slate-400"}`}
              />
              <span className="flex flex-col leading-tight">
                <span>{item.label}</span>
                <span className={`text-[8px] ${active ? "text-radar-400/70" : "text-slate-600"}`}>
                  {item.sub}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Operator badge */}
      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-md border border-white/5 bg-white/[0.02]">
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-crimson-500/15 border border-crimson-500/40 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4 text-crimson-400" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-navy-950" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-mono text-slate-200 truncate">OPERATOR EQUINOX-LEAD</p>
            <p className="text-[8px] font-mono text-hazard-400 tracking-wide">SEC-CLEARANCE-IV</p>
          </div>
        </div>
      </div>
    </aside>
  );
}