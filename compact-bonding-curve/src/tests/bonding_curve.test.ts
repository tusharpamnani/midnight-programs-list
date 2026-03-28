import { BondingCurveMath } from "../math.js";
import { ContractSimulator } from "../simulator.js";

/**
 * Test suite for the BondingCurve Compact contract.
 *
 * Structure mirrors the contract's own section layout:
 *   1.  Constructor validation
 *   2.  calculatePrice  /  getPrice
 *   3.  calculateMintCost  /  getSpotCost
 *   4.  calculateBurnRefund  /  getSpotRefund
 *   5.  Mathematical consistency
 *   6.  buy() — core behaviour
 *   7.  buy() — slippage guard (maxCost)
 *   8.  buy() — supply cap
 *   9.  buy() — paused guard
 *   10. sell() — core behaviour
 *   11. sell() — slippage guard (minRefund)
 *   12. sell() — balance ownership edge cases
 *   13. sell() — paused guard
 *   14. transfer()
 *   15. approve() and allowance()
 *   16. transferFrom()
 *   17. pause() / unpause()
 *   18. transferOwnership()
 *   19. Read-only query circuits
 *   20. Contract state simulation — multi-user scenarios
 *   21. Economic properties
 *   22. Integer arithmetic / witness integrity
 *   23. Edge cases
 *   24. Large-number stress tests
 *   25. Sequential trade simulation
 *   26. Randomised fuzz testing
 *   27. Multi-slope parameter tests
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Off-chain replica of verifiedHalfProduct: floor((slope × (sNew²−sOld²)) / 2) */
function expectedCost(slope: bigint, sOld: bigint, sNew: bigint): bigint {
    const deltaSq = sNew * sNew - sOld * sOld;
    return (slope * deltaSq) / 2n;
}

function randomBigInt(max: number): bigint {
    return BigInt(Math.floor(Math.random() * max));
}

/** Deterministic fake address — unique per label so tests stay isolated. */
function addr(label: string): Uint8Array {
    const buf = new Uint8Array(32);
    for (let i = 0; i < label.length && i < 32; i++) buf[i] = label.charCodeAt(i);
    return buf;
}

// Shared address fixtures
const OWNER = addr("owner");
const ALICE = addr("alice");
const BOB = addr("bob");
const CHARLIE = addr("charlie");

const MAX_U64 = 18_446_744_073_709_551_615n; // 2^64 − 1, used as "no slippage limit"

// ─── Constants ────────────────────────────────────────────────────────────────

const slope = 10n;

