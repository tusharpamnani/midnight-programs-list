// Sparse Merkle tree for the ZK allowlist. Supports:
//   - Initialization with configurable depth
//   - Incremental leaf insertion
//   - Merkle path generation for proof construction
//   - Serialization/deserialization to JSON
//   - Root computation
//
// The tree uses "zero hashes" for empty subtrees, making it efficient even at
// large depths (2^20 leaves) since only populated paths are stored.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { hashLeaf, hashNode, computeZeroHashes } from './poseidon.js';
import type { MerkleTreeData, MerklePath, HashHex, TREE_DEPTH } from './types.js';
import { TREE_DEPTH as DEFAULT_DEPTH } from './types.js';

/** Default data directory for persistent storage */
const DATA_DIR = 'data';

export class MerkleTree {
  readonly depth: number;
  private leaves: HashHex[] = [];
  /** Sparse layer storage: layers[level][index] = hash */
  private layers: Map<number, Map<number, HashHex>> = new Map();
  /** Pre-computed zero hashes for each level */
  private zeroHashes: HashHex[];

  constructor(depth: number = DEFAULT_DEPTH) {
    this.depth = depth;
    this.zeroHashes = computeZeroHashes(depth);

    // Initialize empty layers
    for (let i = 0; i <= depth; i++) {
      this.layers.set(i, new Map());
    }
  }

  /** Current number of leaves */
  get leafCount(): number {
    return this.leaves.length;
  }

  /** Maximum number of leaves this tree can hold */
  get capacity(): number {
    return 2 ** this.depth;
  }

  /** Get the current Merkle root */
  get root(): HashHex {
    return this.getNode(this.depth, 0);
  }

  /**
   * Get a node at a specific level and index.
   * Returns the zero hash if the node hasn't been set.
   */
  private getNode(level: number, index: number): HashHex {
    const layer = this.layers.get(level);
    if (layer && layer.has(index)) {
      return layer.get(index)!;
    }
    return this.zeroHashes[level];
  }

  /**
   * Set a node at a specific level and index.
   */
  private setNode(level: number, index: number, hash: HashHex): void {
    let layer = this.layers.get(level);
    if (!layer) {
      layer = new Map();
      this.layers.set(level, layer);
    }
    layer.set(index, hash);
  }

  /**
   * Insert a new leaf and update the path to root.
   * Returns the leaf index.
   */
  insertLeaf(leafHash: HashHex): number {
    if (this.leaves.length >= this.capacity) {
      throw new Error(`Tree is full (capacity: ${this.capacity})`);
    }

    const leafIndex = this.leaves.length;
    this.leaves.push(leafHash);

    // Set leaf at level 0
    this.setNode(0, leafIndex, leafHash);

    // Update path from leaf to root
    let currentIndex = leafIndex;
    for (let level = 0; level < this.depth; level++) {
      const parentIndex = Math.floor(currentIndex / 2);
      const leftChild = this.getNode(level, parentIndex * 2);
      const rightChild = this.getNode(level, parentIndex * 2 + 1);
      const parentHash = hashNode(leftChild, rightChild);
      this.setNode(level + 1, parentIndex, parentHash);
      currentIndex = parentIndex;
    }

    return leafIndex;
  }

  /**
   * Add a member by their secret.
   * Computes the leaf hash and inserts it.
   */
  addMember(secret: string): { leaf: HashHex; index: number } {
    const leaf = hashLeaf(secret);
    const index = this.insertLeaf(leaf);
    return { leaf, index };
  }

  /**
   * Get the Merkle proof (path) for a leaf at the given index.
   */
  getMerklePath(leafIndex: number): MerklePath {
    if (leafIndex < 0 || leafIndex >= this.leaves.length) {
      throw new Error(`Leaf index ${leafIndex} out of range [0, ${this.leaves.length - 1}]`);
    }

    const siblings: HashHex[] = [];
    const pathIndices: number[] = [];

    let currentIndex = leafIndex;
    for (let level = 0; level < this.depth; level++) {
      // Determine if current node is left (0) or right (1) child
      const isRight = currentIndex % 2 === 1;
      pathIndices.push(isRight ? 1 : 0);

      // Get sibling
      const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;
      siblings.push(this.getNode(level, siblingIndex));

      // Move to parent
      currentIndex = Math.floor(currentIndex / 2);
    }

    return { siblings, pathIndices };
  }

  /**
   * Verify that a Merkle path is valid for a given leaf.
   */
  verifyPath(leaf: HashHex, path: MerklePath, expectedRoot?: HashHex): boolean {
    let currentHash = leaf;

    for (let i = 0; i < path.siblings.length; i++) {
      if (path.pathIndices[i] === 0) {
        // Current is left child
        currentHash = hashNode(currentHash, path.siblings[i]);
      } else {
        // Current is right child
        currentHash = hashNode(path.siblings[i], currentHash);
      }
    }

    const root = expectedRoot ?? this.root;
    return currentHash === root;
  }

  /**
   * Find the leaf index for a given secret.
   * Returns -1 if not found.
   */
  findLeafIndex(secret: string): number {
    const leaf = hashLeaf(secret);
    return this.leaves.indexOf(leaf);
  }

  /**
   * Serialize the tree to a JSON-compatible object.
   */
  toJSON(): MerkleTreeData {
    const layersObj: Record<number, Record<number, HashHex>> = {};
    for (const [level, layer] of this.layers.entries()) {
      if (layer.size > 0) {
        layersObj[level] = {};
        for (const [index, hash] of layer.entries()) {
          layersObj[level][index] = hash;
        }
      }
    }

    return {
      depth: this.depth,
      leafCount: this.leaves.length,
      leaves: [...this.leaves],
      layers: layersObj,
      root: this.root,
    };
  }

  /**
   * Restore a tree from a serialized JSON object.
   */
  static fromJSON(data: MerkleTreeData): MerkleTree {
    const tree = new MerkleTree(data.depth);
    tree.leaves = [...data.leaves];

    for (const [levelStr, layer] of Object.entries(data.layers)) {
      const level = parseInt(levelStr, 10);
      const layerMap = new Map<number, HashHex>();
      for (const [indexStr, hash] of Object.entries(layer as Record<string, HashHex>)) {
        layerMap.set(parseInt(indexStr, 10), hash);
      }
      tree.layers.set(level, layerMap);
    }

    return tree;
  }

  /**
   * Save the tree to a JSON file.
   */
  save(filePath?: string): string {
    const targetPath = filePath ?? path.join(DATA_DIR, 'tree.json');
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(targetPath, JSON.stringify(this.toJSON(), null, 2));
    return targetPath;
  }

  /**
   * Load a tree from a JSON file.
   */
  static load(filePath?: string): MerkleTree {
    const targetPath = filePath ?? path.join(DATA_DIR, 'tree.json');
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Tree file not found: ${targetPath}. Run 'zk init' first.`);
    }
    const data: MerkleTreeData = JSON.parse(fs.readFileSync(targetPath, 'utf-8'));
    return MerkleTree.fromJSON(data);
  }
}
