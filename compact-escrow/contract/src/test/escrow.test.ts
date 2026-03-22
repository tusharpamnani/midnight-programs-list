/**
 * Comprehensive test suite for the Midnight Escrow Smart Contract.
 *
 * Contract state enum (as numeric values from ledger):
 *   0 = EMPTY     (initial)
 *   1 = FUNDED    (after createEscrow)
 *   2 = RELEASED  (after release)
 *   3 = REFUNDED  (after refund)
 *
 * Ledger fields:
 *   buyer            – derived public key of the buyer (hash of secretKey)
 *   seller           – derived public key of the seller
 *   termsCommitment  – persistentCommit(amount || hash(releaseSecret), nonce)
 *   state            – EscrowState enum (number)
 *   round            – Counter (bigint)
 *
 * Key design note: `buyer` and `seller` on the ledger are DERIVED keys
 * (i.e., persistentHash(["midnight:escrow:key", secretKey])), NOT raw secret
 * keys. The simulator must derive these values by running createEscrow with
 * the correct secretKey in private state and inspecting ledger.buyer.
 */

import { EscrowSimulator } from "./escrow-simulator.js";
import { pureCircuits } from "../managed/escrow/contract/index.js";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { describe, it, expect, beforeEach } from "vitest";
import type { EscrowPrivateState } from "../witnesses.js";

setNetworkId("undeployed");

// ---------------------------------------------------------------------------
// CONSTANTS – Compact state enum values
// ---------------------------------------------------------------------------
const STATE = { EMPTY: 0, FUNDED: 1, RELEASED: 2, REFUNDED: 3 } as const;

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

/** Return a deterministic 32-byte Uint8Array filled with `fill`. */
const b32 = (fill: number): Uint8Array => new Uint8Array(32).fill(fill);

/**
 * Build an EscrowSimulator and derive the participant's public key.
 *
 * The contract derives `buyer = persistentHash(["midnight:escrow:key", secretKey])`.
 * The only way to get that value deterministically in tests is to run a fresh
 * `createEscrow` with a dummy seller and read back `ledger.buyer`.
 */
const derivePK = (secretKey: Uint8Array): Uint8Array => {
    const sim = new EscrowSimulator({
        secretKey,
        releaseSecret: b32(0),
        nonce: b32(0),
        amount: 0n,
    });
    sim.createEscrow(b32(0xff), 0n); // dummy seller
    return sim.getLedger().buyer;    // this is deriveKey(secretKey)
};

/**
 * Build a fresh simulator as *buyer* (Bob) funded with seller PK set to Alice.
 * Returns both the simulator and Alice's derived PK for convenience.
 */
const makeFundedEscrow = (opts: {
    buyerSK?: Uint8Array;
    sellerSK?: Uint8Array;
    secret?: Uint8Array;
    nonce?: Uint8Array;
    amount?: bigint;
} = {}): { sim: EscrowSimulator; alicePK: Uint8Array; bobPK: Uint8Array } => {
    const buyerSK = opts.buyerSK ?? b32(0x10);
    const sellerSK = opts.sellerSK ?? b32(0x20);
    const secret = opts.secret ?? b32(0x30);
    const nonce = opts.nonce ?? b32(0x40);
    const amount = opts.amount ?? 100n;

    const alicePK = derivePK(sellerSK);
    const bobPK = derivePK(buyerSK);

    const sim = new EscrowSimulator({ secretKey: buyerSK, releaseSecret: secret, nonce, amount });
    sim.createEscrow(alicePK, amount);
    return { sim, alicePK, bobPK };
};