// ═══════════════════════════════════════════════════════════════════════════════
// 1. CONSTRUCTOR VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe("Constructor validation", () => {
    test("slope=0 is rejected", () => {
        expect(() => ContractSimulator.deploy(0n, OWNER, 0n)).toThrow(
            "Slope must be greater than zero"
        );
    });

    test("valid deployment initialises all ledger fields correctly", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        expect(c.totalSupply).toBe(0n);
        expect(c.reserveBalance).toBe(0n);
        expect(c.curveSlope).toBe(slope);
        expect(c.paused).toBe(false);
        expect(c.supplyCap).toBe(0n);
    });

    test("supply cap is stored correctly when provided", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 500n);
        expect(c.supplyCap).toBe(500n);
    });

    test("owner is stored correctly", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        expect(c.owner).toEqual(OWNER);
    });

    test("slope=0 rejected regardless of other params", () => {
        expect(() => ContractSimulator.deploy(0n, ALICE, 999n)).toThrow();
        expect(() => ContractSimulator.deploy(0n, OWNER, 0n)).toThrow();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. calculatePrice / getPrice — P(s) = slope × s
// ═══════════════════════════════════════════════════════════════════════════════

describe("calculatePrice / getPrice — P(s) = slope × s", () => {
    test("price at zero supply is zero", () => {
        expect(BondingCurveMath.calculatePrice(0n, slope)).toBe(0n);
    });

    test("price at known supply values", () => {
        expect(BondingCurveMath.calculatePrice(1n, slope)).toBe(10n);
        expect(BondingCurveMath.calculatePrice(10n, slope)).toBe(100n);
        expect(BondingCurveMath.calculatePrice(50n, slope)).toBe(500n);
        expect(BondingCurveMath.calculatePrice(100n, slope)).toBe(1000n);
    });

    test("price scales linearly with slope", () => {
        const s = 25n;
        expect(BondingCurveMath.calculatePrice(s, 1n)).toBe(25n);
        expect(BondingCurveMath.calculatePrice(s, 5n)).toBe(125n);
        expect(BondingCurveMath.calculatePrice(s, 20n)).toBe(500n);
    });

    test("price with slope=1 equals supply", () => {
        for (const s of [0n, 1n, 7n, 99n, 1000n]) {
            expect(BondingCurveMath.calculatePrice(s, 1n)).toBe(s);
        }
    });

    test("price strictly increases with supply", () => {
        let prev = BondingCurveMath.calculatePrice(0n, slope);
        for (let s = 1n; s <= 100n; s++) {
            const curr = BondingCurveMath.calculatePrice(s, slope);
            expect(curr).toBeGreaterThan(prev);
            prev = curr;
        }
    });

    test("price strictly decreases as supply decreases", () => {
        const prices = [100n, 50n, 20n, 1n].map(s =>
            BondingCurveMath.calculatePrice(s, slope)
        );
        for (let i = 1; i < prices.length; i++) {
            expect(prices[i]).toBeLessThan(prices[i - 1]);
        }
    });

    test("getPrice() on contract matches calculatePrice(totalSupply, slope)", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 30n, MAX_U64);
        expect(c.getPrice()).toBe(BondingCurveMath.calculatePrice(c.totalSupply, slope));
    });

    test("getPrice() rises after every buy", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        let prev = c.getPrice();
        for (let i = 0; i < 5; i++) {
            c.buy(ALICE, 10n, MAX_U64);
            const curr = c.getPrice();
            expect(curr).toBeGreaterThan(prev);
            prev = curr;
        }
    });

    test("getPrice() falls after every sell", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 100n, MAX_U64);
        let prev = c.getPrice();
        for (let i = 0; i < 5; i++) {
            c.sell(ALICE, 10n, 0n);
            const curr = c.getPrice();
            expect(curr).toBeLessThan(prev);
            prev = curr;
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. calculateMintCost / getSpotCost
// ═══════════════════════════════════════════════════════════════════════════════

describe("calculateMintCost / getSpotCost — integral from s to s+n", () => {
    test("mint 10 tokens from zero supply", () => {
        // (10/2)·(10²−0²) = 5·100 = 500
        expect(BondingCurveMath.calculateMintCost(0n, 10n, slope)).toBe(500n);
    });

    test("mint 1 token from zero supply", () => {
        expect(BondingCurveMath.calculateMintCost(0n, 1n, slope)).toBe(5n);
    });

    test("mint from non-zero supply", () => {
        // s=10, n=10 → s_new=20 → (10/2)·(400−100) = 1500
        expect(BondingCurveMath.calculateMintCost(10n, 10n, slope)).toBe(1500n);
    });

    test("cost matches area-under-curve formula across many cases", () => {
        const cases: [bigint, bigint][] = [
            [0n, 5n], [5n, 5n], [20n, 3n], [100n, 50n], [0n, 1n], [50n, 1n],
        ];
        for (const [s, n] of cases) {
            expect(BondingCurveMath.calculateMintCost(s, n, slope))
                .toBe(expectedCost(slope, s, s + n));
        }
    });

    test("buying zero tokens costs nothing", () => {
        expect(BondingCurveMath.calculateMintCost(0n, 0n, slope)).toBe(0n);
        expect(BondingCurveMath.calculateMintCost(100n, 0n, slope)).toBe(0n);
    });

    test("cost increases as starting supply increases (same n)", () => {
        const n = 5n;
        let prev = BondingCurveMath.calculateMintCost(0n, n, slope);
        for (let s = 10n; s <= 100n; s += 10n) {
            const curr = BondingCurveMath.calculateMintCost(s, n, slope);
            expect(curr).toBeGreaterThan(prev);
            prev = curr;
        }
    });

    test("cost increases as mint amount increases (same starting supply)", () => {
        const s = 10n;
        let prev = BondingCurveMath.calculateMintCost(s, 1n, slope);
        for (let n = 2n; n <= 20n; n++) {
            const curr = BondingCurveMath.calculateMintCost(s, n, slope);
            expect(curr).toBeGreaterThan(prev);
            prev = curr;
        }
    });

    test("cost with slope=1 produces correct value", () => {
        expect(BondingCurveMath.calculateMintCost(0n, 10n, 1n)).toBe(50n);
    });

    test("cost scales proportionally with slope", () => {
        const base = BondingCurveMath.calculateMintCost(0n, 10n, 1n);
        expect(BondingCurveMath.calculateMintCost(0n, 10n, 5n)).toBe(base * 5n);
        expect(BondingCurveMath.calculateMintCost(0n, 10n, 10n)).toBe(base * 10n);
    });

    test("getSpotCost() matches calculateMintCost at current supply", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 20n, MAX_U64);
        const n = 15n;
        expect(c.getSpotCost(n))
            .toBe(BondingCurveMath.calculateMintCost(c.totalSupply, n, slope));
    });

    test("getSpotCost() does NOT mutate state", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 20n, MAX_U64);
        const supplyBefore = c.totalSupply;
        const reserveBefore = c.reserveBalance;
        c.getSpotCost(10n);
        expect(c.totalSupply).toBe(supplyBefore);
        expect(c.reserveBalance).toBe(reserveBefore);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. calculateBurnRefund / getSpotRefund
// ═══════════════════════════════════════════════════════════════════════════════

describe("calculateBurnRefund / getSpotRefund — integral from s-n to s", () => {
    test("burn 10 tokens from supply=20", () => {
        expect(BondingCurveMath.calculateBurnRefund(20n, 10n, slope)).toBe(1500n);
    });

    test("burn 1 token from supply=1", () => {
        expect(BondingCurveMath.calculateBurnRefund(1n, 1n, slope)).toBe(5n);
    });

    test("refund matches area-under-curve formula", () => {
        const cases: [bigint, bigint][] = [
            [10n, 5n], [20n, 10n], [100n, 50n], [50n, 1n], [5n, 3n],
        ];
        for (const [s, n] of cases) {
            expect(BondingCurveMath.calculateBurnRefund(s, n, slope))
                .toBe(expectedCost(slope, s - n, s));
        }
    });

    test("burning zero tokens refunds nothing", () => {
        expect(BondingCurveMath.calculateBurnRefund(10n, 0n, slope)).toBe(0n);
        expect(BondingCurveMath.calculateBurnRefund(100n, 0n, slope)).toBe(0n);
    });

    test("burning entire supply returns all reserve", () => {
        const s = 50n;
        expect(BondingCurveMath.calculateBurnRefund(s, s, slope))
            .toBe(BondingCurveMath.calculateMintCost(0n, s, slope));
    });

    test("burning more than supply throws", () => {
        expect(() => BondingCurveMath.calculateBurnRefund(10n, 11n, slope)).toThrow();
        expect(() => BondingCurveMath.calculateBurnRefund(0n, 1n, slope)).toThrow();
        expect(() => BondingCurveMath.calculateBurnRefund(5n, 100n, slope)).toThrow();
    });

    test("refund decreases as supply decreases (same n)", () => {
        const n = 5n;
        let prev = BondingCurveMath.calculateBurnRefund(100n, n, slope);
        for (let s = 90n; s >= 10n; s -= 10n) {
            const curr = BondingCurveMath.calculateBurnRefund(s, n, slope);
            expect(curr).toBeLessThan(prev);
            prev = curr;
        }
    });

    test("getSpotRefund() matches calculateBurnRefund at current supply", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 50n, MAX_U64);
        const n = 20n;
        expect(c.getSpotRefund(n))
            .toBe(BondingCurveMath.calculateBurnRefund(c.totalSupply, n, slope));
    });

    test("getSpotRefund() does NOT mutate state", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 50n, MAX_U64);
        const supplyBefore = c.totalSupply;
        const reserveBefore = c.reserveBalance;
        c.getSpotRefund(10n);
        expect(c.totalSupply).toBe(supplyBefore);
        expect(c.reserveBalance).toBe(reserveBefore);
    });

    test("getSpotRefund() throws when n > totalSupply", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 10n, MAX_U64);
        expect(() => c.getSpotRefund(11n)).toThrow(
            "Cannot quote refund for more than total supply"
        );
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. MATHEMATICAL CONSISTENCY
// ═══════════════════════════════════════════════════════════════════════════════

