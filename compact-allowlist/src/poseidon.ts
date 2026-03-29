// PersistentHash implementation for the ZK allowlist. This uses the same
// cryptographic primitive as the Compact circuit (Poseidon) so that local roots
// match on-chain verification.

import * as runtime from '@midnight-ntwrk/compact-runtime';
import { createHash } from 'node:crypto';

// Types for persistentHash
const bytes32Type = new runtime.CompactTypeBytes(32);
const vector2Type = new runtime.CompactTypeVector(2, bytes32Type);
const vector3Type = new runtime.CompactTypeVector(3, bytes32Type);

/** Domain separation tags for different hash contexts */
const DOMAIN_LEAF = 'zk-allowlist:leaf:v1';
const DOMAIN_NODE = 'zk-allowlist:node:v1';
const DOMAIN_NULLIFIER = 'zk-allowlist:nullifier:v1';
const DOMAIN_ADMIN = 'zk-allowlist:admin:v1';

/**
 * Padding string to 32 bytes for Compact compatibility.
 */
function pad32(str: string): Uint8Array {
  const buf = new Uint8Array(32);
  const strBuf = Buffer.from(str, 'utf-8');
  buf.set(strBuf.slice(0, 32));
  return buf;
}

/**
 * Normalizes any string into a 32-byte secret.
 * If already hex(64), use as-is. Otherwise, SHA-256 it.
 */
export function normalizeSecret(secret: string): string {
  if (/^[0-9a-f]{64}$/i.test(secret)) {
    return secret.toLowerCase();
  }
  return createHash('sha256').update(secret).digest('hex');
}

/**
 * Hash a single value (for leaf computation).
 * leaf = persistentHash(tag || secret)
 */
export function hashLeaf(secretHex: string): string {
  const s = normalizeSecret(secretHex);
  const secretBytes = Uint8Array.from(Buffer.from(s, 'hex'));
  const tag = pad32(DOMAIN_LEAF);
  
  const res = runtime.persistentHash(vector2Type, [tag, secretBytes]);
  return Buffer.from(res).toString('hex');
}

/**
 * Hash two children together (for internal Merkle nodes).
 * node = persistentHash(tag || left || right)
 */
export function hashNode(leftHex: string, rightHex: string): string {
  const left = Uint8Array.from(Buffer.from(leftHex, 'hex'));
  const right = Uint8Array.from(Buffer.from(rightHex, 'hex'));
  const tag = pad32(DOMAIN_NODE);
  
  const res = runtime.persistentHash(vector3Type, [tag, left, right]);
  return Buffer.from(res).toString('hex');
}

/**
 * Compute nullifier for replay protection.
 * nullifier = persistentHash(tag || secret || context)
 */
export function hashNullifier(secretHex: string, context: string): string {
  const s = normalizeSecret(secretHex);
  const secretBytes = Uint8Array.from(Buffer.from(s, 'hex'));
  const contextBytes = pad32(context);
  const tag = pad32(DOMAIN_NULLIFIER);
  
  const res = runtime.persistentHash(vector3Type, [tag, secretBytes, contextBytes]);
  return Buffer.from(res).toString('hex');
}

/**
 * Compute the commitment for the contract administrator.
 */
export function hashAdminCommitment(secretHex: string): string {
  const s = normalizeSecret(secretHex);
  const secretBytes = Uint8Array.from(Buffer.from(s, 'hex'));
  const tag = pad32(DOMAIN_ADMIN);
  
  const res = runtime.persistentHash(vector2Type, [tag, secretBytes]);
  return Buffer.from(res).toString('hex');
}

/**
 * Compute the "zero" hash for empty nodes at a given depth.
 */
export function computeZeroHashes(depth: number): string[] {
  const zeros: string[] = new Array(depth + 1);
  // Level 0: pad to 32 bytes empty string then persistentHash with tag
  const emptyBytes = new Uint8Array(32);
  const tagBytes = pad32(DOMAIN_LEAF);
  const res = runtime.persistentHash(vector2Type, [tagBytes, emptyBytes]);
  zeros[0] = Buffer.from(res).toString('hex');

  for (let i = 1; i <= depth; i++) {
    zeros[i] = hashNode(zeros[i - 1], zeros[i - 1]);
  }
  return zeros;
}
