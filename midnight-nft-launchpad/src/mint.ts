import crypto from 'node:crypto';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { createWallet, createProviders, getCompiledContract, NFTContractModule } from './utils.js';
import { addOwnedToken } from './state.js';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';

export async function mint(seed: string, contractAddress: string, metadata: string) {
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

  const metadataHashBytes = crypto.createHash('sha256').update(metadata).digest();

  console.log(`Minting NFT with metadata: "${metadata}"...`);
  console.log(`Caller Address Hash: ${toHex(callerAddressBytes)}`);
  
  // Read current token ID before mint
  const state = await providers.publicDataProvider.queryContractState(contractAddress);
  const ledgerState = NFTContractModule.ledger(state!.data);
  const tokenIdToMint = ledgerState.nextTokenId.toString();

  console.log('Validating proof and submitting transaction (this may take 20-30 seconds)...');
  const tx = await contract.callTx.mint(metadataHashBytes);

  console.log(`✅ Minted successfully!`);
  console.log(`Transaction: ${tx.public.txId}`);
  console.log(`Token ID: ${tokenIdToMint}`);

  addOwnedToken(tokenIdToMint, toHex(metadataHashBytes), metadata, tx.public.txId);
  console.log(`Saved token #${tokenIdToMint} to local state.`);

  await walletCtx.wallet.stop();
}