describe("Mathematical Consistency", () => {
    test("mint then burn same amount is perfectly reversible", () => {
        for (const [s, n] of [[0n, 10n], [10n, 5n], [100n, 50n]] as [bigint, bigint][]) {
            const cost = BondingCurveMath.calculateMintCost(s, n, slope);
            const refund = BondingCurveMath.calculateBurnRefund(s + n, n, slope);
            expect(cost).toBe(refund);
        }
    });

    test("area under curve: cost = integral formula", () => {
        const s = 20n, n = 5n, s2 = s + n;
        expect(BondingCurveMath.calculateMintCost(s, n, slope))
            .toBe((slope * (s2 * s2 - s * s)) / 2n);
    });

    test("additive: cost(s→s+a) + cost(s+a→s+a+b) = cost(s→s+a+b)", () => {
        const s = 10n, a = 5n, b = 8n;
        expect(
            BondingCurveMath.calculateMintCost(s, a, slope) +
            BondingCurveMath.calculateMintCost(s + a, b, slope)
        ).toBe(BondingCurveMath.calculateMintCost(s, a + b, slope));
    });

    test("burn additivity: refund(s, a+b) = refund(s, b) + refund(s-b, a)", () => {
        const s = 30n, a = 5n, b = 8n;
        expect(
            BondingCurveMath.calculateBurnRefund(s, b, slope) +
            BondingCurveMath.calculateBurnRefund(s - b, a, slope)
        ).toBe(BondingCurveMath.calculateBurnRefund(s, a + b, slope));
    });

    test("splitting buy into single-token trades equals one bulk buy", () => {
        const s = 0n, n = 10n;
        let split = 0n;
        for (let i = 0n; i < n; i++) split += BondingCurveMath.calculateMintCost(s + i, 1n, slope);
        expect(split).toBe(BondingCurveMath.calculateMintCost(s, n, slope));
    });

    test("cost is always non-negative", () => {
        for (const [s, n] of [[0n, 1n], [0n, 100n], [50n, 50n], [1000n, 1n]]) {
            expect(BondingCurveMath.calculateMintCost(s, n, slope)).toBeGreaterThanOrEqual(0n);
        }
    });

    test("refund is always non-negative", () => {
        for (const [s, n] of [[1n, 1n], [10n, 5n], [100n, 100n], [1000n, 1n]]) {
            expect(BondingCurveMath.calculateBurnRefund(s, n, slope)).toBeGreaterThanOrEqual(0n);
        }
    });

    test("partial refund never exceeds the total amount paid to reach that supply", () => {
        const s = 50n, n = 20n;
        expect(BondingCurveMath.calculateBurnRefund(s, n, slope))
            .toBeLessThanOrEqual(BondingCurveMath.calculateMintCost(0n, s, slope));
    });

    test("reserve always equals integral(0..totalSupply) after any trade sequence", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 30n, MAX_U64);
        c.buy(BOB, 20n, MAX_U64);
        c.sell(ALICE, 10n, 0n);
        c.buy(CHARLIE, 5n, MAX_U64);
        c.sell(BOB, 15n, 0n);
        expect(c.reserveBalance)
            .toBe(BondingCurveMath.calculateMintCost(0n, c.totalSupply, slope));
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. buy() — CORE BEHAVIOUR
// ═══════════════════════════════════════════════════════════════════════════════

describe("buy() — core behaviour", () => {
    test("increases totalSupply by n", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 15n, MAX_U64);
        expect(c.totalSupply).toBe(15n);
    });

    test("increases reserveBalance by exact bonding-curve cost", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 10n, MAX_U64);
        expect(c.reserveBalance)
            .toBe(BondingCurveMath.calculateMintCost(0n, 10n, slope));
    });

    test("credits buyer's balance with n tokens", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 25n, MAX_U64);
        expect(c.balanceOf(ALICE)).toBe(25n);
    });

    test("two sequential buys by same address accumulate balance", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 10n, MAX_U64);
        c.buy(ALICE, 15n, MAX_U64);
        expect(c.balanceOf(ALICE)).toBe(25n);
    });

    test("two different buyers each hold their own tokens", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 10n, MAX_U64);
        c.buy(BOB, 20n, MAX_U64);
        expect(c.balanceOf(ALICE)).toBe(10n);
        expect(c.balanceOf(BOB)).toBe(20n);
        expect(c.totalSupply).toBe(30n);
    });

    test("buy(n=0) throws", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        expect(() => c.buy(ALICE, 0n, MAX_U64)).toThrow(
            "Purchase amount must be greater than zero"
        );
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. buy() — SLIPPAGE GUARD (maxCost)
// ═══════════════════════════════════════════════════════════════════════════════

describe("buy() — maxCost slippage guard", () => {
    test("buy succeeds when cost exactly equals maxCost", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        const cost = BondingCurveMath.calculateMintCost(0n, 10n, slope);
        expect(() => c.buy(ALICE, 10n, cost)).not.toThrow();
    });

    test("buy succeeds when cost is below maxCost", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        expect(() => c.buy(ALICE, 10n, MAX_U64)).not.toThrow();
    });

    test("buy reverts when cost exceeds maxCost", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        const cost = BondingCurveMath.calculateMintCost(0n, 10n, slope);
        expect(() => c.buy(ALICE, 10n, cost - 1n)).toThrow(
            "Cost exceeds maxCost slippage limit"
        );
    });

    test("state is unchanged after a reverted buy (slippage)", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        try { c.buy(ALICE, 10n, 1n); } catch { }
        expect(c.totalSupply).toBe(0n);
        expect(c.reserveBalance).toBe(0n);
        expect(c.balanceOf(ALICE)).toBe(0n);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. buy() — SUPPLY CAP
// ═══════════════════════════════════════════════════════════════════════════════

describe("buy() — supply cap", () => {
    test("buy succeeds when new supply equals cap exactly", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 50n);
        expect(() => c.buy(ALICE, 50n, MAX_U64)).not.toThrow();
        expect(c.totalSupply).toBe(50n);
    });

    test("buy reverts when new supply would exceed cap by 1", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 50n);
        expect(() => c.buy(ALICE, 51n, MAX_U64)).toThrow(
            "Purchase would exceed supply cap"
        );
    });

    test("buy reverts on second purchase that would breach cap", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 50n);
        c.buy(ALICE, 40n, MAX_U64);
        expect(() => c.buy(ALICE, 11n, MAX_U64)).toThrow(
            "Purchase would exceed supply cap"
        );
    });

    test("cap=0 means uncapped — large buy succeeds", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        expect(() => c.buy(ALICE, 1_000_000n, MAX_U64)).not.toThrow();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. buy() — PAUSED GUARD
// ═══════════════════════════════════════════════════════════════════════════════

describe("buy() — paused guard", () => {
    test("buy reverts when contract is paused", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.pause(OWNER);
        expect(() => c.buy(ALICE, 10n, MAX_U64)).toThrow("Contract is paused");
    });

    test("buy succeeds after unpause", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.pause(OWNER);
        c.unpause(OWNER);
        expect(() => c.buy(ALICE, 10n, MAX_U64)).not.toThrow();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. sell() — CORE BEHAVIOUR
// ═══════════════════════════════════════════════════════════════════════════════

describe("sell() — core behaviour", () => {
    test("decreases totalSupply by n", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 20n, MAX_U64);
        c.sell(ALICE, 8n, 0n);
        expect(c.totalSupply).toBe(12n);
    });

    test("decreases reserveBalance by exact bonding-curve refund", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 20n, MAX_U64);
        const refund = BondingCurveMath.calculateBurnRefund(20n, 8n, slope);
        c.sell(ALICE, 8n, 0n);
        expect(c.reserveBalance)
            .toBe(BondingCurveMath.calculateMintCost(0n, 20n, slope) - refund);
    });

    test("debits seller's balance by n", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 20n, MAX_U64);
        c.sell(ALICE, 8n, 0n);
        expect(c.balanceOf(ALICE)).toBe(12n);
    });

    test("sell entire balance zeroes it out", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 20n, MAX_U64);
        c.sell(ALICE, 20n, 0n);
        expect(c.balanceOf(ALICE)).toBe(0n);
        expect(c.totalSupply).toBe(0n);
    });

    test("sell(n=0) throws", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 10n, MAX_U64);
        expect(() => c.sell(ALICE, 0n, 0n)).toThrow(
            "Sale amount must be greater than zero"
        );
    });

    test("sell more than totalSupply throws", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 10n, MAX_U64);
        expect(() => c.sell(ALICE, 11n, 0n)).toThrow(
            "Cannot sell more than total supply"
        );
    });

    test("sell from zero balance throws", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 10n, MAX_U64);
        expect(() => c.sell(BOB, 5n, 0n)).toThrow("Insufficient token balance");
    });

    test("seller cannot sell more than their own balance even if supply is larger", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 5n, MAX_U64);
        c.buy(BOB, 50n, MAX_U64);
        expect(() => c.sell(ALICE, 10n, 0n)).toThrow("Insufficient token balance");
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. sell() — SLIPPAGE GUARD (minRefund)
// ═══════════════════════════════════════════════════════════════════════════════

