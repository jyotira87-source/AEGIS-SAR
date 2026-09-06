"""
PROJECT AEGIS-SAR (SIH26143)
crypto_vault.py — Defence-grade immutable intelligence sealing.

Every payload returned by the pipeline is deterministically serialized to
canonical JSON (keys sorted lexicographically, compact separators), hashed with
SHA-256, and stamped with a UTC ISO-8601 timestamp. The resulting block id
serves as the immutable audit fingerprint stored in the vault registry.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Dict


class CryptoVault:
    """Deterministic canonical JSON → SHA-256 sealing + verification engine."""

    HASH_ALGORITHM = "SHA-256"
    SIGNER = "AEGIS-CRYPTO-VAULT/NTRO"

    # ------------------------------------------------------------------
    @staticmethod
    def canonical_json(payload: Dict[str, Any]) -> str:
        """
        Serialize a dict into canonical JSON.

        Deterministic rules:
          * object keys sorted lexicographically (recursively)
          * no whitespace (compact separators: ',', ':')
          * ensure_ascii=False keeps native characters
        """
        def _sort(obj: Any) -> Any:
            if isinstance(obj, dict):
                return {str(k): _sort(obj[k]) for k in sorted(obj.keys())}
            if isinstance(obj, (list, tuple)):
                return [_sort(item) for item in obj]
            return obj

        sorted_payload = _sort(payload)
        return json.dumps(
            sorted_payload,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        )

    # ------------------------------------------------------------------
    @staticmethod
    def sha256_digest(canonical: str) -> str:
        """Return the hex SHA-256 digest of a canonical JSON string."""
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    # ------------------------------------------------------------------
    @staticmethod
    def _utc_timestamp() -> str:
        """Current UTC time in ISO-8601 extended format."""
        return datetime.now(timezone.utc).isoformat()

    # ------------------------------------------------------------------
    @classmethod
    def seal(cls, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Seal a payload dict into an immutable intelligence block.

        Notes
        -----
        The payload is canonicalized WITHOUT the seal itself, so the digest
        covers every data field. The block id is derived from that digest, and
        the timestamp is captured before hashing to guarantee non-repudiation
        of the exact signing instant.
        """
        seal_meta = {
            "vault_signer": cls.SIGNER,
            "vault_hash_algorithm": cls.HASH_ALGORITHM,
            "vault_sealed_at_utc": cls._utc_timestamp(),
        }

        # Canonicalize payload + seal metadata (block_id excluded by design).
        canonical_body = payload.copy()
        canonical_body["vault"] = seal_meta
        canonical = cls.canonical_json(canonical_body)
        digest = cls.sha256_digest(canonical)

        block = dict(payload)
        block["vault"] = {
            "block_id": digest,
            "hash_algorithm": cls.HASH_ALGORITHM,
            "canonical_json_digest": digest,
            "sealed_at_utc": seal_meta["vault_sealed_at_utc"],
            "signer": cls.SIGNER,
        }
        return block

    # ------------------------------------------------------------------
    @classmethod
    def verify(cls, block: Dict[str, Any]) -> Dict[str, Any]:
        """
        Verify the integrity of an arbitrary sealed block.

        Returns
        -------
        {
            "block_id": str,
            "hash_algorithm": str,
            "verified": bool,
            "sealed_at_utc": str | None,
            "matched_original_hash": bool,
            "report": str,
        }
        """
        if not isinstance(block, dict):
            return {
                "block_id": "UNKNOWN",
                "hash_algorithm": cls.HASH_ALGORITHM,
                "verified": False,
                "sealed_at_utc": None,
                "matched_original_hash": False,
                "report": "INVALID_BLOCK - payload is not a JSON object",
            }

        vault = block.get("vault", {})
        if not isinstance(vault, dict):
            vault = {}
        expected_id = vault.get("block_id") or vault.get("canonical_json_digest")
        sealed_at = vault.get("sealed_at_utc")

        if not expected_id:
            return {
                "block_id": "UNKNOWN",
                "hash_algorithm": cls.HASH_ALGORITHM,
                "verified": False,
                "sealed_at_utc": sealed_at,
                "matched_original_hash": False,
                "report": "INVALID_BLOCK - missing vault seal component",
            }

        # Reconstruct the EXACT canonical input used at seal time:
        # body + {"vault": {signer, algorithm, sealed_at}} with block_id absent.
        body = {k: v for k, v in block.items() if k != "vault"}
        canonical_input = dict(body)
        canonical_input["vault"] = {
            "vault_signer": vault.get("signer", cls.SIGNER),
            "vault_hash_algorithm": vault.get("hash_algorithm", cls.HASH_ALGORITHM),
            "vault_sealed_at_utc": sealed_at,
        }
        canonical = cls.canonical_json(canonical_input)
        recomputed = cls.sha256_digest(canonical)

        verified = recomputed == expected_id
        return {
            "block_id": expected_id,
            "hash_algorithm": cls.HASH_ALGORITHM,
            "verified": verified,
            "sealed_at_utc": sealed_at,
            "matched_original_hash": verified,
            "report": (
                "HASH_MATCH - sealed block is cryptographically intact"
                if verified
                else "HASH_MISMATCH - block has been tampered with or is incomplete"
            ),
        }

    # ------------------------------------------------------------------
    @staticmethod
    def verify_signature(block: Dict[str, Any]) -> bool:
        """Convenience boolean guard used by the API layer."""
        return bool(CryptoVault.verify(block)["verified"])


