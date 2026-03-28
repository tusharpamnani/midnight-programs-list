# Curve Economics

This document explains the core economic properties, incentives, and algorithmic trade mechanics of the Midnight Linear Bonding Curve implementation.

## 1. Curve Shape: The Linear Invariant
The marginal price of the token scales strictly linearly with the total supply:
$$ P(S) = a \cdot S $$
Because price is linearly proportional to supply, the primary asset reserve (the area under the price curve) grows quadratically:
$$ R(S) = \frac{a \cdot S^2}{2} $$
This creates a fundamentally **convex** cost function, imposing increasingly steep barriers to entry (and highly rewarded exits) as the network grows.

## 2. Early Adopter Incentive
The linear shape heavily incentivises early market participation:
- At supply $S=0$, the spot price is 0.
- The first buyer accesses tokens at essentially fractional costs compared to the 100th buyer.
- This bootstraps liquidity natively, as participants naturally rush to "mint low and sell high".
- **Risk:** Extreme concentration of tokens in early blocks can lead to steep price spikes and dumps. The protocol assumes participants understand this dynamic before provisioning DUST.

## 3. Liquidity Depth
Unlike a constant-product Automated Market Maker (AMM) (e.g., Uniswap $x \cdot y = k$) which requires external liquidity providers (LPs) to deposit a paired pool of assets, a bonding curve acts as its own infinite counterparty.
- **Continuous Liquidity:** There is always guaranteed liquidity to buy from or sell to, directly against the smart contract.
- **100% Backing:** Every publicly circulating token is completely backed by the underlying reserve value strictly defined by the curve integral limit. The contract is mathematically incapable of becoming insolvent because no tokens can exist without their cost area having already been deposited into the backing reserve ledger.

## 4. Price Impact (Slippage)
Price Impact represents how much a single atomic trade shifts the marginal token price.
- Buying $n$ tokens shifts the spot price linearly from $P(S)$ to $P(S+n)$.
- The exact deterministic price impact is: $\Delta P = a \cdot n$.
- This means massive trades suffer proportionally higher average execution costs per-token compared to smaller fractional trades split across time, enforcing natural trade bounding and heavily dampening "whale" volatility.