describe("sell() — minRefund slippage guard", () => {
    test("sell succeeds when refund exactly equals minRefund", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 20n, MAX_U64);
        const refund = BondingCurveMath.calculateBurnRefund(20n, 10n, slope);
        expect(() => c.sell(ALICE, 10n, refund)).not.toThrow();
    });

    test("sell succeeds when refund is above minRefund", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 20n, MAX_U64);
        expect(() => c.sell(ALICE, 10n, 0n)).not.toThrow();
    });

    test("sell reverts when refund is below minRefund", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 20n, MAX_U64);
        const refund = BondingCurveMath.calculateBurnRefund(20n, 10n, slope);
        expect(() => c.sell(ALICE, 10n, refund + 1n)).toThrow(
            "Refund below minRefund slippage limit"
        );
    });

    test("state is unchanged after a reverted sell (slippage)", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 20n, MAX_U64);
        const supplyBefore = c.totalSupply;
        const reserveBefore = c.reserveBalance;
        const balBefore = c.balanceOf(ALICE);
        try { c.sell(ALICE, 10n, MAX_U64); } catch { }
        expect(c.totalSupply).toBe(supplyBefore);
        expect(c.reserveBalance).toBe(reserveBefore);
        expect(c.balanceOf(ALICE)).toBe(balBefore);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. sell() — BALANCE OWNERSHIP EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════════

describe("sell() — balance ownership edge cases", () => {
    test("selling only deducts from the seller's own balance", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 10n, MAX_U64);
        c.buy(BOB, 10n, MAX_U64);
        c.sell(ALICE, 10n, 0n);
        expect(c.balanceOf(ALICE)).toBe(0n);
        expect(c.balanceOf(BOB)).toBe(10n);
        expect(c.totalSupply).toBe(10n);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 13. sell() — PAUSED GUARD
// ═══════════════════════════════════════════════════════════════════════════════

describe("sell() — paused guard", () => {
    test("sell reverts when contract is paused", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 20n, MAX_U64);
        c.pause(OWNER);
        expect(() => c.sell(ALICE, 10n, 0n)).toThrow("Contract is paused");
    });

    test("sell succeeds after unpause", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 20n, MAX_U64);
        c.pause(OWNER);
        c.unpause(OWNER);
        expect(() => c.sell(ALICE, 10n, 0n)).not.toThrow();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 14. transfer()
// ═══════════════════════════════════════════════════════════════════════════════

describe("transfer()", () => {
    test("moves tokens from sender to recipient", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 20n, MAX_U64);
        c.transfer(ALICE, BOB, 8n);
        expect(c.balanceOf(ALICE)).toBe(12n);
        expect(c.balanceOf(BOB)).toBe(8n);
    });

    test("totalSupply and reserve are unchanged by transfer", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 20n, MAX_U64);
        const supply = c.totalSupply;
        const reserve = c.reserveBalance;
        c.transfer(ALICE, BOB, 5n);
        expect(c.totalSupply).toBe(supply);
        expect(c.reserveBalance).toBe(reserve);
    });

    test("transfer full balance", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 15n, MAX_U64);
        c.transfer(ALICE, BOB, 15n);
        expect(c.balanceOf(ALICE)).toBe(0n);
        expect(c.balanceOf(BOB)).toBe(15n);
    });

    test("transfer zero tokens throws", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 15n, MAX_U64);
        expect(() => c.transfer(ALICE, BOB, 0n)).toThrow(
            "Transfer amount must be greater than zero"
        );
    });

    test("transfer more than balance throws", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 10n, MAX_U64);
        expect(() => c.transfer(ALICE, BOB, 11n)).toThrow(
            "Insufficient balance for transfer"
        );
    });

    test("transfer from zero balance throws", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        expect(() => c.transfer(ALICE, BOB, 1n)).toThrow(
            "Insufficient balance for transfer"
        );
    });

    test("recipient already holding tokens: amounts accumulate", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 20n, MAX_U64);
        c.buy(BOB, 10n, MAX_U64);
        c.transfer(ALICE, BOB, 5n);
        expect(c.balanceOf(BOB)).toBe(15n);
    });

    test("transfer to self does not change balance", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 20n, MAX_U64);
        c.transfer(ALICE, ALICE, 5n);
        expect(c.balanceOf(ALICE)).toBe(20n);
    });

    test("transfer is NOT blocked when contract is paused", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 10n, MAX_U64);
        c.pause(OWNER);
        // Only buy/sell assert !paused; transfer has no such check
        expect(() => c.transfer(ALICE, BOB, 5n)).not.toThrow();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 15. approve() and allowance()