// ============================================================================
// 1. DEPLOYMENT
// ============================================================================
describe("deployment", () => {
    it("initialises with state = EMPTY", () => {
        const sim = new EscrowSimulator({
            secretKey: b32(1), releaseSecret: b32(2), nonce: b32(3), amount: 100n
        });
        expect(sim.getLedger().state).toBe(STATE.EMPTY);
    });

    it("initialises with zero-filled buyer and seller ledger fields", () => {
        const sim = new EscrowSimulator({
            secretKey: b32(1), releaseSecret: b32(2), nonce: b32(3), amount: 100n
        });
        const ledger = sim.getLedger();
        expect(ledger.buyer).toEqual(new Uint8Array(32));
        expect(ledger.seller).toEqual(new Uint8Array(32));
        expect(ledger.termsCommitment).toEqual(new Uint8Array(32));
    });

    it("initialises with round = 0", () => {
        const sim = new EscrowSimulator({
            secretKey: b32(1), releaseSecret: b32(2), nonce: b32(3), amount: 100n
        });
        expect(sim.getLedger().round).toBe(0n);
    });

    it("two fresh simulators start with identical ledger state", () => {
        const ps = { secretKey: b32(1), releaseSecret: b32(2), nonce: b32(3), amount: 100n };
        const sim0 = new EscrowSimulator(ps);
        const sim1 = new EscrowSimulator(ps);
        expect(sim0.getLedger().state).toBe(sim1.getLedger().state);
        expect(sim0.getLedger().buyer).toEqual(sim1.getLedger().buyer);
    });
});

// ============================================================================
// 2. ESCROW LIFECYCLE (HAPPY PATHS)
// ============================================================================
describe("escrow lifecycle", () => {
    it("transitions EMPTY → FUNDED on createEscrow", () => {
        const alicePK = derivePK(b32(0x20));
        const sim = new EscrowSimulator({
            secretKey: b32(0x10), releaseSecret: b32(0x30), nonce: b32(0x40), amount: 100n
        });
        sim.createEscrow(alicePK, 100n);
        expect(sim.getLedger().state).toBe(STATE.FUNDED);
    });

    it("records seller PK on the ledger after createEscrow", () => {
        const alicePK = derivePK(b32(0x20));
        const sim = new EscrowSimulator({
            secretKey: b32(0x10), releaseSecret: b32(0x30), nonce: b32(0x40), amount: 100n
        });
        sim.createEscrow(alicePK, 100n);
        expect(sim.getLedger().seller).toEqual(alicePK);
    });

    it("records buyer's derived PK on the ledger after createEscrow", () => {
        const buyerSK = b32(0x10);
        const alicePK = derivePK(b32(0x20));
        const bobPK = derivePK(buyerSK);
        const sim = new EscrowSimulator({
            secretKey: buyerSK, releaseSecret: b32(0x30), nonce: b32(0x40), amount: 100n
        });
        sim.createEscrow(alicePK, 100n);
        expect(sim.getLedger().buyer).toEqual(bobPK);
    });

    it("stores a non-trivial termsCommitment after createEscrow", () => {
        const { sim } = makeFundedEscrow();
        const commitment = sim.getLedger().termsCommitment;
        expect(commitment).not.toEqual(new Uint8Array(32));
        expect(commitment.length).toBe(32);
    });

    it("seller can acceptEscrow while state remains FUNDED", () => {
        const sellerSK = b32(0x20);
        const { sim } = makeFundedEscrow({ sellerSK });
        sim.updatePrivateState({ secretKey: sellerSK });
        sim.acceptEscrow();
        // state does not change on accept — it stays FUNDED until release
        expect(sim.getLedger().state).toBe(STATE.FUNDED);
    });

    it("transitions FUNDED → RELEASED on release with correct secret/nonce/amount", () => {
        const sellerSK = b32(0x20);
        const secret = b32(0x30);
        const nonce = b32(0x40);
        const amount = 100n;
        const { sim } = makeFundedEscrow({ sellerSK, secret, nonce, amount });
        sim.updatePrivateState({ secretKey: sellerSK, releaseSecret: secret, nonce, amount });
        sim.release();
        expect(sim.getLedger().state).toBe(STATE.RELEASED);
    });

    it("transitions FUNDED → REFUNDED on refund by buyer", () => {
        const buyerSK = b32(0x10);
        const { sim } = makeFundedEscrow({ buyerSK });
        sim.updatePrivateState({ secretKey: buyerSK });
        sim.refund();
        expect(sim.getLedger().state).toBe(STATE.REFUNDED);
    });

    it("full lifecycle: create → accept → release succeeds end-to-end", () => {
        const buyerSK = b32(0x10);
        const sellerSK = b32(0x20);
        const secret = b32(0x30);
        const nonce = b32(0x40);
        const amount = 500n;

        const alicePK = derivePK(sellerSK);
        // Bob funds
        const sim = new EscrowSimulator({ secretKey: buyerSK, releaseSecret: secret, nonce, amount });
        expect(sim.getLedger().state).toBe(STATE.EMPTY);
        sim.createEscrow(alicePK, amount);
        expect(sim.getLedger().state).toBe(STATE.FUNDED);
        // Alice accepts
        sim.updatePrivateState({ secretKey: sellerSK, releaseSecret: secret, nonce, amount });
        sim.acceptEscrow();
        expect(sim.getLedger().state).toBe(STATE.FUNDED);
        // Alice releases
        sim.release();
        expect(sim.getLedger().state).toBe(STATE.RELEASED);
    });
});

