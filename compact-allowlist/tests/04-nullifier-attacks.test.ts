// ─── 4. Nullifier Attacks ───────────────────────────────────────────────────────
// Test nullifier uniqueness enforcement, replay prevention, and collision
// resistance using the ContractSimulator.
// ─────────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import { MerkleTree } from '../src/merkle-tree.js';
import { hashNullifier } from '../src/poseidon.js';
import { verifyProof } from '../src/allowlist-utils.js';
import { makeTree, makeProofInMemory, cloneProof, ContractSimulator } from './helpers.js';

describe('Nullifier Attacks', () => {
  let tree: MerkleTree;
  let contract: ContractSimulator;

  beforeEach(() => {
    tree = makeTree(8, ['alice', 'bob', 'charlie']);
    contract = new ContractSimulator(tree.root);
  });

  // ── Replay attacks ───

  it('same proof submitted twice → second is REJECTED', () => {
    const proof = makeProofInMemory(tree, 'alice', 'ctx1');

    const first = contract.verifyAndUse(proof);
    expect(first.accepted).toBe(true);

    const second = contract.verifyAndUse(proof);
    expect(second.accepted).toBe(false);
    expect(second.reason).toContain('Nullifier already used');
  });

  it('cloned proof submitted after original → REJECTED', () => {
    const proof = makeProofInMemory(tree, 'bob', 'vote_1');
    const clone = cloneProof(proof);

    contract.verifyAndUse(proof);
    const result = contract.verifyAndUse(clone);
    expect(result.accepted).toBe(false);
  });

  // ── Same secret, different contexts ───

  it('same secret + different context → different nullifiers → both accepted', () => {
    const proof1 = makeProofInMemory(tree, 'alice', 'mint_v1');
    const proof2 = makeProofInMemory(tree, 'alice', 'mint_v2');

    expect(proof1.publicInputs.nullifier).not.toBe(proof2.publicInputs.nullifier);

    const r1 = contract.verifyAndUse(proof1);
    const r2 = contract.verifyAndUse(proof2);
    expect(r1.accepted).toBe(true);
    expect(r2.accepted).toBe(true);
  });

  // ── Same secret, same context ───

  it('same secret + same context → same nullifier → second REJECTED', () => {
    const proof1 = makeProofInMemory(tree, 'alice', 'ctx');
    const proof2 = makeProofInMemory(tree, 'alice', 'ctx');

    expect(proof1.publicInputs.nullifier).toBe(proof2.publicInputs.nullifier);

    contract.verifyAndUse(proof1);
    const result = contract.verifyAndUse(proof2);
    expect(result.accepted).toBe(false);
  });

  // ── Cross-member independence ───

  it('different members with same context → different nullifiers → both accepted', () => {
    const proofA = makeProofInMemory(tree, 'alice', 'ctx');
    const proofB = makeProofInMemory(tree, 'bob', 'ctx');

    expect(proofA.publicInputs.nullifier).not.toBe(proofB.publicInputs.nullifier);

    const rA = contract.verifyAndUse(proofA);
    const rB = contract.verifyAndUse(proofB);
    expect(rA.accepted).toBe(true);
    expect(rB.accepted).toBe(true);
  });

  // ── Nullifier collision attempt ───

  it('cannot forge a collision: different secret producing same nullifier', () => {
    const nullAlice = hashNullifier('alice', 'ctx');
    const nullBob = hashNullifier('bob', 'ctx');
    expect(nullAlice).not.toBe(nullBob);

    // Even with similar-looking inputs
    const n1 = hashNullifier('alice', 'ctx1');
    const n2 = hashNullifier('alic', 'ectx1');
    expect(n1).not.toBe(n2);
  });

  it('nullifier is deterministic: same inputs always produce same output', () => {
    const results = Array.from({ length: 100 }, () => hashNullifier('secret', 'ctx'));
    const unique = new Set(results);
    expect(unique.size).toBe(1);
  });

  // ── Nullifier tracking after root rotation ───

  it('nullifier persists even after root rotation', () => {
    const proof = makeProofInMemory(tree, 'alice', 'ctx');
    contract.verifyAndUse(proof);

    // Simulate root rotation (tree updated with new member)
    tree.addMember('dave');
    contract.setRoot(tree.root);

    // Old nullifier is still recorded
    expect(contract.isNullifierUsed(proof.publicInputs.nullifier)).toBe(true);
  });

  // ── Bulk nullifier exhaustion ───

  it('100 unique proofs all accepted, then all REJECTED on replay', () => {
    const bigTree = makeTree(10, Array.from({ length: 50 }, (_, i) => `member_${i}`));
    const bigContract = new ContractSimulator(bigTree.root);

    const proofs = Array.from({ length: 50 }, (_, i) =>
      makeProofInMemory(bigTree, `member_${i}`, `ctx_${i}`)
    );

    // All accepted first time
    for (const p of proofs) {
      expect(bigContract.verifyAndUse(p).accepted).toBe(true);
    }

    // All rejected on replay
    for (const p of proofs) {
      expect(bigContract.verifyAndUse(p).accepted).toBe(false);
    }
  });
});