// ═══════════════════════════════════════════════════════════════════════════════

describe("approve() and allowance()", () => {
    test("allowance starts at zero before any approval", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        expect(c.allowance(ALICE, BOB)).toBe(0n);
    });

    test("approve sets allowance correctly", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.approve(ALICE, BOB, 100n);
        expect(c.allowance(ALICE, BOB)).toBe(100n);
    });

    test("approve overwrites previous allowance", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.approve(ALICE, BOB, 100n);
        c.approve(ALICE, BOB, 50n);
        expect(c.allowance(ALICE, BOB)).toBe(50n);
    });

    test("approve(0) effectively revokes allowance", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.approve(ALICE, BOB, 100n);
        c.approve(ALICE, BOB, 0n);
        expect(c.allowance(ALICE, BOB)).toBe(0n);
    });

    test("allowances for different spenders on same owner are independent", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.approve(ALICE, BOB, 50n);
        c.approve(ALICE, CHARLIE, 75n);
        expect(c.allowance(ALICE, BOB)).toBe(50n);
        expect(c.allowance(ALICE, CHARLIE)).toBe(75n);
    });

    test("allowances for different owners are independent", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.approve(ALICE, CHARLIE, 30n);
        c.approve(BOB, CHARLIE, 70n);
        expect(c.allowance(ALICE, CHARLIE)).toBe(30n);
        expect(c.allowance(BOB, CHARLIE)).toBe(70n);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 16. transferFrom()
// ═══════════════════════════════════════════════════════════════════════════════

describe("transferFrom()", () => {
    test("moves tokens and deducts allowance correctly", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 30n, MAX_U64);
        c.approve(ALICE, BOB, 20n);
        c.transferFrom(BOB, ALICE, CHARLIE, 15n);
        expect(c.balanceOf(ALICE)).toBe(15n);
        expect(c.balanceOf(CHARLIE)).toBe(15n);
        expect(c.allowance(ALICE, BOB)).toBe(5n);
    });

    test("transferFrom full allowance zeroes it", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 10n, MAX_U64);
        c.approve(ALICE, BOB, 10n);
        c.transferFrom(BOB, ALICE, CHARLIE, 10n);
        expect(c.allowance(ALICE, BOB)).toBe(0n);
    });

    test("transferFrom without prior approval throws", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 10n, MAX_U64);
        expect(() => c.transferFrom(BOB, ALICE, CHARLIE, 5n)).toThrow(
            "Transfer amount exceeds allowance"
        );
    });

    test("transferFrom more than allowance throws", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 20n, MAX_U64);
        c.approve(ALICE, BOB, 5n);
        expect(() => c.transferFrom(BOB, ALICE, CHARLIE, 6n)).toThrow(
            "Transfer amount exceeds allowance"
        );
    });

    test("transferFrom more than owner's balance throws", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 5n, MAX_U64);
        c.approve(ALICE, BOB, 100n); // generous allowance but balance only 5
        expect(() => c.transferFrom(BOB, ALICE, CHARLIE, 6n)).toThrow(
            "Insufficient balance for transferFrom"
        );
    });

    test("transferFrom zero amount throws", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 10n, MAX_U64);
        c.approve(ALICE, BOB, 50n);
        expect(() => c.transferFrom(BOB, ALICE, CHARLIE, 0n)).toThrow(
            "Transfer amount must be greater than zero"
        );
    });

    test("totalSupply and reserve unchanged by transferFrom", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 20n, MAX_U64);
        const supply = c.totalSupply;
        const reserve = c.reserveBalance;
        c.approve(ALICE, BOB, 10n);
        c.transferFrom(BOB, ALICE, CHARLIE, 10n);
        expect(c.totalSupply).toBe(supply);
        expect(c.reserveBalance).toBe(reserve);
    });

    test("sequential transferFroms each deduct from remaining allowance", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 30n, MAX_U64);
        c.approve(ALICE, BOB, 20n);
        c.transferFrom(BOB, ALICE, CHARLIE, 8n);
        c.transferFrom(BOB, ALICE, CHARLIE, 7n);
        expect(c.allowance(ALICE, BOB)).toBe(5n); // 20 − 8 − 7
        expect(c.balanceOf(CHARLIE)).toBe(15n);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 17. pause() / unpause()
// ═══════════════════════════════════════════════════════════════════════════════

