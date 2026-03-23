# 🚢 Battleship Compact on Midnight 

A simple version of the game Battleship on the **Midnight Network** using the Compact language.

This project demonstrates several key features of Compact:
- **Private state management** — Hiding secret ship positions from opponents
- **On-chain verification** — Verifying attacks securely without revealing ship placement
- **Witness functionality** — Resolving hits vs misses computationally
- **List Operations** — Managing game board states securely

---

## 🚀 Getting Started

### 📦 Prerequisites

- **Node.js 22+** installed  
- **Docker** installed (required for proof server)

---

## ⚡ Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Setup and Compile

```bash
npm run setup
```

### 3. Run the CLI

```bash
npm run cli
```

---

## 📂 Project Structure

```text
compact-battleship/
├── contracts/
│   ├── battleship.compact     # Battleship smart contract
│   └── managed/               # Compiled artifacts
├── src/
│   ├── deploy.ts              # Deployment script
│   ├── cli.ts                 # CLI for battleship actions
│   └── check-balance.ts       # Wallet balance checker
├── docker-compose.yml         # Proof server config
└── package.json
```

---

## 🏗️ Key Concepts

### Hiding Ship Placement

Compact allows complex data management to be performed securely within **private state**. The exact locations of ships remain hidden on the ledger while still allowing the smart contract to govern the rules of the board.

### Verifying Attacks

To ensure the game execution cannot be tampered with by an opponent attempting to evade hits, the circuit uses `assert` during attacks to securely verify the structural properties of a hit/miss against the player's private ship placements via zero-knowledge proofs. This guarantees mathematical provability without compromising the game's secret coordinates.