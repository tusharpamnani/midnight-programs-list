# 📝 compact-bulletin

A Midnight Network application implementing a **privacy-preserving bulletin board**, where users can post and remove messages securely.

---

## 🚀 Getting Started

### Prerequisites

- Node.js 22+
- Docker (for proof server)

---

## ⚡ Quick Start

### 1. Install dependencies

```bash
npm install


# Project Structure

compact-bulletin/
├── contracts/
│   ├── bulletin.compact      # Bulletin contract
│   └── managed/              # Compiled artifacts
├── src/
│   ├── deploy.ts             # Deployment script
│   ├── cli.ts                # CLI interaction
│   └── check-balance.ts      # Balance checker
├── docker-compose.yml
├── deployment.json
└── package.json