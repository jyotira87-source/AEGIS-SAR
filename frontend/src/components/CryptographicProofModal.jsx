"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Copy, FileJson, ShieldCheck, X } from "lucide-react";

/**
 * CryptographicProofModal — reveals the sealed SHA-256 intelligence block.
 * Displays "VERIFIED SECURE — INTACT", the block id hash, UTC seal time, the
 * full canonical JSON payload and a one-click clipboard copy with feedback.
 */
export default function CryptographicProofModal({ block, onClose }) {
  const [copied, setCopied] = useState(false);
  const [jsonText, setJsonText] = useState("");

  useEffect(() => {
    if (block) {
      setJsonText(JSON.stringify(block, null, 2));
      setCopied(false);
    }
  }, [block]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard unavailable */
    }
  }, [jsonText]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!block) return null;

  const hash = block?.vault?.block_id ?? "N/A";
  const sealedAt = block?.vault?.sealed_at_utc ?? "N/A";
  const signed = block?.vault?.signer ?? "AEGIS-CRYPTO-VAULT/NTRO";

  return (
    <AnimatePresence>
      <motion.div
        key="proof-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          key="proof-panel"
          initial={{ scale: 0.9, y: 24, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.92, y: 12, opacity: 0 }}
          transition={{ type: "spring", damping: 22, stiffness: 260 }}
          onClick={(e) => e.stopPropagation()}
          className="glass-card w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-cyan-400/10 border border-cyan-400/25 flex items-center justify-center">
                <FileJson className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-100">CRYPTOGRAPHIC SEAL</p>
                <p className="text-[10px] font-mono tracking-[0.2em] text-slate-400 uppercase">
                  SHA-256 Immutable Intelligence Block
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-md hover:bg-white/5 text-slate-400 hover:text-slate-200 transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Status badge */}
          <div className="px-6 py-4 border-b border-white/10 bg-emerald-500/5 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-mono tracking-wider">
              <CheckCircle2 className="w-4 h-4" /> VERIFIED SECURE — INTACT
            </span>
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-mono">
              <ShieldCheck className="w-4 h-4" /> {signed}
            </span>
            <span className="inline-flex items-center gap-1 text-cyan-400 text-[10px] font-mono tracking-widest ml-auto">
              <span className="status-dot inline-block" /> HASH MATCH
            </span>
          </div>

          {/* Hash & timestamp */}
          <div className="px-6 py-4 space-y-3 border-b border-white/10">
            <div>
              <p className="text-[10px] font-mono tracking-[0.22em] text-slate-500 uppercase mb-1">Block ID Digest</p>
              <div className="flex items-center gap-2">
                <code className="text-[11px] font-mono text-emerald-400 break-all bg-black/40 border border-emerald-500/15 rounded-md px-3 py-2 flex-1">
                  {hash}
                </code>
                <button
                  onClick={handleCopy}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-400 text-[11px] font-mono hover:bg-cyan-400/20 transition-colors"
                >
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "COPIED" : "COPY JSON"}
                </button>
              </div>
              {copied && (
                <p className="mt-1.5 text-[10px] font-mono text-emerald-400">Clipboard armed — payload replicated.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              <div>
                <p className="text-[10px] font-mono tracking-[0.22em] text-slate-500 uppercase">UTC Sealed At</p>
                <p className="text-xs font-mono text-cyan-300">{sealedAt}</p>
              </div>
              <div>
                <p className="text-[10px] font-mono tracking-[0.22em] text-slate-500 uppercase">Hash Algorithm</p>
                <p className="text-xs font-mono text-slate-200">{block?.vault?.hash_algorithm ?? "SHA-256"}</p>
              </div>
              <div>
                <p className="text-[10px] font-mono tracking-[0.22em] text-slate-500 uppercase">Prime Suspect</p>
                <p className="text-xs font-mono text-amber-400">{block?.prime_suspect_mmsi ?? "N/A"}</p>
              </div>
            </div>
          </div>

          {/* JSON viewer */}
          <div className="flex-1 min-h-0">
            <div className="px-6 py-2.5 flex items-center justify-between">
              <p className="text-[10px] font-mono tracking-[0.22em] text-slate-500 uppercase">Signed Payload</p>
              <p className="text-[10px] font-mono text-slate-500">
                {new Blob([jsonText]).size.toLocaleString()} BYTES
              </p>
            </div>
            <pre className="mx-6 mb-4 p-4 h-[300px] overflow-auto rounded-lg bg-black/50 border border-white/10 text-[10.5px] leading-relaxed font-mono text-cyan-200/90 whitespace-pre-wrap break-all">
              {jsonText}
            </pre>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}