import 'dotenv/config';
import * as fs from 'node:fs';
import { deploy } from './deploy.js';
import { mint } from './mint.js';
import { transfer } from './transfer.js';
import { verify } from './verify.js';
import { getOwnedTokens } from './state.js';
import { ensureCompiledArtifacts } from './check-artifacts.js';

function getDeployment() {
  if (!fs.existsSync('deployment.json')) {
    console.error('No deployment.json found! Run `deploy` first.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync('deployment.json', 'utf-8'));
}

async function main() {
  ensureCompiledArtifacts();

  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(`
Midnight NFT CLI

Usage:
  npm run cli -- <command> [args]

Commands:
  deploy                        Deploy the base contract
  create-collection <name> <desc> <cap>  Create a new collection
  mint <metadata>               Mint a new NFT (Base Contract)
  mint-from-collection <addr> <meta>    Mint from a specific collection
  transfer <id> <address>       Transfer NFT <id> to recipient <address>
  balance                       Show owned NFT IDs from local state
  verify <id>                   Verify ownership of NFT <id> on-chain
    `);
    process.exit(0);
  }

  // Expect PRIVATE_STATE_PASSWORD to be in env, or supply it
  if (!process.env.PRIVATE_STATE_PASSWORD) {
    process.env.PRIVATE_STATE_PASSWORD = 'Str0ng!MidnightLocal';
  }

  try {
    switch (command) {
      case 'deploy': {
        const seed = process.env.WALLET_SEED || '0000000000000000000000000000000000000000000000000000000000000000'; // For testing or user has to set it
        console.log(`Using seed starting with ${seed.substring(0, 4)}...`);
        await deploy(seed);
        break;
      }
      
      case 'mint': {
        const deployment = getDeployment();
        const metadata = args.slice(1).join(' ');
        if (!metadata) throw new Error("Metadata is required");
        await mint(deployment.seed, deployment.contractAddress, metadata);
        break;
      }

      case 'create-collection': {
        const deployment = getDeployment();
        const name = args[1];
        const description = args[2];
        const maxSupply = parseInt(args[3]);
        if (!name || !description || isNaN(maxSupply)) throw new Error("usage: create-collection <name> <description> <maxSupply>");
        const { createCollection } = await import('./createCollection.js');
        await createCollection(deployment.seed, name, description, maxSupply);
        break;
      }

      case 'mint-from-collection': {
        const deployment = getDeployment();
        const address = args[1];
        const metadata = args.slice(2).join(' ');
        if (!address || !metadata) throw new Error("usage: mint-from-collection <address> <metadata>");
        const { mintFromCollection } = await import('./mintFromCollection.js');
        await mintFromCollection(deployment.seed, address, metadata);
        break;
      }

      case 'transfer': {
        const deployment = getDeployment();
        const tokenId = args[1];
        const recipient = args[2];
        if (!tokenId || !recipient) throw new Error("TokenId and recipient address are required");
        await transfer(deployment.seed, deployment.contractAddress, tokenId, recipient);
        break;
      }

      case 'balance': {
        const tokens = getOwnedTokens();
        console.log('\nOwned Tokens:');
        console.log('──────────────────────────────────────────────────');
        for (const [id, data] of Object.entries(tokens)) {
          console.log(`ID: ${id}`);
          console.log(`Metadata: ${data.metadata}`);
          console.log(`Metadata Hash: ${data.metadataHash}`);
          console.log('──────────────────────────────────────────────────');
        }
        if (Object.keys(tokens).length === 0) {
          console.log('No tokens found in local state.');
        }
        break;
      }

      case 'verify': {
        const deployment = getDeployment();
        const tokenId = args[1];
        if (!tokenId) throw new Error("TokenId is required");
        await verify(deployment.seed, deployment.contractAddress, tokenId);
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error executing command:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();