describe("pause() / unpause()", () => {
    test("pause sets paused=true", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.pause(OWNER);
        expect(c.paused).toBe(true);
    });

    test("unpause sets paused=false", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.pause(OWNER);
        c.unpause(OWNER);
        expect(c.paused).toBe(false);
    });

    test("non-owner cannot pause", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        expect(() => c.pause(ALICE)).toThrow("Only owner can pause");
    });

    test("non-owner cannot unpause", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.pause(OWNER);
        expect(() => c.unpause(ALICE)).toThrow("Only owner can unpause");
    });

    test("pausing an already-paused contract throws", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.pause(OWNER);
        expect(() => c.pause(OWNER)).toThrow("Contract is already paused");
    });

    test("unpausing an already-active contract throws", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        expect(() => c.unpause(OWNER)).toThrow("Contract is not paused");
    });

    test("transfer is NOT blocked when paused", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 10n, MAX_U64);
        c.pause(OWNER);
        expect(() => c.transfer(ALICE, BOB, 5n)).not.toThrow();
    });

    test("can pause → unpause → pause again successfully", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.pause(OWNER);
        c.unpause(OWNER);
        expect(() => c.pause(OWNER)).not.toThrow();
        expect(c.paused).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 18. transferOwnership()
// ═══════════════════════════════════════════════════════════════════════════════

describe("transferOwnership()", () => {
    test("owner field is updated to new address", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.transferOwnership(OWNER, ALICE);
        expect(c.owner).toEqual(ALICE);
    });

    test("new owner can pause", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.transferOwnership(OWNER, ALICE);
        expect(() => c.pause(ALICE)).not.toThrow();
    });

    test("old owner can no longer pause after transfer", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.transferOwnership(OWNER, ALICE);
        expect(() => c.pause(OWNER)).toThrow("Only owner can pause");
    });

    test("non-owner cannot transfer ownership", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        expect(() => c.transferOwnership(ALICE, BOB)).toThrow(
            "Only owner can transfer ownership"
        );
    });

    test("ownership can be transferred a second time by the new owner", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.transferOwnership(OWNER, ALICE);
        c.transferOwnership(ALICE, BOB);
        expect(c.owner).toEqual(BOB);
    });

    test("old owner can no longer transfer ownership after handoff", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.transferOwnership(OWNER, ALICE);
        expect(() => c.transferOwnership(OWNER, BOB)).toThrow(
            "Only owner can transfer ownership"
        );
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 19. READ-ONLY QUERY CIRCUITS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Read-only query circuits", () => {
    test("getSupply() matches totalSupply ledger field", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 35n, MAX_U64);
        expect(c.getSupply()).toBe(c.totalSupply);
    });

    test("getReserve() matches reserveBalance ledger field", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 35n, MAX_U64);
        expect(c.getReserve()).toBe(c.reserveBalance);
    });

    test("balanceOf() returns zero for unknown address", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        expect(c.balanceOf(addr("unknown"))).toBe(0n);
    });

    test("balanceOf() reflects buys, sells, and transfers accurately", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 20n, MAX_U64);
        c.sell(ALICE, 5n, 0n);
        c.transfer(ALICE, BOB, 3n);
        expect(c.balanceOf(ALICE)).toBe(12n); // 20 − 5 − 3
        expect(c.balanceOf(BOB)).toBe(3n);
    });

    test("allowance() returns zero before any approval", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        expect(c.allowance(ALICE, BOB)).toBe(0n);
    });

    test("allowance() reflects approve and transferFrom consumption", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 20n, MAX_U64);
        c.approve(ALICE, BOB, 15n);
        c.transferFrom(BOB, ALICE, CHARLIE, 6n);
        expect(c.allowance(ALICE, BOB)).toBe(9n); // 15 − 6
    });

    test("none of the query circuits modify state", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 50n, MAX_U64);
        const snap = { supply: c.totalSupply, reserve: c.reserveBalance };
        c.getPrice();
        c.getSupply();
        c.getReserve();
        c.getSpotCost(5n);
        c.getSpotRefund(5n);
        c.balanceOf(ALICE);
        c.allowance(ALICE, BOB);
        expect(c.totalSupply).toBe(snap.supply);
        expect(c.reserveBalance).toBe(snap.reserve);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 20. CONTRACT STATE SIMULATION — MULTI-USER SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Contract state simulation — multi-user scenarios", () => {
    test("reserve always equals integral(0..supply) after a complex sequence", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 30n, MAX_U64);
        c.buy(BOB, 20n, MAX_U64);
        c.sell(ALICE, 10n, 0n);
        c.buy(CHARLIE, 5n, MAX_U64);
        c.sell(BOB, 15n, 0n);
        expect(c.reserveBalance)
            .toBe(BondingCurveMath.calculateMintCost(0n, c.totalSupply, slope));
    });

    test("5 buyers then 3 sellers: reserve remains solvent throughout", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        const buyers = [ALICE, BOB, CHARLIE, addr("d"), addr("e")];
        const sellers = [ALICE, BOB, CHARLIE];
        for (const b of buyers) c.buy(b, 10n, MAX_U64);
        for (const s of sellers) {
            expect(c.getSpotRefund(10n)).toBeLessThanOrEqual(c.reserveBalance);
            c.sell(s, 10n, 0n);
        }
        expect(c.totalSupply).toBe(20n);
        expect(c.reserveBalance).toBeGreaterThanOrEqual(0n);
    });

    test("full round-trip: mint then burn entire supply → both ledgers = 0", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 100n, MAX_U64);
        c.sell(ALICE, 100n, 0n);
        expect(c.totalSupply).toBe(0n);
        expect(c.reserveBalance).toBe(0n);
    });

    test("tokens transferred between users don't affect curve invariants", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 50n, MAX_U64);
        c.transfer(ALICE, BOB, 25n);
        expect(c.totalSupply).toBe(50n);
        expect(c.reserveBalance)
            .toBe(BondingCurveMath.calculateMintCost(0n, 50n, slope));
        // Bob can now sell his received tokens
        c.sell(BOB, 25n, 0n);
        expect(c.totalSupply).toBe(25n);
    });

    test("approve + transferFrom chain preserves global reserve invariant", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 40n, MAX_U64);
        c.approve(ALICE, BOB, 20n);
        c.transferFrom(BOB, ALICE, CHARLIE, 20n);
        // CHARLIE now holds 20, ALICE holds 20
        c.sell(CHARLIE, 10n, 0n);
        expect(c.reserveBalance)
            .toBe(BondingCurveMath.calculateMintCost(0n, c.totalSupply, slope));
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 21. ECONOMIC PROPERTIES
// ═══════════════════════════════════════════════════════════════════════════════

