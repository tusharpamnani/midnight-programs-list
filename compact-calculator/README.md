# 🧮 Calculator Compact on Midnight 

A simple calculator implementation on the **Midnight Network** using the Compact language.

This project demonstrates several key features of Compact:
- **Arithmetic circuits** — `add`, `subtract`, `multiply`, `square`
- **Witness functions** — `divMod` for off-chain division/modulo compute
- **On-chain verification** — validating off-chain computed values using `assert`

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
compact-calculator/
├── contracts/
│   ├── calculator.compact     # Calculator smart contract
│   └── managed/               # Compiled artifacts
├── src/
│   ├── deploy.ts              # Deployment script
│   ├── cli.ts                 # CLI for calculator actions
│   └── check-balance.ts       # Wallet balance checker
├── docker-compose.yml         # Proof server config
└── package.json
```

---

## 🏗️ Key Concepts

### Witness Functions

Compact allows complex computations (like division and modulo) to be performed **off-chain** via witness functions. The result is then passed back to the circuit.

### On-chain Verification

To ensure the off-chain compute was correct, the circuit uses `assert` to verify the mathematical properties of the result (e.g., `quo * divisor + rem == dividend`). This pattern is a core part of building efficient, ZK-provable applications on Midnight.