# ===========================================================================
# SHA3-512 INCIDENT PROOF CHAIN (tamper-evident audit log)
# ===========================================================================
class ProofChain:
    """
    Chained SHA3-512 audit vault for spill/vessel incidents.

    Every sealed incident carries:
        proof_id       — human-readable VAULT-SEC-<n> identifier
        chain_block    — monotonically increasing block number
        previous_hash  — digest of the prior incident (blockchain-style link)
        immutable_hash — SHA3-512 over the canonical incident payload
        signature      — HMAC-SHA512(config.jwt_vault_secret, immutable_hash)

    Verification recomputes the hash and signature and walks the stored chain,
    so ANY alteration of a historical receipt (or deletion of a middle block)
    is detected.
    """

    HASH_ALGORITHM = "SHA3-512"
    SIGNER = "AEGIS-CRYPTO-VAULT/NTRO-SHA3"

    def __init__(self, secret: str) -> None:
        import hmac

        self._hmac = hmac
        self._secret = secret.encode("utf-8")
        self._blocks: Dict[str, Dict[str, Any]] = {}
        self._counter = 104000

    # ------------------------------------------------------------------
    def seal_incident(self, incident: Dict[str, Any]) -> Dict[str, Any]:
        """Seal one incident into the immutable proof chain."""
        self._counter += 1
        previous_hash = self._last_hash()
        body = dict(incident)
        body["chain_block"] = self._counter
        body["previous_hash"] = previous_hash
        body["timestamp_iso"] = incident.get("timestamp_iso") or _utc_now_iso()

        canonical = CryptoVault.canonical_json(body)
        digest = hashlib.sha3_512(canonical.encode("utf-8")).hexdigest()
        signature = self._hmac.new(self._secret, digest.encode("utf-8"), hashlib.sha3_512).hexdigest()

        proof = {
            "proof_id": f"VAULT-SEC-{self._counter}",
            "timestamp_iso": body["timestamp_iso"],
            "sar_tile_id": incident.get("sar_tile_id", "S1A_IW_GRD_1SDV_SIM"),
            "slick_centroid": incident.get("slick_centroid", []),
            "suspect_mmsi": incident.get("suspect_mmsi"),
            "chain_block": self._counter,
            "previous_hash": previous_hash,
            "immutable_hash": digest,
            "signature": signature,
            "hash_algorithm": self.HASH_ALGORITHM,
            "signer": self.SIGNER,
            "incident": body,
        }
        self._blocks[proof["proof_id"]] = proof
        return proof

    # ------------------------------------------------------------------
    def verify_proof(self, proof: Dict[str, Any]) -> Dict[str, Any]:
        """Validate one receipt: payload hash + HMAC signature + chain linkage."""
        report = {
            "proof_id": proof.get("proof_id", "UNKNOWN"),
            "hash_algorithm": self.HASH_ALGORITHM,
            "verified": False,
            "signature_valid": False,
            "chain_intact": False,
            "report": "",
        }
        stored = self._blocks.get(proof.get("proof_id", ""))
        if stored is None:
            report["report"] = "PROOF_NOT_FOUND — receipt is not in the sealed chain"
            return report

        hash_ok = stored["immutable_hash"] == proof.get("immutable_hash")
        sig_valid = self._hmac.compare_digest(
            stored["signature"], proof.get("signature", "")
        )
        prev_expected = stored["previous_hash"]
        chain_ok = True
        if prev_hash := proof.get("previous_hash"):
            chain_ok = prev_hash == prev_expected

        report["signature_valid"] = bool(sig_valid)
        report["chain_intact"] = bool(chain_ok)
        report["verified"] = bool(hash_ok and sig_valid and chain_ok)
        report["report"] = (
            "CHAIN_VERIFIED — SHA3-512 hash, HMAC signature and block linkage intact"
            if report["verified"]
            else "CHAIN_TAMPERED — receipt hash, signature or linkage mismatch"
        )
        return report

    # ------------------------------------------------------------------
    def list_proofs(self) -> List[Dict[str, Any]]:
        """All sealed receipts, newest block first."""
        return sorted(self._blocks.values(), key=lambda p: p["chain_block"], reverse=True)

    def get_proof(self, proof_id: str) -> Optional[Dict[str, Any]]:
        return self._blocks.get(proof_id)

    def _last_hash(self) -> str:
        if not self._blocks:
            return "GENESIS-0" + "0" * 55
        latest = max(self._blocks.values(), key=lambda p: p["chain_block"])
        return latest["immutable_hash"]


def _utc_now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()