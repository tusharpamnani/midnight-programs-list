import { type WalletContext } from './api';
import { Buffer } from 'buffer';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface, type Interface } from 'node:readline/promises';
import { type Logger } from 'pino';
import { type StartedDockerComposeEnvironment, type DockerComposeEnvironment } from 'testcontainers';
import { type EscrowProviders, type DeployedEscrowContract } from './common-types';
import { type Config, StandaloneConfig } from './config';
import * as api from './api';
import { MidnightBech32m, ShieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';
import { getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

let logger: Logger;

const GENESIS_MINT_WALLET_SEED =
  '0000000000000000000000000000000000000000000000000000000000000001';

const BANNER = `
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║              Midnight Private Escrow Demo                    ║
║              ───────────────────────────                     ║
║              Privacy-preserving escrow contract              ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`;

const DIVIDER = '──────────────────────────────────────────────────────────────';

const WALLET_MENU = `
${DIVIDER}
  Wallet Setup
${DIVIDER}
  [1] Create a new wallet
  [2] Restore wallet from seed
  [3] Exit
${'─'.repeat(62)}
> `;

const contractMenu = (dustBalance: string) => `
${DIVIDER}
  Escrow Actions${dustBalance ? `                    DUST: ${dustBalance}` : ''}
${DIVIDER}
  [1] Deploy new escrow contract
  [2] Join existing escrow contract
  [3] Monitor DUST balance
  [4] Exit
${'─'.repeat(62)}
> `;

/* ─── Wallet Setup ───────────────────────────────────────── */

const buildWalletFromSeed = async (config: Config, rli: Interface): Promise<WalletContext> => {
  const seed = await rli.question('Enter your wallet seed: ');
  return await api.buildWalletAndWaitForFunds(config, seed);
};

const buildWallet = async (config: Config, rli: Interface): Promise<WalletContext | null> => {
  if (config instanceof StandaloneConfig) {
    return await api.buildWalletAndWaitForFunds(config, GENESIS_MINT_WALLET_SEED);
  }

  while (true) {
    const choice = await rli.question(WALLET_MENU);
    switch (choice.trim()) {
      case '1':
        return await api.buildFreshWallet(config);
      case '2':
        return await buildWalletFromSeed(config, rli);
      case '3':
        return null;
      default:
        logger.error(`Invalid choice: ${choice}`);
    }
  }
};

/* ─── Contract Interaction ───────────────────────────────── */

const getDustLabel = async (wallet: api.WalletContext['wallet']): Promise<string> => {
  try {
    const dust = await api.getDustBalance(wallet);
    return dust.available.toLocaleString();
  } catch {
    return '';
  }
};

const joinContract = async (
  providers: EscrowProviders,
  rli: Interface,
): Promise<DeployedEscrowContract> => {
  const contractAddress = await rli.question('Enter the contract address (hex): ');
  return await api.joinContract(providers, contractAddress);
};

const startDustMonitor = async (wallet: api.WalletContext['wallet'], rli: Interface): Promise<void> => {
  console.log('');
  const stopPromise = rli.question('  Press Enter to return to menu...\n').then(() => { });
  await api.monitorDustBalance(wallet, stopPromise);
  console.log('');
};

const deployOrJoin = async (
  providers: EscrowProviders,
  walletCtx: api.WalletContext,
  rli: Interface,
): Promise<DeployedEscrowContract | null> => {
  while (true) {
    const dustLabel = await getDustLabel(walletCtx.wallet);
    const choice = await rli.question(contractMenu(dustLabel));

    switch (choice.trim()) {
      case '1':
        try {
          const contract = await api.withStatus('Deploying escrow contract', () =>
            api.deploy(providers),
          );
          console.log(`  Contract deployed at: ${contract.deployTxData.public.contractAddress}\n`);
          return contract;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`\n  ✗ Deploy failed: ${msg}\n`);
        }
        break;

      case '2':
        try {
          return await joinContract(providers, rli);
        } catch (e: any) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`  ✗ Failed to join contract: ${msg}\n`);
          if (e.stack) console.log(e.stack);
        }
        break;

      case '3':
        await startDustMonitor(walletCtx.wallet, rli);
        break;

      case '4':
        return null;

      default:
        console.log(`  Invalid choice: ${choice}`);
    }
  }
};

const interactionMenu = (dustBalance: string) => `
${DIVIDER}
  Contract Interaction${dustBalance ? `                  DUST: ${dustBalance}` : ''}
${DIVIDER}
  [1] Create Escrow (Buyer)
  [2] Accept Escrow (Seller)
  [3] Release Funds (Seller)
  [4] Refund (Buyer)
  [5] Monitor DUST balance
  [6] Show My Escrow Identity (Share with Buyer)
  [7] Disconnect
${'─'.repeat(62)}
> `;

