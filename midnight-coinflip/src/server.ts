import * as http from "http";
import * as fs from "node:fs";
import { findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { createWallet, createProviders, compiledContract, generateSecret, computeHash, getResult } from "./flip-utils.js";

// Use the seed the user provided
const SEED = "57bb166cb6bbf3a6cb5e93a26043e3e2d3c830b63b85286fe97619456a2a23f2";

let walletCtx: any = null;
let contract: any = null;

// Mock in-memory DB for the house secret
let currentSecret: Buffer | null = null;
let currentCommitHash: Buffer | null = null;

async function bootstrap() {
  console.log("Starting System Wallet (Option A - Server Model)...");
  
  if (!fs.existsSync("deployment.json")) {
    throw new Error("Missing deployment.json");
  }
  
  const deployment = JSON.parse(fs.readFileSync("deployment.json", "utf-8"));
  
  walletCtx = await createWallet(SEED);
  console.log("Wallet created, waiting for sync...");
  await walletCtx.wallet.waitForSyncedState();
  console.log("Wallet synced. Registering providers...");
  const providers = await createProviders(walletCtx);
  
  contract = await findDeployedContract(providers, {
    contractAddress: deployment.contractAddress,
    compiledContract,
  });
  console.log("Midnight Network Connected! House Node ready on port 3001.");
}

const server = http.createServer(async (req, res) => {
  // Simple CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "OPTIONS, GET, POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/api/commit") {
    try {
      console.log("Incoming request: Commit");
      currentSecret = generateSecret();
      currentCommitHash = computeHash(currentSecret);
      
      const commitTx = await contract.callTx.commit(currentCommitHash);
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ commitHash: currentCommitHash.toString("hex"), txId: commitTx.public.txId }));
    } catch (e: any) {
      console.error(e);
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message || String(e) }));
    }
  } else if (req.method === "POST" && req.url === "/api/reveal") {
    try {
      console.log("Incoming request: Reveal");
      if (!currentSecret) throw new Error("No active commit");
      
      const revealTx = await contract.callTx.reveal(currentSecret);
      
      const secretStr = currentSecret.toString("hex");
      // Optional: contract.callTx.reset() to clean up after reveal
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ secret: secretStr, txId: revealTx.public.txId }));
    } catch (e: any) {
      console.error(e);
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message || String(e) }));
    }
  } else {
    res.writeHead(404);
    res.end();
  }
});

// Run
bootstrap().then(() => {
  server.listen(3001, () => {
    console.log("Listening on http://localhost:3001");
  });
}).catch(console.error);

