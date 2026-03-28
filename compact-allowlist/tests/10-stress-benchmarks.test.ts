// ─── 10. Stress & Benchmark Tests ───────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { MerkleTree } from '../src/merkle-tree.js';
import { hashLeaf, hashNullifier } from '../src/poseidon.js';
import { verifyProof } from '../src/allowlist-utils.js';
import { makeTree, makeProofInMemory } from './helpers.js';

describe('Stress & Benchmarks', () => {
  // ── 10k identity collision test ───────────────────────────────────────
  it('10,000 random identities → zero leaf hash collisions', () => {
    const hashes = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      hashes.add(hashLeaf(`identity_${i}_${Math.random().toString(36)}`));
    }
    expect(hashes.size).toBe(10_000);
  });

  it('10,000 sequential identities → zero leaf hash collisions', () => {
    const hashes = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      hashes.add(hashLeaf(`user_${i}`));
    }
    expect(hashes.size).toBe(10_000);
  });

  it('10,000 nullifier pairs → zero collisions', () => {
    const nullifiers = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      nullifiers.add(hashNullifier(`secret_${i}`, `ctx_${i}`));
    }
    expect(nullifiers.size).toBe(10_000);
  });

  // ── Benchmark: proof generation ───────────────────────────────────────
  it('benchmark: proof generation time (1000 members)', () => {
    const members = Array.from({ length: 1000 }, (_, i) => `m_${i}`);
    const tree = makeTree(12, members);

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      makeProofInMemory(tree, `m_${i}`, 'bench');
    }
    const elapsed = performance.now() - start;

    console.log(`  ⏱  100 proof generations (1000-member tree): ${elapsed.toFixed(1)}ms`);
    console.log(`  ⏱  Average: ${(elapsed / 100).toFixed(2)}ms/proof`);
    expect(elapsed).toBeLessThan(10_000); // must complete in <10s
  });

  // ── Benchmark: verification time ──────────────────────────────────────
  it('benchmark: verification time (100 proofs)', () => {
    const tree = makeTree(12, Array.from({ length: 500 }, (_, i) => `m_${i}`));
    const proofs = Array.from({ length: 100 }, (_, i) =>
      makeProofInMemory(tree, `m_${i}`, 'bench')
    );

    const start = performance.now();
    for (const p of proofs) {
      const r = verifyProof(p);
      expect(r.valid).toBe(true);
    }
    const elapsed = performance.now() - start;

    console.log(`  ⏱  100 verifications: ${elapsed.toFixed(1)}ms`);
    console.log(`  ⏱  Average: ${(elapsed / 100).toFixed(2)}ms/verify`);
    expect(elapsed).toBeLessThan(5_000);
  });

  // ── Benchmark: tree insertion ─────────────────────────────────────────
  it('benchmark: insert 5000 members into depth-14 tree', () => {
    const tree = new MerkleTree(14);
    const start = performance.now();
    for (let i = 0; i < 5000; i++) {
      tree.addMember(`member_${i}`);
    }
    const elapsed = performance.now() - start;

    console.log(`  ⏱  5000 insertions (depth-14): ${elapsed.toFixed(1)}ms`);
    expect(tree.leafCount).toBe(5000);
    expect(elapsed).toBeLessThan(15_000);
  });

  // ── Property: forgery never works ─────────────────────────────────────
  it('property: random mutations to valid proof always fail', () => {
    const tree = makeTree(6, ['alice', 'bob', 'charlie']);
    const validProof = makeProofInMemory(tree, 'alice', 'ctx');

    fc.assert(
      fc.property(
        fc.nat({ max: 5 }),
        fc.stringMatching(/^[0-9a-f]{64}$/),
        (sibIdx, fakeHash) => {
          const tampered = JSON.parse(JSON.stringify(validProof));
          const w = JSON.parse(Buffer.from(tampered.proof, 'hex').toString());
          if (sibIdx < w.witness.siblings.length) {
            w.witness.siblings[sibIdx] = fakeHash;
          }
          tampered.proof = Buffer.from(JSON.stringify(w)).toString('hex');
          return verifyProof(tampered).valid === false;
        }
      ),
      { numRuns: 200 }
    );
  });
});
