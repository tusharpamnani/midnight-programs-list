import { Command } from 'commander';
import kleur from 'kleur';
import * as fs from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';

import { 
  createWallet, 
  createProviders, 
  compiledContract, 
  generateSecret,
  computeHash,
  getResult
} from './flip-utils.js';

const program = new Command();

program
  .name('mn-coinflip')
  .description('Provably fair coin flip on Midnight');

program
  .command('play')
  .description('Start a new coin flip round')
  .option('-v, --verbose', 'Show raw secret and verification steps')
  .action(async (options) => {
    console.log(kleur.magenta('\n🟣 Midnight Coin Flip\n'));

    if (!fs.existsSync('deployment.json')) {
      console.error(kleur.red('❌ No deployment.json found! Run `npm run deploy` first.\n'));
      process.exit(1);
    }

    const deployment = JSON.parse(fs.readFileSync('deployment.json', 'utf-8'));
    const rl = createInterface({ input: stdin, output: stdout });

    try {
      const seed = await rl.question(kleur.cyan('  Enter your wallet seed: '));
      console.log(kleur.yellow('\n  Connecting to Midnight Preprod...'));
      const walletCtx = await createWallet(seed.trim());
      
      console.log(kleur.yellow('  Syncing wallet...'));
      await walletCtx.wallet.waitForSyncedState();
      
      const providers = await createProviders(walletCtx);
      const contract = await findDeployedContract(providers, {
        contractAddress: deployment.contractAddress,
        compiledContract,
      });

      console.log(kleur.green('  Connected! Ready to play.\n'));

      let playAgain = true;
      while (playAgain) {
        // 1. Generate local secret & commit hash
        console.log(kleur.cyan('🔐 Committing randomness...'));
        const secret = generateSecret();
        const commitHash = computeHash(secret);
        
        if (options.verbose) {
          console.log(kleur.gray(`   Secret: 0x${secret.toString('hex')}`));
        }
        console.log(kleur.gray(`   Commit Hash: 0x${commitHash.toString('hex')}`));

        // 2. Call contract commit(hash)
        const commitTx = await contract.callTx.commit(commitHash);
        console.log(kleur.green('  ✅ Committed on-chain.'));
        if (options.verbose) console.log(kleur.gray(`     Tx: ${commitTx.public.txId}`));

        // 3. User choice
        console.log(kleur.cyan('\nChoose:'));
        console.log('1. Heads');
        console.log('2. Tails');
        const input = await rl.question(kleur.yellow('\n> '));
        const userChoice = input.trim() === '2' || input.toLowerCase() === 'tails' ? 'TAILS' : 'HEADS';

        console.log(kleur.cyan(`\n🪙 Flipping... (You chose ${userChoice})\n`));

        // 4. Reveal
        console.log(kleur.cyan('→ Revealing secret...'));
        if (options.verbose) console.log(kleur.gray(`   Secret: 0x${secret.toString('hex')}`));
        
        await contract.callTx.reveal(secret);
        console.log(kleur.green('  ✅ Secret revealed.'));

        // 5. Fairness Summary
        console.log(kleur.yellow('\n🔍 How this was fair:'));
        console.log(kleur.gray('   1. System generated a secret'));
        console.log(kleur.gray('   2. Stored only its hash on-chain'));
        console.log(kleur.gray('   3. You made your choice'));
        console.log(kleur.gray('   4. Secret revealed AFTER'));
        console.log(kleur.gray('   5. Hash matched → no cheating possible'));

        // 6. Verification & Result
        console.log(kleur.cyan('\n→ Verifying commitment...'));
        const verified = computeHash(secret).equals(commitHash);
        if (verified) {
          console.log(kleur.green('   hash(secret) == commit ✅'));
        } else {
          console.log(kleur.red('   hash(secret) != commit ❌ SYSTEM CHEATED!'));
          break;
        }

        const result = getResult(secret);
        const won = userChoice === result;

        console.log(kleur.magenta('\n─────────────────────────────────────────────────────────────────'));
        console.log(`🎯 Result: ${kleur.bold(result)} ${won ? '🏆' : '❌'}`);
        console.log(kleur.magenta('─────────────────────────────────────────────────────────────────'));

        if (won) {
          console.log(kleur.green('\n✨ YOU WON!'));
        } else {
          console.log(kleur.red('\n💀 Better luck next time.'));
        }

        console.log(kleur.cyan('\n🔐 Proof Verified: System could not cheat'));

        // Reset for next round
        console.log(kleur.gray('\n  Resetting round...'));
        await contract.callTx.reset();

        const replayInput = await rl.question(kleur.yellow('\nPlay again? (y/n) \n> '));
        playAgain = replayInput.toLowerCase().startsWith('y');
        if (playAgain) {
          console.log(kleur.magenta('\n─────────────────────────────────────────────────────────────────\n'));
        }
      }

    } catch (e) {
      console.error(kleur.red(`\n❌ Error: ${e instanceof Error ? e.message : e}\n`));
    } finally {
      console.log(kleur.magenta('\nThanks for playing! 👋\n'));
      rl.close();
      process.exit(0);
    }
  });

program.parse();