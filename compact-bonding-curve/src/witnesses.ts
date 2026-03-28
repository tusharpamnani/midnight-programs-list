import { type Witnesses, type Ledger } from "../contracts/managed/bonding_curve/contract/index.js";
import { type WitnessContext } from "@midnight-ntwrk/compact-runtime";
import { BondingCurveMath } from "./math.js";

/**
 * The private state for the bonding curve application.
 */
export interface PrivateState {
    address: Uint8Array;
}

/**
 * Implementation of BondingCurve witnesses.
 */
export const bondingCurveWitnesses: Witnesses<PrivateState> = {
    calculateCost: (context: WitnessContext<Ledger, PrivateState>, slope: bigint, sOld: bigint, sNew: bigint): [PrivateState, bigint] => {
        let result: bigint;
        if (sNew >= sOld) {
            result = BondingCurveMath.calculateMintCost(sOld, sNew - sOld, slope);
        } else {
            result = BondingCurveMath.calculateBurnRefund(sOld, sOld - sNew, slope);
        }

        return [context.privateState, result];
    },
    callerAddress: (context: WitnessContext<Ledger, PrivateState>): [PrivateState, Uint8Array] => {
        return [context.privateState, context.privateState.address];
    }
};
