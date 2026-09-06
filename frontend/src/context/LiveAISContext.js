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

/**
 * LiveAISContext — real-time maritime stream provider.
 *
 * Owns the WebSocket connection to GET /ws/live-feed on the backend and the
 * client-side vessel store. Handles:
 *   - automatic reconnection with exponential backoff (3s → 30s cap)
 *   - VESSEL_UPDATE_BATCH / SPILL_ALERT / TELEMETRY_STATS frame dispatch
 *   - a ping keep-alive every 15 s
 *   - server-time tag on each batch for smooth marker interpolation
 *
 * The latest raw batches are also exposed via refs so the map can interpolate
 * positions without re-rendering the whole tree on every animation frame.
 */

const RECONNECT_BASE_MS = 3000;
const RECONNECT_MAX_MS = 30000;
const KEEPALIVE_MS = 15000;

function resolveWsUrl() {
  const custom = process.env.NEXT_PUBLIC_WS_URL;
  if (custom) return custom;
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const host = window.location.hostname || "localhost";
    return `${proto}://${host}:8000/ws/live-feed`;
  }
  return "ws://localhost:8000/ws/live-feed";
}

const LiveAISContext = createContext(null);

export function LiveAISProvider({ children }) {
  const [vessels, setVessels] = useState([]);
  const [stats, setStats] = useState({
    total_ships: 0,
    dark_vessels: 0,
    active_slicks: 0,
    feed_mode: "CONNECTING",
  });
  const [slicks, setSlicks] = useState([]);
  const [connection, setConnection] = useState("CONNECTING"); // CONNECTING | LIVE | RECONNECTING
  const [serverEpoch, setServerEpoch] = useState(0);

  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const backoffRef = useRef(RECONNECT_BASE_MS);
  const deadRef = useRef(false);
  const mountedRef = useRef(true);

  // Refs for jitter-free interpolation inside the map component.
  const latestBatchRef = useRef([]);
  const prevBatchRef = useRef([]);
  const batchTimeRef = useRef(0);
  const batchIntervalMsRef = useRef(1000);

  const connect = useCallback(() => {
    if (deadRef.current || !mountedRef.current) return;
    const proto = process.env.NEXT_PUBLIC_WS_URL
      ? null
      : typeof window !== "undefined" && window.location.protocol === "https:"
        ? "wss"
        : "ws";

    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnection((c) => (c === "LIVE" ? "LIVE" : "CONNECTING"));
    let ws;
    try {
      ws = new WebSocket(resolveWsUrl());
    } catch {
      scheduleReconnect();
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      backoffRef.current = RECONNECT_BASE_MS;
      setConnection("LIVE");
    };

    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      const now = Date.now();
      switch (msg.type) {
        case "VESSEL_UPDATE_BATCH": {
          const arr = Array.isArray(msg.data) ? msg.data : [];
          // Track interpolation window between successive batches.
          if (batchTimeRef.current > 0 && arr.length > 0) {
            prevBatchRef.current = latestBatchRef.current;
            batchIntervalMsRef.current = Math.min(
              3000,
              Math.max(250, now - batchTimeRef.current)
            );
          }
          latestBatchRef.current = arr;
          batchTimeRef.current = now;
          setVessels(arr);
          break;
        }
        case "SPILL_ALERT": {
          const record = msg.data;
          setSlicks((prev) => {
            const next = [record, ...prev];
            return next.slice(0, 50);
          });
          break;
        }
        case "TELEMETRY_STATS": {
          setStats((s) => ({ ...s, ...(msg.data || {}) }));
          setServerEpoch(msg.data?.timestamp_epoch || now / 1000);
          break;
        }
        default:
          break;
      }
    };

    ws.onclose = () => {
      if (deadRef.current) return;
      setConnection("RECONNECTING");
      scheduleReconnect();
    };

    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* noop */
      }
    };
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current || deadRef.current) return;
    const delay = backoffRef.current;
    backoffRef.current = Math.min(RECONNECT_MAX_MS, backoffRef.current * 1.6);
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connect();
    }, delay);
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    const keepalive = setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send("ping");
      }
    }, KEEPALIVE_MS);
    return () => {
      mountedRef.current = false;
      deadRef.current = true;
      clearInterval(keepalive);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      try {
        wsRef.current?.close();
      } catch {
        /* noop */
      }
    };
  }, [connect]);

  const value = useMemo(
    () => ({
      vessels,
      stats,
      slicks,
      connection,
      serverEpoch,
      latestBatchRef,
      prevBatchRef,
      batchTimeRef,
      batchIntervalMsRef,
    }),
    [vessels, stats, slicks, connection, serverEpoch]
  );

  return <LiveAISContext.Provider value={value}>{children}</LiveAISContext.Provider>;
}

export function useLiveAIS() {
  const ctx = useContext(LiveAISContext);
  if (!ctx) throw new Error("useLiveAIS must be used within <LiveAISProvider>");
  return ctx;
}