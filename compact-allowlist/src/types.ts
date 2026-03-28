/** Depth of the Merkle tree (supports 2^20 ≈ 1M members) */
export const TREE_DEPTH = 20;

/** A single node in the Merkle tree (hex-encoded hash) */
export type HashHex = string;

/** Stored Merkle tree structure */
export interface MerkleTreeData {
  depth: number;
  leafCount: number;
  leaves: HashHex[];
  /** Sparse representation: layers[level][index] = hash */
  layers: Record<number, Record<number, HashHex>>;
  root: HashHex;
}

/** Merkle proof path for a single leaf */
export interface MerklePath {
  /** Sibling hashes from leaf to root */
  siblings: HashHex[];
  /** Direction bits: 0 = left, 1 = right (position of the proven leaf) */
  pathIndices: number[];
}

/** Member entry stored locally */
export interface MemberEntry {
  /** The original secret (dev-only, never sent on-chain) */
  secret: string;
  /** poseidon_hash(secret) — the leaf in the tree */
  leaf: HashHex;
  /** Index in the tree's leaf array */
  leafIndex: number;
  /** Timestamp of when the member was added */
  addedAt: string;
}

/** Local member store */
export interface MembersData {
  members: MemberEntry[];
}

/** Nullifier tracking entry */
export interface NullifierEntry {
  nullifier: HashHex;
  context: string;
  secret: string;
  createdAt: string;
  submitted: boolean;
}

/** Local nullifier store */
export interface NullifiersData {
  nullifiers: NullifierEntry[];
}

/** Generated proof output */
export interface ProofOutput {
  /** The ZK proof bytes (hex-encoded) */
  proof: string;
  /** Public inputs */
  publicInputs: {
    root: HashHex;
    nullifier: HashHex;
  };
  /** Metadata */
  meta: {
    context: string;
    treeDepth: number;
    generatedAt: string;
    verified: boolean;
  };
}

/** JSON output wrapper for deterministic CLI output */
export interface CLIOutput<T = unknown> {
  success: boolean;
  command: string;
  data?: T;
  error?: string;
  timestamp: string;
}
