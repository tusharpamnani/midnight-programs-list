#!/usr/bin/env node

// CLI for managing a Zero-Knowledge allowlist on Midnight.
//
// Commands:
//   zk init                                  Initialize a new Merkle tree
//   zk add-member --secret <secret>          Add a member to the allowlist
//   zk export-root                           Print the current Merkle root
//   zk gen-proof --secret <s> --context <c>  Generate a ZK membership proof
//   zk verify-proof <proof.json>             Verify a proof locally
//   zk submit-proof <proof.json>             Submit proof to Midnight contract
//   zk status                                Show tree status and stats
//
// All commands output deterministic JSON for scripting.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { MerkleTree } from './merkle-tree.js';
import {
  addMember,
  generateProof,
  verifyProof,
  loadMembers,
  loadNullifiers,
  trackNullifier,
  cliSuccess,
  cliError,
  output,
} from './allowlist-utils.js';
import type { ProofOutput } from './types.js';
import { TREE_DEPTH } from './types.js';
import { ZkAllowlistWitnesses } from './utils.js';

// ─── Argument Parsing ───

const args = process.argv.slice(2);
const command = args[0];

function getFlag(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

function getPositional(index: number): string | undefined {
  // Skip command and any --flags
  let pos = 0;
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      i++; // skip flag value
      continue;
    }
    if (pos === index) return args[i];
    pos++;
  }
  return undefined;
}

// ─── Commands ───

function cmdInit(): void {
  const depth = parseInt(getFlag('depth') ?? String(TREE_DEPTH), 10);

  // Check if tree already exists
  if (fs.existsSync('data/tree.json')) {
    const overwrite = getFlag('force');
    if (!overwrite) {
      output(
        cliError(
          'init',
          'Tree already exists at data/tree.json. Use --force true to overwrite.'
        )
      );
      process.exit(1);
    }
  }

  const tree = new MerkleTree(depth);
  const savedPath = tree.save();

  // Initialize empty members file
  if (!fs.existsSync('data')) {
    fs.mkdirSync('data', { recursive: true });
  }
  fs.writeFileSync(
    'data/members.json',
    JSON.stringify({ members: [] }, null, 2)
  );
  fs.writeFileSync(
    'data/nullifiers.json',
    JSON.stringify({ nullifiers: [] }, null, 2)
  );

  output(
    cliSuccess('init', {
      depth,
      capacity: 2 ** depth,
      root: tree.root,
      storagePath: savedPath,
      files: ['data/tree.json', 'data/members.json', 'data/nullifiers.json'],
    })
  );
}

function cmdAddMember(): void {
  const secret = getFlag('secret');
  if (!secret) {
    output(cliError('add-member', 'Missing required flag: --secret <secret>'));
    process.exit(1);
  }

  try {
    const tree = MerkleTree.load();
    const result = addMember(tree, secret);

    output(
      cliSuccess('add-member', {
        leaf: result.member.leaf,
        leafIndex: result.member.leafIndex,
        newRoot: result.root,
        totalMembers: tree.leafCount,
      })
    );
  } catch (err) {
    output(
      cliError(
        'add-member',
        err instanceof Error ? err.message : String(err)
      )
    );
    process.exit(1);
  }
}

function cmdExportRoot(): void {
  try {
    const tree = MerkleTree.load();
    output(
      cliSuccess('export-root', {
        root: tree.root,
        leafCount: tree.leafCount,
        depth: tree.depth,
      })
    );
  } catch (err) {
    output(
      cliError(
        'export-root',
        err instanceof Error ? err.message : String(err)
      )
    );
    process.exit(1);
  }
}

