import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { Ledger } from './managed/escrow/contract/index.js';

// Escrow contract private state
export type EscrowPrivateState = {
  secretKey: Uint8Array;
  releaseSecret: Uint8Array;
  nonce: Uint8Array;
  amount: bigint;
};

// Correct synchronous Compact witness definitions
export const witnesses = {
  secretKey(
    context: WitnessContext<Ledger, EscrowPrivateState>
  ): [EscrowPrivateState, Uint8Array] {
    const state = context.privateState;
    return [state, state.secretKey];
  },

  releaseSecret(
    context: WitnessContext<Ledger, EscrowPrivateState>
  ): [EscrowPrivateState, Uint8Array] {
    const state = context.privateState;
    return [state, state.releaseSecret];
  },

  nonce(
    context: WitnessContext<Ledger, EscrowPrivateState>
  ): [EscrowPrivateState, Uint8Array] {
    const state = context.privateState;
    return [state, state.nonce];
  },

  escrowAmount(
    context: WitnessContext<Ledger, EscrowPrivateState>
  ): [EscrowPrivateState, bigint] {
    const state = context.privateState;
    return [state, state.amount];
  },
};