# ZK Quadratic Voting: Privacy-Preserving Influence on Midnight

[![Compact](https://img.shields.io/badge/Compact-0.30.0-1abc9c.svg)](https://shields.io/) [![midnight-js](https://img.shields.io/badge/midnight--js-4.0.2-blueviolet.svg)](https://shields.io/) [![Proof Server](https://img.shields.io/badge/proof--server-8.0.3-green.svg)](https://shields.io/)

A CLI-based **Zero-Knowledge Quadratic Voting system** that lets users express **strength of preference privately**, built on Midnight’s Compact language.

---

# What This Is

A system where:

* Users **commit tokens privately**
* Voting power is: `weight = floor(sqrt(tokens))`
* The contract verifies this **entirely in zero-knowledge**
* A **deterministic nullifier** ensures:

  > **one voter = one vote**

---

# Privacy Model

```
┌──────────────────────────────────────────────────────────────────────┐
│                          PRIVACY MODEL                               │
│                                                                      │
│   PRIVATE (never leaves local machine)    PUBLIC (on-chain)          │
│   ─────────────────────────────────────   ──────────────────         │
│   • voter_id                              • nullifier                │
│   • committed tokens                      • total_votes              │
│   • sqrt weight                           • ZK proof                 │
│   • w² (auxiliary witness)                • commitment existence     │
└──────────────────────────────────────────────────────────────────────┘
```

### Key idea:

> The chain never learns your tokens, only that your vote weight is valid.

---

# Flow Overview

```
        ┌────────────────────────┐
        │   User (private)       │
        └──────────┬─────────────┘
                   │
                   ▼
        ┌────────────────────────┐
        │ Commit tokens          │
        │ (private state)        │
        └──────────┬─────────────┘
                   │
                   ▼
        ┌────────────────────────┐
        │ Compute sqrt(tokens)   │
        │ → weight (w)           │
        └──────────┬─────────────┘
                   │
                   ▼
        ┌──────────────────────────────┐
        │ Generate ZK proof            │
        │ - commitment exists          │
        │ - tokens match               │
        │ - w² ≤ tokens < (w+1)²       │
        └──────────┬───────────────────┘
                   │
                   ▼
        ┌──────────────────────────────┐
        │ Compute nullifier            │
        │ = hash(voter_id)             │
        └──────────┬───────────────────┘
                   │
                   ▼
        ┌──────────────────────────────┐
        │ Submit vote                  │
        │ (proof + nullifier)          │
        └──────────┬───────────────────┘
                   │
                   ▼
        ┌──────────────────────────────┐
        │ On-chain verification        │
        │ ✔ commitment exists          │
        │ ✔ ZK proof valid             │
        │ ✔ nullifier unused           │
        └──────────┬───────────────────┘
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
   ACCEPT ✅            REJECT ❌
```

---

# Core Math (Quadratic Constraint)

The circuit enforces: `w^2 <= tokens < (w + 1)^2`

This guarantees: `w = floor(sqrt(tokens))`


### Why this matters

* No floating point
* No expensive sqrt
* Fully verifiable in ZK

---

# Double Voting Protection

### Nullifier Design

```text
nullifier = hash(voter_id)
```

### Properties

| Scenario               | Result     |
| ---------------------- | ---------- |
| Same voter votes twice | ❌ Rejected |
| Different voters       | ✅ Accepted |
| Same proof replay      | ❌ Rejected |

---

# Contract State

| Field              | Type                       | Purpose                    |
| ------------------ | -------------------------- | -------------------------- |
| `committed_tokens` | `Map<Bytes<32>, Uint<64>>` | Stores private commitments |
| `has_voted`        | `Set<Bytes<32>>`           | Tracks used nullifiers     |
| `total_votes`      | `Counter`                  | Global weighted tally      |

---

# Security Model

## Guarantees

* ✅ Correct quadratic weighting
* ✅ No double voting
* ✅ Private token amounts
* ✅ ZK integrity (no forged weights)

---

## What the chain sees

* Nullifier
* Total votes
* Valid proof

---

## What the chain does NOT see

* Token amount
* Voter identity
* Raw vote input

---

# Limitations

* Single vote per voter (not budget-based QV)
* No multi-option voting (single tally)
* Nullifier = `hash(voter_id)` → cross-contract linkability

---

# Future Improvements

* Domain-separated nullifiers

  ```text
  hash(voter_id, contract_id)
  ```

* Multi-option voting (A/B/C)

* Spend-based quadratic voting (true QV)

* Private ballots (not just private weights)

---

# Quick Start

```bash
npm install
npm run compile
npm run build
```

---

### Start Proof Server

```bash
npm run start-proof-server
```

---

### Deploy

```bash
export PRIVATE_STATE_PASSWORD='Str0ng!MidnightLocal'
npm run deploy
```

---

### Run CLI

```bash
export PRIVATE_STATE_PASSWORD='Str0ng!MidnightLocal'
npm run cli
```

---

# CLI Commands

| Command           | Description             |
| ----------------- | ----------------------- |
| Commit Tokens     | Lock tokens privately   |
| Vote (Quadratic)  | Cast vote with √ weight |
| View Global Tally | See aggregated weight   |

---

# Project Structure

```
contracts/
  quadratic-voting.compact

src/
  cli.ts
  deploy.ts
  utils.ts
```

---

# Mental Model

> This is not “voting with tokens”
> This is:
>
> **Proving how much influence you deserve, without revealing why**

---

# Suggested Test Cases (for extension)

* Invalid sqrt weight → reject
* Wrong token witness → reject
* Reused nullifier → reject
* Tampered proof → reject
* Large token values → correct weight

---

# TL;DR

> A zero-knowledge quadratic voting system where influence scales as √tokens, votes are private, and double voting is cryptographically prevented.
