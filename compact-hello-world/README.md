# compact-hello-world

A Midnight Network application created with `create-mn-app`.

## Getting Started

### Prerequisites

- Node.js 22+ installed
- Docker installed (for proof server)

### Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Setup and deploy**:

   ```bash
   npm run setup
   ```

   This will:

   - Compile your Compact contract
   - Deploy contract to Preprod

3. **Interact with your contract**:
   ```bash
   npm run cli
   ```

### Available Scripts

- `npm run setup` - Start proof server, compile contract, and deploy
- `npm run compile` - Compile Compact contract
- `npm run deploy` - Deploy contract to Preprod
- `npm run cli` - Interactive CLI for contract
- `npm run check-balance` - Check wallet balance
- `npm run proof-server:start` - Start proof server (Docker)
- `npm run proof-server:stop` - Stop proof server
- `npm run clean` - Clean build artifacts

### Project Structure

```
compact-hello-world/
├── contracts/
│   ├── hello-world.compact    # Smart contract source
│   └── managed/               # Compiled artifacts (after compile)
├── src/
│   ├── deploy.ts             # Deployment script
│   ├── cli.ts                # Interactive CLI
│   └── check-balance.ts      # Balance checker
├── docker-compose.yml        # Proof server config
├── deployment.json           # Deployment info (after deploy)
└── package.json
```

### Getting Preprod Tokens

1. Run `npm run deploy` to see your wallet address
2. Visit [https://faucet.preprod.midnight.network/](https://faucet.preprod.midnight.network/)
3. Enter your address to receive test tokens (tNight)

### Learn More

- [Midnight Documentation](https://docs.midnight.network)
- [Compact Language Guide](https://docs.midnight.network/compact)
- [Tutorial Series](https://docs.midnight.network/tutorials)

## Contract Overview

This project includes a simple "Hello World" contract that:

- Stores a message on the blockchain
- Allows reading the current message
- Demonstrates basic Midnight functionality

The contract uses:

- **Public ledger state** for the message
- **Zero-knowledge proofs** for transactions
- **Privacy-preserving** architecture

Happy coding! 🌙