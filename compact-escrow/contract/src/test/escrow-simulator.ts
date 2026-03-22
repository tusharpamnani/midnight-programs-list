import {
    type CircuitContext,
    sampleContractAddress,
    createConstructorContext,
    createCircuitContext
} from "@midnight-ntwrk/compact-runtime";
import {
    Contract,
    type Ledger,
    ledger
} from "../managed/escrow/contract/index.js";
import { type EscrowPrivateState, witnesses } from "../witnesses.js";

export class EscrowSimulator {
    readonly contract: Contract<EscrowPrivateState>;
    circuitContext: CircuitContext<EscrowPrivateState>;

    constructor(initialPrivateState: EscrowPrivateState) {
        this.contract = new Contract<EscrowPrivateState>(witnesses);
        const {
            currentPrivateState,
            currentContractState,
            currentZswapLocalState
        } = this.contract.initialState(
            createConstructorContext(initialPrivateState, "0".repeat(64))
        );
        this.circuitContext = createCircuitContext(
            sampleContractAddress(),
            currentZswapLocalState,
            currentContractState,
            currentPrivateState
        );
    }

    public updatePrivateState(newState: Partial<EscrowPrivateState>) {
        this.circuitContext = {
            ...this.circuitContext,
            currentPrivateState: {
                ...this.circuitContext.currentPrivateState,
                ...newState
            }
        };
    }

    public getLedger(): Ledger {
        return ledger(this.circuitContext.currentQueryContext.state);
    }

    public getPrivateState(): EscrowPrivateState {
        return this.circuitContext.currentPrivateState;
    }

    public createEscrow(sellerPk: Uint8Array, amount: bigint): Ledger {
        this.circuitContext = this.contract.impureCircuits.createEscrow(
            this.circuitContext,
            sellerPk,
            amount
        ).context;
        return ledger(this.circuitContext.currentQueryContext.state);
    }

    public acceptEscrow(): Ledger {
        this.circuitContext = this.contract.impureCircuits.acceptEscrow(
            this.circuitContext
        ).context;
        return ledger(this.circuitContext.currentQueryContext.state);
    }

    public release(): Ledger {
        this.circuitContext = this.contract.impureCircuits.release(
            this.circuitContext
        ).context;
        return ledger(this.circuitContext.currentQueryContext.state);
    }

    public refund(): Ledger {
        this.circuitContext = this.contract.impureCircuits.refund(
            this.circuitContext
        ).context;
        return ledger(this.circuitContext.currentQueryContext.state);
    }
}
