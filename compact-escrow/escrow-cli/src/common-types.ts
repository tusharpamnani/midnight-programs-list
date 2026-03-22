// This file is part of midnightntwrk/example-counter.
// Modified to support the Escrow contract instead of Counter.

import { Escrow, type EscrowPrivateState } from '@midnight-ntwrk/counter-contract';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import type { DeployedContract, FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { ImpureCircuitId } from '@midnight-ntwrk/compact-js';

export type EscrowCircuits = ImpureCircuitId<Escrow.Contract<EscrowPrivateState>>;

export const EscrowPrivateStateId = 'escrowPrivateState';

export type EscrowProviders = MidnightProviders<
  EscrowCircuits,
  typeof EscrowPrivateStateId,
  EscrowPrivateState
>;

export type EscrowContract = Escrow.Contract<EscrowPrivateState>;

export type DeployedEscrowContract =
  | DeployedContract<EscrowContract>
  | FoundContract<EscrowContract>;