// ============================================================================
// 3. ACCESS CONTROL
// ============================================================================
describe("access control", () => {
    it("rejects acceptEscrow by buyer (not seller)", () => {
        const buyerSK = b32(0x10);
        const { sim } = makeFundedEscrow({ buyerSK });
        // Bob tries to accept his own escrow — he is the buyer, not the seller
        sim.updatePrivateState({ secretKey: buyerSK });
        expect(() => sim.acceptEscrow()).toThrowError("Only seller can accept");
    });

    it("rejects acceptEscrow by a third party", () => {
        const charlieSK = b32(0xcc);
        const { sim } = makeFundedEscrow();
        sim.updatePrivateState({ secretKey: charlieSK });
        expect(() => sim.acceptEscrow()).toThrowError("Only seller can accept");
    });

    it("rejects release by buyer", () => {
        const buyerSK = b32(0x10);
        const sellerSK = b32(0x20);
        const secret = b32(0x30);
        const nonce = b32(0x40);
        const amount = 100n;
        const { sim } = makeFundedEscrow({ buyerSK, sellerSK, secret, nonce, amount });
        // Bob (buyer) attempts to release
        sim.updatePrivateState({ secretKey: buyerSK, releaseSecret: secret, nonce, amount });
        expect(() => sim.release()).toThrowError("Only seller can release");
    });

    it("rejects release by a third party", () => {
        const charlieSK = b32(0xcc);
        const secret = b32(0x30);
        const nonce = b32(0x40);
        const amount = 100n;
        const { sim } = makeFundedEscrow({ secret, nonce, amount });
        sim.updatePrivateState({ secretKey: charlieSK, releaseSecret: secret, nonce, amount });
        expect(() => sim.release()).toThrowError("Only seller can release");
    });

    it("rejects refund by seller", () => {
        const sellerSK = b32(0x20);
        const { sim } = makeFundedEscrow({ sellerSK });
        sim.updatePrivateState({ secretKey: sellerSK });
        expect(() => sim.refund()).toThrowError("Only buyer can refund");
    });

    it("rejects refund by a third party", () => {
        const charlieSK = b32(0xcc);
        const { sim } = makeFundedEscrow();
        sim.updatePrivateState({ secretKey: charlieSK });
        expect(() => sim.refund()).toThrowError("Only buyer can refund");
    });
});

