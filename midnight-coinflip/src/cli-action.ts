import * as fs from 'node:fs';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { createWallet, createProviders, compiledContract, generateSecret, computeHash, getResult } from './flip-utils.js';

// Read arguments
const command = process.argv[2];

// Use a fixed system "house" wallet for testing
const SEED = "57bb166cb6bbf3a6cb5e93a26043e3e2d3c830b63b85286fe97619456a2a23f2";
const PASSWORD = "This1s@StrongPassworddddd"

async function run() {
  try {
    const deployment = JSON.parse(fs.readFileSync('deployment.json', 'utf-8'));
    const walletCtx = await createWallet(SEED);
    await walletCtx.wallet.waitForSyncedState();
    const providers = await createProviders(walletCtx);
    const contract = await findDeployedContract(providers, {
      contractAddress: deployment.contractAddress,
      compiledContract,
    });

    if (command === 'commit') {
      const secret = generateSecret();
      const commitHash = computeHash(secret);
      
      const commitTx = await contract.callTx.commit(commitHash);
      
      // Output just the JSON
      console.log(JSON.stringify({ 
        secret: secret.toString('hex'), 
        commitHash: commitHash.toString('hex'),
        txId: commitTx.public.txId
      }));
    } else if (command === 'reveal') {
      const secretHex = process.argv[3];
      const secret = Buffer.from(secretHex, 'hex');
      
      const revealTx = await contract.callTx.reveal(secret);
      
      console.log(JSON.stringify({ 
        success: true,
        txId: revealTx.public.txId
      }));
    } else if (command === 'reset') {
      const resetTx = await contract.callTx.reset();
      console.log(JSON.stringify({ success: true }));
    } else {
      console.error(JSON.stringify({ error: `Unknown command: ${command}` }));
      process.exit(1);
    }
  } catch(e: any) {
    console.error(JSON.stringify({ error: e.message || String(e) }));
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

run();
