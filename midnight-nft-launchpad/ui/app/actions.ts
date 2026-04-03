"use server";

import { config } from 'dotenv';
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";

config({ path: path.resolve(process.cwd(), "..", ".env") });

const execAsync = promisify(exec);

// Path to the workspace root (where the CLI scripts are)
const ROOT_DIR = path.resolve(process.cwd(), "..");
const STATE_FILE = path.join(ROOT_DIR, 'local-state.json');

async function runCliAction(command: string, ...args: string[]) {
  try {
    const formattedArgs = args.map(arg => 
      arg.includes(' ') || arg.includes('{') ? `'${arg}'` : arg
    ).join(' ');
    
    console.log(`Executing: npx tsx src/cli.ts ${command} ${formattedArgs}`);
    
    const { stdout, stderr } = await execAsync(`npx tsx src/cli.ts ${command} ${formattedArgs}`, {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        PRIVATE_STATE_PASSWORD: process.env.PRIVATE_STATE_PASSWORD || "Str0ng!MidnightLocal",
      },
      timeout: 180000, // 3 mins for ZK
    });
    
    return { success: true, stdout, stderr };
  } catch (err: any) {
    console.error(`CLI Action ${command} failed:`, err.message);
    throw new Error(err.message || "Midnight operation failed. Check your wallet balance and proof-server.");
  }
}

export async function fetchOwnedNFTs() {
  if (fs.existsSync(STATE_FILE)) {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    return Object.values(state.ownedTokens || {});
  }
  return [];
}

export async function fetchCollections() {
  if (fs.existsSync(STATE_FILE)) {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    return state.collections || [];
  }
  return [];
}

export async function actionCreateCollection(name: string, description: string, maxSupply: number) {
  return await runCliAction("create-collection", name, description, maxSupply.toString());
}

export async function actionMintFromCollection(collectionAddress: string, metadata: string) {
  return await runCliAction("mint-from-collection", collectionAddress, metadata);
}

export async function getDeployment() {
  const deployFile = path.join(ROOT_DIR, 'deployment.json');
  if (fs.existsSync(deployFile)) {
    return JSON.parse(fs.readFileSync(deployFile, 'utf-8'));
  }
  return null;
}

export async function actionDeploy() {
  return await runCliAction("deploy");
}

export async function actionMint(metadata: string) {
  return await runCliAction("mint", metadata);
}

export async function actionTransfer(tokenId: string, recipient: string) {
  return await runCliAction("transfer", tokenId, recipient);
}

export async function actionVerify(tokenId: string) {
  return await runCliAction("verify", tokenId);
}