// ============================================================================
// 4. VALIDATION (incorrect secret / nonce / amount)
// ============================================================================
describe("secret and nonce validation", () => {
    it("release fails with wrong secret", () => {
        const sellerSK = b32(0x20);
        const nonce = b32(0x40);
        const amount = 100n;
        const { sim } = makeFundedEscrow({
            sellerSK, secret: b32(0x30), nonce, amount
        });
        // Provide wrong secret
        sim.updatePrivateState({ secretKey: sellerSK, releaseSecret: b32(0xaa), nonce, amount });
        expect(() => sim.release()).toThrowError("Invalid release proof");
    });

    it("release fails with wrong nonce", () => {
        const sellerSK = b32(0x20);
        const secret = b32(0x30);
        const amount = 100n;
        const { sim } = makeFundedEscrow({
            sellerSK, secret, nonce: b32(0x40), amount
        });
        // Provide wrong nonce
        sim.updatePrivateState({ secretKey: sellerSK, releaseSecret: secret, nonce: b32(0xbb), amount });
        expect(() => sim.release()).toThrowError("Invalid release proof");
    });

    it("release fails with wrong amount", () => {
        const sellerSK = b32(0x20);
        const secret = b32(0x30);
        const nonce = b32(0x40);
        const amount = 100n;
        const { sim } = makeFundedEscrow({ sellerSK, secret, nonce, amount });
        // Provide wrong amount (1 instead of 100)
        sim.updatePrivateState({ secretKey: sellerSK, releaseSecret: secret, nonce, amount: 1n });
        expect(() => sim.release()).toThrowError("Invalid release proof");
    });

    it("release fails when all three (secret, nonce, amount) are wrong", () => {
        const sellerSK = b32(0x20);
        const { sim } = makeFundedEscrow({ sellerSK });
        sim.updatePrivateState({ secretKey: sellerSK, releaseSecret: b32(0xff), nonce: b32(0xff), amount: 999n });
        expect(() => sim.release()).toThrowError("Invalid release proof");
    });

    it("pureCircuits.getReleaseHash produces deterministic output for the same secret", () => {
        const secret = b32(0x30);
        const h1 = pureCircuits.getReleaseHash(secret);
        const h2 = pureCircuits.getReleaseHash(secret);
        expect(h1).toEqual(h2);
    });

    it("pureCircuits.getReleaseHash produces different output for different secrets", () => {
        const h1 = pureCircuits.getReleaseHash(b32(0x30));
        const h2 = pureCircuits.getReleaseHash(b32(0x31));
        expect(h1).not.toEqual(h2);
    });
});

