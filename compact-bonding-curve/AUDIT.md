# Security Considerations and Audit Risks

This document outlines the known security characteristics, threat models, and mitigated risks of the Midnight Linear Bonding Curve protocol.

## 1. Zero-Knowledge State and Concurrency
**Risk:** State Contention.
In a high-throughput scenario, multiple users attempting to interact with the ZK state concurrently may cause proof invalidations or `expected a cell, received null` errors due to underlying Merkle tree and ledger state progressing while a local client generates a proof.
**Mitigation:** The protocol uses client-side slippage limits. In case of state progression, the user simply regenerates the proof on the latest block.

## 2. Integer Arithmetic and Precision Loss
**Risk:** Fractional Dust.
The theoretical bonding curve uses real numbers, but the blockchain uses integers. Division by 2 in the verified half-product `(a * (sNew^2 - sOld^2)) / 2` could leave dust fractions trapped.
**Mitigation:** The protocol enforces that `R` perfectly tracks the ZK verified calculated cost. On the final "burn-to-zero" operation, the contract sweeps the entire absolute remaining `reserveBalance` instead of calculating the exact formula, ensuring 100% of dust is liberated on system reset.

## 3. Privacy Leakage (Front-Running & MEV)
**Risk:** Observer inference.
While the Midnight ledger protects participant balances, the ZK transactions themselves might leak intent (a `buy` vs a `sell` circuit being invoked) just by the size or shape of the proof submitting on-chain. Additionally, the global `totalSupply` and `reserveBalance` are fully public.
**Mitigation:** This is an intentional design choice to provide a transparent, auditable price. Slippage parameters guarantee execution limits, mitigating standard MEV sandwich attacks that rely on unbounded slippage tolerances.

## 4. Identity Mapping
**Risk:** Mismatched unspent outputs or lost access.
**Mitigation:** The contract utilizes `SHA-256` hashing of `Bech32m` unshielded addresses. It explicitly bypasses shielded addresses and coin public keys for all token transfers to ensure seamless peer-to-peer interoperability against deterministic maps.
*Note:* If a user loses their wallet seed, any tokens in the Curve are permanently frozen, as there is no central mechanism to recover unspent outputs without the private key.

## 5. Centralization Vectors
**Risk:** Owner manipulation.
The `owner` address has the power to invoke `pause()`.
**Mitigation:** `pause()` only disables `buy` and `sell`; it explicitly does *not* disable `transfer`, preventing total freeze of peer-to-peer liquidity or secondary market trading. The owner cannot drain the reserve or alter the `curveSlope`.
