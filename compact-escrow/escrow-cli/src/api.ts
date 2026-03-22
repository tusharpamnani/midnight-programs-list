/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Escrow, type EscrowPrivateState, witnesses } from '@midnight-ntwrk/counter-contract';
import {
  MidnightBech32m,
  ShieldedAddress,
  ShieldedCoinPublicKey,
  ShieldedEncryptionPublicKey,
} from '@midnight-ntwrk/wallet-sdk-address-format';
import * as ledger from '@midnight-ntwrk/ledger-v7';
import { unshieldedToken } from '@midnight-ntwrk/ledger-v7';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { type MidnightProvider, type WalletProvider } from '@midnight-ntwrk/midnight-js-types';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { HDWallet, Roles, generateRandomSeed } from '@midnight-ntwrk/wallet-sdk-hd';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import {
  createKeystore,
  InMemoryTransactionHistoryStorage,
  PublicKey,
  UnshieldedWallet,
  type UnshieldedKeystore,
} from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { type Logger } from 'pino';
import * as Rx from 'rxjs';
import { WebSocket } from 'ws';
import {
  type EscrowCircuits,
  type EscrowContract,
  type EscrowPrivateStateId,
  type EscrowProviders,
  type DeployedEscrowContract,
} from './common-types';
import { type Config, contractConfig } from './config';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';
import { getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { Buffer } from 'buffer';
import { randomBytes } from 'node:crypto';

export interface WalletContext {
  wallet: WalletFacade;
  shieldedSecretKeys: ledger.ZswapSecretKeys;
  dustSecretKey: ledger.DustSecretKey;
  unshieldedKeystore: UnshieldedKeystore;
}

let logger: Logger;

// Required for GraphQL subscriptions
// @ts-expect-error
globalThis.WebSocket = WebSocket;

/* ---------------------------
   Contract compilation
--------------------------- */

const escrowCompiledContract = CompiledContract.make('escrow', Escrow.Contract).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets(contractConfig.zkConfigPath),
);

/* ---------------------------
   Wallet types
--------------------------- */

export interface WalletContext {
  wallet: WalletFacade;
  shieldedSecretKeys: ledger.ZswapSecretKeys;
  dustSecretKey: ledger.DustSecretKey;
  unshieldedKeystore: UnshieldedKeystore;
}

/* ---------------------------
   Contract lifecycle
--------------------------- */


// Helper to check if proof server is reachable
const checkProofServer = async (url: string) => {
  try {
    const response = await fetch(url + '/health', { method: 'GET' });
    if (!response.ok) throw new Error(`Status ${response.status}`);
  } catch (e: any) {
    logger.error(`Could not connect to proof server at ${url}: ${e.message}`);
    throw new Error(`Proof server is not reachable at ${url}. Please verify it is running (e.g. via 'get-proof-server' or 'docker-compose').`);
  }
};

export const joinContract = async (
  providers: EscrowProviders,
  contractAddress: string,
): Promise<DeployedEscrowContract> => {
  // @ts-ignore
  await checkProofServer(providers.proofProvider.baseUrl || 'http://127.0.0.1:6300');

  const escrowContract = await findDeployedContract(providers, {
    contractAddress,
    compiledContract: escrowCompiledContract,
    privateStateId: 'escrowPrivateState',
    initialPrivateState: {
      secretKey: new Uint8Array(randomBytes(32)),
      releaseSecret: new Uint8Array(randomBytes(32)),
      nonce: new Uint8Array(randomBytes(32)),
    },
  });
  logger.info(`Joined contract at address: ${escrowContract.deployTxData.public.contractAddress}`);
  return escrowContract;
};

export const deploy = async (
  providers: EscrowProviders,
): Promise<DeployedEscrowContract> => {
  logger.info('Deploying escrow contract...');

  // Explicitly check proof server we know from config or providers
  // Since providers.proofProvider is abstract properly, we might need config context, 
  // but looking at `configureProviders`, it uses config.proofServer.
  // We don't have config here easily, but we can guess or try to access it if we exported it?
  // We imported `contractConfig`.
  // Let's rely on the error message bubbling up, or try a simple fetch to localhost:6300 if we suspect that's the default.
  // Actually, let's just use a try/catch block around deployContract with a better error message.

  try {
    const escrowContract = await deployContract(providers, {
      compiledContract: escrowCompiledContract,
      privateStateId: 'escrowPrivateState',
      initialPrivateState: {
        secretKey: new Uint8Array(randomBytes(32)),
        releaseSecret: new Uint8Array(randomBytes(32)),
        nonce: new Uint8Array(randomBytes(32)),
      },
    });
    logger.info(`Deployed contract at address: ${escrowContract.deployTxData.public.contractAddress}`);
    return escrowContract;
  } catch (error: any) {
    logger.error('Deploy failed details:', error);
    if (error.message?.includes('Failed to prove') || error.code === 'ECONNREFUSED') {
      logger.error(' \n!!! HINT: Is the Proof Server running? The CLI expects a proof server at http://127.0.0.1:6300 (default).\n');
    }
    throw error;
  }
};

