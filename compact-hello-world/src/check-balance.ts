/**
 * Check wallet balance on Midnight Preprod network
 */
import * as fs from 'node:fs';
import { WebSocket } from 'ws';
import * as Rx from 'rxjs';
import { Buffer } from 'buffer';

// Midnight SDK imports
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import { unshieldedToken } from '@midnight-ntwrk/ledger-v8';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { createKeystore, InMemoryTransactionHistoryStorage, PublicKey, UnshieldedWallet } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { initWalletWithSeed } from './index.js';

// Enable WebSocket for GraphQL subscriptions
// @ts-expect-error Required for wallet sync
globalThis.WebSocket = WebSocket;

// Set network to undeployed (local)
setNetworkId('undeployed');

// Local network configuration
const INDEXER_PORT = Number.parseInt(process.env['INDEXER_PORT'] ?? '8088', 10);
const NODE_PORT = Number.parseInt(process.env['NODE_PORT'] ?? '9944', 10);
const PROOF_SERVER_PORT = Number.parseInt(process.env['PROOF_SERVER_PORT'] ?? '6300', 10);

const CONFIG = {
  indexer: `http://localhost:${INDEXER_PORT}/api/v3/graphql`,
  indexerWS: `ws://localhost:${INDEXER_PORT}/api/v3/graphql/ws`,
  node: `http://localhost:${NODE_PORT}`,
  proofServer: `http://localhost:${PROOF_SERVER_PORT}`,
  faucetUrl: 'http://localhost:8080',
};

// ─── Wallet Functions ──────────────────────────────────────────────────────────

// Wallet initialization is now handled by initWalletWithSeed in src/index.ts

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                   Wallet Balance Checker                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Check for deployment.json to get seed
  if (!fs.existsSync('deployment.json')) {
    console.error('❌ No deployment.json found! Run: npm run deploy\n');
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync('deployment.json', 'utf-8'));

  if (!deployment.seed) {
    console.error('❌ No wallet seed in deployment.json\n');
    process.exit(1);
  }

  try {
    console.log('  Building wallet...');
    const { wallet, unshieldedKeystore } = await initWalletWithSeed(Buffer.from(deployment.seed, 'hex'));

    console.log('  Syncing with network...');
    const state = await Rx.firstValueFrom(
      wallet.state().pipe(Rx.throttleTime(5000), Rx.filter((s) => s.isSynced)),
    );

    const address = unshieldedKeystore.getBech32Address();
    const tNightBalance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
    const dustBalance = state.dust.balance(new Date());

    console.log('\n─── Wallet Details ─────────────────────────────────────────────\n');
    console.log(`  Address: ${address}`);
    console.log(`  Network: local\n`);

    console.log('─── Balances ───────────────────────────────────────────────────\n');
    console.log(`  tNight: ${tNightBalance.toLocaleString()}`);
    console.log(`  DUST:   ${dustBalance.toLocaleString()}\n`);

    if (tNightBalance === 0n) {
      console.log('─── Need Funds? ────────────────────────────────────────────────\n');
      console.log(`  1. Visit: ${CONFIG.faucetUrl}`);
      console.log(`  2. Paste your address: ${address}`);
      console.log(`  3. Request tokens and wait ~2-5 minutes`);
      console.log(`  4. Run this command again to check balance\n`);
    } else {
      console.log('  ✅ Wallet is funded and ready!\n');
    }

    await wallet.stop();
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
