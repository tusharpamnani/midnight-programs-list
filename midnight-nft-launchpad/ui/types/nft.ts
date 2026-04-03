export interface NFTMetadata {
  name: string;
  description?: string;
  image?: string;
  [key: string]: any;
}

export interface OwnedNFT {
  tokenId: string;
  metadata: string;
  metadataHash: string;
  mintedAt: string;
  txId?: string;
  collectionAddress?: string;
}

export interface DeploymentInfo {
  contractAddress: string;
  network: string;
  deployedAt: string;
}

export interface WalletState {
  address: string | null;
  isConnected: boolean;
}
