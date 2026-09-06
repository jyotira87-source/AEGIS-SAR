"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertOctagon, X } from "lucide-react";
import { useLiveAIS } from "@/context/LiveAISContext";

/**
 * LiveAlertBanner — slide-in toast whenever a correlated spill alert arrives.
 * Auto-dismisses after 9s; dismissed stamps prevent re-notification.
 */

export default function LiveAlertBanner() {
  const { slicks } = useLiveAIS();
  const [current, setCurrent] = useState(null);
  const [queue, setQueue] = useState([]);
  const seenRef = useRef(new Set());

  // Move high-confidence alerts into the toast queue.
  useEffect(() => {
    for (const s of slicks) {
      const key = s.anomaly_id || s.proof_id;
      if (!key || seenRef.current.has(key)) continue;
      seenRef.current.add(key);
      if ((s.confidence_score ?? 0) >= 70) {
        setQueue((prev) => [...prev, s]);
      }
    }
  }, [slicks]);

  // Show the next queued alert one at a time.
  useEffect(() => {
    if (current || queue.length === 0) return;
    const next = queue[0];
    setCurrent(next);
    setQueue((prev) => prev.slice(1));
    const timer = setTimeout(() => setCurrent(null), 9000);
    return () => clearTimeout(timer);
  }, [current, queue]);

  const dismiss = () => {
    setCurrent(null);
    // Re-trigger the queue effect for a queued alert.
    if (queue.length === 0) return;
    setTimeout(() => setCurrent(queue[0]), 50);
    setQueue((prev) => prev.slice(1));
  };

  return (
    <div className="fixed top-16 right-4 z-50 max-w-sm">
      <AnimatePresence>
        {current && (
          <motion.div
            key={current.anomaly_id || current.proof_id}
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 60 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="rounded-lg border border-crimson-500/50 bg-[#0d1524]/95 backdrop-blur-md shadow-glow-crimson p-3.5"
          >
            <div className="flex items-start gap-2.5">
              <div className="relative mt-0.5">
                <AlertOctagon className="w-5 h-5 text-crimson-400" />
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-crimson-500 animate-ping" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-mono tracking-[0.2em] text-crimson-400 uppercase">
                  Correlated Spill Alert
                </p>
                <p className="mt-1 text-[12px] font-bold text-slate-100 leading-snug">
                  {current.suspect_vessel_mmsi
                    ? `MMSI ${current.suspect_vessel_mmsi} tagged as suspect`
                    : "Unattributed slick detected"}
                </p>
                <p className="mt-1 text-[10px] font-mono text-slate-400">
                  AREA {current.slick_area_sq_km?.toFixed?.(1) ?? "--"} km² · CONF {current.confidence_score?.toFixed?.(0) ?? "--"}%
                </p>
                <p className="text-[9px] font-mono text-slate-600 mt-1">
                  {current.proof_id} · {current.timestamp ? String(current.timestamp).slice(0, 19) : ""}
                </p>
              </div>
              <button onClick={dismiss} className="text-slate-500 hover:text-slate-200 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}