// ============================================================================
// 5. STATE MACHINE – INVALID TRANSITIONS
// ============================================================================
describe("invalid operations", () => {
    it("createEscrow on FUNDED contract is rejected", () => {
        const { sim, alicePK } = makeFundedEscrow();
        // Contract is now FUNDED; calling createEscrow again must fail
        expect(() => sim.createEscrow(alicePK, 100n)).toThrowError("Escrow already exists");
    });

    it("acceptEscrow on EMPTY contract is rejected", () => {
        const sellerSK = b32(0x20);
        const sellerPK = derivePK(sellerSK);
        const sim = new EscrowSimulator({
            secretKey: sellerSK, releaseSecret: b32(0x30), nonce: b32(0x40), amount: 100n
        });
        // Contract is still EMPTY
        expect(() => sim.acceptEscrow()).toThrowError("Escrow not funded");
    });

    it("release on EMPTY contract is rejected", () => {
        const sellerSK = b32(0x20);
        const sim = new EscrowSimulator({
            secretKey: sellerSK, releaseSecret: b32(0x30), nonce: b32(0x40), amount: 100n
        });
        expect(() => sim.release()).toThrowError("Invalid state");
    });

    it("refund on EMPTY contract is rejected", () => {
        const buyerSK = b32(0x10);
        const sim = new EscrowSimulator({
            secretKey: buyerSK, releaseSecret: b32(0x30), nonce: b32(0x40), amount: 100n
        });
        expect(() => sim.refund()).toThrowError("Invalid state");
    });

    it("release after refund is rejected (double-spend prevention)", () => {
        const buyerSK = b32(0x10);
        const sellerSK = b32(0x20);
        const secret = b32(0x30);
        const nonce = b32(0x40);
        const amount = 100n;
        const { sim } = makeFundedEscrow({ buyerSK, sellerSK, secret, nonce, amount });
        // Buyer refunds
        sim.updatePrivateState({ secretKey: buyerSK });
        sim.refund();
        expect(sim.getLedger().state).toBe(STATE.REFUNDED);
        // Seller now tries to release — must fail
        sim.updatePrivateState({ secretKey: sellerSK, releaseSecret: secret, nonce, amount });
        expect(() => sim.release()).toThrowError("Invalid state");
    });

    it("refund after release is rejected (double-spend prevention)", () => {
        const buyerSK = b32(0x10);
        const sellerSK = b32(0x20);
        const secret = b32(0x30);
        const nonce = b32(0x40);
        const amount = 100n;
        const { sim } = makeFundedEscrow({ buyerSK, sellerSK, secret, nonce, amount });
        // Seller releases
        sim.updatePrivateState({ secretKey: sellerSK, releaseSecret: secret, nonce, amount });
        sim.release();
        expect(sim.getLedger().state).toBe(STATE.RELEASED);
        // Buyer now tries to refund — must fail
        sim.updatePrivateState({ secretKey: buyerSK });
        expect(() => sim.refund()).toThrowError("Invalid state");
    });

    it("double release is rejected", () => {
        const sellerSK = b32(0x20);
        const secret = b32(0x30);
        const nonce = b32(0x40);
        const amount = 100n;
        const { sim } = makeFundedEscrow({ sellerSK, secret, nonce, amount });
        sim.updatePrivateState({ secretKey: sellerSK, releaseSecret: secret, nonce, amount });
        sim.release();
        expect(() => sim.release()).toThrowError("Invalid state");
    });

    it("double refund is rejected", () => {
        const buyerSK = b32(0x10);
        const { sim } = makeFundedEscrow({ buyerSK });
        sim.updatePrivateState({ secretKey: buyerSK });
        sim.refund();
        expect(() => sim.refund()).toThrowError("Invalid state");
    });

    it("double acceptEscrow is rejected (state must be FUNDED)", () => {
        // acceptEscrow asserts state === FUNDED. After a release the state is RELEASED.
        const sellerSK = b32(0x20);
        const secret = b32(0x30);
        const nonce = b32(0x40);
        const amount = 100n;
        const { sim } = makeFundedEscrow({ sellerSK, secret, nonce, amount });
        sim.updatePrivateState({ secretKey: sellerSK, releaseSecret: secret, nonce, amount });
        sim.acceptEscrow();
        sim.release();
        // Now state = RELEASED; calling accept again must fail
        expect(() => sim.acceptEscrow()).toThrowError("Escrow not funded");
    });

    it("createEscrow after release is rejected", () => {
        const buyerSK = b32(0x10);
        const sellerSK = b32(0x20);
        const secret = b32(0x30);
        const nonce = b32(0x40);
        const amount = 100n;
        const alicePK = derivePK(sellerSK);
        const { sim } = makeFundedEscrow({ buyerSK, sellerSK, secret, nonce, amount });
        sim.updatePrivateState({ secretKey: sellerSK, releaseSecret: secret, nonce, amount });
        sim.release();
        sim.updatePrivateState({ secretKey: buyerSK, releaseSecret: secret, nonce, amount });
        expect(() => sim.createEscrow(alicePK, amount)).toThrowError("Escrow already exists");
    });
});

