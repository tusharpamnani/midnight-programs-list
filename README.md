<div align="center">
  <img src="./banner.svg" alt="Midnight Network" width="180">
  <h2>Midnight Programs Collection</h2>
  <h4>Privacy-First Smart Contracts on Midnight Network</h4>
</div>

A curated collection of Midnight programs built with Compact and TypeScript

## Repository Structure

Each program is organized in its own dedicated folder:

- `compact-[programname]` — Pure Compact contract programs

## Programs Included

**Legend:**

- 🟢 Completed
- 🟡 In Progress
- 🔴 Planned
- 🏗️ Work in Progress
- ✅ Tests Available
- ❌ No Tests

| Program | Description | Features | 🌙 Compact |
|---------|-------------|----------|------------|
| [Hello World](./compact-hello-world) | Hello World on Midnight | `Compact` `Public State` `ZK Proofs` `CLI` | 🟢 ❌ |
| [Counter](./compact-counter) | Counter on Midnight | `Compact` `Public State` `ZK Proofs` `CLI` | 🟢 ❌ |
| [Escrow](./compact-escrow) | Escrow on Midnight | `Compact` `Public State` `ZK Proofs` `CLI` | 🟢 ✅ |
| [Todo](./compact-todo) | Todo App on Midnight | `Compact` `Private State` `ZK Proofs` `CLI` | 🟢 ❌ |
| [Voting](./compact-voting) | Voting App on Midnight | `Compact` `Commit-Reveal` `ZK Proofs` `CLI` | 🟢 ❌ |
| [Calculator](./compact-calculator) | Calculator on Midnight | `Compact` `Witness Function` `Verification` `CLI` | 🟢 ❌ |
| [Token Transfers](./compact-token-transfers) | Token Transfers on Midnight | `Compact` `Mint` `Shielded` `Unshielded` `CLI` | 🟢 ❌ |
| [Bulletin Board](./compact-bulletin-board) | Bulletin Board on Midnight | `Compact` `Public State` `ZK Proofs` `CLI` | 🟢 ❌ |
| [Battleship](./compact-battleship) | Battleship on Midnight | `Compact` `Private State` `ZK Proofs` `CLI` | 🟢 ❌ |
| [Allowlist](./compact-allowlist) | Allowlist on Midnight | `Compact` `Private State` `ZK Proofs` `CLI` | 🟢 ✅ |
| [Bonding Curve](./midnight-bonding-curve) | Bonding Curve on Midnight | `Compact` `Private State` `ZK Proofs` `CLI` | 🟢 ✅ |
| [Quadratic Voting](./compact-quadratic-voting) | Quadratic Voting on Midnight | `Compact` `Private State` `ZK Proofs` `CLI` | 🟢 ❌ |

> Programs are being added actively. Watch the repo for updates.

## Prerequisites

- [Midnight Compact compiler](https://docs.midnight.network)
- Node.js v22+
- Docker (for proof server)
- Midnight Lace Wallet (for testnet interaction)

## Getting Started

1. Clone the repository
```bash
git clone https://github.com/tusharpamnani/midnight-programs-list.git
cd midnight-programs-list
```

2. Navigate to a program directory
```bash
cd compact-hello-world
```

3. Follow the program's own `README.md` for setup and deployment instructions

## Project Structure (Per Program)
```
compact-[programname]/
├── contracts/
│   ├── contract.compact       # Compact smart contract source
│   └── managed/               # Compiled artifacts (generated)
├── src/
│   ├── deploy.ts              # Deployment script
│   ├── cli.ts                 # Interactive CLI
│   └── check-balance.ts       # Wallet balance checker
├── docker-compose.yml         # Proof server config
├── package.json
└── README.md
```

## Key Concepts

**Compact** is Midnight's domain-specific language for writing ZK-provable smart contracts. It distinguishes between:

- **Private state** — known only to the user, proved via ZK
- **Public ledger state** — visible on-chain to everyone

Understanding this distinction is essential before diving into any program here.

## Getting Preprod Tokens

1. Deploy any program to get your wallet address
2. Visit [https://faucet.preprod.midnight.network/](https://faucet.preprod.midnight.network/)
3. Enter your address to receive test tokens (tNight)

## Learn More

- [Midnight Documentation](https://docs.midnight.network)
- [Compact Language Guide](https://docs.midnight.network/compact)
- [Tutorial Series](https://docs.midnight.network/tutorials)

## Contributing

PRs are welcome! Please open an issue first to discuss what you'd like to add.

## License

MIT