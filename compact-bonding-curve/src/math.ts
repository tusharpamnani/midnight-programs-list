/**
 * Linear Bonding Curve Math
 * 
 * P(s) = a * s
 * Cost(s, n) = (a/2) * ((s+n)^2 - s^2)
 * Refund(s, n) = (a/2) * (s^2 - (s-n)^2)
 */

export class BondingCurveMath {
    /**
     * Calculate the cost to mint n tokens given current supply s and slope a.
     * cost = floor((a/2) * ((s+n)^2 - s^2))
     */
    static calculateMintCost(supply: bigint, n: bigint, slope: bigint): bigint {
        const newSupply = supply + n;
        const deltaSq = (newSupply * newSupply) - (supply * supply);
        const totalProduct = slope * deltaSq;
        return totalProduct / 2n;
    }

    /**
     * Calculate the refund to burn n tokens given current supply s and slope a.
     * refund = floor((a/2) * (s^2 - (s-n)^2))
     */
    static calculateBurnRefund(supply: bigint, n: bigint, slope: bigint): bigint {
        if (n > supply) throw new Error("Cannot burn more than supply");
        const newSupply = supply - n;
        const deltaSq = (supply * supply) - (newSupply * newSupply);
        const totalProduct = slope * deltaSq;
        return totalProduct / 2n;
    }

    /**
     * Get marginal price at current supply s and slope a.
     * P(s) = a * s
     */
    static calculatePrice(supply: bigint, slope: bigint): bigint {
        return slope * supply;
    }
}
