// ─── 3. Proof Forgery Attempts ──────────────────────────────────────────────────
// Every invalid manipulation MUST return valid === false.
// This suite tries to forge, tamper, and replay proofs.
// ─────────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll } from 'vitest';
import { MerkleTree } from '../src/merkle-tree.js';
import { hashLeaf, hashNullifier } from '../src/poseidon.js';
import { verifyProof } from '../src/allowlist-utils.js';
import type { ProofOutput } from '../src/types.js';
import {
  makeTree,
  makeProofInMemory,
  cloneProof,
  decodeWitness,
  encodeWitness,
  tamperSibling,
  tamperPathIndex,
} from './helpers.js';

describe('Proof Forgery Attempts', () => {
  let tree: MerkleTree;
  let validProof: ProofOutput;

  beforeAll(() => {
    tree = makeTree(8, ['alice', 'bob', 'charlie']);
    validProof = makeProofInMemory(tree, 'alice', 'ctx1');
  });

  // ── Baseline ───

  it('valid proof passes (control)', () => {
    expect(verifyProof(validProof).valid).toBe(true);
  });

  // ── Random garbage ───

  it('random bytes as proof → fails', () => {
    const garbage: ProofOutput = {
      proof: 'deadbeef'.repeat(64),
      publicInputs: { root: 'a'.repeat(64), nullifier: 'b'.repeat(64) },
      meta: { context: 'x', treeDepth: 8, generatedAt: '', verified: false },
    };
    const result = verifyProof(garbage);
    expect(result.valid).toBe(false);
  });

  it('empty proof string → fails', () => {
    const empty: ProofOutput = {
      ...validProof,
      proof: '',
    };
    const result = verifyProof(empty);
    expect(result.valid).toBe(false);
  });

  // ── Tampered public inputs ───

  it('valid proof + wrong root → rootMatches fails', () => {
    const tampered = cloneProof(validProof);
    tampered.publicInputs.root = 'ff'.repeat(32);
    const result = verifyProof(tampered);
    expect(result.valid).toBe(false);
    expect(result.checks.rootMatches).toBe(false);
  });

  it('valid proof + wrong nullifier → nullifierValid fails', () => {
    const tampered = cloneProof(validProof);
    tampered.publicInputs.nullifier = 'ff'.repeat(32);
    const result = verifyProof(tampered);
    expect(result.valid).toBe(false);
    expect(result.checks.nullifierValid).toBe(false);
  });

  it('valid proof + swapped root and nullifier → both fail', () => {
    const tampered = cloneProof(validProof);
    const tmp = tampered.publicInputs.root;
    tampered.publicInputs.root = tampered.publicInputs.nullifier;
    tampered.publicInputs.nullifier = tmp;
    const result = verifyProof(tampered);
    expect(result.valid).toBe(false);
  });

  // ── Tampered witness (private inputs) ───

  it('witness with wrong secret → leafValid fails', () => {
    const tampered = cloneProof(validProof);
    const w = decodeWitness(tampered);
    w.witness.secret = 'eve'; // not alice
    tampered.proof = encodeWitness(w);
    const result = verifyProof(tampered);
    expect(result.valid).toBe(false);
    expect(result.checks.leafValid).toBe(false);
  });

  it('witness with tampered sibling[0] → rootMatches fails', () => {
    const tampered = tamperSibling(validProof, 0);
    const result = verifyProof(tampered);
    expect(result.valid).toBe(false);
    expect(result.checks.rootMatches).toBe(false);
  });

  it('witness with tampered sibling[3] → rootMatches fails', () => {
    const tampered = tamperSibling(validProof, 3);
    const result = verifyProof(tampered);
    expect(result.valid).toBe(false);
    expect(result.checks.rootMatches).toBe(false);
  });

  it('witness with flipped pathIndex[0] → rootMatches fails', () => {
    const tampered = tamperPathIndex(validProof, 0);
    const result = verifyProof(tampered);
    expect(result.valid).toBe(false);
    expect(result.checks.rootMatches).toBe(false);
  });

  it('witness with all path indices flipped → fails', () => {
    const tampered = cloneProof(validProof);
    const w = decodeWitness(tampered);
    w.witness.pathIndices = w.witness.pathIndices.map((i: number) => (i === 0 ? 1 : 0));
    tampered.proof = encodeWitness(w);
    const result = verifyProof(tampered);
    expect(result.valid).toBe(false);
  });

  it('witness with wrong leaf hash (doesn\'t match secret) → leafValid fails', () => {
    const tampered = cloneProof(validProof);
    const w = decodeWitness(tampered);
    w.witness.leaf = hashLeaf('not_alice');
    tampered.proof = encodeWitness(w);
    const result = verifyProof(tampered);
    expect(result.valid).toBe(false);
    expect(result.checks.leafValid).toBe(false);
  });

  // ── Cross-tree forgery ───

  it('proof from different tree → rootMatches fails', () => {
    const otherTree = makeTree(8, ['dave', 'eve']);
    const otherProof = makeProofInMemory(otherTree, 'dave', 'ctx1');

    // Try to use otherProof against our tree's root
    const hijacked = cloneProof(otherProof);
    hijacked.publicInputs.root = tree.root; // pretend it's for this tree
    const result = verifyProof(hijacked);
    expect(result.valid).toBe(false);
    expect(result.checks.rootMatches).toBe(false);
  });

  // ── Replay with modified context ───

  it('valid proof + changed context → nullifierValid fails', () => {
    const tampered = cloneProof(validProof);
    tampered.meta.context = 'different_context';
    const result = verifyProof(tampered);
    expect(result.valid).toBe(false);
    expect(result.checks.nullifierValid).toBe(false);
  });

  // ── Malformed proof structures ───

  it('proof with missing witness fields → fails', () => {
    const malformed = cloneProof(validProof);
    malformed.proof = Buffer.from(JSON.stringify({ witness: {} })).toString('hex');
    const result = verifyProof(malformed);
    expect(result.valid).toBe(false);
  });

  it('proof with non-hex string → fails', () => {
    const malformed = cloneProof(validProof);
    malformed.proof = 'this is not hex!!!!';
    const result = verifyProof(malformed);
    expect(result.valid).toBe(false);
  });

  // ── All sibling positions ───

  it('tampering ANY single sibling breaks the proof', () => {
    const w = decodeWitness(validProof);
    const numSiblings = w.witness.siblings.length;

    for (let i = 0; i < numSiblings; i++) {
      const tampered = tamperSibling(validProof, i);
      const result = verifyProof(tampered);
      expect(result.valid).toBe(false);
    }
  });
});
