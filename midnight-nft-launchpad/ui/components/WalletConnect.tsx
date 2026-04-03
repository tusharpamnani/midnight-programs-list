'use client';

import { useState } from 'react';
import { useWallet } from '../hooks/useWallet';
import { Wallet, Shield, LogOut, Smartphone, ChevronDown } from 'lucide-react';

export default function WalletConnect() {
  const { isConnected, isConnecting, address, walletType, connectLace, connectSeed, disconnect, isClient } = useWallet();
  const [showSeedInput, setShowSeedInput] = useState(false);
  const [seed, setSeed] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isClient) return null;

  const handleLace = async () => {
    setError(null);
    try {
      await connectLace();
    } catch (e: any) {
      setError("Lace wallet not found or connection rejected.");
      setShowSeedInput(true);
    }
  };

  const handleSeedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (seed.length < 32) {
      setError("Enter a valid 64-character hex seed.");
      return;
    }
    await connectSeed(seed);
    setShowSeedInput(false);
    setSeed('');
  };

  if (isConnected) {
    return (
      <div className="flex items-center gap-3 border border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
        {/* Corner accents */}
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-violet-500/30 pointer-events-none" />

        <div className="w-7 h-7 border border-violet-500/20 flex items-center justify-center">
          {walletType === 'lace'
            ? <Smartphone className="w-3.5 h-3.5 text-violet-400" />
            : <Shield className="w-3.5 h-3.5 text-violet-400" />}
        </div>

        <div className="flex flex-col">
          <span className="text-[9px] tracking-[0.2em] font-mono text-zinc-600 uppercase">
            {walletType === 'lace' ? 'Lace' : 'Seed'}
          </span>
          <span className="text-[11px] font-mono text-zinc-300 truncate max-w-[130px]">{address}</span>
        </div>

        <button
          onClick={disconnect}
          className="ml-2 w-7 h-7 border border-white/[0.04] flex items-center justify-center text-zinc-600 hover:text-red-400 hover:border-red-500/20 transition-all"
          title="Disconnect"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      {!showSeedInput ? (
        <div className="flex gap-2">
          <button
            onClick={handleLace}
            disabled={isConnecting}
            className="flex items-center gap-2.5 bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-mono tracking-widest uppercase py-2.5 px-5 transition-all disabled:opacity-40 active:scale-95"
          >
            {isConnecting
              ? <div className="w-3.5 h-3.5 border border-white/30 border-t-white rounded-full animate-spin" />
              : <Smartphone className="w-3.5 h-3.5" />}
            Connect Lace
          </button>

          <button
            onClick={() => setShowSeedInput(true)}
            className="flex items-center gap-2 border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] text-zinc-400 text-[11px] font-mono uppercase tracking-widest py-2.5 px-4 transition-all active:scale-95"
          >
            <Shield className="w-3.5 h-3.5" />
            Seed
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSeedSubmit}
          className="absolute right-0 top-full mt-2 w-80 border border-white/[0.07] bg-[#0a0a0a] p-5 space-y-4 z-50 shadow-2xl shadow-black/50"
        >
          {/* Corner accents */}
          <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-violet-500/30" />
          <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-violet-500/30" />
          <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-violet-500/30" />
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-violet-500/30" />

          <div className="flex items-center justify-between">
            <span className="text-[9px] tracking-[0.25em] font-mono text-zinc-500 uppercase">Seed Recovery</span>
            <button
              type="button"
              onClick={() => { setShowSeedInput(false); setError(null); }}
              className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              esc
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="text-[9px] tracking-[0.2em] font-mono text-zinc-600 uppercase">Hex Seed</label>
            <input
              type="password"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="57bb166cb6b..."
              className="w-full bg-black/50 border border-white/[0.06] px-3 py-2.5 text-[11px] font-mono text-violet-400 placeholder:text-zinc-800 focus:outline-none focus:border-violet-500/30 transition-all"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-[10px] font-mono text-red-500/80">{error}</p>
          )}

          <button
            type="submit"
            className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-[10px] font-mono tracking-widest uppercase transition-all active:scale-95"
          >
            Authenticate
          </button>

          <p className="text-[9px] font-mono text-zinc-700 leading-relaxed">
            Seed remains in transient memory only — not persisted to browser storage.
          </p>
        </form>
      )}
    </div>
  );
}