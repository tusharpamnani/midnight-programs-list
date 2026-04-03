'use client';

import { useState, useCallback, useEffect } from 'react';
import { 
  fetchOwnedNFTs, 
  fetchCollections,
  actionMintFromCollection,
  actionCreateCollection,
} from '../app/actions';
import { OwnedNFT } from '../types/nft';

export interface Collection {
  id: string;
  name: string;
  description: string;
  maxSupply: number;
  contractAddress: string;
  creatorAddress: string;
  createdAt: string;
}

export function useLaunchpad() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [userNfts, setUserNfts] = useState<OwnedNFT[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshData = useCallback(async () => {
    try {
      const [cols, nfts] = await Promise.all([
        fetchCollections(),
        fetchOwnedNFTs()
      ]);
      setCollections(cols as Collection[]);
      setUserNfts(nfts as OwnedNFT[]);
    } catch (e) {
      console.error("Failed to refresh launchpad data", e);
    }
  }, []);

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 10000);
    return () => clearInterval(interval);
  }, [refreshData]);

  const createCollection = useCallback(async (name: string, description: string, maxSupply: number) => {
    setIsLoading(true);
    try {
      const res = await actionCreateCollection(name, description, maxSupply);
      await refreshData();
      return res;
    } finally {
      setIsLoading(false);
    }
  }, [refreshData]);

  const mint = useCallback(async (collectionAddress: string, metadata: string) => {
    setIsLoading(true);
    try {
      const res = await actionMintFromCollection(collectionAddress, metadata);
      await refreshData();
      return res;
    } finally {
      setIsLoading(false);
    }
  }, [refreshData]);

  return {
    collections,
    userNfts,
    createCollection,
    mint,
    isLoading,
    refreshData
  };
}
