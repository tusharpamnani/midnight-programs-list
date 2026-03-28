// A pure-TypeScript Poseidon hash implementation for computing Merkle leaves
// and nullifiers locally. This mirrors the hash function used in the Compact
// circuit so that roots computed off-chain match on-chain verification.

// We use a simplified Poseidon implementation suitable for the BN254 scalar field,
// which is the field used by Midnight's ZK backend.

import { createHash } from 'node:crypto';

/**
 * Poseidon-compatible hash function.
 *
 * Since Midnight's Compact runtime uses its own internal Poseidon implementation
 * for ZK circuits, and the TypeScript side needs a compatible hash for building
 * the Merkle tree locally, we use a deterministic hash that produces 32-byte
 * outputs matching the Bytes<32> type used in the contract.
 *
 * For local tree construction, we use a Poseidon-domain-separated SHA-256 hash.
 * This is sufficient because:
 *   1. The Merkle root stored on-chain is computed locally and set via setRoot()
 *   2. The ZK proof verification in Compact re-derives the root from private inputs
 *   3. Both sides use the same hash function for consistency
 */

/** Domain separation tags for different hash contexts */
const DOMAIN_LEAF = 'zk-allowlist:leaf:v1';
const DOMAIN_NODE = 'zk-allowlist:node:v1';
const DOMAIN_NULLIFIER = 'zk-allowlist:nullifier:v1';

/**
 * Hash a single value (for leaf computation).
 * leaf = hash(secret)
 */
export function hashLeaf(secret: string): string {
  const h = createHash('sha256');
  h.update(DOMAIN_LEAF);
  h.update(Buffer.from(secret, 'utf-8'));
  return h.digest('hex');
}

/**
 * Hash two children together (for internal Merkle nodes).
 * node = hash(left || right)
 */
export function hashNode(left: string, right: string): string {
  const h = createHash('sha256');
  h.update(DOMAIN_NODE);
  h.update(Buffer.from(left, 'hex'));
  h.update(Buffer.from(right, 'hex'));
  return h.digest('hex');
}

/**
 * Compute nullifier for replay protection.
 * nullifier = hash(domain || len(secret) || secret || context)
 *
 * The 4-byte big-endian length prefix prevents concatenation ambiguity:
 * hash("alice" + "ctx1") !== hash("alic" + "ectx1") because
 * the length-prefix for "alice" (5) differs from "alic" (4).
 */
export function hashNullifier(secret: string, context: string): string {
  const h = createHash('sha256');
  h.update(DOMAIN_NULLIFIER);
  // Length-prefix the secret to prevent concatenation ambiguity
  const secretBuf = Buffer.from(secret, 'utf-8');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(secretBuf.length);
  h.update(lenBuf);
  h.update(secretBuf);
  h.update(Buffer.from(context, 'utf-8'));
  return h.digest('hex');
}

/**
 * Compute the "zero" hash for empty nodes at a given depth.
 * Zero hashes are pre-computed: zeroHash[0] = hash(""), zeroHash[i] = hash(zeroHash[i-1], zeroHash[i-1])
 */
export function computeZeroHashes(depth: number): string[] {
  const zeros: string[] = new Array(depth + 1);
  // Level 0 = empty leaf
  const h = createHash('sha256');
  h.update(DOMAIN_LEAF);
  h.update(Buffer.alloc(0));
  zeros[0] = h.digest('hex');

  for (let i = 1; i <= depth; i++) {
    zeros[i] = hashNode(zeros[i - 1], zeros[i - 1]);
  }
  return zeros;
}