/* ---------------------------
   Wallet helpers
--------------------------- */

const buildShieldedConfig = ({ indexer, indexerWS, node, proofServer }: Config) => ({
  networkId: getNetworkId(),
  indexerClientConnection: {
    indexerHttpUrl: indexer,
    indexerWsUrl: indexerWS,
  },
  provingServerUrl: new URL(proofServer),
  relayURL: new URL(node.replace(/^http/, 'ws')),
});

const buildUnshieldedConfig = ({ indexer, indexerWS }: Config) => ({
  networkId: getNetworkId(),
  indexerClientConnection: {
    indexerHttpUrl: indexer,
    indexerWsUrl: indexerWS,
  },
  txHistoryStorage: new InMemoryTransactionHistoryStorage(),
});

const buildDustConfig = ({ indexer, indexerWS, node, proofServer }: Config) => ({
  networkId: getNetworkId(),
  costParameters: {
    additionalFeeOverhead: 300_000_000_000_000n,
    feeBlocksMargin: 5,
  },
  indexerClientConnection: {
    indexerHttpUrl: indexer,
    indexerWsUrl: indexerWS,
  },
  provingServerUrl: new URL(proofServer),
  relayURL: new URL(node.replace(/^http/, 'ws')),
});

const deriveKeysFromSeed = (seed: string) => {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
  if (hdWallet.type !== 'seedOk') throw new Error('Failed to initialize HDWallet from seed');

  const derivationResult = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);

  if (derivationResult.type !== 'keysDerived') throw new Error('Failed to derive keys');

  hdWallet.hdWallet.clear();
  return derivationResult.keys;
};

const formatBalance = (balance: bigint): string => balance.toLocaleString();

const waitForSync = (wallet: WalletFacade) =>
  Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(5_000),
      Rx.filter((state) => state.isSynced),
    ),
  );

const waitForFunds = (wallet: WalletFacade): Promise<bigint> =>
  Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(10_000),
      Rx.filter((state) => state.isSynced),
      Rx.map((s) => s.unshielded.balances[unshieldedToken().raw] ?? 0n),
      Rx.filter((balance) => balance > 0n),
    ),
  );

const printWalletSummary = (seed: string, state: any, unshieldedKeystore: UnshieldedKeystore) => {
  const networkId = getNetworkId();
  const unshieldedBalance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;

  // Build the bech32m shielded address from coin + encryption public keys
  const coinPubKey = ShieldedCoinPublicKey.fromHexString(state.shielded.coinPublicKey.toHexString());
  const encPubKey = ShieldedEncryptionPublicKey.fromHexString(state.shielded.encryptionPublicKey.toHexString());
  const shieldedAddress = MidnightBech32m.encode(networkId, new ShieldedAddress(coinPubKey, encPubKey)).toString();

  const DIV = '──────────────────────────────────────────────────────────────';

  console.log(`\n${DIV}\n  Wallet Overview                            Network: ${networkId}\n${DIV}\n  Seed: ${seed}\n${DIV}\n\n  Shielded (ZSwap)\n  └─ Address: ${shieldedAddress}\n\n  Unshielded\n  ├─ Address: ${unshieldedKeystore.getBech32Address()}\n  └─ Balance: ${formatBalance(unshieldedBalance)} tNight\n\n  Dust\n  └─ Address: ${state.dust.dustAddress}\n\n${DIV}`);
};

const registerForDustGeneration = async (
  wallet: WalletFacade,
  unshieldedKeystore: UnshieldedKeystore,
): Promise<void> => {
  const state = await Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s) => s.isSynced)));

  // Check if dust is already available (e.g. from a previous designation)
  if (state.dust.availableCoins.length > 0) {
    const dustBal = state.dust.walletBalance(new Date());
    console.log(`  ✓ Dust tokens already available (${formatBalance(dustBal)} DUST)`);
    return;
  }

  // Only register coins that haven't been designated yet
  const nightUtxos = state.unshielded.availableCoins.filter(
    (coin: any) => coin.meta?.registeredForDustGeneration !== true,
  );
  if (nightUtxos.length === 0) {
    // All coins already registered — just wait for dust to generate
    await withStatus('Waiting for dust tokens to generate', () =>
      Rx.firstValueFrom(
        wallet.state().pipe(
          Rx.throttleTime(5_000),
          Rx.filter((s) => s.isSynced),
          Rx.filter((s) => s.dust.walletBalance(new Date()) > 0n),
        ),
      ),
    );
    return;
  }

  await withStatus(`Registering ${nightUtxos.length} NIGHT UTXO(s) for dust generation`, async () => {
    const recipe = await wallet.registerNightUtxosForDustGeneration(
      nightUtxos,
      unshieldedKeystore.getPublicKey(),
      (payload) => unshieldedKeystore.signData(payload),
    );
    const finalized = await wallet.finalizeRecipe(recipe);
    await wallet.submitTransaction(finalized);
  });

  // Wait for dust to actually generate (balance > 0), not just for coins to appear
  await withStatus('Waiting for dust tokens to generate', () =>
    Rx.firstValueFrom(
      wallet.state().pipe(
        Rx.throttleTime(5_000),
        Rx.filter((s) => s.isSynced),
        Rx.filter((s) => s.dust.walletBalance(new Date()) > 0n),
      ),
    ),
  );
};

