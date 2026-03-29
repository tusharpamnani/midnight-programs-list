// Higher-level utilities for the ZK allowlist system:
//   - Member management (add/list)
//   - Nullifier tracking
//   - Proof generation and verification
//   - Contract interaction helpers

import * as fs from 'node:fs';
import * as path from 'node:path';
import { MerkleTree } from './merkle-tree.js';
import { hashLeaf, hashNullifier, hashNode, normalizeSecret } from './poseidon.js';
import type {
  MembersData,
  MemberEntry,
  NullifiersData,
  ProofOutput,
  CLIOutput,
} from './types.js';

const DATA_DIR = 'data';

// ─── Member Management ───

function membersPath(): string {
  return path.join(DATA_DIR, 'members.json');
}

export function loadMembers(): MembersData {
  const fp = membersPath();
  if (!fs.existsSync(fp)) {
    return { members: [] };
  }
  return JSON.parse(fs.readFileSync(fp, 'utf-8'));
}

export function saveMembers(data: MembersData): void {
  const dir = path.dirname(membersPath());
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(membersPath(), JSON.stringify(data, null, 2));
}

export function addMember(
  tree: MerkleTree,
  secret: string
): { member: MemberEntry; root: string } {
  const secretNormalized = normalizeSecret(secret);
  // Check if already a member
  const existingIndex = tree.findLeafIndex(secretNormalized);
  if (existingIndex >= 0) {
    throw new Error(`Secret already in tree at index ${existingIndex}`);
  }

  // Add to tree
  const { leaf, index } = tree.addMember(secret);

  // Create member entry
  const member: MemberEntry = {
    secret: secretNormalized,
    leaf: leaf,
    leafIndex: index,
    addedAt: new Date().toISOString(),
  };

  // Save member
  const members = loadMembers();
  members.members.push(member);
  saveMembers(members);

  // Save tree
  tree.save();

  return { member, root: tree.root };
}

// ─── Nullifier Tracking ───

function nullifiersPath(): string {
  return path.join(DATA_DIR, 'nullifiers.json');
}

export function loadNullifiers(): NullifiersData {
  const fp = nullifiersPath();
  if (!fs.existsSync(fp)) {
    return { nullifiers: [] };
  }
  return JSON.parse(fs.readFileSync(fp, 'utf-8'));
}

export function saveNullifiers(data: NullifiersData): void {
  const dir = path.dirname(nullifiersPath());
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(nullifiersPath(), JSON.stringify(data, null, 2));
}

export function trackNullifier(
  secret: string,
  context: string,
  nullifier: string,
  submitted: boolean = false
): void {
  const data = loadNullifiers();

  // Check if this nullifier was already generated
  const existing = data.nullifiers.find((n) => n.nullifier === nullifier);
  if (existing) {
    existing.submitted = submitted;
  } else {
    data.nullifiers.push({
      nullifier,
      context,
      secret,
      createdAt: new Date().toISOString(),
      submitted,
    });
  }

  saveNullifiers(data);
}

// ─── Proof Generation ───

/**
 * Generate a ZK membership proof.
 *
 * This constructs the witness data (private inputs) and public inputs
 * needed for the Compact circuit to verify membership.
 *
 * Private inputs (never leave the local machine in production):
 *   - secret: the member's secret
 *   - path: Merkle sibling hashes
 *   - pathIndices: direction bits
 *
 * Public inputs (included in the proof):
 *   - root: current Merkle root
 *   - nullifier: hash(secret, context)
 */
export function generateProof(
  tree: MerkleTree,
  secret: string,
  context: string
): ProofOutput {
  // Find the member's leaf index
  const secretNormalized = normalizeSecret(secret);
  // Find the member's leaf index
  const leafIndex = tree.findLeafIndex(secretNormalized);
  if (leafIndex < 0) {
    throw new Error('Secret not found in the tree. Add the member first.');
  }

  // Get Merkle path
  const merklePath = tree.getMerklePath(leafIndex);

  // Compute leaf and nullifier
  const leaf = hashLeaf(secretNormalized);
  const nullifier = hashNullifier(secretNormalized, context);
  const root = tree.root;

  // Verify the path locally before creating the proof
  const isValid = tree.verifyPath(leaf, merklePath);
  if (!isValid) {
    throw new Error('Internal error: Merkle path verification failed');
  }

  // Construct the proof output
  const proof: ProofOutput = {
    proof: Buffer.from(
      JSON.stringify({
        // Private witness (would be consumed by proof server, not sent on-chain)
        witness: {
          secret: secretNormalized,
          leaf,
          leafIndex,
          siblings: merklePath.siblings,
          pathIndices: merklePath.pathIndices,
        },
      })
    ).toString('hex'),
    publicInputs: {
      root,
      nullifier,
    },
    meta: {
      context,
      treeDepth: tree.depth,
      generatedAt: new Date().toISOString(),
      verified: true,
    },
  };

  // Track the nullifier locally
  trackNullifier(secret, context, nullifier);

  return proof;
}

/**
 * Verify a proof locally.
 *
 * Checks:
 *   1. Decode the witness from the proof
 *   2. Re-derive the leaf from the secret
 *   3. Re-compute the Merkle root from the path
 *   4. Verify root matches public input
 *   5. Re-compute the nullifier
 *   6. Verify nullifier matches public input
 */
export function verifyProof(proof: ProofOutput): {
  valid: boolean;
  checks: Record<string, boolean>;
} {
  const checks: Record<string, boolean> = {
    proofDecoded: false,
    leafValid: false,
    pathValid: false,
    rootMatches: false,
    nullifierValid: false,
  };

  try {
    // Decode witness
    const witnessData = JSON.parse(
      Buffer.from(proof.proof, 'hex').toString('utf-8')
    );
    checks.proofDecoded = true;

    const { secret, leaf, siblings, pathIndices } = witnessData.witness;

    const secretNormalized = normalizeSecret(secret);
    // Verify leaf = hash(secret)
    const computedLeaf = hashLeaf(secretNormalized);
    checks.leafValid = computedLeaf === leaf;

    // Recompute root from path
    let currentHash = computedLeaf;
    for (let i = 0; i < siblings.length; i++) {
      if (pathIndices[i] === 0) {
        currentHash = hashNode(currentHash, siblings[i]);
      } else {
        currentHash = hashNode(siblings[i], currentHash);
      }
    }
    checks.pathValid = true;
    checks.rootMatches = currentHash === proof.publicInputs.root;

    // Verify nullifier
    const computedNullifier = hashNullifier(secretNormalized, proof.meta.context);
    checks.nullifierValid = computedNullifier === proof.publicInputs.nullifier;

    const valid = Object.values(checks).every(Boolean);
    return { valid, checks };
  } catch (err) {
    return { valid: false, checks };
  }
}

// ─── CLI Output Helpers ───

export function cliSuccess<T>(command: string, data: T): CLIOutput<T> {
  return {
    success: true,
    command,
    data,
    timestamp: new Date().toISOString(),
  };
}

export function cliError(command: string, error: string): CLIOutput {
  return {
    success: false,
    command,
    error,
    timestamp: new Date().toISOString(),
  };
}

export function output(result: CLIOutput): void {
  console.log(JSON.stringify(result, null, 2));
}
