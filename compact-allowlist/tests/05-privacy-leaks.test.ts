// ─── 5. Privacy Leak Checks ──────────────────────────────────────────────────────
// Ensure that CLI output, proof public data, and error messages
// NEVER expose: secret, leaf hash, Merkle path, or leaf index.
// ─────────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll } from 'vitest';
import { MerkleTree } from '../src/merkle-tree.js';
import { hashLeaf, hashNullifier } from '../src/poseidon.js';
import { verifyProof } from '../src/allowlist-utils.js';
import type { ProofOutput } from '../src/types.js';
import { makeTree, makeProofInMemory, decodeWitness } from './helpers.js';

describe('Privacy Leak Checks', () => {
  let tree: MerkleTree;
  let proof: ProofOutput;
  const secret = 'supersecretidentity';
  const context = 'mint_v1';

  beforeAll(() => {
    tree = makeTree(8, [secret, 'alice', 'bob']);
    proof = makeProofInMemory(tree, secret, context);
  });

  // ── Public inputs must NOT contain private data ───

  it('publicInputs.root does not contain the secret', () => {
    expect(proof.publicInputs.root).not.toContain(secret);
  });

  it('publicInputs.nullifier does not contain the secret', () => {
    expect(proof.publicInputs.nullifier).not.toContain(secret);
  });

  it('publicInputs does not contain the leaf hash', () => {
    const leaf = hashLeaf(secret);
    expect(proof.publicInputs.root).not.toBe(leaf);
    expect(proof.publicInputs.nullifier).not.toBe(leaf);
  });

  // ── Meta fields must NOT contain private data ───

  it('meta.context is the provided context, not the secret', () => {
    expect(proof.meta.context).toBe(context);
    expect(proof.meta.context).not.toBe(secret);
  });

  it('meta fields do not leak secret', () => {
    const metaStr = JSON.stringify(proof.meta);
    expect(metaStr).not.toContain(secret);
  });

  // ── Proof blob contains witness (expected in dev, NOT in production) ───
  // In production, the proof would be an opaque ZK-SNARK blob.
  // For dev mode, we verify the witness IS inside the proof hex,
  // but it would NOT be if using a real proof server.

  it('[dev-mode check] proof blob contains witness with secret (expected)', () => {
    const witness = decodeWitness(proof);
    expect(witness.witness.secret).toBe(secret);
    // NOTE: In production, this test should FAIL — the proof blob
    // would be an opaque ZK-SNARK, not a JSON witness.
  });

  // ── Verify output structure ───

  it('verifyProof result does not expose secret in output', () => {
    const result = verifyProof(proof);
    const resultStr = JSON.stringify(result);
    expect(resultStr).not.toContain(secret);
  });

  it('verifyProof result only contains check flags and valid boolean', () => {
    const result = verifyProof(proof);
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('checks');
    expect(typeof result.valid).toBe('boolean');
    expect(typeof result.checks).toBe('object');

    // Should not have extra fields leaking private data
    const keys = Object.keys(result);
    expect(keys.sort()).toEqual(['checks', 'valid']);
  });

  // ── Root does not reveal member count or tree structure ───

  it('root is always 64 hex characters regardless of member count', () => {
    for (const count of [1, 2, 5, 50]) {
      const t = makeTree(8, Array.from({ length: count }, (_, i) => `m_${i}`));
      expect(t.root.length).toBe(64);
      expect(/^[0-9a-f]+$/.test(t.root)).toBe(true);
    }
  });

  it('nullifier is always 64 hex characters', () => {
    const n = hashNullifier(secret, context);
    expect(n.length).toBe(64);
    expect(/^[0-9a-f]+$/.test(n)).toBe(true);
  });

  // ── Proof output does NOT contain leaf index ───

  it('proof publicInputs do not contain leaf index', () => {
    const publicStr = JSON.stringify(proof.publicInputs);
    // The leaf index is 0. Checking the string doesn't encode it
    // (this is a structural check — the proof.publicInputs object
    // should only have root and nullifier)
    const publicKeys = Object.keys(proof.publicInputs);
    expect(publicKeys.sort()).toEqual(['nullifier', 'root']);
  });

  it('proof meta does not contain leaf index', () => {
    const metaKeys = Object.keys(proof.meta);
    expect(metaKeys).not.toContain('leafIndex');
    expect(metaKeys).not.toContain('leaf');
    expect(metaKeys).not.toContain('siblings');
    expect(metaKeys).not.toContain('pathIndices');
  });

  // ── Different members produce indistinguishable output shapes ───

  it('proof shapes are identical for different members (no structural leakage)', () => {
    const proofAlice = makeProofInMemory(tree, secret, 'a');
    const proofBob = makeProofInMemory(tree, 'alice', 'b');

    // Same keys in publicInputs
    expect(Object.keys(proofAlice.publicInputs).sort()).toEqual(
      Object.keys(proofBob.publicInputs).sort()
    );

    // Same keys in meta
    expect(Object.keys(proofAlice.meta).sort()).toEqual(
      Object.keys(proofBob.meta).sort()
    );

    // Same field types
    expect(typeof proofAlice.publicInputs.root).toBe(typeof proofBob.publicInputs.root);
    expect(typeof proofAlice.proof).toBe(typeof proofBob.proof);
  });
});
