// ─── 1. Happy Path Tests ────────────────────────────────────────────────────────
// Baseline sanity: valid members can generate, verify, and submit proofs.
// Multiple members work independently. Outputs are deterministic.
// ─────────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import { MerkleTree } from '../src/merkle-tree.js';
import { hashNullifier } from '../src/poseidon.js';
import { verifyProof } from '../src/allowlist-utils.js';
import { makeTree, makeProofInMemory, ContractSimulator } from './helpers.js';

describe('Happy Path', () => {
  let tree: MerkleTree;

  beforeEach(() => {
    tree = makeTree(8, ['alice', 'bob', 'charlie']);
  });

  it('valid member generates a verifiable proof', () => {
    const proof = makeProofInMemory(tree, 'alice', 'ctx1');
    const result = verifyProof(proof);
    expect(result.valid).toBe(true);
    expect(Object.values(result.checks).every(Boolean)).toBe(true);
  });

  it('proof contains correct public inputs', () => {
    const proof = makeProofInMemory(tree, 'bob', 'mint_v1');
    expect(proof.publicInputs.root).toBe(tree.root);
    expect(proof.publicInputs.nullifier).toBe(hashNullifier('bob', 'mint_v1'));
  });

  it('multiple members generate independent valid proofs', () => {
    const secrets = ['alice', 'bob', 'charlie'];
    for (const secret of secrets) {
      const proof = makeProofInMemory(tree, secret, 'ctx');
      const result = verifyProof(proof);
      expect(result.valid).toBe(true);
    }
  });

  it('same member can generate proofs with different contexts', () => {
    const contexts = ['mint_v1', 'mint_v2', 'vote_round_3'];
    const nullifiers = new Set<string>();

    for (const ctx of contexts) {
      const proof = makeProofInMemory(tree, 'alice', ctx);
      const result = verifyProof(proof);
      expect(result.valid).toBe(true);
      nullifiers.add(proof.publicInputs.nullifier);
    }

    // Each context must produce a unique nullifier
    expect(nullifiers.size).toBe(contexts.length);
  });

  it('contract simulator accepts valid proof once', () => {
    const contract = new ContractSimulator(tree.root);
    const proof = makeProofInMemory(tree, 'alice', 'ctx1');

    const result = contract.verifyAndUse(proof);
    expect(result.accepted).toBe(true);
  });

  it('deterministic root: same insertions → same root', () => {
    const tree2 = makeTree(8, ['alice', 'bob', 'charlie']);
    expect(tree.root).toBe(tree2.root);
  });

  it('deterministic nullifier: same secret+context → same nullifier', () => {
    const n1 = hashNullifier('alice', 'ctx1');
    const n2 = hashNullifier('alice', 'ctx1');
    expect(n1).toBe(n2);
  });

  it('deterministic proof: same inputs → same root and nullifier in proof', () => {
    const p1 = makeProofInMemory(tree, 'alice', 'ctx');
    const p2 = makeProofInMemory(tree, 'alice', 'ctx');
    expect(p1.publicInputs.root).toBe(p2.publicInputs.root);
    expect(p1.publicInputs.nullifier).toBe(p2.publicInputs.nullifier);
  });
});
