"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  Copy,
  FileJson,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";

/**
 * CryptographicProofModal — sealed intelligence block viewer.
 *
 * Supports both evidence backends:
 *   • SHA3-512 incident proof chain (`/api/v1/crypto/verify/{id}`) — the default
 *     path from the Evidence Vault page. `proof` is the full receipt from
 *     `/api/v1/crypto/proofs` and `verification` is the LIVE report recomputed
 *     by the backend (payload digest + HMAC + chain linkage).
 *   • Legacy SHA-256 vault seals (`block.vault`) rendered with their own fields.
 */
export default function CryptographicProofModal({ block, proof, verification, onClose }) {
  const [copied, setCopied] = useState(false);

  const isLegacy = Boolean(block?.vault?.block_id);
  const isVerifying = Boolean(block) && !verification && !isLegacy;
  const verified =
    verification?.verified === true || (isLegacy && !verification);

  const digest = isLegacy
    ? block?.vault?.block_id
    : verification?.verified === false
      ? block?.immutable_hash ?? "TAMPERED"
      : proof?.immutable_hash ?? block?.immutable_hash;
  const sealedAt = isLegacy ? block?.vault?.sealed_at_utc : proof?.timestamp_iso ?? block?.timestamp;
  const signer = isLegacy
    ? block?.vault?.signer
    : proof?.signer ?? block?.signer ?? "AEGIS-CRYPTO-VAULT/NTRO-SHA3";
  const hashAlgorithm = isLegacy
    ? block?.vault?.hash_algorithm ?? "SHA-256"
    : proof?.hash_algorithm ?? "SHA3-512";

  // JSON payload for the viewer/copy: full incident receipt + live verification.
  const jsonText = useMemo(() => {
    if (!block) return "";
    if (isLegacy) return JSON.stringify(block, null, 2);
    return JSON.stringify(
      { record: block, receipt: proof ?? null, verification: verification ?? null },
      null,
      2
    );
  }, [block, proof, verification, isLegacy]);

  useEffect(() => {
    setCopied(false);
  }, [block, proof, verification]);

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

  const proofId = block?.proof_id ?? "N/A";
  const chainBlock = block?.chain_block ?? proof?.chain_block ?? "—";

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
                  {isLegacy
                    ? "SHA-256 Immutable Intelligence Block"
                    : "SHA3-512 Tamper-Evident Evidence Chain"}
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

          {/* Live verification status */}
          <div
            className={`px-6 py-4 border-b border-white/10 flex flex-wrap items-center gap-3 ${
              verified ? "bg-emerald-500/5" : "bg-crimson-500/5"
            }`}
          >
            {verified ? (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-mono tracking-wider">
                <CheckCircle2 className="w-4 h-4" /> VERIFIED SECURE — CHAIN INTACT
              </span>
            ) : isVerifying ? (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs font-mono tracking-wider">
                <ShieldCheck className="w-4 h-4" /> VERIFICATION PENDING…
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-crimson-500/15 border border-crimson-500/30 text-crimson-400 text-xs font-mono tracking-wider">
                <ShieldAlert className="w-4 h-4" /> TAMPERED — EVIDENCE INVALID
              </span>
            )}
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-mono">
              <ShieldCheck className="w-4 h-4" /> {signer}
            </span>
            {!isLegacy && verification && (
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-mono tracking-widest ml-auto ${
                  verification.payload_intact ? "text-emerald-400" : "text-crimson-400"
                }`}
              >
                <span className="status-dot inline-block" />
                HASH {verification.payload_intact ? "MATCH" : "MISMATCH"}
              </span>
            )}
            {!isLegacy && verification && (
              <p className="basis-full text-[10px] font-mono text-slate-400">
                {verification.report}
              </p>
            )}
          </div>

          {/* Hash & chain fields */}
          <div className="px-6 py-4 space-y-3 border-b border-white/10">
            <div>
              <p className="text-[10px] font-mono tracking-[0.22em] text-slate-500 uppercase mb-1">
                {isLegacy ? "Block ID Digest" : "Immutable Hash (SHA3-512)"}
              </p>
              <div className="flex items-center gap-2">
                <code
                  className={`text-[11px] font-mono break-all bg-black/40 border rounded-md px-3 py-2 flex-1 ${
                    verified ? "border-emerald-500/15 text-emerald-400" : "border-crimson-500/30 text-crimson-400"
                  }`}
                >
                  {digest}
                </code>
                <button
                  onClick={handleCopy}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-400 text-[11px] font-mono hover:bg-cyan-400/20 transition-colors"
                >
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "COPIED" : "COPY JSON"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-[11px] font-mono">
              {!isLegacy && (
                <>
                  <div>
                    <p className="text-[8px] tracking-[0.16em] text-slate-500 uppercase">Proof ID</p>
                    <p className="text-radar-300 truncate">{proofId}</p>
                  </div>
                  <div>
                    <p className="text-[8px] tracking-[0.16em] text-slate-500 uppercase">Chain Block</p>
                    <p className="text-emerald-400">#{chainBlock}</p>
                  </div>
                  <div>
                    <p className="text-[8px] tracking-[0.16em] text-slate-500 uppercase">Hash Algorithm</p>
                    <p className="text-slate-200">{hashAlgorithm}</p>
                  </div>
                  <div>
                    <p className="text-[8px] tracking-[0.16em] text-slate-500 uppercase">Previous Hash</p>
                    <p className="text-slate-400 break-all">
                      {String(block?.previous_hash ?? proof?.previous_hash ?? "GENESIS").slice(0, 40)}…
                    </p>
                  </div>
                  <div>
                    <p className="text-[8px] tracking-[0.16em] text-slate-500 uppercase">Signature</p>
                    <p className="text-slate-400 break-all">{String(block?.signature ?? proof?.signature ?? "—").slice(0, 40)}…</p>
                  </div>
                  <div>
                    <p className="text-[8px] tracking-[0.16em] text-slate-500 uppercase">Prime Suspect</p>
                    <p className="text-amber-400">{proof?.suspect_mmsi ?? block?.suspect_vessel_mmsi ?? "UNATTRIBUTED"}</p>
                  </div>
                  <div>
                    <p className="text-[8px] tracking-[0.16em] text-slate-500 uppercase">Slick Area</p>
                    <p className="text-slate-200">
                      {block?.slick_area_sq_km != null
                        ? `${block.slick_area_sq_km.toFixed(1)} km²`
                        : "—"}
                    </p>
                  </div>
                </>
              )}
              <div>
                <p className="text-[8px] tracking-[0.16em] text-slate-500 uppercase">UTC Sealed At</p>
                <p className="text-cyan-300 break-all">{sealedAt}</p>
              </div>
              {isLegacy && (
                <div>
                  <p className="text-[8px] tracking-[0.16em] text-slate-500 uppercase">Hash Algorithm</p>
                  <p className="text-slate-200">{hashAlgorithm}</p>
                </div>
              )}
            </div>
          </div>

          {/* JSON viewer */}
          <div className="flex-1 min-h-0">
            <div className="px-6 py-2.5 flex items-center justify-between">
              <p className="text-[10px] font-mono tracking-[0.22em] text-slate-500 uppercase">Signed Payload</p>
              <p className="text-[10px] font-mono text-slate-500">
                {new TextEncoder().encode(jsonText).length.toLocaleString()} BYTES
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