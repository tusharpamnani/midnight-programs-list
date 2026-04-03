import crypto from 'node:crypto';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { createWallet, createProviders, getCompiledContract, NFTContractModule } from './utils.js';
import { loadState, removeOwnedToken } from './state.js';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';

export async function transfer(seed: string, contractAddress: string, tokenIdStr: string, recipientAddress: string) {
  const tokenState = loadState().ownedTokens[tokenIdStr];
  if (!tokenState) {
    throw new Error(`Token #${tokenIdStr} is not found in your local state. You can only transfer tokens you own and have metadata for.`);
  }

  console.log(`Transferring Token #${tokenIdStr} to ${recipientAddress}...`);
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
  const newOwnerBytes = crypto.createHash('sha256').update(recipientAddress).digest();
  const tokenId = BigInt(tokenIdStr);

  console.log('Validating proof and submitting transaction (this may take 20-30 seconds)...');
  const tx = await contract.callTx.transfer(tokenId, newOwnerBytes, metadataHashBytes);

  console.log(`✅ Transferred successfully!`);
  console.log(`Transaction: ${tx.public.txId}`);

  removeOwnedToken(tokenIdStr);
  console.log(`Removed token #${tokenIdStr} from local state.`);

  await walletCtx.wallet.stop();
}
