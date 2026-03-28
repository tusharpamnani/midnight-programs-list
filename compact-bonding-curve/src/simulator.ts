import { BondingCurveMath } from "./math.js";

/**
 * A TypeScript simulator for the BondingCurve Compact contract.
 * Used for unit testing the contract logic in-memory without a full ledger.
 */
export class ContractSimulator {
    public totalSupply: bigint = 0n;
    public reserveBalance: bigint = 0n;
    public curveSlope: bigint;
    public paused: boolean = false;
    public owner: Uint8Array;
    public supplyCap: bigint;
    private balances: Map<string, bigint> = new Map();
    private allowances: Map<string, Map<string, bigint>> = new Map();

    private constructor(slope: bigint, owner: Uint8Array, cap: bigint) {
        if (slope <= 0n) {
            throw new Error("Slope must be greater than zero");
        }
        this.curveSlope = slope;
        this.owner = owner;
        this.supplyCap = cap;
    }

    /**
     * Deploy a new instance of the contract simulator.
     */
    static deploy(slope: bigint, owner: Uint8Array, cap: bigint): ContractSimulator {
        return new ContractSimulator(slope, owner, cap);
    }

    private toKey(addr: Uint8Array): string {
        return Array.from(addr)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
    }

    /**
     * Mint n new curve tokens.
     */
    buy(caller: Uint8Array, n: bigint, maxCost: bigint): void {
        if (this.paused) throw new Error("Contract is paused");
        if (n <= 0n) throw new Error("Purchase amount must be greater than zero");

        const s = this.totalSupply;
        const newSupply = s + n;

        if (this.supplyCap !== 0n && newSupply > this.supplyCap) {
            throw new Error("Purchase would exceed supply cap");
        }

        const cost = BondingCurveMath.calculateMintCost(s, n, this.curveSlope);

        if (cost > maxCost) {
            throw new Error("Cost exceeds maxCost slippage limit");
        }

        const callerKey = this.toKey(caller);
        const prevBalance = this.balances.get(callerKey) || 0n;
        this.balances.set(callerKey, prevBalance + n);

        this.totalSupply = newSupply;
        this.reserveBalance += cost;
    }

    /**
     * Burn n existing curve tokens and receive a reserve refund.
     */
    sell(caller: Uint8Array, n: bigint, minRefund: bigint): void {
        if (this.paused) throw new Error("Contract is paused");
        if (n <= 0n) throw new Error("Sale amount must be greater than zero");

        const s = this.totalSupply;
        if (n > s) throw new Error("Cannot sell more than total supply");

        const callerKey = this.toKey(caller);
        const balance = this.balances.get(callerKey) || 0n;
        if (n > balance) throw new Error("Insufficient token balance");

        const newSupply = s - n;
        const refund = BondingCurveMath.calculateBurnRefund(s, n, this.curveSlope);

        if (refund < minRefund) {
            throw new Error("Refund below minRefund slippage limit");
        }

        if (refund > this.reserveBalance) {
            throw new Error("Insufficient reserve balance for refund");
        }

        this.balances.set(callerKey, balance - n);
        this.totalSupply = newSupply;
        this.reserveBalance -= refund;
    }

    /**
     * Move amount tokens from one account to another.
     */
    transfer(caller: Uint8Array, to: Uint8Array, amount: bigint): void {
        if (amount <= 0n) throw new Error("Transfer amount must be greater than zero");

        const callerKey = this.toKey(caller);
        const fromBalance = this.balances.get(callerKey) || 0n;
        if (amount > fromBalance) throw new Error("Insufficient balance for transfer");

        const toKey = this.toKey(to);
        const targetBalance = this.balances.get(toKey) || 0n;

        // Self-transfer check to avoid double-deductions if we used simple logic
        if (callerKey === toKey) return;

        this.balances.set(callerKey, fromBalance - amount);
        this.balances.set(toKey, targetBalance + amount);
    }

    /**
     * Grant spender the right to transfer up to amount tokens.
     */
    approve(caller: Uint8Array, spender: Uint8Array, amount: bigint): void {
        const callerKey = this.toKey(caller);
        const spenderKey = this.toKey(spender);

        let ownerAllowances = this.allowances.get(callerKey);
        if (!ownerAllowances) {
            ownerAllowances = new Map();
            this.allowances.set(callerKey, ownerAllowances);
        }
        ownerAllowances.set(spenderKey, amount);
    }

    /**
     * Transfer tokens on behalf of an owner using an allowance.
     */
    transferFrom(caller: Uint8Array, tokenOwner: Uint8Array, to: Uint8Array, amount: bigint): void {
        if (amount <= 0n) throw new Error("Transfer amount must be greater than zero");

        const ownerKey = this.toKey(tokenOwner);
        const spenderKey = this.toKey(caller);
        const toKey = this.toKey(to);

        const ownerAllowances = this.allowances.get(ownerKey);
        const allowed = ownerAllowances?.get(spenderKey) || 0n;

        if (amount > allowed) throw new Error("Transfer amount exceeds allowance");

        const fromBalance = this.balances.get(ownerKey) || 0n;
        if (amount > fromBalance) throw new Error("Insufficient balance for transferFrom");

        const targetBalance = this.balances.get(toKey) || 0n;

        // Update allowance
        ownerAllowances!.set(spenderKey, allowed - amount);

        // If owner is same as recipient, don't change balances
        if (ownerKey === toKey) return;

        this.balances.set(ownerKey, fromBalance - amount);
        this.balances.set(toKey, targetBalance + amount);
    }

    /**
     * Halt all buy and sell activity.
     */
    pause(caller: Uint8Array): void {
        if (this.toKey(caller) !== this.toKey(this.owner)) {
            throw new Error("Only owner can pause");
        }
        if (this.paused) throw new Error("Contract is already paused");
        this.paused = true;
    }

    /**
     * Resume normal buy and sell activity.
     */
    unpause(caller: Uint8Array): void {
        if (this.toKey(caller) !== this.toKey(this.owner)) {
            throw new Error("Only owner can unpause");
        }
        if (!this.paused) throw new Error("Contract is not paused");
        this.paused = false;
    }

    /**
     * Hand ownership to a new address.
     */
    transferOwnership(caller: Uint8Array, newOwner: Uint8Array): void {
        if (this.toKey(caller) !== this.toKey(this.owner)) {
            throw new Error("Only owner can transfer ownership");
        }
        this.owner = newOwner;
    }

    // --- Read-only Queries ---

    getPrice(): bigint {
        return this.curveSlope * this.totalSupply;
    }

    getSpotCost(n: bigint): bigint {
        return BondingCurveMath.calculateMintCost(this.totalSupply, n, this.curveSlope);
    }

    getSpotRefund(n: bigint): bigint {
        if (n > this.totalSupply) {
            throw new Error("Cannot quote refund for more than total supply");
        }
        return BondingCurveMath.calculateBurnRefund(this.totalSupply, n, this.curveSlope);
    }

    getSupply(): bigint {
        return this.totalSupply;
    }

    getReserve(): bigint {
        return this.reserveBalance;
    }

    balanceOf(account: Uint8Array): bigint {
        return this.balances.get(this.toKey(account)) || 0n;
    }

    allowance(owner: Uint8Array, spender: Uint8Array): bigint {
        return this.allowances.get(this.toKey(owner))?.get(this.toKey(spender)) || 0n;
    }
}