describe("Economic Properties", () => {
    test("larger single trades cost disproportionately more (convexity)", () => {
        const small = BondingCurveMath.calculateMintCost(0n, 10n, slope);
        const large = BondingCurveMath.calculateMintCost(0n, 20n, slope);
        expect(large).toBeGreaterThan(small * 2n);
    });

    test("splitting buys has same total cost as one bulk buy", () => {
        const a = BondingCurveMath.calculateMintCost(0n, 10n, slope);
        const b = BondingCurveMath.calculateMintCost(10n, 10n, slope);
        const bulk = BondingCurveMath.calculateMintCost(0n, 20n, slope);
        expect(a + b).toBe(bulk);
    });

    test("buy then immediate sell is break-even", () => {
        const s = 30n, n = 5n;
        expect(BondingCurveMath.calculateMintCost(s, n, slope))
            .toBe(BondingCurveMath.calculateBurnRefund(s + n, n, slope));
    });

    test("price impact: larger trade moves spot price more", () => {
        const base = BondingCurveMath.calculatePrice(50n, slope);
        const afterSmall = BondingCurveMath.calculatePrice(51n, slope);
        const afterLarge = BondingCurveMath.calculatePrice(60n, slope);
        expect(afterLarge - base).toBeGreaterThan(afterSmall - base);
    });

    test("slope=0 is outright rejected (no free-token exploit)", () => {
        expect(() => ContractSimulator.deploy(0n, OWNER, 0n)).toThrow();
    });

    test("reserve strictly increases with each consecutive buy", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        let prev = c.reserveBalance;
        for (let i = 1; i <= 10; i++) {
            c.buy(ALICE, 1n, MAX_U64);
            expect(c.reserveBalance).toBeGreaterThan(prev);
            prev = c.reserveBalance;
        }
    });

    test("reserve strictly decreases with each consecutive sell", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 100n, MAX_U64);
        let prev = c.reserveBalance;
        for (let i = 0; i < 10; i++) {
            c.sell(ALICE, 1n, 0n);
            expect(c.reserveBalance).toBeLessThan(prev);
            prev = c.reserveBalance;
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 22. INTEGER ARITHMETIC / WITNESS INTEGRITY
// ═══════════════════════════════════════════════════════════════════════════════

describe("Integer arithmetic / witness integrity", () => {
    test("slope=1, n=1, s=0: floor(1/2) = 0", () => {
        expect(BondingCurveMath.calculateMintCost(0n, 1n, 1n)).toBe(0n);
    });

    test("witness check: 2*cost == product OR 2*cost+1 == product", () => {
        const cases: [bigint, bigint, bigint][] = [
            [0n, 1n, 1n], [0n, 3n, 1n], [1n, 2n, 1n], [0n, 7n, 3n],
        ];
        for (const [s, n, sl] of cases) {
            const sNew = s + n;
            const product = sl * (sNew * sNew - s * s);
            const cost = BondingCurveMath.calculateMintCost(s, n, sl);
            expect(2n * cost === product || 2n * cost + 1n === product).toBe(true);
        }
    });

    test("slope=1 odd-supply: mint/burn symmetric under floor division", () => {
        const s = 3n, n = 2n;
        expect(BondingCurveMath.calculateMintCost(s, n, 1n))
            .toBe(BondingCurveMath.calculateBurnRefund(s + n, n, 1n));
    });

    test("no overflow for large-but-safe Uint<64> values", () => {
        const s = 1_000_000n, n = 1_000n;
        const cost = BondingCurveMath.calculateMintCost(s, n, slope);
        const refund = BondingCurveMath.calculateBurnRefund(s + n, n, slope);
        expect(cost).toBeGreaterThan(0n);
        expect(cost).toBe(refund);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 23. EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════════

describe("Edge cases", () => {
    test("buy then immediately sell 1 token from supply=0 returns to initial state", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 1n, MAX_U64);
        c.sell(ALICE, 1n, 0n);
        expect(c.totalSupply).toBe(0n);
        expect(c.reserveBalance).toBe(0n);
    });

    test("buy at exactly supply cap, then one more reverts", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 10n);
        c.buy(ALICE, 10n, MAX_U64);
        expect(() => c.buy(ALICE, 1n, MAX_U64)).toThrow(
            "Purchase would exceed supply cap"
        );
    });

    test("sell entire supply from a single holder drains reserve to 0", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 50n, MAX_U64);
        c.sell(ALICE, 50n, 0n);
        expect(c.reserveBalance).toBe(0n);
        expect(c.totalSupply).toBe(0n);
    });

    test("price at supply=0 is zero", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        expect(c.getPrice()).toBe(0n);
    });

    test("approve then immediately revoke blocks transferFrom", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 10n, MAX_U64);
        c.approve(ALICE, BOB, 10n);
        c.approve(ALICE, BOB, 0n);
        expect(() => c.transferFrom(BOB, ALICE, CHARLIE, 1n)).toThrow(
            "Transfer amount exceeds allowance"
        );
    });

    test("getSpotRefund on empty supply throws", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        expect(() => c.getSpotRefund(1n)).toThrow(
            "Cannot quote refund for more than total supply"
        );
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 24. LARGE-NUMBER STRESS TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Large-number stress tests", () => {
    test("1 billion token buy from zero supply", () => {
        const n = 1_000_000_000n;
        expect(BondingCurveMath.calculateMintCost(0n, n, slope))
            .toBe(expectedCost(slope, 0n, n));
    });

    test("large supply with small incremental buy", () => {
        const s = 100_000_000_000n, n = 1_000n;
        expect(BondingCurveMath.calculateMintCost(s, n, slope))
            .toBe(expectedCost(slope, s, s + n));
    });

    test("large supply: mint then burn is perfectly reversible", () => {
        const s = 50_000_000n, n = 1_000n;
        expect(BondingCurveMath.calculateMintCost(s, n, slope))
            .toBe(BondingCurveMath.calculateBurnRefund(s + n, n, slope));
    });

    test("price at 1-billion supply", () => {
        const s = 1_000_000_000n;
        expect(BondingCurveMath.calculatePrice(s, slope)).toBe(s * slope);
    });

    test("5 sequential large buys: reserve equals integral(0..supply)", () => {
        let supply = 0n, reserve = 0n;
        const step = 10_000_000n;
        for (let i = 0; i < 5; i++) {
            reserve += BondingCurveMath.calculateMintCost(supply, step, slope);
            supply += step;
        }
        expect(reserve).toBe(BondingCurveMath.calculateMintCost(0n, supply, slope));
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 25. SEQUENTIAL TRADE SIMULATION
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sequential trade simulation", () => {
    test("10 sequential buyers of 10 tokens each: reserve equals integral(0..100)", () => {
        let supply = 0n, reserve = 0n;
        for (let i = 0; i < 10; i++) {
            reserve += BondingCurveMath.calculateMintCost(supply, 10n, slope);
            supply += 10n;
        }
        expect(supply).toBe(100n);
        expect(reserve).toBe(BondingCurveMath.calculateMintCost(0n, 100n, slope));
    });

    test("interleaved buy/sell keeps reserve solvent at every step", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        const ops: Array<{ caller: Uint8Array; type: "buy" | "sell"; n: bigint }> = [
            { caller: ALICE, type: "buy", n: 30n },
            { caller: ALICE, type: "sell", n: 10n },
            { caller: BOB, type: "buy", n: 20n },
            { caller: BOB, type: "sell", n: 5n },
            { caller: CHARLIE, type: "buy", n: 10n },
            { caller: ALICE, type: "sell", n: 15n },
        ];
        for (const op of ops) {
            if (op.type === "buy") {
                c.buy(op.caller, op.n, MAX_U64);
            } else {
                expect(c.getSpotRefund(op.n)).toBeLessThanOrEqual(c.reserveBalance);
                c.sell(op.caller, op.n, 0n);
            }
            expect(c.totalSupply).toBeGreaterThanOrEqual(0n);
            expect(c.reserveBalance).toBeGreaterThanOrEqual(0n);
        }
    });

    test("buy 20, sell 10: reserve equals integral(0..10)", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 20n, MAX_U64);
        c.sell(ALICE, 10n, 0n);
        expect(c.reserveBalance)
            .toBe(BondingCurveMath.calculateMintCost(0n, 10n, slope));
    });

    test("full round-trip through the contract: supply and reserve both zero", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        c.buy(ALICE, 100n, MAX_U64);
        c.sell(ALICE, 100n, 0n);
        expect(c.totalSupply).toBe(0n);
        expect(c.reserveBalance).toBe(0n);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 26. RANDOMISED FUZZ TESTING
// ═══════════════════════════════════════════════════════════════════════════════

describe("Randomised fuzz testing", () => {
    test("100 random buy/sell rounds: supply and reserve stay non-negative", () => {
        let supply = 0n, reserve = 0n;
        for (let i = 0; i < 100; i++) {
            const n = randomBigInt(20) + 1n;
            reserve += BondingCurveMath.calculateMintCost(supply, n, slope);
            supply += n;
            const sell = randomBigInt(Number(n));
            if (sell > 0n) {
                reserve -= BondingCurveMath.calculateBurnRefund(supply, sell, slope);
                supply -= sell;
            }
            expect(supply).toBeGreaterThanOrEqual(0n);
            expect(reserve).toBeGreaterThanOrEqual(0n);
        }
    });

    test("random buy/sell: reserve always equals integral(0..supply)", () => {
        let supply = 0n, reserve = 0n;
        for (let i = 0; i < 50; i++) {
            const n = randomBigInt(15) + 1n;
            reserve += BondingCurveMath.calculateMintCost(supply, n, slope);
            supply += n;
            if (supply > 1n) {
                const raw = randomBigInt(Number(supply) / 2) + 1n;
                const sell = raw > supply ? 1n : raw;
                reserve -= BondingCurveMath.calculateBurnRefund(supply, sell, slope);
                supply -= sell;
            }
            expect(reserve).toBe(BondingCurveMath.calculateMintCost(0n, supply, slope));
        }
    });

    test("randomised slope: mint-burn reversibility always holds", () => {
        for (let i = 0; i < 50; i++) {
            const sl = randomBigInt(50) + 1n;
            const s = randomBigInt(200);
            const n = randomBigInt(50) + 1n;
            expect(BondingCurveMath.calculateMintCost(s, n, sl))
                .toBe(BondingCurveMath.calculateBurnRefund(s + n, n, sl));
        }
    });

    test("random splits equal bulk: cost(s,a)+cost(s+a,b) = cost(s,a+b)", () => {
        for (let i = 0; i < 50; i++) {
            const s = randomBigInt(100);
            const a = randomBigInt(20) + 1n;
            const b = randomBigInt(20) + 1n;
            expect(
                BondingCurveMath.calculateMintCost(s, a, slope) +
                BondingCurveMath.calculateMintCost(s + a, b, slope)
            ).toBe(BondingCurveMath.calculateMintCost(s, a + b, slope));
        }
    });

    test("random multi-user contract simulation: reserve invariant holds throughout", () => {
        const c = ContractSimulator.deploy(slope, OWNER, 0n);
        const users = [ALICE, BOB, CHARLIE];
        for (let i = 0; i < 60; i++) {
            const user = users[i % users.length];
            const n = randomBigInt(10) + 1n;
            c.buy(user, n, MAX_U64);
            const bal = c.balanceOf(user);
            if (bal > 0n) {
                const raw = randomBigInt(Number(bal)) + 1n;
                const sell = raw > bal ? 1n : raw;
                if (sell > 0n) c.sell(user, sell, 0n);
            }
        }
        expect(c.reserveBalance)
            .toBe(BondingCurveMath.calculateMintCost(0n, c.totalSupply, slope));
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 27. MULTI-SLOPE PARAMETER TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Multi-slope parameter tests", () => {
    const slopes = [1n, 2n, 5n, 10n, 100n, 1000n];

    test("mint-burn reversibility holds for every slope", () => {
        for (const sl of slopes) {
            const s = 50n, n = 20n;
            expect(BondingCurveMath.calculateMintCost(s, n, sl))
                .toBe(BondingCurveMath.calculateBurnRefund(s + n, n, sl));
        }
    });

    test("cost is proportional to slope", () => {
        const s = 10n, n = 4n;
        const base = BondingCurveMath.calculateMintCost(s, n, 1n);
        for (const sl of slopes) {
            expect(BondingCurveMath.calculateMintCost(s, n, sl)).toBe(base * sl);
        }
    });

    test("price is proportional to slope", () => {
        const supply = 25n;
        const base = BondingCurveMath.calculatePrice(supply, 1n);
        for (const sl of slopes) {
            expect(BondingCurveMath.calculatePrice(supply, sl)).toBe(base * sl);
        }
    });

    test("additive property holds for all slopes", () => {
        const s = 0n, a = 10n, b = 10n;
        for (const sl of slopes) {
            expect(
                BondingCurveMath.calculateMintCost(s, a, sl) +
                BondingCurveMath.calculateMintCost(s + a, b, sl)
            ).toBe(BondingCurveMath.calculateMintCost(s, a + b, sl));
        }
    });

    test("constructor rejects slope=0 regardless of other parameters", () => {
        expect(() => ContractSimulator.deploy(0n, OWNER, 0n)).toThrow();
        expect(() => ContractSimulator.deploy(0n, ALICE, 999n)).toThrow();
    });
});