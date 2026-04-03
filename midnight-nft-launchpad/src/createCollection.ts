import crypto from 'node:crypto';
import { 
  createWallet, 
  createProviders, 
  deriveKeys, 
  zkConfigPath,
  CONFIG 
} from './utils.js';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { addCollection } from './state.js';

export async function createCollection(
  seed: string, 
  name: string, 
  description: string, 
  maxSupply: number
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

  console.log(`Deploying collection "${name}"...`);
  
  // Pad name/desc to match Bytes<N> exactly if necessary, 
  // though Midnight usually handles this if they are within bounds.
  // We use Buffer for Bytes<32> and Bytes<64>
  const nameBytes = Buffer.alloc(32);
  nameBytes.write(name);
  const descBytes = Buffer.alloc(64);
  descBytes.write(description);

  const deployed = await deployContract(providers, {
    compiledContract: compiledCollection,
    args: [nameBytes, descBytes, BigInt(maxSupply)]
  });

  console.log(`✅ Collection deployed at: ${deployed.deployTxData.public.contractAddress}`);
  
  addCollection({
    id: crypto.randomUUID(),
    name,
    description,
    maxSupply,
    contractAddress: deployed.deployTxData.public.contractAddress,
    creatorAddress: walletAddressString,
    createdAt: new Date().toISOString()
  });

  await walletCtx.wallet.stop();
  return deployed.deployTxData.public.contractAddress;
}
