"use server";

import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";

const execAsync = promisify(exec);

// Path to the workspace root
const ROOT_DIR = path.resolve(process.cwd(), "..");

// Very basic session store for the game secret (Works fine for local test server)
let currentSecretHex: string | null = null;
let currentCommitHex: string | null = null;

async function runCliAction(command: string, args: string = "") {
  try {
    const { stdout, stderr } = await execAsync(`npx tsx src/cli-action.ts ${command} ${args}`, {
      cwd: ROOT_DIR,
      timeout: 60000, // 60s timeout to prevent infinite hanging
    });
    
    // Parse the last line of stdout as JSON (in case there are other logs)
    const lines = stdout.trim().split("\n");
    const jsonStr = lines[lines.length - 1];
    
    return JSON.parse(jsonStr);
  } catch (err: any) {
    console.error("CLI Action failed:", err);
    throw new Error("Backend connection failed");
  }
}

export async function backendCommit(): Promise<string> {
  const res = await runCliAction("commit");
  if (res.error) throw new Error(res.error);
  
  // Store the secret on the SERVER only
  currentSecretHex = res.secret;
  currentCommitHex = res.commitHash;
  
  // Only return the hash to the client
  return currentCommitHex as string;
}

export async function backendReveal(): Promise<string> {
  if (!currentSecretHex) throw new Error("No active commit found");
  
  const res = await runCliAction("reveal", currentSecretHex);
  if (res.error) throw new Error(res.error);
  
  const secret = currentSecretHex;
  // Clear after reveal logic is conceptually done, or keep it until reset
  
  return secret;
}


export async function backendGetResult(secretHex: string) {
  // We can just compute the result synchronously here or re-use logic.
  // Given flip-utils computes it via last byte:
  const lastByte = parseInt(secretHex.slice(-2), 16);
  return lastByte % 2 === 0 ? "HEADS" : "TAILS";
}