const interactionLoop = async (
  providers: EscrowProviders,
  walletCtx: api.WalletContext,
  contract: DeployedEscrowContract,
  rli: Interface,
): Promise<void> => {
  while (true) {
    const dustLabel = await getDustLabel(walletCtx.wallet);
    const choice = await rli.question(interactionMenu(dustLabel));

    try {
      switch (choice.trim()) {
        case '1': {
          const sellerPkInput = await rli.question('Enter Seller Public Key (hex or bech32m shielded address): ');
          const amountStr = await rli.question('Enter Amount (tNight/DUST units): ');

          let sellerPk: Buffer;

          if (sellerPkInput.startsWith('mn_')) {
            try {
              const mb32 = MidnightBech32m.parse(sellerPkInput);
              // We need valid network ID.
              // We can get it from api.getNetworkId or just pass what parse returns if logic allows.
              // ShieldedAddress.codec.decode requires networkId.
              const networkId = getNetworkId();
              const address = ShieldedAddress.codec.decode(networkId, mb32);

              // We assume escrow uses Encryption Public Key for the seller identity
              sellerPk = Buffer.from(address.encryptionPublicKey.data);
            } catch (e: any) {
              console.log(`  ✗ Failed: ${e.message}`);
              // Print stack trace for debugging
              if (e.stack) console.log(`\n  Stack Trace:\n  ${e.stack}\n`);
              if (e.cause) console.log(`  Cause: ${e.cause}\n`);
              continue;
            }
          } else {
            sellerPk = Buffer.from(sellerPkInput.replace(/^0x/, ''), 'hex');
          }

          const amount = BigInt(amountStr);

          console.log('Note: Secret must be exactly 32 bytes (64 hex chars).');
          const secretHex = await rli.question('Enter Release Secret (32 bytes hex): ');
          const secretBytes = Buffer.from(secretHex.replace(/^0x/, ''), 'hex');

          if (secretBytes.length !== 32) throw new Error(`Secret must be 32 bytes.`);
          if (sellerPk.length !== 32) throw new Error(`Seller PK must be 32 bytes.`);

          console.log(`  Using Seller PK (Encryption Key): ${sellerPk.toString('hex')}`);

          await api.withStatus('Creating Escrow', async () => {
            const nonce = await api.createEscrow(providers, contract, sellerPk, amount, secretBytes);
            console.log(`\n  Escrow Created!\n  Please share the following NONCE and SECRET with the Seller (required for release):\n  NONCE (hex): ${Buffer.from(nonce).toString('hex')}\n  SECRET (hex): ${secretBytes.toString('hex')}\n`);
          });
          break;
        }
        case '2':
          await api.withStatus('Accepting Escrow', () => api.acceptEscrow(providers, contract));
          break;
        case '3':
          console.log('Enter the parameters provided by Buyer:');
          const rAmountStr = await rli.question('Amount: ');
          const rSecretHex = await rli.question('Secret (hex): ');
          const rNonceHex = await rli.question('Nonce (hex): ');

          const rAmount = BigInt(rAmountStr);
          const rSecretBytes = Buffer.from(rSecretHex.replace(/^0x/, ''), 'hex');
          const rNonceBytes = Buffer.from(rNonceHex.replace(/^0x/, ''), 'hex');

          if (rSecretBytes.length !== 32) throw new Error(`Secret must be 32 bytes.`);
          if (rNonceBytes.length !== 32) throw new Error(`Nonce must be 32 bytes.`);

          await api.withStatus('Releasing Funds', () => api.release(providers, contract, rSecretBytes, rNonceBytes, rAmount));
          break;
        case '4':
          await api.withStatus('Refunding', () => api.refund(providers, contract));
          break;
        case '5':
          await startDustMonitor(walletCtx.wallet, rli);
          break;
        case '6': {
          const pk = await api.getEscrowPublicKey(walletCtx);
          console.log(`\n  Your Escrow Public Key (Share this with Buyer):\n  ${pk}\n`);
          break;
        }
        case '7':
          return;
        default:
          console.log(`  Invalid choice: ${choice}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ✗ Error: ${msg}\n`);
    }
  }
};

const mainLoop = async (
  providers: EscrowProviders,
  walletCtx: api.WalletContext,
  rli: Interface,
): Promise<void> => {
  const escrowContract = await deployOrJoin(providers, walletCtx, rli);
  if (escrowContract === null) return;

  console.log(`
${DIVIDER}
  Escrow contract ready.
${DIVIDER}
`);

  await interactionLoop(providers, walletCtx, escrowContract, rli);
};

/* ─── Docker Mapping ─────────────────────────────────────── */

const mapContainerPort = (env: StartedDockerComposeEnvironment, url: string, containerName: string) => {
  const mappedUrl = new URL(url);
  const container = env.getContainer(containerName);
  mappedUrl.port = String(container.getFirstMappedPort());
  return mappedUrl.toString().replace(/\/+$/, '');
};

/* ─── Entry Point ────────────────────────────────────────── */

export const run = async (
  config: Config,
  _logger: Logger,
  dockerEnv?: DockerComposeEnvironment,
): Promise<void> => {
  logger = _logger;
  api.setLogger(_logger);

  console.log(BANNER);

  const rli = createInterface({ input, output, terminal: true });
  let env: StartedDockerComposeEnvironment | undefined;

  try {
    if (dockerEnv !== undefined) {
      env = await dockerEnv.up();

      if (config instanceof StandaloneConfig) {
        config.indexer = mapContainerPort(env, config.indexer, 'counter-indexer');
        config.indexerWS = mapContainerPort(env, config.indexerWS, 'counter-indexer');
        config.node = mapContainerPort(env, config.node, 'counter-node');
        config.proofServer = mapContainerPort(env, config.proofServer, 'counter-proof-server');
      }
    }

    const walletCtx = await buildWallet(config, rli);
    if (walletCtx === null) return;

    try {
      const providers = await api.withStatus('Configuring providers', () =>
        api.configureProviders(walletCtx, config),
      );
      console.log('');
      await mainLoop(providers, walletCtx, rli);
    } finally {
      await walletCtx.wallet.stop();
    }
  } finally {
    rli.close();
    if (env) await env.down();
    logger.info('Goodbye.');
  }
};