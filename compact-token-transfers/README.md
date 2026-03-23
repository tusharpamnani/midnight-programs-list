# 🪙 Token Transfers Compact on Midnight 

A comprehensive guide and set of implementations for **Token Operations** on the **Midnight Network** using the Compact language.

This project demonstrates several advanced features of Compact for handling both unshielded and shielded tokens:

### 🔓 Unshielded Token Operations
- **Minting & Receiving** — `mintAndReceive` for creating new unshielded tokens.
- **Transfer to Users** — `sendToUser` for sending unshielded tokens to a user address.
- **Direct Receiving** — `receiveTokens` for accepting incoming unshielded tokens.
- **Native Token Operations** — `receiveNightTokens` and `sendNightTokensToUser` for handling `tNight` tokens.

### 🛡️ Shielded Token Operations (ZK-Privacy)
- **Shielded Receiving** — `receiveShieldedTokens` for accepting private token coins.
- **Shielded Sending** — `sendShieldedToUser` for private peer-to-peer transfers.
- **Shielded Minting** — `mintShieldedToSelf` and `mintAndSendShielded` for private asset creation and distribution.

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

```
compact-token-transfers/
├── contracts/
│   ├── token-transfers.compact # Token transfer smart contract
│   └── managed/                # Compiled artifacts
├── src/
│   ├── deploy.ts               # Deployment script
│   ├── cli.ts                  # CLI for token actions
│   └── check-balance.ts        # Wallet balance checker
├── docker-compose.yml          # Proof server config
└── package.json
```

---

## 🏗️ Key Concepts

### Unshielded vs. Shielded
- **Unshielded** tokens are transparent on the ledger, similar to traditional blockchain tokens.
- **Shielded** tokens provide privacy by hiding the amount and type of token being transferred using zero-knowledge proofs.

### Midnight Kernel
This project leverages the `kernel.self()` reference to identify the contract's own address and the `StandardLibrary` for built-in token primitives like `mintUnshieldedToken`, `sendUnshielded`, and `receiveShielded`.
