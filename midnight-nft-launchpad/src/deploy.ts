import * as fs from 'node:fs';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { createWallet, createProviders, getCompiledContract } from './utils.js';

export async function deploy(seed: string) {
  console.log('Connecting and syncing wallet...');
  const walletCtx = await createWallet(seed);
  await walletCtx.wallet.waitForSyncedState();

  console.log('Setting up providers...');
  const providers = await createProviders(walletCtx);

  console.log('Deploying contract (this may take 30-60 seconds)...');
  const deployed = await deployContract(providers, {
    compiledContract: getCompiledContract(new Uint8Array(32)),
    args: [],
  });

  const contractAddress = deployed.deployTxData.public.contractAddress;
  console.log('✅ Contract deployed successfully!');
  console.log(`Contract Address: ${contractAddress}`);

  const deploymentInfo = {
    contractAddress,
    seed,
    network: 'preprod',
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync('deployment.json', JSON.stringify(deploymentInfo, null, 2));
  console.log('Saved to deployment.json');
  
  await walletCtx.wallet.stop();
}