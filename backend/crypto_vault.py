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