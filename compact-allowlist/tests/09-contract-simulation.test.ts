// ─── 9. Contract Simulation ─────────────────────────────────────────────────────
import { describe, it, expect, beforeEach } from 'vitest';
import { MerkleTree } from '../src/merkle-tree.js';
import { verifyProof } from '../src/allowlist-utils.js';
import type { ProofOutput } from '../src/types.js';
import { makeTree, makeProofInMemory, cloneProof, ContractSimulator, tamperSibling } from './helpers.js';

describe('Contract Simulation', () => {
  let tree: MerkleTree;
  let contract: ContractSimulator;

  beforeEach(() => {
    tree = makeTree(8, ['alice', 'bob', 'charlie']);
    contract = new ContractSimulator(tree.root);
  });

  // ── Accept valid ──────────────────────────────────────────────────────
  it('accepts valid proof from each member', () => {
    for (const s of ['alice', 'bob', 'charlie']) {
      const c = new ContractSimulator(tree.root);
      const p = makeProofInMemory(tree, s, `ctx_${s}`);
      expect(c.verifyAndUse(p).accepted).toBe(true);
    }
  });

  // ── Reject invalid proof ──────────────────────────────────────────────
  it('rejects proof with tampered sibling', () => {
    const proof = makeProofInMemory(tree, 'alice', 'ctx');
    const tampered = tamperSibling(proof, 0);
    expect(contract.verifyAndUse(tampered).accepted).toBe(false);
  });

  it('rejects proof with wrong root', () => {
    const proof = makeProofInMemory(tree, 'alice', 'ctx');
    const bad = cloneProof(proof);
    bad.publicInputs.root = 'ff'.repeat(32);
    expect(contract.verifyAndUse(bad).accepted).toBe(false);
  });

  it('rejects random garbage proof', () => {
    const garbage: ProofOutput = {
      proof: 'deadbeef'.repeat(32),
      publicInputs: { root: tree.root, nullifier: 'ab'.repeat(32) },
      meta: { context: 'x', treeDepth: 8, generatedAt: '', verified: false },
    };
    expect(contract.verifyAndUse(garbage).accepted).toBe(false);
  });

  // ── Reused nullifier ──────────────────────────────────────────────────
  it('rejects reused nullifier', () => {
    const proof = makeProofInMemory(tree, 'alice', 'ctx');
    contract.verifyAndUse(proof);
    expect(contract.verifyAndUse(proof).accepted).toBe(false);
    expect(contract.verifyAndUse(proof).reason).toContain('Nullifier already used');
  });

  // ── Root rotation ─────────────────────────────────────────────────────
  it('old proof fails after root rotation', () => {
    const proof = makeProofInMemory(tree, 'alice', 'ctx');

    // Add new member → root changes
    tree.addMember('dave');
    contract.setRoot(tree.root);

    // Old proof's root no longer matches
    const result = contract.verifyAndUse(proof);
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('Root mismatch');
  });

  it('new proof succeeds after root rotation', () => {
    tree.addMember('dave');
    contract.setRoot(tree.root);

    const freshProof = makeProofInMemory(tree, 'alice', 'ctx');
    expect(contract.verifyAndUse(freshProof).accepted).toBe(true);
  });

  it('new member can prove after root rotation', () => {
    tree.addMember('dave');
    contract.setRoot(tree.root);

    const proof = makeProofInMemory(tree, 'dave', 'ctx');
    expect(contract.verifyAndUse(proof).accepted).toBe(true);
  });

  // ── Cross-tree rejection ──────────────────────────────────────────────
  it('proof from a completely different tree is rejected', () => {
    const otherTree = makeTree(8, ['evil_alice']);
    const otherProof = makeProofInMemory(otherTree, 'evil_alice', 'ctx');
    expect(contract.verifyAndUse(otherProof).accepted).toBe(false);
  });

  // ── Bulk acceptance ───────────────────────────────────────────────────
  it('50 unique proofs all accepted sequentially', () => {
    const members = Array.from({ length: 50 }, (_, i) => `m_${i}`);
    const bigTree = makeTree(10, members);
    const bigContract = new ContractSimulator(bigTree.root);

    for (let i = 0; i < 50; i++) {
      const p = makeProofInMemory(bigTree, `m_${i}`, `ctx_${i}`);
      expect(bigContract.verifyAndUse(p).accepted).toBe(true);
    }
  });

  // ── Nullifier state inspection ────────────────────────────────────────
  it('isNullifierUsed returns false before submission, true after', () => {
    const proof = makeProofInMemory(tree, 'alice', 'ctx');
    expect(contract.isNullifierUsed(proof.publicInputs.nullifier)).toBe(false);
    contract.verifyAndUse(proof);
    expect(contract.isNullifierUsed(proof.publicInputs.nullifier)).toBe(true);
  });
});
