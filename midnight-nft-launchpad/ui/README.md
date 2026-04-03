# Midnight NFT Web UI

This is a modern, privacy-first web interface for the Midnight NFT Minting platform.

## Features

- **Lace Wallet Connector**: Connect and interact with the Midnight Preprod network.
- **ZK Minting**: Create NFTs with private metadata strings or JSON.
- **Private State Discovery**: Automatically tracks tokens minted or owned by the connected address.
- **Proof-of-Ownership**: Verify ownership directly on-chain using Zero-Knowledge proofs.
- **Native Aesthetic**: Dark-themed, developer-oriented UI using Tailwind CSS and Lucide icons.

## Setup

### Prerequisites

- **Midnight Proof Server**: Must be running (via Docker) to process ZK proofs.
- **Lace Wallet**: Installed with Midnight Preprod support enabled.

### Run Locally

1. Install all dependencies:
\`\`\`bash
npm install --legacy-peer-deps
\`\`\`

2. (Optional) Recompile the Compact contract:
\`\`\`bash
npm run compile-contracts
\`\`\`

3. Start the development server:
\`\`\`bash
npm run dev
\`\`\`

Navigate to [http://localhost:3000](http://localhost:3000) to begin minting.

## Development Note

This UI is designed to bridge the gap between deep ZK logic and user experience. 

- **State**: Persistent ownership state is stored locally in the browser's \`localStorage\`, mirroring the logic behavior of the CLI tool. 
- **ZK Logic**: Proof generation happens asynchronously, providing live feedback via the Terminal Log component.
