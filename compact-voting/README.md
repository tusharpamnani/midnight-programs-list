# 🗳️ compact-voting-app

A privacy-preserving **Voting dApp on Midnight Network** built using the Compact language.

This project demonstrates how to build a **secure, zero-knowledge voting system** with commit-reveal logic on Midnight.

---

## 🚀 Getting Started

### 📦 Prerequisites

* **Node.js 22+** installed  
* **Docker** installed (required for proof server)

---

## ⚡ Quick Start

### 1. Install dependencies

```bash
npm install



# Project structure 
compact-voting-app/
├── contracts/
│   ├── voting.compact        # Voting smart contract
│   └── managed/              # Compiled artifacts
├── src/
│   ├── deploy.ts             # Deployment script
│   ├── cli.ts                # CLI for voting actions
│   └── check-balance.ts      # Wallet balance checker
├── docker-compose.yml        # Proof server config
├── deployment.json           # Deployment details
└── package.json