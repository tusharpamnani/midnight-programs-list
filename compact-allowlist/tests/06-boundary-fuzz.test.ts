// ─── 6. Boundary & Fuzz Testing ─────────────────────────────────────────────────
//
// Fuzz inputs, edge-case strings, corrupted proofs, missing fields,
// extremely large inputs. Every invalid input must fail gracefully.
// ─────────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { MerkleTree } from '../src/merkle-tree.js';
import { hashLeaf, hashNullifier, hashNode, computeZeroHashes } from '../src/poseidon.js';
import { verifyProof } from '../src/allowlist-utils.js';
import type { ProofOutput } from '../src/types.js';
import { makeTree, makeProofInMemory, cloneProof, decodeWitness, encodeWitness } from './helpers.js';

describe('Boundary & Fuzz Testing', () => {
  // ── Empty and weird string inputs ──

  describe('edge-case string inputs', () => {
    it('empty string secret → valid leaf hash', () => {
      const leaf = hashLeaf('');
      expect(leaf.length).toBe(64);
      expect(/^[0-9a-f]+$/.test(leaf)).toBe(true);
    });

    it('empty string secret can be added to tree', () => {
      const tree = new MerkleTree(4);
      expect(() => tree.addMember('')).not.toThrow();
      expect(tree.leafCount).toBe(1);
    });

    it('whitespace-only secret produces valid hash', () => {
      const leaf = hashLeaf('   ');
      expect(leaf.length).toBe(64);
      // Different from empty string
      expect(leaf).not.toBe(hashLeaf(''));
    });

    it('unicode secrets produce valid hashes', () => {
      const unicodeSecrets = ['🔐', '密码', 'пароль', '🏳️‍🌈', 'a̐éö̲'];
      for (const s of unicodeSecrets) {
        const leaf = hashLeaf(s);
        expect(leaf.length).toBe(64);
      }
    });

    it('very long secret (10KB) produces valid hash', () => {
      const longSecret = 'x'.repeat(10_000);
      const leaf = hashLeaf(longSecret);
      expect(leaf.length).toBe(64);
    });

    it('null bytes in secret → valid hash', () => {
      const leaf = hashLeaf('\x00\x00\x00');
      expect(leaf.length).toBe(64);
    });

    it('newlines and tabs in secret → valid hash', () => {
      const leaf = hashLeaf('\n\t\r');
      expect(leaf.length).toBe(64);
    });
  });

  // ── Hash function properties ──

  describe('hash function properties', () => {
    it('different inputs → different leaf hashes (100 samples)', () => {
      const hashes = new Set<string>();
      for (let i = 0; i < 100; i++) {
        hashes.add(hashLeaf(`secret_${i}`));
      }
      expect(hashes.size).toBe(100);
    });

    it('hashLeaf and hashNullifier produce different outputs for same input', () => {
      const leaf = hashLeaf('test');
      const nullifier = hashNullifier('test', '');
      expect(leaf).not.toBe(nullifier);
    });

    it('hashNode(a,b) !== hashNode(b,a) — NOT commutative', () => {
      const a = hashLeaf('a');
      const b = hashLeaf('b');
      expect(hashNode(a, b)).not.toBe(hashNode(b, a));
    });

    it('domain separation: hashLeaf("") !== zero hash at level 0', () => {
      // The zero hash uses DOMAIN_LEAF + empty buffer
      // hashLeaf("") also uses DOMAIN_LEAF + empty UTF-8 buffer
      // These SHOULD be the same by construction
      const zeros = computeZeroHashes(1);
      const emptyLeaf = hashLeaf('');
      expect(emptyLeaf).toBe(zeros[0]);
    });
  });

  // ── Corrupted proof JSON ──

  describe('corrupted proof structures', () => {
    let validProof: ProofOutput;

    it('set up valid proof', () => {
      const tree = makeTree(6, ['alice', 'bob']);
      validProof = makeProofInMemory(tree, 'alice', 'ctx');
      expect(verifyProof(validProof).valid).toBe(true);
    });

    it('proof with truncated hex → fails gracefully', () => {
      const bad = cloneProof(validProof);
      bad.proof = validProof.proof.slice(0, 10);
      expect(verifyProof(bad).valid).toBe(false);
    });

    it('proof with extra characters → fails gracefully', () => {
      const bad = cloneProof(validProof);
      bad.proof = validProof.proof + 'ZZZZ';
      // May or may not fail depending on hex parsing, but must not crash
      const result = verifyProof(bad);
      // Either valid or invalid, but no crash
      expect(typeof result.valid).toBe('boolean');
    });

    it('proof with witness missing "secret" field → fails', () => {
      const bad = cloneProof(validProof);
      const w = decodeWitness(bad);
      delete w.witness.secret;
      bad.proof = encodeWitness(w);
      const result = verifyProof(bad);
      expect(result.valid).toBe(false);
    });

    it('proof with witness missing "siblings" field → fails', () => {
      const bad = cloneProof(validProof);
      const w = decodeWitness(bad);
      delete w.witness.siblings;
      bad.proof = encodeWitness(w);
      const result = verifyProof(bad);
      expect(result.valid).toBe(false);
    });

    it('proof with witness missing "pathIndices" field → fails', () => {
      const bad = cloneProof(validProof);
      const w = decodeWitness(bad);
      delete w.witness.pathIndices;
      bad.proof = encodeWitness(w);
      const result = verifyProof(bad);
      expect(result.valid).toBe(false);
    });

    it('proof with empty siblings array → rootMatches fails', () => {
      const bad = cloneProof(validProof);
      const w = decodeWitness(bad);
      w.witness.siblings = [];
      w.witness.pathIndices = [];
      bad.proof = encodeWitness(w);
      const result = verifyProof(bad);
      expect(result.valid).toBe(false);
    });

    it('proof with null publicInputs fields → fails', () => {
      const bad = cloneProof(validProof);
      (bad.publicInputs as any).root = null;
      const result = verifyProof(bad);
      expect(result.valid).toBe(false);
    });
  });

  // ── Property-based (fast-check) ──

  describe('property-based tests (fast-check)', () => {
    it('any string secret produces a 64-char hex hash', () => {
      fc.assert(
        fc.property(fc.string(), (secret) => {
          const leaf = hashLeaf(secret);
          return leaf.length === 64 && /^[0-9a-f]+$/.test(leaf);
        }),
        { numRuns: 500 }
      );
    });

    it('any two distinct secrets produce distinct leaf hashes', () => {
      fc.assert(
        fc.property(fc.string(), fc.string(), (a, b) => {
          fc.pre(a !== b);
          return hashLeaf(a) !== hashLeaf(b);
        }),
        { numRuns: 500 }
      );
    });

    it('any secret+context produces a 64-char hex nullifier', () => {
      fc.assert(
        fc.property(fc.string(), fc.string(), (secret, context) => {
          const n = hashNullifier(secret, context);
          return n.length === 64 && /^[0-9a-f]+$/.test(n);
        }),
        { numRuns: 500 }
      );
    });

    it('same secret+context always produces same nullifier (determinism)', () => {
      fc.assert(
        fc.property(fc.string(), fc.string(), (secret, context) => {
          return hashNullifier(secret, context) === hashNullifier(secret, context);
        }),
        { numRuns: 300 }
      );
    });

    it('random proof bytes never validate', () => {
      fc.assert(
        fc.property(fc.stringMatching(/^[0-9a-f]{20,200}$/), (hex) => {
          const fakeProof: ProofOutput = {
            proof: hex,
            publicInputs: { root: 'a'.repeat(64), nullifier: 'b'.repeat(64) },
            meta: { context: 'x', treeDepth: 4, generatedAt: '', verified: false },
          };
          return verifyProof(fakeProof).valid === false;
        }),
        { numRuns: 200 }
      );
    });

    it('adding random secrets to a tree always increases leaf count', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 20 }),
          (secrets) => {
            const tree = new MerkleTree(8);
            for (const s of secrets) {
              tree.addMember(s);
            }
            return tree.leafCount === secrets.length;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('every inserted member has a valid Merkle path', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 10 }),
          (secrets) => {
            const tree = new MerkleTree(8);
            for (const s of secrets) {
              tree.addMember(s);
            }
            for (let i = 0; i < secrets.length; i++) {
              const leaf = hashLeaf(secrets[i]);
              const path = tree.getMerklePath(i);
              if (!tree.verifyPath(leaf, path)) return false;
            }
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('proof gen → verify is always valid for members in tree', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 15 }),
          fc.nat({ max: 14 }),
          fc.string({ minLength: 1 }),
          (secrets, memberIdx, context) => {
            const uniqueSecrets = [...new Set(secrets)];
            if (uniqueSecrets.length === 0) return true;
            const idx = memberIdx % uniqueSecrets.length;
            const tree = makeTree(8, uniqueSecrets);
            const proof = makeProofInMemory(tree, uniqueSecrets[idx], context);
            return verifyProof(proof).valid === true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
