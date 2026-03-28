# Protocol Specification: Private Linear Bonding Curve (PLBC)

**Version:** 1.0.0  
**Status:** Stable / Reference Implementation  
**Network:** Midnight Network  

---

## 1. Abstract

The Private Linear Bonding Curve (PLBC) protocol defines a decentralized automated market mechanism for the issuance and redemption of tokens on the Midnight Network. By utilizing a deterministic pricing curve, the protocol ensures continuous liquidity without the need for traditional order books. Leveraging Midnight’s Zero-Knowledge (ZK) architecture, the protocol maintains the confidentiality of participant balances while enforcing public state consistency and economic invariants.

## 2. Definitions and Notation

*   $s$: **Total Supply**. The cumulative number of tokens currently in circulation.
*   $n$: **Transaction Amount**. The number of tokens being minted or burned in a single operation.
*   $a$: **Slope Coefficient** (`curveSlope`). A constant parameter defining the rate of price appreciation.
*   $P(s)$: **Marginal Price**. The cost of the next infinitesimal unit of the token at supply $s$.
*   $R(s)$: **Reserve Balance**. The total amount of collateral (DUST) held by the contract to back the supply $s$.
*   $C(s, n)$: **Mint Cost**. The total collateral required to increase supply from $s$ to $s+n$.
*   $Ref(s, n)$: **Burn Refund**. The total collateral returned to a participant when decreasing supply from $s$ to $s-n$.

## 3. Mathematical Model

The protocol is governed by a linear price function. The relationship between supply and price is deterministic, ensuring that every token issued is fully backed by collateral according to the integral of the price curve.

## 4. Price Function $P(s)$

The marginal price is a linear function of the total supply:

$$P(s) = a \cdot s$$

This implies that the price starts at 0 when the supply is 0 and increases linearly as tokens are minted.

## 5. Reserve Function $R(s)$

The reserve balance required to back a total supply $s$ is the definite integral of the price function from 0 to $s$:

$$R(s) = \int_0^s P(x) \, dx = \int_0^s a \cdot x \, dx = \frac{a}{2}s^2$$

The quadratic relationship between supply and reserve ensures that the cost of participation increases as the market grows, rewarding early participants with lower entry prices.

## 6. Mint Operation Mechanics

A **Mint** (Buy) operation increases the total supply from $s_{old}$ to $s_{new} = s_{old} + n$. 

### Cost Calculation
The participant must provide an amount of collateral equal to the area under the curve between $s_{old}$ and $s_{new}$:

$$C(s, n) = R(s+n) - R(s) = \frac{a}{2}((s+n)^2 - s^2)$$

### Implementation Note
In the ZK circuit, this is verified using a witness-based property to ensure integer division does not break the reserve invariant:
$$2 \cdot Cost = a \cdot ((s+n)^2 - s^2)$$

## 7. Burn Operation Mechanics

A **Burn** (Sell) operation decreases the total supply from $s_{old}$ to $s_{new} = s_{old} - n$.

### Refund Calculation
The protocol returns collateral equal to the area under the curve removed by the reduction in supply:

$$Ref(s, n) = R(s) - R(s-n) = \frac{a}{2}(s^2 - (s-n)^2)$$

Due to the symmetry of the definite integral, the refund for burning $n$ tokens at supply $s$ is identical to the cost previously paid to mint $n$ tokens starting at supply $s-n$.

## 8. Protocol Invariants and Solvency

The following invariants are strictly enforced by the Midnight ledger and ZK circuits:

1.  **Full Backing Invariant**: At any block height $h$, the public ledger balance of the contract must satisfy $Balance \ge R(s)$.
2.  **Solvency Guarantee**: The protocol is mathematically incapable of a "bank run" failure; every circulating token has a guaranteed liquidation value defined by the curve, independent of other participants' behavior.
3.  **Monotonicity**: $P(s)$ is strictly increasing for $s > 0$.

## 9. Slippage Protection

Because Midnight transactions involve a transition of state that may be contested or superseded by other transactions in the same block, the protocol implements slippage guards:

*   **Max Cost ($C_{max}$)**: For mint operations, if the calculated $C(s, n) > C_{max}$, the transaction reverts.
*   **Min Refund ($Ref_{min}$)**: For burn operations, if the calculated $Ref(s, n) < Ref_{min}$, the transaction reverts.

## 10. Privacy Model

The PLBC utilizes Midnight's hybrid state model:

*   **Public Ledger State**: `totalSupply`, `reserveBalance`, `paused`, and `owner` are stored publicly to ensure all participants can calculate the current price.
*   **Private State**: Individual token balances are stored in persistent private state on the participant's local machine. 
*   **Confidential Transfers**: Tokens can be moved between users without revealing the sender, recipient, or amount to the public ledger, as only the encrypted state commitments are updated on-chain.

## 11. Identity and Address Normalization

To ensure seamless interoperability between external wallets and the smart contract's deterministic state maps, the PLBC protocol implements a strict **Address Normalization** standard.

*   **Canonical Identity**: The protocol explicitly uses **Unshielded Addresses** as the canonical identity for token ownership rather than Shielded Addresses or underlying Coin Public Keys. This ensures deterministic, public-facing identity mapping that facilitates direct peer-to-peer transfers without requiring out-of-band sender/receiver handshake protocols.
*   **Bech32m Standard**: All user-facing interfaces (CLI, UI) must accept addresses in the standard Midnight `Bech32m` format (e.g., `mn_addr_...`).
*   **Normalization Function**: Inside the contract's zero-knowledge maps (`Map<Bytes<32>, Uint<64>>`), identities are stored as 32-byte hashes. The normalization process decodes the Bech32m string into its raw payload bytes, and applies a `SHA-256` hash to guarantee a consistent, fixed-length 32-byte identity key.

## 12. Administrative Controls

*   **Pause Mechanism**: The contract owner may set the `paused` flag to `true`. While paused, `mint` and `burn` circuits will revert. `transfer` and `balanceOf` remain functional to allow users to move their assets.
*   **Ownership Transfer**: The current owner may designate a new address as the owner.
*   **Slope Initialization**: The slope $a$ is fixed at deployment and cannot be modified.

## 13. Supply Caps and Constraints

The protocol supports an optional `supplyCap`.
*   If `supplyCap > 0`, any mint operation resulting in $s + n > supplyCap$ will revert.
*   Calculations are performed using `Uint<64>`. Large slope values combined with large supply may result in arithmetic overflow. Participants should verify curve parameters before interaction.

## 14. Failure Conditions

1.  **Arithmetic Overflow**: If $(s+n)^2$ exceeds $2^{64}-1$, the circuit will fail to prove.
2.  **Insufficient Collateral**: If the participant's DUST balance is less than $C(s, n)$, the transaction will fail.
3.  **Circuit Contention**: High-frequency trading may result in "expected a cell" errors if the public state or private tree root moves between proof generation and submission.

## 15. Security Considerations

*   **Front-running**: While Midnight's ZK nature hides transaction details, the *intent* to mint or burn can be inferred by observers. The slippage guards are the primary defense.
*   **Flash Loans**: The curve is resistant to flash loan manipulation as the price is determined uniquement by supply, which requires actual collateral deposit to move.
*   **Key Security**: Loss of the wallet seed results in the permanent loss of private token balances, as the ledger only stores commitments.

## 16. Economic Properties

*   **Convexity**: The cost function is convex, meaning larger single-transaction mints are disproportionately more expensive than smaller ones, naturally dampening extreme volatility.
*   **Early Adopter Incentive**: The linear growth of $P(s)$ provides a direct incentive for early liquidity provision.

## 17. Limitations and Assumptions

*   **Linearity**: The model assumes a fixed linear slope. It does not account for dynamic adjustments based on external market data (Oracles).
*   **Finality**: Users must wait for block finality to ensure their private state update is immutable on the ledger.

## 17. Potential Extensions

*   **Fee Capture**: Implementing a protocol fee $\phi$ on every trade to build a secondary insurance fund or reward the owner.
*   **Dynamic Slopes**: Utilizing oracles to adjust $a$ based on external asset prices.
*   **Multi-Asset Curves**: Integrating multiple collateral types into a single pricing manifold.