// ============================================================================
// 6. EDGE CASES
// ============================================================================
describe("edge cases", () => {
    it("zero-amount escrow can be funded and released", () => {
        const sellerSK = b32(0x20);
        const secret = b32(0x30);
        const nonce = b32(0x40);
        const amount = 0n;
        const { sim } = makeFundedEscrow({ sellerSK, secret, nonce, amount });
        expect(sim.getLedger().state).toBe(STATE.FUNDED);
        sim.updatePrivateState({ secretKey: sellerSK, releaseSecret: secret, nonce, amount });
        sim.release();
        expect(sim.getLedger().state).toBe(STATE.RELEASED);
    });

    it("zero-amount escrow can be refunded by buyer", () => {
        const buyerSK = b32(0x10);
        const amount = 0n;
        const { sim } = makeFundedEscrow({ buyerSK, amount });
        sim.updatePrivateState({ secretKey: buyerSK });
        sim.refund();
        expect(sim.getLedger().state).toBe(STATE.REFUNDED);
    });

    it("maximum uint64 amount is accepted and can be released", () => {
        const sellerSK = b32(0x20);
        const secret = b32(0x30);
        const nonce = b32(0x40);
        const amount = 18_446_744_073_709_551_615n; // u64::MAX
        const { sim } = makeFundedEscrow({ sellerSK, secret, nonce, amount });
        expect(sim.getLedger().state).toBe(STATE.FUNDED);
        sim.updatePrivateState({ secretKey: sellerSK, releaseSecret: secret, nonce, amount });
        sim.release();
        expect(sim.getLedger().state).toBe(STATE.RELEASED);
    });

    it("different nonces produce different termsCommitments for same secret+amount", () => {
        const alicePK = derivePK(b32(0x20));
        const secret = b32(0x30);
        const amount = 100n;

        const sim1 = new EscrowSimulator({ secretKey: b32(0x10), releaseSecret: secret, nonce: b32(0x41), amount });
        sim1.createEscrow(alicePK, amount);

        const sim2 = new EscrowSimulator({ secretKey: b32(0x10), releaseSecret: secret, nonce: b32(0x42), amount });
        sim2.createEscrow(alicePK, amount);

        expect(sim1.getLedger().termsCommitment).not.toEqual(sim2.getLedger().termsCommitment);
    });

    it("different secrets produce different termsCommitments for same nonce+amount", () => {
        const alicePK = derivePK(b32(0x20));
        const nonce = b32(0x40);
        const amount = 100n;

        const sim1 = new EscrowSimulator({ secretKey: b32(0x10), releaseSecret: b32(0x31), nonce, amount });
        sim1.createEscrow(alicePK, amount);

        const sim2 = new EscrowSimulator({ secretKey: b32(0x10), releaseSecret: b32(0x32), nonce, amount });
        sim2.createEscrow(alicePK, amount);

        expect(sim1.getLedger().termsCommitment).not.toEqual(sim2.getLedger().termsCommitment);
    });

    it("different amounts produce different termsCommitments for same secret+nonce", () => {
        const alicePK = derivePK(b32(0x20));
        const secret = b32(0x30);
        const nonce = b32(0x40);

        const sim1 = new EscrowSimulator({ secretKey: b32(0x10), releaseSecret: secret, nonce, amount: 100n });
        sim1.createEscrow(alicePK, 100n);

        const sim2 = new EscrowSimulator({ secretKey: b32(0x10), releaseSecret: secret, nonce, amount: 200n });
        sim2.createEscrow(alicePK, 200n);

        expect(sim1.getLedger().termsCommitment).not.toEqual(sim2.getLedger().termsCommitment);
    });

    it("same secret key always produces the same derived buyer key", () => {
        const pk1 = derivePK(b32(0x10));
        const pk2 = derivePK(b32(0x10));
        expect(pk1).toEqual(pk2);
    });

    it("different secret keys produce different derived keys", () => {
        const pk1 = derivePK(b32(0x10));
        const pk2 = derivePK(b32(0x11));
        expect(pk1).not.toEqual(pk2);
    });
});

