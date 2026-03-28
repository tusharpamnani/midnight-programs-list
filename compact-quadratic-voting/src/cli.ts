import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import * as Rx from 'rxjs';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import {
  createWallet,
  createProviders,
  compiledContract,
  createCompiledContract,
  buildVoteWitnesses,
  QuadraticVoting,
} from './utils.js';
import { ensureCompiledArtifacts } from './check-artifacts.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function deriveVoterId(seed: string): Uint8Array {
  return new Uint8Array(
    crypto.createHash('sha256').update(`voter-id:${seed}`).digest()
  );
}


// ─── Main CLI Script ───────────────────────────────────────────────────────────

async function main() {
  ensureCompiledArtifacts();

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║           Quadratic Voting CLI (Midnight)               ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  if (!fs.existsSync('deployment.json')) {
    console.error('No deployment.json found! Run `npm run deploy` first.\n');
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync('deployment.json', 'utf-8'));
  console.log(`  Contract: ${deployment.contractAddress}\n`);

  const rl = createInterface({ input: stdin, output: stdout });

  try {
    const seed = await rl.question('  Enter your wallet seed: ');
    const trimmedSeed = seed.trim();

    console.log('\n  Connecting to Midnight Preprod...');
    const walletCtx = await createWallet(trimmedSeed);

    console.log('  Syncing wallet...');
    await walletCtx.wallet.waitForSyncedState();

    console.log('  Setting up providers...');
    const providers = await createProviders(walletCtx);

    // Derive this voter's stable identity from their seed
    const voterId = deriveVoterId(trimmedSeed);

    // compiledContract has stub witnesses — fine for commit() which has no witnesses
    console.log('  Joining contract...');
    const contract = await findDeployedContract(providers, {
      contractAddress: deployment.contractAddress,
      compiledContract,
    });

    console.log('  Connected!\n');

    // Sync commitment from ledger so the user doesn't have to commit again on restart
    console.log('  Syncing commitment from ledger...');
    let committedTokens = 0n;
    const initialState = await providers.publicDataProvider.queryContractState(
      deployment.contractAddress
    );
    if (initialState) {
      const ledgerState = QuadraticVoting.ledger(initialState.data);
      const commitment = ledgerState.committed_tokens.lookup(voterId);
      if (commitment !== undefined) {
        committedTokens = commitment;
        console.log(`  Found existing commitment: ${committedTokens} tokens`);
      }
    }
    console.log('');

    let running = true;
    while (running) {
      const dust = (
        await Rx.firstValueFrom(
          walletCtx.wallet.state().pipe(Rx.filter((s) => s.isSynced))
        )
      ).dust.balance(new Date());

      console.log('─────────────────────────────────────────────────────────────────');
      console.log(`  DUST: ${dust.toLocaleString()} | Committed: ${committedTokens}`);
      console.log('─────────────────────────────────────────────────────────────────');
      const choice = await rl.question(
        '  [1] Commit Tokens\n  [2] Vote (Quadratic)\n  [3] View Global Tally\n  [4] Exit\n  > '
      );

      switch (choice.trim()) {

        // ── Commit ────────────────────────────────────────────────────────────
        case '1': {
          try {
            const input = await rl.question('\n  Enter tokens to commit: ');
            const amount = parseInt(input.trim());
            if (isNaN(amount) || amount <= 0) throw new Error('Enter a positive number');

            console.log('  Committing tokens to ZK circuit...\n');

            // commit(voter_id: Bytes<32>, tokens: Uint<64>)
            // voter_id is public: identifies this voter's ledger slot
            // tokens is public: the amount being committed
            const tx = await contract.callTx.commit(voterId, BigInt(amount));
            committedTokens = BigInt(amount);

            console.log(`  ✅ Tokens committed!`);
            console.log(`  Transaction: ${tx.public.txId}\n`);
          } catch (e) {
            console.error(`  ❌ Error: ${e instanceof Error ? e.message : e}\n`);
          }
          break;
        }

        // ── Vote ──────────────────────────────────────────────────────────────
        case '2': {
          try {
            if (committedTokens === 0n) {
              console.log('\n  ⚠️  Commit tokens first!\n');
              break;
            }

            const sqrtWeight = BigInt(Math.floor(Math.sqrt(Number(committedTokens))));
            const wSquared   = sqrtWeight * sqrtWeight;

            console.log(`\n  Quadratic weight: floor(sqrt(${committedTokens})) = ${sqrtWeight}`);
            console.log('  Casting private vote (generating ZK proof)...\n');

            // For vote() we need real witnesses: build a fresh compiled contract
            // instance with the actual private values the proof server will use.
            // The proof enforces w² ≤ tokens < (w+1)² in ZK.
            const voteContract = await findDeployedContract(providers, {
              contractAddress: deployment.contractAddress,
              compiledContract: createCompiledContract(
                buildVoteWitnesses(
                  voterId,
                  committedTokens,
                  sqrtWeight,
                  wSquared,
                )
              ),
            });

            // vote() takes no arguments: nullifier is computed inside in ZK.
            const tx = await voteContract.callTx.vote();

            console.log(`  ✅ Vote cast successfully!`);
            console.log(`  Weight added to tally: ${sqrtWeight}`);
            console.log(`  Transaction: ${tx.public.txId}\n`);
          } catch (e) {
            console.error(`  ❌ Error: ${e instanceof Error ? e.message : e}\n`);
          }
          break;
        }

        // ── View Tally ────────────────────────────────────────────────────────
        case '3': {
          try {
            console.log('\n  Fetching tally from ledger...');
            const state = await providers.publicDataProvider.queryContractState(
              deployment.contractAddress
            );
            if (state) {
              const ledgerState = QuadraticVoting.ledger(state.data);
              // total_votes is a Counter: in the TS ledger projection it is a
              // bigint directly, not an object. No .read() call needed.
              const tally = ledgerState.total_votes as unknown as bigint;
              console.log(`  Global Weighted Tally: ${tally}\n`);
            } else {
              console.log('  No state found.\n');
            }
          } catch (e) {
            console.error(`  ❌ Error: ${e instanceof Error ? e.message : e}\n`);
          }
          break;
        }

        case '4':
          running = false;
          break;

        default:
          console.log('  Unknown option.\n');
      }
    }

    await walletCtx.wallet.stop();
    console.log('\n  Goodbye!\n');
  } finally {
    rl.close();
  }
}

main().catch(console.error);