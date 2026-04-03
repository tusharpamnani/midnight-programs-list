# Midnight NFT Launchpad | Multi-Contract ZK Foundry

A professional, high-fidelity web application for deploying and managing **privacy-preserving NFT collections** on the **Midnight Network**. This project implements a fully functional **NFT Launchpad** that bridges a **Next.js Web UI** with the **Midnight.js SDK**, featuring an independent factory pattern for scalable minting.

## 🌌 Overview

Unlike standard NFTs on public chains, Midnight NFTs store their metadata and ownership in **Private Ledger State**. This application allows users to spawn their own independent NFT collections (factories) with custom supply caps and descriptions.

- **Multi-Contract Factories**: Deploy unique smart contract instances for every collection.
- **Private Metadata**: Ownership and metadata are hidden from the public record; only hashes (Commitments) are stored on-chain.
- **ZK Verification**: Owners use Zero-Knowledge proofs locally to "prove" they own their tokens without revealing identity.
- **Circuit-Enforced Caps**: Supply limits are enforced directly within the ZK circuits, ensuring immutable scarcity.
- **Global Registry**: A synchronized local state keeps track of all deployed collections and minted tokens.

## 🚀 Getting Started

### 1. Prerequisites

- **Node.js 18+**
- **Docker**: Required to run the Midnight Proof Server.
- **Local Proof Server**: Ensure port `6300` is available.

### 2. Environment Setup

Clone and install dependencies for both the CLI and UI:

```bash
# Install root/CLI dependencies
npm install

# Install UI dependencies
cd ui
npm install --legacy-peer-deps
```

### 3. Start the ZK Infrastructure

In a separate terminal, start the **Midnight Proof Server**:

```bash
# From the root directory
npm run start-proof-server
```

## 🛠️ Running the Application

### Option A: The Web Dashboard (Recommended)

Start the Next.js development server:

```bash
cd ui
npm run dev
```

Navigate to [http://localhost:3000](http://localhost:3000).

- **Global Registry**: View all deployed collections across the network.
- **Deploy Factory**: One-click "New Factory" triggers an on-chain deployment of the `collection.compact` contract.
- **Collection Minting**: Select a collection to mint unique tokens with private metadata.
- **ZK Inventory**: View your tokens and hidden metadata, with built-in ZK owner verification.

### Option B: The CLI Tool

For advanced interactions:

```bash
# From the root directory
# 1. Deploy the base contract
npm run cli -- deploy

# 2. Create a new collection (name, description, supply cap)
npm run cli -- create-collection "Moon Birds" "Private avian avatars" 1000

# 3. Mint from a collection
npm run cli -- mint-from-collection <CONTRACT_ADDRESS> "{\"rarity\": \"legendary\"}"

# 4. View your private inventory
npm run cli -- balance
```

## 🏗️ Project Structure

- `contracts/`: **Compact** smart contract logic (`collection.compact`).
- `src/`: Core **Midnight.js SDK** implementation (wallet management, ZK-witness providers).
- `ui/app/`: Next.js frontend featuring **React Server Actions** for backend synchronization.
- `ui/hooks/`: Real-time state synchronization with the Midnight SDK backend.
- `local-state.json`: The server-side registry for collections and private NFT metadata.

## 🔐 Security & Privacy

- **Shielded State**: Metadata never leaves the secure environment in raw form. Only ZK proofs and commitments are submitted to the public network.
- **Local Storage**: For this development environment, private state is managed locally. In production, this would be managed per-user via the Lace extension.

---
*Built with Midnight SDK v0.22.x, Next.js 14, and Tailwind CSS.*