// ============================================================================
// 7. SIMULATION – ALICE (SELLER) & BOB (BUYER) MULTI-ACTOR FLOWS
// ============================================================================
describe("multi-actor simulation (Alice & Bob)", () => {
    // Shared keys used across all multi-actor tests
    const ALICE_SK = b32(0xa1);
    const BOB_SK = b32(0xb0);
    const SECRET = b32(0x53);
    const NONCE = b32(0x4e);
    const AMOUNT = 250n;

    let alicePK: Uint8Array;
    let bobPK: Uint8Array;

    beforeEach(() => {
        alicePK = derivePK(ALICE_SK);
        bobPK = derivePK(BOB_SK);
    });

    it("Bob (buyer) deploys and Alice (seller) can look up her seller PK on the ledger", () => {
        const sim = new EscrowSimulator({ secretKey: BOB_SK, releaseSecret: SECRET, nonce: NONCE, amount: AMOUNT });
        sim.createEscrow(alicePK, AMOUNT);
        // The ledger's seller field should equal Alice's derived key
        expect(sim.getLedger().seller).toEqual(alicePK);
        // And buyer should equal Bob's derived key
        expect(sim.getLedger().buyer).toEqual(bobPK);
    });

    it("Alice rejects accept if she has the wrong secret key (impersonation attempt)", () => {
        const sim = new EscrowSimulator({ secretKey: BOB_SK, releaseSecret: SECRET, nonce: NONCE, amount: AMOUNT });
        sim.createEscrow(alicePK, AMOUNT);
        // Attacker with different SK tries to accept
        const maliciousSK = b32(0xde);
        sim.updatePrivateState({ secretKey: maliciousSK });
        expect(() => sim.acceptEscrow()).toThrowError("Only seller can accept");
    });

    it("Alice releases only after supplying the correct secret that was shared by Bob", () => {
        // Bob creates the escrow with a known secret
        const sim = new EscrowSimulator({ secretKey: BOB_SK, releaseSecret: SECRET, nonce: NONCE, amount: AMOUNT });
        sim.createEscrow(alicePK, AMOUNT);
        // Alice is given the correct values by Bob and releases
        sim.updatePrivateState({ secretKey: ALICE_SK, releaseSecret: SECRET, nonce: NONCE, amount: AMOUNT });
        sim.release();
        expect(sim.getLedger().state).toBe(STATE.RELEASED);
    });

    it("Alice cannot release with a secret she guessed (wrong secret)", () => {
        const sim = new EscrowSimulator({ secretKey: BOB_SK, releaseSecret: SECRET, nonce: NONCE, amount: AMOUNT });
        sim.createEscrow(alicePK, AMOUNT);
        // Alice has the wrong secret
        const guessedSecret = b32(0x99);
        sim.updatePrivateState({ secretKey: ALICE_SK, releaseSecret: guessedSecret, nonce: NONCE, amount: AMOUNT });
        expect(() => sim.release()).toThrowError("Invalid release proof");
    });

    it("Bob can reclaim funds if Alice never accepts (refund path)", () => {
        const sim = new EscrowSimulator({ secretKey: BOB_SK, releaseSecret: SECRET, nonce: NONCE, amount: AMOUNT });
        sim.createEscrow(alicePK, AMOUNT);
        // Alice never accepts; Bob refunds
        sim.updatePrivateState({ secretKey: BOB_SK });
        sim.refund();
        expect(sim.getLedger().state).toBe(STATE.REFUNDED);
    });

    it("a completely independent actor (Charlie) cannot take over any role", () => {
        const charlieSK = b32(0xc0);
        const sim = new EscrowSimulator({ secretKey: BOB_SK, releaseSecret: SECRET, nonce: NONCE, amount: AMOUNT });
        sim.createEscrow(alicePK, AMOUNT);

        // Charlie tries to accept
        sim.updatePrivateState({ secretKey: charlieSK });
        expect(() => sim.acceptEscrow()).toThrowError("Only seller can accept");

        // Charlie tries to release
        sim.updatePrivateState({ secretKey: charlieSK, releaseSecret: SECRET, nonce: NONCE, amount: AMOUNT });
        expect(() => sim.release()).toThrowError("Only seller can release");

        // Charlie tries to refund
        sim.updatePrivateState({ secretKey: charlieSK });
        expect(() => sim.refund()).toThrowError("Only buyer can refund");
    });

    it("escrow can be accepted and then released in the correct order without issue", () => {
        const sim = new EscrowSimulator({ secretKey: BOB_SK, releaseSecret: SECRET, nonce: NONCE, amount: AMOUNT });
        sim.createEscrow(alicePK, AMOUNT);

        // Alice accepts first
        sim.updatePrivateState({ secretKey: ALICE_SK, releaseSecret: SECRET, nonce: NONCE, amount: AMOUNT });
        sim.acceptEscrow();
        expect(sim.getLedger().state).toBe(STATE.FUNDED);

        // Alice then releases
        sim.release();
        expect(sim.getLedger().state).toBe(STATE.RELEASED);
    });

    it("commitments are stable: same inputs produce the same termsCommitment across runs", () => {
        // Determinism check: two fresh simulators with identical inputs must produce
        // identical termsCommitment on the ledger.
        const mk = () => {
            const s = new EscrowSimulator({ secretKey: BOB_SK, releaseSecret: SECRET, nonce: NONCE, amount: AMOUNT });
            s.createEscrow(alicePK, AMOUNT);
            return s.getLedger().termsCommitment;
        };
        expect(mk()).toEqual(mk());
    });
});