export const buildWalletAndWaitForFunds = async (config: Config, seed: string): Promise<WalletContext> => {
  console.log('');

  // Derive HD keys and initialize the three sub-wallets
  const { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore } = await withStatus(
    'Building wallet',
    async () => {
      const keys = deriveKeysFromSeed(seed);
      const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
      const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
      const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], getNetworkId());

      const shieldedWallet = ShieldedWallet(buildShieldedConfig(config)).startWithSecretKeys(shieldedSecretKeys);
      const unshieldedWallet = UnshieldedWallet(buildUnshieldedConfig(config)).startWithPublicKey(
        PublicKey.fromKeyStore(unshieldedKeystore),
      );
      const dustWallet = DustWallet(buildDustConfig(config)).startWithSecretKey(
        dustSecretKey,
        ledger.LedgerParameters.initialParameters().dust,
      );

      const wallet = new WalletFacade(shieldedWallet, unshieldedWallet, dustWallet);
      await wallet.start(shieldedSecretKeys, dustSecretKey);

      return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
    },
  );

  // Show seed and unshielded address immediately so user can fund via faucet while syncing
  const networkId = getNetworkId();
  const DIV = '──────────────────────────────────────────────────────────────';
  console.log(`\n${DIV}\n  Wallet Overview                            Network: ${networkId}\n${DIV}\n  Seed: ${seed}\n\n  Unshielded Address (send tNight here):\n  ${unshieldedKeystore.getBech32Address()}\n\n  Fund your wallet with tNight from the Preprod faucet:\n  https://faucet.preprod.midnight.network/\n${DIV}\n`);

  // Wait for the wallet to sync with the network
  const syncedState = await withStatus('Syncing with network', () => waitForSync(wallet));

  // Display the full wallet summary with all addresses and balances
  printWalletSummary(seed, syncedState, unshieldedKeystore);

  // Check if wallet has funds; if not, wait for incoming tokens
  const balance = syncedState.unshielded.balances[unshieldedToken().raw] ?? 0n;
  if (balance === 0n) {
    const fundedBalance = await withStatus('Waiting for incoming tokens', () => waitForFunds(wallet));
    console.log(`    Balance: ${formatBalance(fundedBalance)} tNight\n`);
  }

  // Register NIGHT UTXOs for dust generation (required for tx fees on Preprod/Preview)
  await registerForDustGeneration(wallet, unshieldedKeystore);

  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
};

export const buildFreshWallet = async (config: Config): Promise<WalletContext> =>
  buildWalletAndWaitForFunds(config, toHex(Buffer.from(generateRandomSeed())));

/* ---------------------------
   Provider bridge
--------------------------- */

