"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLiveAIS } from "./LiveAISContext";

/**
 * AlertSoundContext — WebAudio alarm beeps on new SPILL_ALERT / dark-target
 * events, with a global mute toggle surfaced in the command header.
 */

const AlertSoundContext = createContext(null);

function buildWebAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    return new Ctx();
  } catch {
    return null;
  }
}

export function AlertSoundProvider({ children }) {
  const [muted, setMuted] = useState(false);
  const audioRef = useRef(null);
  const { slicks } = useLiveAIS();
  const knownAlertsRef = useRef(new Set());

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = buildWebAudio();
    return audioRef.current;
  }, []);

  const beep = useCallback(
    (freq = 880, dur = 0.18, gain = 0.04) => {
      if (muted) return;
      const ctx = ensureAudio();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      g.gain.value = gain;
      osc.connect(g).connect(ctx.destination);
      const t = ctx.currentTime;
      osc.start(t);
      osc.stop(t + dur);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    },
    [muted, ensureAudio]
  );

  const tripleBeep = useCallback(() => {
    beep(988, 0.14);
    setTimeout(() => beep(1319, 0.14), 180);
    setTimeout(() => beep(1568, 0.2), 360);
  }, [beep]);

  // Sound the alarm for newly-arrived spill alerts.
  useEffect(() => {
    if (!slicks.length) return;
    for (const s of slicks) {
      const key = s.anomaly_id || s.proof_id;
      if (key && !knownAlertsRef.current.has(key)) {
        knownAlertsRef.current.add(key);
        if (s.confidence_score >= 70) tripleBeep();
        else beep(660, 0.15);
      }
    }
  }, [slicks, beep, tripleBeep]);

  const value = useMemo(
    () => ({
      muted,
      setMuted,
      toggleMute: () => setMuted((m) => !m),
      beep,
      tripleBeep,
    }),
    [muted, beep, tripleBeep]
  );

  return (
    <AlertSoundContext.Provider value={value}>{children}</AlertSoundContext.Provider>
  );
}

export function useAlertSound() {
  const ctx = useContext(AlertSoundContext);
  if (!ctx) throw new Error("useAlertSound must be used within <AlertSoundProvider>");
  return ctx;
}