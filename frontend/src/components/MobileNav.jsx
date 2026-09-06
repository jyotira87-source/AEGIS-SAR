"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Radar, Ship, Waves, ShieldCheck, SlidersHorizontal } from "lucide-react";

/**
 * MobileNav — bottom command rail for small screens (sidebar is desktop-only).
 */

const ITEMS = [
  { href: "/", label: "OPS", icon: Radar },
  { href: "/tracking", label: "FLEET", icon: Ship },
  { href: "/sar-analysis", label: "SAR", icon: Waves },
  { href: "/anomaly-logs", label: "VAULT", icon: ShieldCheck },
  { href: "/settings", label: "CFG", icon: SlidersHorizontal },
];

export default function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-navy-950/90 backdrop-blur-md">
      <div className="flex">
        {ITEMS.map((i) => {
          const active =
            i.href === "/" ? pathname === "/" : pathname.startsWith(i.href);
          return (
            <Link
              key={i.href}
              href={i.href}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[8px] font-mono tracking-widest transition-colors ${
                active ? "text-radar-300" : "text-slate-500"
              }`}
            >
              <i.icon className="w-4 h-4" />
              {i.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}