// Shared utilities for all test files: temp directories, tree factories,
// proof manipulation helpers, and a contract simulation.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MerkleTree } from '../src/merkle-tree.js';
import { hashLeaf, hashNullifier } from '../src/poseidon.js';
import { verifyProof } from '../src/allowlist-utils.js';
import type { ProofOutput } from '../src/types.js';

// ─── Temp directory management ──────────────────────────────────────────────────

let tmpDirs: string[] = [];

export function createTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-test-'));
  tmpDirs.push(dir);
  return dir;
}

export function cleanupTmpDirs(): void {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
  tmpDirs = [];
}

// ─── Tree factories ─────────────────────────────────────────────────────────────

/** Create a small tree with the given secrets inserted */
export function makeTree(depth: number, secrets: string[]): MerkleTree {
  const tree = new MerkleTree(depth);
  for (const s of secrets) {
    tree.addMember(s);
  }
  return tree;
}

/** Create a proof for a given tree/secret/context without touching the filesystem */
export function makeProofInMemory(
  tree: MerkleTree,
  secret: string,
  context: string
): ProofOutput {
  const leafIndex = tree.findLeafIndex(secret);
  if (leafIndex < 0) throw new Error('Secret not in tree');
  const merklePath = tree.getMerklePath(leafIndex);
  const leaf = hashLeaf(secret);
  const nullifier = hashNullifier(secret, context);
  const root = tree.root;

  return {
    proof: Buffer.from(
      JSON.stringify({
        witness: {
          secret,
          leaf,
          leafIndex,
          siblings: merklePath.siblings,
          pathIndices: merklePath.pathIndices,
        },
      })
    ).toString('hex'),
    publicInputs: { root, nullifier },
    meta: {
      context,
      treeDepth: tree.depth,
      generatedAt: new Date().toISOString(),
      verified: true,
    },
  };
}

// ─── Proof manipulation helpers ─────────────────────────────────────────────────

/** Deep-clone a proof */
export function cloneProof(proof: ProofOutput): ProofOutput {
  return JSON.parse(JSON.stringify(proof));
}

/** Decode the witness from a proof */
export function decodeWitness(proof: ProofOutput): any {
  return JSON.parse(Buffer.from(proof.proof, 'hex').toString('utf-8'));
}

/** Encode a modified witness back into a proof */
export function encodeWitness(witnessObj: any): string {
  return Buffer.from(JSON.stringify(witnessObj)).toString('hex');
}

/** Tamper with a specific sibling in the Merkle path */
export function tamperSibling(proof: ProofOutput, index: number): ProofOutput {
  const tampered = cloneProof(proof);
  const w = decodeWitness(tampered);
  // Flip one character in the sibling hash
  const orig = w.witness.siblings[index];
  w.witness.siblings[index] =
    orig[0] === 'a' ? 'b' + orig.slice(1) : 'a' + orig.slice(1);
  tampered.proof = encodeWitness(w);
  return tampered;
}

/** Tamper with a path index (flip direction) */
export function tamperPathIndex(proof: ProofOutput, index: number): ProofOutput {
  const tampered = cloneProof(proof);
  const w = decodeWitness(tampered);
  w.witness.pathIndices[index] = w.witness.pathIndices[index] === 0 ? 1 : 0;
  tampered.proof = encodeWitness(w);
  return tampered;
}

// ─── Contract Simulation ────────────────────────────────────────────────────────

/**
 * Simulates the on-chain Compact contract in-memory.
 * Enforces:
 *   - Root matching
 *   - Nullifier uniqueness
 *   - Proof validity
 */
export class ContractSimulator {
  private root: string;
  private usedNullifiers: Set<string> = new Set();

  constructor(root: string) {
    this.root = root;
  }

  getRoot(): string {
    return this.root;
  }

  setRoot(newRoot: string): void {
    this.root = newRoot;
  }

  isNullifierUsed(nullifier: string): boolean {
    return this.usedNullifiers.has(nullifier);
  }

  /**
   * Simulates verifyAndUse() — returns { accepted, reason }
   */
  verifyAndUse(proof: ProofOutput): { accepted: boolean; reason: string } {
    // 1. Verify proof locally
    const result = verifyProof(proof);
    if (!result.valid) {
      const failedChecks = Object.entries(result.checks)
        .filter(([, v]) => !v)
        .map(([k]) => k);
      return { accepted: false, reason: `Proof invalid: ${failedChecks.join(', ')}` };
    }

    // 2. Check root matches contract root
    if (proof.publicInputs.root !== this.root) {
      return { accepted: false, reason: 'Root mismatch' };
    }

    // 3. Check nullifier uniqueness
    if (this.usedNullifiers.has(proof.publicInputs.nullifier)) {
      return { accepted: false, reason: 'Nullifier already used' };
    }

    // 4. Accept — record nullifier
    this.usedNullifiers.add(proof.publicInputs.nullifier);
    return { accepted: true, reason: 'ok' };
  }
}