function cmdGenProof(): void {
  const secret = getFlag('secret');
  const context = getFlag('context');

  if (!secret) {
    output(cliError('gen-proof', 'Missing required flag: --secret <secret>'));
    process.exit(1);
  }
  if (!context) {
    output(
      cliError('gen-proof', 'Missing required flag: --context <context>')
    );
    process.exit(1);
  }

  try {
    const tree = MerkleTree.load();
    const proof = generateProof(tree, secret, context);

    // Also save to a default file if no redirect
    const proofPath = getFlag('output') ?? 'data/proof.json';
    const dir = path.dirname(proofPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2));

    output(
      cliSuccess('gen-proof', {
        ...proof.publicInputs,
        context: proof.meta.context,
        proofFile: proofPath,
        verified: proof.meta.verified,
      })
    );
  } catch (err) {
    output(
      cliError(
        'gen-proof',
        err instanceof Error ? err.message : String(err)
      )
    );
    process.exit(1);
  }
}

function cmdVerifyProof(): void {
  const proofFile = getPositional(0) ?? getFlag('file');
  if (!proofFile) {
    output(
      cliError(
        'verify-proof',
        'Usage: zk verify-proof <proof.json> or --file <proof.json>'
      )
    );
    process.exit(1);
  }

  try {
    if (!fs.existsSync(proofFile)) {
      throw new Error(`Proof file not found: ${proofFile}`);
    }

    const proof: ProofOutput = JSON.parse(
      fs.readFileSync(proofFile, 'utf-8')
    );
    const result = verifyProof(proof);

    output(
      cliSuccess('verify-proof', {
        valid: result.valid,
        checks: result.checks,
        publicInputs: proof.publicInputs,
      })
    );

    if (!result.valid) {
      process.exit(1);
    }
  } catch (err) {
    output(
      cliError(
        'verify-proof',
        err instanceof Error ? err.message : String(err)
      )
    );
    process.exit(1);
  }
}

async function cmdSetRoot(): Promise<void> {
  try {
    const tree = MerkleTree.load();
    const root = tree.root;

    // Load deployment config
    if (!fs.existsSync('deployment.json')) {
      output(
        cliError(
          'set-root',
          'No deployment.json found. Deploy the contract first with `npm run deploy`.'
        )
      );
      process.exit(1);
    }

    const deployment = JSON.parse(
      fs.readFileSync('deployment.json', 'utf-8')
    );

    if (!deployment.seed) {
      output(
        cliError('set-root', 'deployment.json is missing the wallet seed. Re-deploy the contract.')
      );
      process.exit(1);
    }

    // ─── Connect to Midnight ───

    const { createWallet, createProviders, compiledContract } = await import('./utils.js');
    const { findDeployedContract } = await import('@midnight-ntwrk/midnight-js-contracts');

    const walletCtx = await createWallet(deployment.seed);
    await walletCtx.wallet.waitForSyncedState();

    const providers = await createProviders(walletCtx);

    const contract = await findDeployedContract(providers, {
      compiledContract,
      contractAddress: deployment.contractAddress,
    });

    // ─── Call setRoot() on-chain ───

    const rootBytes = Uint8Array.from(Buffer.from(root, 'hex'));
    const txResult = await contract.callTx.setRoot(rootBytes);

    const txHash = txResult.public?.txId ?? txResult.public?.txHash ?? 'unknown';

    await walletCtx.wallet.stop();

    output(
      cliSuccess('set-root', {
        status: 'confirmed',
        txHash,
        newRoot: root,
        contractAddress: deployment.contractAddress,
      })
    );
  } catch (err) {
    output(
      cliError(
        'set-root',
        err instanceof Error ? err.message : String(err)
      )
    );
    process.exit(1);
  }
}

