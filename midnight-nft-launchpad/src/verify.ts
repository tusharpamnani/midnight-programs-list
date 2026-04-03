import crypto from 'node:crypto';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { createWallet, createProviders, getCompiledContract, NFTContractModule } from './utils.js';
import { loadState } from './state.js';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';

export async function verify(seed: string, contractAddress: string, tokenIdStr: string) {
  const tokenState = loadState().ownedTokens[tokenIdStr];
  if (!tokenState) {
    throw new Error(`Token #${tokenIdStr} is not found in your local state. You need the metadata to prove ownership.`);
  }

  console.log(`Verifying Ownership of Token #${tokenIdStr}...`);
  console.log('Connecting and syncing wallet...');
  const walletCtx = await createWallet(seed);
  await walletCtx.wallet.waitForSyncedState();

  console.log('Setting up providers...');
  const providers = await createProviders(walletCtx);

  const walletAddressString = walletCtx.unshieldedKeystore.getBech32Address().toString();
  const callerAddressBytes = crypto.createHash('sha256').update(walletAddressString).digest();

  const contract = await findDeployedContract(providers, {
    contractAddress,
    compiledContract: getCompiledContract(callerAddressBytes),
  });

  const metadataHashBytes = Buffer.from(tokenState.metadataHash, 'hex');
  const tokenId = BigInt(tokenIdStr);

  console.log('Validating proof and submitting transaction (this may take 20-30 seconds)...');
  const tx = await contract.callTx.verifyOwnership(tokenId, metadataHashBytes);

  console.log(`✅ Ownership verified successfully! You own Token #${tokenIdStr}.`);
  console.log(`Transaction: ${tx.public.txId}`);

  await walletCtx.wallet.stop();
}