export const createWalletAndMidnightProvider = async (
  ctx: WalletContext,
): Promise<WalletProvider & MidnightProvider> => {
  const state = await Rx.firstValueFrom(ctx.wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  return {
    getCoinPublicKey() {
      return state.shielded.coinPublicKey.toHexString();
    },
    getEncryptionPublicKey() {
      return state.shielded.encryptionPublicKey.toHexString();
    },
    async balanceTx(tx, ttl?) {
      const recipe = await ctx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      return ctx.wallet.finalizeRecipe(recipe);
    },
    submitTx(tx) {
      return ctx.wallet.submitTransaction(tx) as any;
    },
  };
};

/* ---------------------------
   Providers
--------------------------- */

export const configureProviders = async (ctx: WalletContext, config: Config) => {
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(ctx);
  const zkConfigProvider = new NodeZkConfigProvider<EscrowCircuits>(contractConfig.zkConfigPath);

  return {
    privateStateProvider: levelPrivateStateProvider<typeof EscrowPrivateStateId>({
      privateStateStoreName: contractConfig.privateStateStoreName,
      walletProvider: walletAndMidnightProvider,
    }),
    publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proofServer, zkConfigProvider),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};

/* ---------------------------
   Helpers
--------------------------- */

export const withStatus = async <T>(message: string, fn: () => Promise<T>): Promise<T> => {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r  ${frames[i++ % frames.length]} ${message}`);
  }, 80);
  try {
    const result = await fn();
    clearInterval(interval);
    process.stdout.write(`\r  ✓ ${message}\n`);
    return result;
  } catch (e) {
    clearInterval(interval);
    process.stdout.write(`\r  ✗ ${message}\n`);
    throw e;
  }
};

export const getDustBalance = async (
  wallet: WalletFacade,
): Promise<{ available: bigint; pending: bigint; availableCoins: number; pendingCoins: number }> => {
  const state = await Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  const available = state.dust.walletBalance(new Date());
  const availableCoins = state.dust.availableCoins.length;
  const pendingCoins = state.dust.pendingCoins.length;
  // Sum pending coin initial values for a rough pending balance
  const pending = state.dust.pendingCoins.reduce((sum, c) => sum + c.initialValue, 0n);
  return { available, pending, availableCoins, pendingCoins };
};

export const monitorDustBalance = async (wallet: WalletFacade, stopSignal: Promise<void>): Promise<void> => {
  let stopped = false;
  void stopSignal.then(() => {
    stopped = true;
  });

  const sub = wallet
    .state()
    .pipe(
      Rx.throttleTime(5_000),
      Rx.filter((s) => s.isSynced),
    )
    .subscribe((state) => {
      if (stopped) return;

      const now = new Date();
      const available = state.dust.walletBalance(now);
      const availableCoins = state.dust.availableCoins.length;
      const pendingCoins = state.dust.pendingCoins.length;

      const registeredNight = state.unshielded.availableCoins.filter(
        (coin: any) => coin.meta?.registeredForDustGeneration === true,
      ).length;
      const totalNight = state.unshielded.availableCoins.length;

      let status = '';
      if (pendingCoins > 0) {
        status = '(generating...)';
      } else if (registeredNight < totalNight) {
        status = `(${totalNight - registeredNight} NIGHT UTXOs not registered)`;
      }

      process.stdout.write(
        `\r  DUST: ${available.toLocaleString()} (${availableCoins} coins, ${pendingCoins} pending) ${status}`.padEnd(80),
      );
    });

  await stopSignal;
  sub.unsubscribe();
  process.stdout.write('\n');
};

export const getEscrowPublicKey = async (ctx: WalletContext): Promise<string> => {
  const state = await Rx.firstValueFrom(ctx.wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  return state.shielded.encryptionPublicKey.toHexString();
};

export const createEscrow = async (
  providers: EscrowProviders,
  contract: DeployedEscrowContract,
  sellerPk: Buffer,
  amount: bigint,
  secretBytes: Buffer,
): Promise<Uint8Array> => {
  logger.info("Initializing escrow...");
  const nonce = randomBytes(32);

  const currentState = await providers.privateStateProvider.get('escrowPrivateState');
  await providers.privateStateProvider.set('escrowPrivateState', {
    secretKey: currentState?.secretKey ?? new Uint8Array(32),
    nonce: new Uint8Array(nonce),
    releaseSecret: new Uint8Array(secretBytes),
    amount,
  });

  const tx = await contract.callTx.createEscrow(
    new Uint8Array(sellerPk),
    amount,
  );

  logger.info(`Transaction submitted.`);
  return nonce;
};

export const acceptEscrow = async (providers: EscrowProviders, contract: DeployedEscrowContract) => {
  logger.info('Accepting escrow...');
  const tx = await contract.callTx.acceptEscrow();
  logger.info('Transaction submitted.');
};

export const release = async (
  providers: EscrowProviders,
  contract: DeployedEscrowContract,
  rSecretBytes: Buffer,
  rNonceBytes: Buffer,
  rAmount: bigint,
) => {
  logger.info('Releasing funds...');
  const currentState = await providers.privateStateProvider.get('escrowPrivateState');
  await providers.privateStateProvider.set('escrowPrivateState', {
    secretKey: currentState?.secretKey ?? new Uint8Array(32),
    releaseSecret: new Uint8Array(rSecretBytes),
    nonce: new Uint8Array(rNonceBytes),
    amount: rAmount,
  });
  const tx = await contract.callTx.release();
  logger.info(`Transaction submitted.`);
};

export const refund = async (providers: EscrowProviders, contract: DeployedEscrowContract) => {
  logger.info('Refunding funds...');
  const tx = await contract.callTx.refund();
  logger.info(`Transaction submitted.`);
};

export function setLogger(_logger: Logger) {
  logger = _logger;
}