async function cmdSubmitProof(): Promise<void> {
  const proofFile = getPositional(0) ?? getFlag('file');
  if (!proofFile) {
    output(
      cliError(
        'submit-proof',
        'Usage: zk submit-proof <proof.json> or --file <proof.json>'
      )
    );
    process.exit(1);
  }

  try {
    if (!fs.existsSync(proofFile)) {
      throw new Error(`Proof file not found: ${proofFile}`);
    }

    const proof: ProofOutput = JSON.parse(
      fs.readFileSync(proofFile, 'utf-8')
    );

    // Verify locally first (fast sanity check before hitting the network)
    const localResult = verifyProof(proof);
    if (!localResult.valid) {
      output(
        cliError('submit-proof', 'Proof failed local verification. Fix the proof before submitting.')
      );
      process.exit(1);
    }

    // Load deployment config
    if (!fs.existsSync('deployment.json')) {
      output(
        cliError(
          'submit-proof',
          'No deployment.json found. Deploy the contract first with `npm run deploy`.'
        )
      );
      process.exit(1);
    }

    const deployment = JSON.parse(
      fs.readFileSync('deployment.json', 'utf-8')
    );

    if (!deployment.seed) {
      output(
        cliError('submit-proof', 'deployment.json is missing the wallet seed. Re-deploy the contract.')
      );
      process.exit(1);
    }

    // ─── Connect to Midnight ───

    const { createWallet, createProviders, createCompiledContract } = await import('./utils.js');
    const { findDeployedContract } = await import('@midnight-ntwrk/midnight-js-contracts');

    // Build real witnesses from the proof file.
    // getMerkleRoot() → the Merkle root the prover computed locally from their path.
    // getNullifier()  → the nullifier the prover computed locally from secret+context.
    // These are invoked by the proof server on the local machine to build the ZK
    // proof: the values themselves never go on-chain.
    const witnesses: ZkAllowlistWitnesses = {
      getMerkleRoot: (_ctx) => [undefined, Uint8Array.from(Buffer.from(proof.publicInputs.root, 'hex'))],
      getNullifier: (_ctx) => [undefined, Uint8Array.from(Buffer.from(proof.publicInputs.nullifier, 'hex'))],
    };

    const contractWithWitnesses = createCompiledContract(witnesses);

    const walletCtx = await createWallet(deployment.seed);
    await walletCtx.wallet.waitForSyncedState();

    const providers = await createProviders(walletCtx);

    // ─── Find the deployed contract ───

    const contract = await findDeployedContract(providers as any, {
      compiledContract: contractWithWitnesses,
      contractAddress: deployment.contractAddress,
    });

    // ─── Call verifyAndUse() on-chain ───
    // These are the public inputs passed as circuit parameters.
    // The proof server will call our witnesses above to get the private data
    // and build the ZK proof that these public values are consistent with it.

    const nullifierBytes = Uint8Array.from(
      Buffer.from(proof.publicInputs.nullifier, 'hex')
    );
    const rootBytes = Uint8Array.from(
      Buffer.from(proof.publicInputs.root, 'hex')
    );

    const txResult = await contract.callTx.verifyAndUse(
      nullifierBytes,
      rootBytes,
    );

    const txHash = txResult.public?.txId ?? txResult.public?.txHash ?? 'unknown';

    // Mark nullifier as submitted locally
    trackNullifier(
      '',
      proof.meta.context,
      proof.publicInputs.nullifier,
      true,
    );

    await walletCtx.wallet.stop();

    output(
      cliSuccess('submit-proof', {
        status: 'confirmed',
        txHash,
        contractAddress: deployment.contractAddress,
        nullifier: proof.publicInputs.nullifier,
        root: proof.publicInputs.root,
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Detect on-chain reverts
    const isRevert =
      message.includes('Nullifier') ||
      message.includes('assert') ||
      message.includes('revert') ||
      message.includes('root');

    output(
      cliError(
        'submit-proof',
        isRevert
          ? `Contract reverted: ${message}`
          : message,
      )
    );
    process.exit(1);
  }
}

function cmdStatus(): void {
  try {
    const treeExists = fs.existsSync('data/tree.json');

    if (!treeExists) {
      output(
        cliSuccess('status', {
          initialized: false,
          message: "No tree found. Run 'zk init' to get started.",
        })
      );
      return;
    }

    const tree = MerkleTree.load();
    const members = loadMembers();
    const nullifiers = loadNullifiers();

    output(
      cliSuccess('status', {
        initialized: true,
        tree: {
          depth: tree.depth,
          capacity: tree.capacity,
          leafCount: tree.leafCount,
          root: tree.root,
          utilizationPercent:
            ((tree.leafCount / tree.capacity) * 100).toFixed(4) + '%',
        },
        members: {
          total: members.members.length,
          secrets: members.members.map((m) => ({
            secret: m.secret.substring(0, 3) + '***',
            leaf: m.leaf.substring(0, 16) + '...',
            index: m.leafIndex,
          })),
        },
        nullifiers: {
          total: nullifiers.nullifiers.length,
          submitted: nullifiers.nullifiers.filter((n) => n.submitted).length,
          pending: nullifiers.nullifiers.filter((n) => !n.submitted).length,
        },
      })
    );
  } catch (err) {
    output(
      cliError('status', err instanceof Error ? err.message : String(err))
    );
    process.exit(1);
  }
}

function cmdHelp(): void {
  const help = `
╔══════════════════════════════════════════════════════════════════════════╗
║                    ZK Allowlist CLI (Midnight)                         ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  COMMANDS:                                                             ║
║                                                                        ║
║  init                                 Initialize Merkle tree           ║
║    --depth <n>                        Tree depth (default: 20)         ║
║    --force true                       Overwrite existing tree          ║
║                                                                        ║
║  add-member --secret <secret>         Add member to allowlist          ║
║                                                                        ║
║  export-root                          Print current Merkle root        ║
║                                                                        ║
║  set-root                             Push local root to on-chain      ║
║                                                                        ║
║  gen-proof                            Generate ZK membership proof     ║
║    --secret <secret>                  Member's secret                  ║
║    --context <context>                Unique context (replay prot.)    ║
║    --output <file>                    Output file (default: proof.json)║
║                                                                        ║
║  verify-proof <proof.json>            Verify proof locally             ║
║                                                                        ║
║  submit-proof <proof.json>            Submit to Midnight contract      ║
║                                                                        ║
║  status                               Show tree/member/nullifier info  ║
║                                                                        ║
║  help                                 Show this help message           ║
║                                                                        ║
╠══════════════════════════════════════════════════════════════════════════╣
║  EXAMPLE FLOW:                                                         ║
║                                                                        ║
║  npx tsx src/zk-cli.ts init                                            ║
║  npx tsx src/zk-cli.ts add-member --secret alice                       ║
║  npx tsx src/zk-cli.ts add-member --secret bob                         ║
║  npx tsx src/zk-cli.ts export-root                                     ║
║  npx tsx src/zk-cli.ts set-root                                        ║
║  npx tsx src/zk-cli.ts gen-proof --secret alice --context mint_v1      ║
║  npx tsx src/zk-cli.ts verify-proof data/proof.json                    ║
║  npx tsx src/zk-cli.ts submit-proof data/proof.json                    ║
║  npx tsx src/zk-cli.ts status                                          ║
║                                                                        ║
╚══════════════════════════════════════════════════════════════════════════╝
`;
  console.log(help);
}

// ─── Main ───

async function main(): Promise<void> {
  switch (command) {
    case 'init':
      cmdInit();
      break;
    case 'add-member':
      cmdAddMember();
      break;
    case 'export-root':
      cmdExportRoot();
      break;
    case 'set-root':
      await cmdSetRoot();
      break;
    case 'gen-proof':
      cmdGenProof();
      break;
    case 'verify-proof':
      cmdVerifyProof();
      break;
    case 'submit-proof':
      await cmdSubmitProof();
      break;
    case 'status':
      cmdStatus();
      break;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      cmdHelp();
      break;
    default:
      output(
        cliError('unknown', `Unknown command: ${command}. Run 'zk help' for usage.`)
      );
      process.exit(1);
  }
}

main().catch((err) => {
  output(
    cliError('fatal', err instanceof Error ? err.message : String(err))
  );
  process.exit(1);
});