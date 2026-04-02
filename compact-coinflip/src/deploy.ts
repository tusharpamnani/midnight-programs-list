import * as fs from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createWallet, createProviders, compiledContract } from './flip-utils.js';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { firstValueFrom, filter } from 'rxjs';
import kleur from 'kleur';

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });
  
  try {
    const seedEnv = process.env.SEED?.trim();
    let seed = seedEnv;

    if (!seed) {
      console.log(kleur.yellow('\n  No $SEED environment variable found.'));
      seed = (await rl.question(kleur.cyan('  Enter your wallet seed: '))).trim();
    }

    if (!seed || seed.length < 1) {
      throw new Error('Seed is required for deployment.');
    }

    console.log(kleur.magenta('\n🚀 Deploying CoinFlip contract...'));
    
    const walletCtx = await createWallet(seed);
    console.log(kleur.yellow('  Syncing wallet...'));
    await walletCtx.wallet.waitForSyncedState();
    
    const providers = await createProviders(walletCtx);
    
    // Wait for enough dust balance
    const state = await firstValueFrom(walletCtx.wallet.state().pipe(filter(s => s.isSynced)));
    const dustBalance = state.dust.balance(new Date());
    console.log(kleur.gray(`  Current DUST: ${dustBalance.toLocaleString()}`));

    if (dustBalance === 0n) {
      console.log(kleur.red('  ❌ Error: Your wallet has 0 DUST. Please fund it first.\n'));
      return;
    }

    console.log(kleur.yellow('  Deploying (this may take 20-30 seconds)...'));
    const contract = await deployContract(providers, {
      compiledContract,
      args: [],
    });

    console.log(kleur.green('\n✅ Deployed Successfully!'));
    console.log(`${kleur.bold('Contract Address:')} ${contract.deployTxData.public.contractAddress}`);

    fs.writeFileSync('deployment.json', JSON.stringify({
      contractAddress: contract.deployTxData.public.contractAddress,
      networkId: 'preprod'
    }, null, 2));
    
    await walletCtx.wallet.stop();
  } finally {
    rl.close();
  }
}

main().catch((e) => {
  console.error(kleur.red(`\n❌ Deployment Failed: ${e instanceof Error ? e.message : e}\n`));
  process.exit(1);
});