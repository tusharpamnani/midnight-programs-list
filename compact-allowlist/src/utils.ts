// Shared configuration, wallet creation, and provider setup for the
// ZK Allowlist contract on Midnight Preprod.
//
// Reused by:
//   - deploy.ts   (contract deployment)
//   - zk-cli.ts   (submit-proof → on-chain verifyAndUse)

import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';
import { Buffer } from 'buffer';

import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import {
  createKeystore,
  InMemoryTransactionHistoryStorage,
  PublicKey,
  UnshieldedWallet,
} from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';

import { ensureCompiledArtifacts } from './check-artifacts.js';

// Required for GraphQL subscriptions in Node.
// @ts-expect-error The SDK expects WebSocket on the global scope.
globalThis.WebSocket = WebSocket;

setNetworkId('preprod');

// ─── Network Configuration ───

export const CONFIG = {
  indexer: 'https://indexer.preprod.midnight.network/api/v3/graphql',
  indexerWS: 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws',
  node: 'https://rpc.preprod.midnight.network',
  proofServer: 'http://127.0.0.1:6300',
} as const;

// ─── Contract Artifacts ───

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const zkConfigPath = path.resolve(
  __dirname,
  '..',
  'contracts',
  'managed',
  'zk-allowlist',
);

type ZkAllowlistModule = typeof import('../contracts/managed/zk-allowlist/contract/index.js');

// ─── Witness Type ───
//
// The Compact runtime passes witnesses as plain objects to `new Contract(witnesses)`.
// At runtime each witness is called as: witnesses.getMerkleRoot(context) etc.
// We define the shape as the compiled contract constructor expects it.
// Using `any` for return type avoids fighting the SDK's complex generic inference
// on withWitnesses: the runtime behavior is what matters and it works correctly.

export type ZkAllowlistWitnesses = {
  getMerkleRoot: (...args: any[]) => any;
  getNullifier: (...args: any[]) => any;
};

const zkAllowlistModulePromise = (async () => {
  ensureCompiledArtifacts();
  return import(
    pathToFileURL(path.join(zkConfigPath, 'contract', 'index.js')).href
  ) as Promise<ZkAllowlistModule>;
})();

export const ZkAllowlist = await zkAllowlistModulePromise;

// ─── Compiled Contract Factory ───
//
// CompiledContract.make(tag, ctor) — 2 args only.
// Witnesses attach via .pipe(CompiledContract.withWitnesses(witnesses)).

// The withWitnesses generic inference is complex; we cast to `any` at the call
// site to avoid TypeScript fighting us over the exact Witness<PS, U> tuple shape.
// The runtime contract constructor receives the witnesses object directly and
// calls each function as witnesses.getMerkleRoot(context), etc.

export function createCompiledContract(witnesses: ZkAllowlistWitnesses) {
  return CompiledContract.make('zk-allowlist', ZkAllowlist.Contract).pipe(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    CompiledContract.withWitnesses(witnesses as any),
    CompiledContract.withCompiledFileAssets(zkConfigPath),
  );
}

// ─── Stub Witnesses ───
//
// Used for deployContract() — the proof server never calls witnesses during
// deployment so stubs are never invoked. They just satisfy the constructor.

export const stubWitnesses: ZkAllowlistWitnesses = {
  getMerkleRoot: () => [undefined, new Uint8Array(32)],
  getNullifier: () => [undefined, new Uint8Array(32)],
};

// Pre-built compiled contract with stubs — safe for deployContract().
export const compiledContract = createCompiledContract(stubWitnesses);

// ─── Key Derivation ───

export function deriveKeys(seed: string) {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
  if (hdWallet.type !== 'seedOk') throw new Error('Invalid seed');

  const result = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);

  if (result.type !== 'keysDerived') throw new Error('Key derivation failed');

  hdWallet.hdWallet.clear();
  return result.keys;
}

// ─── Wallet Creation ───

export async function createWallet(seed: string) {
  const keys = deriveKeys(seed);
  const networkId = getNetworkId();

  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], networkId);

  const walletConfig = {
    networkId,
    indexerClientConnection: {
      indexerHttpUrl: CONFIG.indexer,
      indexerWsUrl: CONFIG.indexerWS,
    },
    provingServerUrl: new URL(CONFIG.proofServer),
    relayURL: new URL(CONFIG.node.replace(/^http/, 'ws')),
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
    costParameters: {
      additionalFeeOverhead: 300_000_000_000_000n,
      feeBlocksMargin: 5,
    },
  };

  const wallet = await WalletFacade.init({
    configuration: walletConfig,
    shielded: async (config) =>
      ShieldedWallet(config).startWithSecretKeys(shieldedSecretKeys),
    unshielded: async (config) =>
      UnshieldedWallet(config).startWithPublicKey(
        PublicKey.fromKeyStore(unshieldedKeystore),
      ),
    dust: async (config) =>
      DustWallet(config).startWithSecretKey(
        dustSecretKey,
        ledger.LedgerParameters.initialParameters().dust,
      ),
  });

  await wallet.start(shieldedSecretKeys, dustSecretKey);

  return { seed, wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
}

// ─── Provider Setup ───

export async function createProviders(
  walletCtx: Awaited<ReturnType<typeof createWallet>>,
) {
  const privateStatePassword = process.env.PRIVATE_STATE_PASSWORD?.trim();
  if (!privateStatePassword) {
    throw new Error(
      'Missing PRIVATE_STATE_PASSWORD. Set a strong local encryption password:\n' +
        "export PRIVATE_STATE_PASSWORD='Str0ng!MidnightLocal'",
    );
  }

  const state = await walletCtx.wallet.waitForSyncedState();

  const walletProvider = {
    getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: () => state.shielded.encryptionPublicKey.toHexString(),
    async balanceTx(tx: unknown, ttl?: Date) {
      const recipe = await walletCtx.wallet.balanceUnboundTransaction(
        tx as Parameters<typeof walletCtx.wallet.balanceUnboundTransaction>[0],
        {
          shieldedSecretKeys: walletCtx.shieldedSecretKeys,
          dustSecretKey: walletCtx.dustSecretKey,
        },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );

      const signedRecipe = await walletCtx.wallet.signRecipe(recipe, (payload) =>
        walletCtx.unshieldedKeystore.signData(payload),
      );

      return walletCtx.wallet.finalizeRecipe(signedRecipe);
    },
    submitTx: (tx: ledger.FinalizedTransaction) =>
      walletCtx.wallet.submitTransaction(tx),
  };

  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);
  const accountId = walletCtx.unshieldedKeystore.getBech32Address().toString();

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'zk-allowlist-state',
      accountId,
      privateStoragePasswordProvider: () => privateStatePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(CONFIG.indexer, CONFIG.indexerWS),
    zkConfigProvider: zkConfigProvider as any,
    proofProvider: httpClientProofProvider(CONFIG.proofServer, zkConfigProvider as any),
    walletProvider,
    midnightProvider: walletProvider,
  } as any;
}