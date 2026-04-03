import { FinalizedTransaction } from '@midnight-ntwrk/ledger-v8';

export interface WalletProvider {
  address: string;
  submitTx(tx: FinalizedTransaction): Promise<string>;
}

export interface WalletAdapter {
  name: string;
  type: 'lace' | 'seed';
  connect(): Promise<void>;
  getAddress(): string;
  getWalletProvider(): any;
  getAccountId(): string;
}

export interface ContractInfo {
  address: string;
  createdAt: number;
}
