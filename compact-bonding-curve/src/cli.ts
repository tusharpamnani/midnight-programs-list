import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import * as fs from 'node:fs';
import * as Rx from 'rxjs';
import { Buffer } from 'node:buffer';
import chalk from 'chalk';
import logSymbols from 'log-symbols';
import { bech32m } from 'bech32';

// Midnight SDK imports
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';

// Shared utilities from the utils.ts file
import {
  createWallet,
  createProviders,
  compiledContract,
  BondingCurve,
  normalizeAddress
} from './utils.js';
import { BondingCurveMath } from './math.js';

// ─── Main CLI Script ───────────────────────────────────────────────────────────

async function main() {
  console.log(chalk.bold.magenta('\n╔══════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.magenta('║           Bonding Curve Market CLI (Preprod)             ║'));
  console.log(chalk.bold.magenta('╚══════════════════════════════════════════════════════════╝\n'));

  // Check for deployment.json
  if (!fs.existsSync('deployment.json')) {
    console.error(logSymbols.error, 'No deployment.json found! Run `npm run deploy` first.\n');
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync('deployment.json', 'utf-8'));
  console.log(`${chalk.cyan('  Contract Address:')} ${deployment.contractAddress}\n`);

  const rl = createInterface({ input: stdin, output: stdout });

  try {
    // Get wallet seed
    const seed = await rl.question(chalk.yellow('  Enter your wallet seed: '));

    console.log('\n  Connecting to Midnight Preprod...');
    const walletCtx = await createWallet(seed.trim());

    console.log('  Syncing wallet...');
    await Rx.firstValueFrom(
      walletCtx.wallet.state().pipe(
        Rx.throttleTime(5000),
        Rx.filter((s) => s.isSynced)
      )
    );

    console.log('  Setting up providers...');
    const providers = await createProviders(walletCtx);

    const userUnshieldedAddress = String(walletCtx.unshieldedKeystore.getBech32Address());
    const userAddress = normalizeAddress(userUnshieldedAddress);

    console.log('  Joining contract...');
    const contract = await findDeployedContract(providers, {
      contractAddress: deployment.contractAddress,
      compiledContract,
      privateStateId: 'bondingCurveState',
      initialPrivateState: { address: userAddress },
    });

    console.log(logSymbols.success, 'Connected!\n');

    // Main menu loop
    let running = true;
    while (running) {
      const state = await Rx.firstValueFrom(
        walletCtx.wallet.state().pipe(Rx.filter((s) => s.isSynced))
      );
      const dust = state.dust.walletBalance(new Date());

      console.log(chalk.gray('─────────────────────────────────────────────────────────────────'));
      console.log(`${chalk.yellow('  DUST Balance:')} ${dust.toLocaleString()}`);

      const ledgerData = await providers.publicDataProvider.queryContractState(deployment.contractAddress);
      if (ledgerData) {
        try {
          const ledger = BondingCurve.ledger(ledgerData.data);
          let myBalance = 0n;
          try {
            if (ledger.balances.member(userAddress)) {
              myBalance = ledger.balances.lookup(userAddress);
            }
          } catch (err) {
            // Member/lookup might fail if map state is not fully available in public ledger snapshot
          }
          console.log(`${chalk.cyan('  Token Supply:')} ${ledger.totalSupply} | ${chalk.cyan('Reserve:')} ${ledger.reserveBalance}`);
          console.log(`${chalk.green('  My Tokens:  ')} ${myBalance}`);
        } catch (err) {
          console.log(chalk.yellow('  (Could not fetch detailed market state from ledger)'));
        }
      }

      console.log(chalk.gray('─────────────────────────────────────────────────────────────────'));
      const choice = await rl.question(
        '  [1] Buy Tokens\n  [2] Sell Tokens\n  [3] Transfer Tokens\n  [4] Market State\n  [5] Exit\n  > '
      );

      switch (choice.trim()) {
        case '1':
          try {
            const amountStr = await rl.question('\n  How many tokens to buy? ');
            const n = BigInt(amountStr);
            if (n <= 0n) throw new Error("Amount must be greater than zero");

            // Fetch current state for a quote
            const ledgerData = await providers.publicDataProvider.queryContractState(deployment.contractAddress);
            if (!ledgerData) throw new Error("Failed to fetch ledger state");
            const ledger = BondingCurve.ledger(ledgerData.data);

            const cost = BondingCurveMath.calculateMintCost(ledger.totalSupply, n, ledger.curveSlope);
            const currentPrice = BondingCurveMath.calculatePrice(ledger.totalSupply, ledger.curveSlope);
            const maxCost = (cost * 110n) / 100n;

            console.log(chalk.magenta('\n  --- Trade Preview ---'));
            console.log(`  Tokens to Buy:   ${n}`);
            console.log(`  Spot Price:      ${currentPrice} DUST`);
            console.log(`  Est. Total Cost: ${cost} DUST`);
            console.log(`  Max Cost Limit:  ${maxCost} DUST (+10% slippage tolerance)`);
            console.log(chalk.magenta('  ---------------------\n'));

            const confirm = await rl.question('  Confirm purchase? (y/n) ');
            if (confirm.toLowerCase() === 'y') {
              console.log('  Executing buy (30-60 seconds)...\n');
              const tx = await contract.callTx.buy(n, maxCost);
              console.log(logSymbols.success, `Tokens purchased! Tx: ${tx.public.txId}`);
            }
          } catch (e: any) {
            const errStr = e.toString();
            if (errStr.includes("exceeds maxCost")) {
               console.log(chalk.red('\n  Trade failed: Slippage tolerance exceeded. Curve price moved or cost calculation misaligned.'));
            } else if (errStr.includes("expected a cell")) {
               console.log(chalk.red('\n  Trade failed: Arithmetic or map lookup error in circuit.'));
            } else {
               console.error(logSymbols.error, chalk.red(`Error: ${e instanceof Error ? e.message : e}`));
            }
          }
          break;

        case '2':
          try {
            const amountStr = await rl.question('\n  How many tokens to sell? ');
            const n = BigInt(amountStr);
            if (n <= 0n) throw new Error("Amount must be greater than zero");

            const ledgerData = await providers.publicDataProvider.queryContractState(deployment.contractAddress);
            if (!ledgerData) throw new Error("Failed to fetch ledger state");
            const ledger = BondingCurve.ledger(ledgerData.data);

            const refund = BondingCurveMath.calculateBurnRefund(ledger.totalSupply, n, ledger.curveSlope);
            const currentPrice = BondingCurveMath.calculatePrice(ledger.totalSupply, ledger.curveSlope);
            const minRefund = (refund * 90n) / 100n;

            console.log(chalk.magenta('\n  --- Trade Preview ---'));
            console.log(`  Tokens to Sell:  ${n}`);
            console.log(`  Spot Price:      ${currentPrice} DUST`);
            console.log(`  Est. Refund:     ${refund} DUST`);
            console.log(`  Min Refund Lim:  ${minRefund} DUST (-10% slippage tolerance)`);
            console.log(chalk.magenta('  ---------------------\n'));

            const confirm = await rl.question('  Confirm sale? (y/n) ');
            if (confirm.toLowerCase() === 'y') {
              console.log('  Executing sell (30-60 seconds)...\n');
              const tx = await contract.callTx.sell(n, minRefund);
              console.log(logSymbols.success, `Tokens sold! Tx: ${tx.public.txId}`);
            }
          } catch (e: any) {
             const errStr = e.toString();
             if (errStr.includes("below minRefund")) {
                 console.log(chalk.red('\n  Trade failed: Slippage tolerance exceeded. Curve price dropped or estimate misaligned.'));
             } else if (errStr.includes("Insufficient token balance")) {
                 console.log(chalk.red('\n  Trade failed: You do not own enough tokens.'));
             } else {
                 console.error(logSymbols.error, chalk.red(`Error: ${e instanceof Error ? e.message : e}`));
             }
          }
          break;

        case '3':
          try {
            const bech32AddressStr = await rl.question('\n  Recipient Address (mn_addr...): ');
            const amountStr = await rl.question('  Amount to transfer: ');
            const amount = BigInt(amountStr);
            if (amount <= 0n) throw new Error("Amount must be greater than zero");

            // Client-side balance check
            const ledgerData = await providers.publicDataProvider.queryContractState(deployment.contractAddress);
            if (!ledgerData) throw new Error("Failed to fetch ledger state");
            
            const ledger = BondingCurve.ledger(ledgerData.data);
            const myBalance = ledger.balances.member(userAddress) ? ledger.balances.lookup(userAddress) : 0n;
            
            if (amount > myBalance) {
                console.log(chalk.red(`\n  Insufficient balance. You only have ${myBalance} tokens.`));
                break;
            }

            // Normalize bech32 address to its underlying hex identity key (32 bytes)
            const toBuffer = normalizeAddress(bech32AddressStr);

            console.log('  Executing transfer...\n');
            const tx = await contract.callTx.transfer(toBuffer, amount);
            console.log(logSymbols.success, `Transfer complete! TxId: ${tx.public.txId}`);
          } catch (e: any) {
            console.error(logSymbols.error, chalk.red(`Error: Invalid address or transfer failed (${e.message})`));
          }
          break;

        case '4':
          try {
            const ledgerData = await providers.publicDataProvider.queryContractState(deployment.contractAddress);
            if (ledgerData) {
              const ledger = BondingCurve.ledger(ledgerData.data);
              console.log(chalk.bold.blue('\n--- Detailed Market State ---'));
              console.log(`${chalk.cyan('Total Supply:   ')} ${ledger.totalSupply}`);
              console.log(`${chalk.cyan('Reserve Balance:')} ${ledger.reserveBalance}`);
              console.log(`${chalk.cyan('Curve Slope:   ')} ${ledger.curveSlope}`);
              console.log(`${chalk.cyan('Paused:        ')} ${ledger.paused}`);
              console.log(`${chalk.cyan('Supply Cap:    ')} ${ledger.supplyCap === 0n ? 'Uncapped' : ledger.supplyCap}`);
              console.log(`${chalk.cyan('Current Price: ')} ${BondingCurveMath.calculatePrice(ledger.totalSupply, ledger.curveSlope)} DUST`);
              console.log('');
            }
          } catch (e) {
            console.error(logSymbols.error, chalk.red(`Error: ${e instanceof Error ? e.message : e}`));
          }
          break;

        case '5':
          running = false;
          break;
      }
    }

    await walletCtx.wallet.stop();
    console.log('\n  Goodbye!\n');
  } finally {
    rl.close();
  }
}

main().catch(console.error);