# Midnight Linear Bonding Curve

[![Generic badge](https://img.shields.io/badge/midnight--js-3.1.0-blueviolet.svg)](https://shields.io/) [![Generic badge](https://img.shields.io/badge/wallet--sdk--facade-1.0.0-blue.svg)](https://shields.io/) [![Generic badge](https://img.shields.io/badge/Tests-160%20passing-brightgreen.svg)](https://shields.io/)


A privacy-preserving automated market maker (AMM) implemented as a Zero-Knowledge smart contract on the [Midnight Network](https://midnight.network). Token price is determined deterministically by a linear bonding curve, while individual balances remain private via ZK proofs.

> **Status:** Reference implementation. Not audited. Do not use in production without a full security review.

---

## Table of Contents

- [Overview](#overview)
- [Mathematics](#mathematics)
- [Contract Features](#contract-features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Usage](#usage)
- [Testing](#testing)
- [Security Considerations](#security-considerations)
- [License](#license)

---

## Overview

A bonding curve is an on-chain pricing primitive where token price is a deterministic function of supply. This eliminates the need for an order book or external oracle: any participant can buy or sell at any time at a price that is provably correct and manipulation-resistant within the ZK execution model.

This implementation uses a **linear curve** — price scales proportionally with supply — giving a simple quadratic reserve function with well-understood economic properties.

### Key properties

- **Deterministic pricing.** Price at any supply level is fully determined by the slope parameter set at deployment.
- **Instant liquidity.** Any buy or sell is settled atomically against the on-chain reserve.
- **Private balances.** Individual holdings are stored in Midnight private state and never revealed on-chain.
- **Slippage protection.** Callers specify a `maxCost` or `minRefund` bound; transactions revert if the curve has moved beyond that limit.

---

## Mathematics

### Pricing function

```
P(s) = a · s
```

| Symbol | Description |
|--------|-------------|
| `P(s)` | Marginal token price at supply `s` |
| `a`    | Slope parameter (`curveSlope`), set at deployment |
| `s`    | Current total token supply |

### Mint cost

Buying `n` tokens from supply `s` requires paying the area under the curve from `s` to `s + n`:

```
Cost(s, n) = (a / 2) · ((s + n)² − s²)
```

### Burn refund

Selling `n` tokens from supply `s` returns:

```
Refund(s, n) = (a / 2) · (s² − (s − n)²)
```

### Reserve invariant

The reserve balance `R` must satisfy at all times:

```
R(s) = (a / 2) · s²
```

This invariant is enforced by the circuit after every buy and sell. Any state that violates it cannot produce a valid ZK proof.

### Integer division

Compact uses integer (truncating) division. For a given `slope` and `deltaSq = (s+n)² − s²`, the on-chain cost is:

```
cost = (slope · deltaSq) / 2      // integer division, truncates remainder
```

The witness supplies this value off-chain; the circuit verifies:

```
2 · cost == totalProduct  OR  2 · cost + 1 == totalProduct
```

Note that `deltaSq` is odd if and only if `n` is odd, in which case `cost` and `refund` for the same `(s, n)` pair are equal (both truncate the same odd product), preserving the mint/burn reversibility invariant.

---

## Contract Features

| Feature | Description |
|---------|-------------|
| **Linear bonding curve** | `P(s) = a·s` with quadratic reserve |
| **Private balances** | Per-address holdings in Midnight private state |
| **ERC-20-style transfers** | `transfer`, `approve`, `transferFrom` |
| **Slippage protection** | `maxCost` on buy, `minRefund` on sell |
| **Supply cap** | Optional hard ceiling; `0` means uncapped |
| **Pause / unpause** | Owner-only emergency halt for buy and sell |
| **Ownership transfer** | Two-step–ready owner field, transferable by current owner |
| **Read-only queries** | `getPrice`, `getSpotCost`, `getSpotRefund`, `getSupply`, `getReserve`, `balanceOf`, `allowance` |

### Address Normalization
To prevent identity mismatches, the protocol utilizes **Midnight Unshielded Addresses** (`mn_addr_...`) as the canonical user identity.
The CLI automatically decodes the `Bech32m` unshielded string into byte payloads and applies a `SHA-256` hash to guarantee a deterministic 32-byte identity key for the smart contract's internal mappings. Shielded addresses and coin public keys are explicitly bypassed for token interactions.

---

## Architecture

```
.
├── contracts/
│   └── bonding_curve.compact       # ZK smart contract (Compact language)
│
└── src/
    ├── math.ts                     # Off-chain bonding curve arithmetic (BigInt)
    ├── simulator.ts                # Local contract state simulator for tests
    ├── cli.ts                      # Interactive trading CLI
    ├── deploy.ts                   # Deployment script (Midnight Preprod)
    ├── utils.ts                    # Network and wallet helpers
    └── tests/
        └── bonding_curve.test.ts   # Full invariant and edge-case test suite
```

### Component responsibilities

**`bonding_curve.compact`** — All on-chain logic. Declares ledger state, witnesses, and exported circuits. The `verifiedHalfProduct` internal circuit centralises the integer-division witness verification used by both `buy` and `sell`.

**`math.ts`** — Pure-function off-chain mirror of the curve mathematics using native BigInt. Shared by the simulator, CLI, and tests.

**`simulator.ts`** — In-process replica of the full contract ledger used in unit tests. Provides the same circuit interface as the deployed contract without requiring a proof server or network connection.

**`cli.ts`** — Terminal interface for buying, selling, transferring, and inspecting curve state against a live deployment.

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | v20+ | Runtime |
| Docker | latest | Proof server |
| Midnight SDK | latest | Compact compiler + ZK toolchain |

---

## Setup

```bash
# Install dependencies
npm install

# Compile the Compact contract into ZK circuits and TypeScript bindings
npm run compile

# Build TypeScript sources
npm run build
```

---

## Usage

### Start the proof server

The proof server must be running whenever ZK proofs are generated (deploy, buy, sell).

```bash
# Run in a separate terminal — keep it alive for the duration of your session
npm run start-proof-server
```

### Deploy

Deploys to the Midnight Preprod network. You will be prompted for a wallet seed phrase or offered the option to generate a new wallet.

```bash
npm run deploy
```

Your wallet requires NIGHT tokens to cover transaction fees. NIGHT can be converted to DUST for private transactions. Use the [Midnight faucet](https://midnight.network) to fund a testnet wallet.

### Interactive CLI

```bash
npm run cli
```

Available actions:

1. Buy tokens from the bonding curve
2. Sell tokens back to the curve
3. Transfer tokens privately to another address
4. Inspect global market state (supply, reserve, spot price)

---

## Testing

```bash
npm run test
```

The test suite is organised into 27 sections covering every circuit in the contract:

| Section | What is verified |
|---------|-----------------|
| Constructor validation | Slope=0 rejection, ledger initialisation |
| `getPrice` / `calculatePrice` | P(s) = a·s at all supply levels |
| `calculateMintCost` / `getSpotCost` | Cost formula, monotonicity, slope proportionality |
| `calculateBurnRefund` / `getSpotRefund` | Refund formula, underflow guards, state immutability |
| Mathematical consistency | Additivity, reversibility, reserve invariant |
| `buy` — core | Supply, reserve, and balance updates |
| `buy` — `maxCost` slippage | Exact, under, and over limits; state rollback |
| `buy` — supply cap | Cap enforcement, uncapped path |
| `buy` — pause guard | Revert when paused, resume after unpause |
| `sell` — core | Supply, reserve, and balance updates |
| `sell` — `minRefund` slippage | Exact, under, and over limits; state rollback |
| `sell` — balance ownership | Cannot sell tokens you do not hold |
| `sell` — pause guard | Revert when paused, resume after unpause |
| `transfer` | Move, self-transfer, zero-amount, insufficient balance, not paused |
| `approve` / `allowance` | Set, overwrite, revoke, independence across owners and spenders |
| `transferFrom` | Spend allowance, deduction, over-allowance, over-balance |
| `pause` / `unpause` | Owner-only, double-pause, double-unpause, transfer unaffected |
| `transferOwnership` | Field update, old owner revoked, non-owner rejected |
| Query circuits | All seven queries correct and non-mutating |
| Multi-user simulation | Reserve invariant across complex interleaved sequences |
| Economic properties | Convexity, break-even, price impact, monotone reserve |
| Integer arithmetic | Witness integrity, odd/even `deltaSq`, truncation behaviour |
| Edge cases | Single-token round-trip, cap boundary, zero-supply queries |
| Large-number stress | Up to 10¹¹ supply values, no overflow |
| Sequential simulation | 10-buyer accumulation, interleaved ops, full round-trip |
| Randomised fuzz | 100-round random buy/sell, per-round reserve invariant check |
| Multi-slope | Reversibility, proportionality, additivity across slopes 1–1000 |

---

## Security Considerations

This is a reference implementation and **has not been audited**.

Before deploying to mainnet or handling real value, address the following:

**Integer overflow.** All supply and reserve values are `Uint<64>`. At `slope=10` the reserve overflows `2^64` at approximately `s = 1.36 × 10⁹`. Choose slope and cap values such that `slope · cap² / 2 < 2^64`.

**Reserve solvency.** The circuit asserts `refund ≤ reserveBalance` before every sell. This is a necessary but not sufficient condition; ensure no path (including rounding) can accumulate a deficit.

**Integer division rounding.** When `n` is odd, `(slope · deltaSq) / 2` truncates. Mint cost and burn refund for the same `(s, n)` pair remain equal because both truncate the same product, but accumulated rounding across many trades should be modelled explicitly.

**Witness trust.** The `calculateCost` and `callerAddress` witnesses are provided off-chain. Their values are verified by circuit constraints, not trusted directly, but the off-chain implementation must be correct for proofs to be generated.

**Proof generation cost.** Each buy or sell requires a ZK proof. Measure proof generation time and gas costs under your expected load before deployment.

**No access control on transfers.** `transfer` and `transferFrom` are not gated by the pause flag by design (a pause is intended to halt curve mechanics, not freeze all token movement). Confirm this matches your intended security model.

---

## License

[Apache License 2.0](LICENSE)

---

## References

- [Midnight Network](https://midnight.network)
- [Compact Language Reference](https://docs.midnight.network/develop/reference/compact-reference)
- [Bonding Curves in Token Design — Yos Riady](https://yos.io/2018/11/10/bonding-curves/)
- [Automated Market Makers — Uniswap](https://uniswap.org)