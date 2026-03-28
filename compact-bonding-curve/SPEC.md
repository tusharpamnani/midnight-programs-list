# Protocol Specification & Formal Invariants

## Core State Variables
- `totalSupply` ($S$): Total number of curve tokens in circulation.
- `reserveBalance` ($R$): Total amount of primary asset (DUST) held by the contract.
- `curveSlope` ($a$): Constant price multiplier.

## System Invariants
These invariants must hold true for all valid states of the bonding curve.

### 1. Global Solvency Invariant (Reserve Backing)
The amount of DUST in the reserve must always be exactly equal to the definite integral of the price function from 0 to the current supply.
$$ R = \int_0^S (a \cdot x) dx = \frac{a \cdot S^2}{2} $$
In discrete integer math, taking into account precision loss on division, the contract guarantees:
$$ 2 \cdot R \approx a \cdot S^2 $$
or precisely for any delta:
$$ 2 \cdot C = a \cdot S_{new}^2 - a \cdot S_{old}^2 $$
where $C$ is the exact cost or refund executed.

### 2. Supply Caps and Non-Negativity
- $S \ge 0$
- $R \ge 0$
- If $SupplyCap > 0$, then $S \le SupplyCap$

### 3. Price Monotonicity (Linearity)
The marginal price $P(s) = a \cdot s$.
- For any $s_1 < s_2$, $P(s_1) < P(s_2)$ given $a > 0$.
- Price at zero supply is strictly 0.

### 4. Conservation of Balance (Transfers)
For any transfer of amount $n$ from account $X$ to account $Y$:
- $S_{after} = S_{before}$ (Total supply is completely unchanged)
- $\sum Balances = S$ (Public supply equals the sum of private bounds, assuming all state is synced).
- $Balance_X(after) = Balance_X(before) - n$
- $Balance_Y(after) = Balance_Y(before) + n$

### 5. Reversibility of Operations (Mint/Burn Symmetry)
Minting $n$ tokens at supply $s$ and then immediately burning $n$ tokens restores the exact same reserve state.
- $R_{after\_mint\_then\_burn} = R_{initial}$

### 6. Slippage Bounds
- Mint operations must satisfy: $C \le MaxCost$
- Burn operations must satisfy: $Ref \ge MinRefund$
