# Midnight Coin Flip

[![Generic badge](https://img.shields.io/badge/Compact%20Toolchain-0.30.0-1abc9c.svg)](https://shields.io/) [![Generic badge](https://img.shields.io/badge/midnight--js-4.0.2-blueviolet.svg)](https://shields.io/) [![Generic badge](https://img.shields.io/badge/wallet--sdk--facade-3.0.0-blue.svg)](https://shields.io/) [![Generic badge](https://img.shields.io/badge/Tests%20Cases%20Passed-30-green.svg)](https://shields.io/)


> Provably fair randomness using a commit–reveal scheme on Midnight.

A CLI-based demo that shows how a system can generate randomness **without requiring trust**, the outcome is locked *before* the user makes a choice and later verified on-chain.

---

## What this demonstrates

This project is not just a game, it’s a **trust primitive**.

It proves that:

* The system **commits to a secret before your choice**
* The outcome is **deterministically derived from that secret**
* The secret is **revealed and verified on-chain**
* The system **cannot change the result after you play**

---

## Features

* **Commit–Reveal Scheme**
  System commits to a hashed secret before user input

* **Provably Fair**
  Anyone can verify: `hash(secret) == commitment`

* **On-chain Verification (Midnight)**
  Commitment + reveal enforced via smart contract

* **CLI Experience**
  Clean, interactive terminal flow designed for demos

* **Verbose Mode**
  Inspect raw secret, hashes, and verification steps

---

## Setup

### 1. Install dependencies

```bash
npm install
```

---

### 2. Start the proof server

Make sure Docker is running:

```bash
docker run -p 6300:6300 midnightntwrk/proof-server:8.0.3 -- midnight-proof-server -v
```

---

### 3. Compile contract

```bash
npm run compile
```

---

### 4. Deploy contract

```bash
export PRIVATE_STATE_PASSWORD='your-strong-password'
npm run deploy
```

**Notes:**

* You’ll be prompted for a seed if not set
* Ensure wallet has at least **1,000,000 DUST**

---

## 🎮 How to Play

### Standard mode

```bash
npm run play
```

### Verbose mode (recommended for demos)

```bash
npm run play:verbose
```

Shows:

* generated secret
* commitment hash
* verification steps

---

## 🌐 Web UI (Next.js)

The project now includes a **Web Frontend** demonstrating the cryptographic interaction visually.

To spin up the web interface instantly:

1. **Start the House Server**
   In one terminal, launch the system wallet holder using your securely funded seed:
   ```bash
   export PRIVATE_STATE_PASSWORD='your-strong-password'
   npx tsx src/server.ts
   ```

2. **Launch the UI**
   In a separate terminal, run the Next.js development server:
   ```bash
   cd ui
   npm run dev
   ```
3. Open `http://localhost:3000` to interact with the provably fair coin flip via a sleek, interactive timeline.

---

## Example Flow

```text
🔐 System commits to a secret (hash stored on-chain)

You choose: HEADS

🪙 Flipping coin...

→ Secret revealed
→ hash(secret) == commitment ✅

🎯 Result: HEADS

🔐 Verified:
The system committed BEFORE your choice.
It could not change the result.
```

---

## Tests

Run tests:

```bash
npm test
```

Covers:

* commit → reveal correctness
* invalid reveal rejection
* deterministic outcomes

---

## Why this matters

Commit–reveal is a foundational pattern for:

* 🎰 Provably fair games
* 🎟️ Lotteries & raffles
* 🎲 Randomness protocols
* 🤝 Trustless interactions

This project shows the concept in its **simplest, most understandable form**.

---

## Future Improvements

* multiplayer commit–reveal
* betting / staking layer
* leaderboard & stats
* additional ZK-based games

---

## Built on Midnight

Showcasing privacy-preserving computation and verifiable execution.
