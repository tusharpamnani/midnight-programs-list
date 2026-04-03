import * as fs from 'node:fs';
import crypto from 'node:crypto';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { 
  createWallet, 
  createProviders, 
  zkConfigPath,
  CONFIG 
} from './utils.js';
import { addOwnedToken } from './state.js';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CompiledContract } from '@midnight-ntwrk/compact-js';

export async function mintFromCollection(
  seed: string, 
  contractAddress: string, 
  metadata: string
) {
  const walletCtx = await createWallet(seed);
  await walletCtx.wallet.waitForSyncedState();
  const walletAddressString = walletCtx.unshieldedKeystore.getBech32Address().toString();
  const callerAddressBytes = crypto.createHash('sha256').update(walletAddressString).digest();

  // Load specifically the collection contract ZK assets
  const collectionZkPath = path.resolve(path.dirname(zkConfigPath), 'collection');
  const providers = await createProviders(walletCtx, collectionZkPath);
  
  const collectionModule = await import(pathToFileURL(path.join(collectionZkPath, 'contract', 'index.js')).href);
  
  const CollectionCtor = collectionModule.Contract as any;
  const compiledCollection = CompiledContract.make('collection', CollectionCtor).pipe(
    CompiledContract.withWitnesses({
      callerAddress: (context: any) => [context.privateState as never, callerAddressBytes]
    }),
    CompiledContract.withCompiledFileAssets(collectionZkPath),
  ) as any;

  const contract = await findDeployedContract(providers, {
    contractAddress,
    compiledContract: compiledCollection,
  });

  const metadataHashBytes = crypto.createHash('sha256').update(metadata).digest();

  console.log(`Minting from collection ${contractAddress}...`);
  
  // Safety check: ensure they aren't using the base contract address with collection logic
  try {
    const deployment = JSON.parse(fs.readFileSync('deployment.json', 'utf-8'));
    if (contractAddress === deployment.contractAddress) {
      throw new Error(`Address ${contractAddress} is the BASE contract. You cannot use 'mint-from-collection' with it. Please CREATE and SELECT a collection in the UI first.`);
    }
  } catch (e: any) {
    if (e.message.includes('BASE contract')) throw e;
    // deployment.json might not exist, proceed anyway
  }

  // Read current supply
  const state = await providers.publicDataProvider.queryContractState(contractAddress);
  let ledgerState;
  try {
    ledgerState = collectionModule.ledger(state!.data);
  } catch (err: any) {
    throw new Error(`Failed to parse ledger: ${err.message}. You are likely passing the address of a contract that was not deployed with the 'collection.compact' schema. (idx: 5 >= 3 indicates it has 3 entries while we expect 7).`);
  }
  const tokenIdToMint = ledgerState.nextTokenId.toString();

  const tx = await (contract as any).callTx.mint(metadataHashBytes);

  console.log(`✅ Minted successfully from collection!`);
  console.log(`Transaction: ${tx.public.txId}`);
  console.log(`Token ID: ${tokenIdToMint}`);

  addOwnedToken(tokenIdToMint, toHex(metadataHashBytes), metadata, tx.public.txId, contractAddress);
  
  await walletCtx.wallet.stop();
}
