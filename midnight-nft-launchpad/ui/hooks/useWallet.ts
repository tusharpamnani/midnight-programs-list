'use client';

import { useState, useCallback, useEffect } from 'react';
import { WalletAdapter } from '../types/wallet';

// Helper to provide the Lace + Seed fallback logic
export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [walletType, setWalletType] = useState<'lace' | 'seed' | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const storedAddr = localStorage.getItem('midnight_last_wallet_address');
    if (storedAddr) {
      setAddress(storedAddr);
      setIsConnected(true);
      setWalletType(localStorage.getItem('midnight_last_wallet_type') as any);
    }
  }, []);

  const connectLace = useCallback(async () => {
    setIsConnecting(true);
    try {
      // Robust discovery: Poll for window.midnight for up to 2 seconds
      let lace = (window as any).midnight?.mnLace;
      if (!lace) {
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 100));
          lace = (window as any).midnight?.mnLace;
          if (lace) break;
        }
      }

      if (!lace) {
        throw new Error("Lace Wallet not detected. Ensure the extension is installed and set to Preprod network.");
      }
      
      const api = await lace.enable();
      const state = await api.state();
      const addr = state.address;
      
      setAddress(addr);
      setIsConnected(true);
      setWalletType('lace');
      localStorage.setItem('midnight_last_wallet_address', addr);
      localStorage.setItem('midnight_last_wallet_type', 'lace');
      return true;
    } catch (e: any) {
      console.error("Lace connection failed", e);
      throw e;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const connectSeed = useCallback(async (seed: string) => {
    setIsConnecting(true);
    try {
      // In seed mode, we simulate the address from the seed for the UI
      // The actual Midnight.js initialization happens on the server/backend in our CLI-bridge pattern
      const mockAddr = `mn_seed_${seed.slice(0, 12)}...`;
      
      setAddress(mockAddr);
      setIsConnected(true);
      setWalletType('seed');
      
      // We persist the address for the session, but NOT the seed
      localStorage.setItem('midnight_last_wallet_address', mockAddr);
      localStorage.setItem('midnight_last_wallet_type', 'seed');
      
      // We keep the seed in memory (or temporary session storage if user allows, but here we keep it simple)
      (window as any)._midnight_seed = seed;
      
      return true;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setIsConnected(false);
    setWalletType(null);
    localStorage.removeItem('midnight_last_wallet_address');
    localStorage.removeItem('midnight_last_wallet_type');
    delete (window as any)._midnight_seed;
  }, []);

  return {
    address,
    isConnected,
    walletType,
    isConnecting,
    isClient,
    connectLace,
    connectSeed,
    disconnect
  };
}
