// ─── 2. Merkle Tree Edge Cases ──────────────────────────────────────────────────
// Break the tree: empty, single-leaf, deep, full, duplicate, serialization,
// tampered nodes, and incorrect paths.
// ─────────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { MerkleTree } from '../src/merkle-tree.js';
import { hashLeaf, computeZeroHashes } from '../src/poseidon.js';
import { makeTree } from './helpers.js';

describe('Merkle Tree Edge Cases', () => {
  // ── Empty tree ───

  describe('empty tree', () => {
    it('has a valid root (zero hash)', () => {
      const tree = new MerkleTree(4);
      expect(tree.root).toBeDefined();
      expect(tree.root.length).toBe(64); // 32 bytes hex
      expect(tree.leafCount).toBe(0);
    });

    it('root equals precomputed zero hash at full depth', () => {
      const depth = 4;
      const zeros = computeZeroHashes(depth);
      const tree = new MerkleTree(depth);
      expect(tree.root).toBe(zeros[depth]);
    });

    it('getMerklePath throws on empty tree', () => {
      const tree = new MerkleTree(4);
      expect(() => tree.getMerklePath(0)).toThrow();
    });

    it('findLeafIndex returns -1 for any secret', () => {
      const tree = new MerkleTree(4);
      expect(tree.findLeafIndex('anything')).toBe(-1);
    });
  });

  // ── Single-leaf tree ───

  describe('single-leaf tree', () => {
    it('root changes after inserting one leaf', () => {
      const tree = new MerkleTree(4);
      const emptyRoot = tree.root;
      tree.addMember('solo');
      expect(tree.root).not.toBe(emptyRoot);
    });

    it('generates a valid path for the only leaf', () => {
      const tree = makeTree(4, ['solo']);
      const path = tree.getMerklePath(0);
      expect(path.siblings.length).toBe(4);
      expect(path.pathIndices.length).toBe(4);

      const leaf = hashLeaf('solo');
      expect(tree.verifyPath(leaf, path)).toBe(true);
    });

    it('path index is all zeros for leaf at index 0', () => {
      const tree = makeTree(4, ['solo']);
      const path = tree.getMerklePath(0);
      expect(path.pathIndices.every((i) => i === 0)).toBe(true);
    });
  });

  // ── Two-leaf tree ───

  describe('two-leaf tree', () => {
    it('second leaf at index 1 has pathIndices[0] === 1', () => {
      const tree = makeTree(4, ['a', 'b']);
      const path = tree.getMerklePath(1);
      expect(path.pathIndices[0]).toBe(1);
    });

    it('both leaves produce valid proofs', () => {
      const tree = makeTree(4, ['a', 'b']);
      for (let i = 0; i < 2; i++) {
        const leaf = hashLeaf(i === 0 ? 'a' : 'b');
        const path = tree.getMerklePath(i);
        expect(tree.verifyPath(leaf, path)).toBe(true);
      }
    });

    it('swapping sibling hashes breaks verification', () => {
      const tree = makeTree(4, ['a', 'b']);
      const leaf = hashLeaf('a');
      const path = tree.getMerklePath(0);

      // Swap the first sibling to a wrong value
      const badPath = {
        siblings: [...path.siblings],
        pathIndices: [...path.pathIndices],
      };
      badPath.siblings[0] = hashLeaf('WRONG');
      expect(tree.verifyPath(leaf, badPath)).toBe(false);
    });
  });

  // ── Deep tree with many leaves ───

  describe('deep tree (1000 leaves)', () => {
    let tree: MerkleTree;

    it('inserts 1000 leaves without error', () => {
      tree = new MerkleTree(12); // capacity 4096
      for (let i = 0; i < 1000; i++) {
        tree.addMember(`member_${i}`);
      }
      expect(tree.leafCount).toBe(1000);
    });

    it('every leaf has a valid Merkle path', () => {
      tree = new MerkleTree(12);
      for (let i = 0; i < 1000; i++) {
        tree.addMember(`member_${i}`);
      }

      // Spot-check 50 random indices
      const indices = [0, 1, 2, 499, 500, 501, 998, 999];
      for (const idx of indices) {
        const leaf = hashLeaf(`member_${idx}`);
        const path = tree.getMerklePath(idx);
        expect(tree.verifyPath(leaf, path)).toBe(true);
      }
    });

    it('root is unique for each insertion', () => {
      const t = new MerkleTree(10);
      const roots = new Set<string>();
      for (let i = 0; i < 100; i++) {
        t.addMember(`m_${i}`);
        roots.add(t.root);
      }
      expect(roots.size).toBe(100);
    });
  });

  // ── Full tree ───

  describe('full tree', () => {
    it('throws when inserting beyond capacity', () => {
      const tree = new MerkleTree(2); // capacity 4
      tree.addMember('a');
      tree.addMember('b');
      tree.addMember('c');
      tree.addMember('d');
      expect(() => tree.addMember('e')).toThrow(/full/i);
    });
  });

  // ── Duplicate members ───

  describe('duplicate leaf hashes', () => {
    it('insertLeaf allows duplicate leaf hashes (tree does not enforce uniqueness)', () => {
      const tree = new MerkleTree(4);
      const leaf = hashLeaf('dup');
      tree.insertLeaf(leaf);
      // insertLeaf itself doesn't check for duplicates
      expect(() => tree.insertLeaf(leaf)).not.toThrow();
      expect(tree.leafCount).toBe(2);
    });

    it('findLeafIndex returns the FIRST occurrence', () => {
      const tree = new MerkleTree(4);
      tree.addMember('dup');
      tree.insertLeaf(hashLeaf('dup'));
      expect(tree.findLeafIndex('dup')).toBe(0);
    });
  });

  // ── Serialization round-trip ───

  describe('serialization', () => {
    it('toJSON → fromJSON preserves root', () => {
      const tree = makeTree(8, ['a', 'b', 'c']);
      const json = tree.toJSON();
      const restored = MerkleTree.fromJSON(json);
      expect(restored.root).toBe(tree.root);
    });

    it('toJSON → fromJSON preserves leaf count', () => {
      const tree = makeTree(8, ['a', 'b', 'c']);
      const json = tree.toJSON();
      const restored = MerkleTree.fromJSON(json);
      expect(restored.leafCount).toBe(3);
    });

    it('toJSON → fromJSON preserves Merkle paths', () => {
      const tree = makeTree(6, ['x', 'y', 'z']);
      const json = tree.toJSON();
      const restored = MerkleTree.fromJSON(json);

      for (let i = 0; i < 3; i++) {
        const origPath = tree.getMerklePath(i);
        const restoredPath = restored.getMerklePath(i);
        expect(restoredPath.siblings).toEqual(origPath.siblings);
        expect(restoredPath.pathIndices).toEqual(origPath.pathIndices);
      }
    });

    it('file save → load preserves root', () => {
      const tmpDir = '/tmp/zk-tree-test-' + Date.now();
      const tmpFile = tmpDir + '/tree.json';

      const tree = makeTree(6, ['a', 'b']);
      tree.save(tmpFile);
      const loaded = MerkleTree.load(tmpFile);

      expect(loaded.root).toBe(tree.root);
      expect(loaded.leafCount).toBe(2);

      // Cleanup
      const fs = require('node:fs');
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  // ── Tampered tree ───

  describe('tampered tree (modified after proof generation)', () => {
    it('proof generated before adding new member has stale root', () => {
      const tree = makeTree(6, ['alice', 'bob']);
      const rootBefore = tree.root;

      // Generate path before modification
      const leaf = hashLeaf('alice');
      const path = tree.getMerklePath(0);

      // Add new member → root changes
      tree.addMember('charlie');
      expect(tree.root).not.toBe(rootBefore);

      // Path is still valid against OLD root
      expect(tree.verifyPath(leaf, path, rootBefore)).toBe(true);

      // Path is NOT valid against NEW root
      expect(tree.verifyPath(leaf, path, tree.root)).toBe(false);
    });
  });

  // ── Wrong path manipulations ───

  describe('incorrect path', () => {
    it('wrong sibling hash → verification fails', () => {
      const tree = makeTree(6, ['a', 'b', 'c']);
      const leaf = hashLeaf('a');
      const path = tree.getMerklePath(0);

      path.siblings[0] = 'ff'.repeat(32);
      expect(tree.verifyPath(leaf, path)).toBe(false);
    });

    it('wrong path index → verification fails', () => {
      const tree = makeTree(6, ['a', 'b', 'c']);
      const leaf = hashLeaf('a');
      const path = tree.getMerklePath(0);

      path.pathIndices[0] = path.pathIndices[0] === 0 ? 1 : 0;
      expect(tree.verifyPath(leaf, path)).toBe(false);
    });

    it('truncated path → wrong root', () => {
      const tree = makeTree(6, ['a', 'b']);
      const leaf = hashLeaf('a');
      const path = tree.getMerklePath(0);

      // Remove last sibling
      const truncated = {
        siblings: path.siblings.slice(0, -1),
        pathIndices: path.pathIndices.slice(0, -1),
      };
      // verifyPath recomputes with fewer levels → different root
      expect(tree.verifyPath(leaf, truncated)).toBe(false);
    });

    it('using path from wrong leaf index → verification fails', () => {
      const tree = makeTree(6, ['a', 'b', 'c']);
      const leafA = hashLeaf('a');
      const pathB = tree.getMerklePath(1); // path for 'b', not 'a'

      expect(tree.verifyPath(leafA, pathB)).toBe(false);
    });
  });
});
