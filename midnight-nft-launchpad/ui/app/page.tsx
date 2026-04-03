'use client';

import { useState, useEffect } from 'react';
import { useContract } from '../hooks/useContract';
import { useWallet } from '../hooks/useWallet';
import WalletConnect from '../components/WalletConnect';
import LaunchpadForm from '../components/LaunchpadForm';
import CollectionList from '../components/CollectionList';
import MintForm from '../components/MintForm';
import NFTList from '../components/NFTList';
import { useLaunchpad } from '../hooks/useLaunchpad';
import { History, Terminal, RefreshCw, ShieldCheck, Lock, PlusCircle, LayoutGrid, Box, Activity } from 'lucide-react';

export default function Home() {
  const { deployment, deploy, log, addLog } = useContract();
  const { isConnected, isClient, address } = useWallet();
  const [selectedContract, setSelectedContract] = useState<string | null>(null);
  const { collections, userNfts, createCollection, mint, isLoading, refreshData } = useLaunchpad();

  useEffect(() => {
    if (selectedContract && deployment?.contractAddress && selectedContract === deployment.contractAddress) {
      setSelectedContract(null);
    }
  }, [selectedContract, deployment]);

  return (
    <main className="min-h-screen bg-[#080808] text-zinc-100 font-sans relative overflow-x-hidden selection:bg-violet-500/20">

      {/* Scanline overlay */}
      <div className="fixed inset-0 pointer-events-none z-50 opacity-[0.025]"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,1) 2px, rgba(255,255,255,1) 4px)', backgroundSize: '100% 4px' }} />

      {/* Ambient glow */}
      <div className="fixed top-[-20%] left-[30%] w-[700px] h-[500px] rounded-full pointer-events-none -z-10"
        style={{ background: 'radial-gradient(ellipse, rgba(109,40,217,0.07) 0%, transparent 70%)' }} />
      <div className="fixed bottom-[-10%] right-[10%] w-[500px] h-[400px] rounded-full pointer-events-none -z-10"
        style={{ background: 'radial-gradient(ellipse, rgba(109,40,217,0.04) 0%, transparent 70%)' }} />

      {/* Fine grid */}
      <div className="fixed inset-0 pointer-events-none -z-10 opacity-40"
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

      {/* ── NAVBAR ── */}
      <nav className="border-b border-white/[0.04] bg-[#080808]/80 backdrop-blur-2xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-8 py-5 flex justify-between items-center">
          <div className="flex items-center gap-4">
            {/* Logo mark */}
            <div className="relative w-9 h-9 flex items-center justify-center">
              <div className="absolute inset-0 border border-violet-500/30 rotate-45" />
              <div className="absolute inset-[3px] bg-violet-600/10 rotate-45" />
              <svg viewBox="0 0 16 16" className="w-4 h-4 relative z-10 fill-violet-400" aria-hidden>
                <path d="M8 1 L15 5 L15 11 L8 15 L1 11 L1 5 Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
                <circle cx="8" cy="8" r="2" fill="currentColor" />
              </svg>
            </div>
            <div>
              <span className="text-[13px] font-bold tracking-[0.2em] text-white uppercase font-mono">Midnight</span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[9px] tracking-[0.25em] uppercase text-zinc-600 font-mono">Preprod Network</span>
              </div>
            </div>
          </div>

          <WalletConnect />
        </div>
      </nav>

      {/* ── MAIN ── */}
      <div className="max-w-7xl mx-auto px-8 py-16">

        {!isConnected ? (
          /* ── LOCKED STATE ── */
          <div className="flex flex-col items-center justify-center py-32 space-y-10">
            <div className="relative">
              <div className="w-20 h-20 border border-white/[0.06] flex items-center justify-center rotate-45">
                <div className="w-14 h-14 border border-violet-500/20 flex items-center justify-center">
                  <Lock className="w-6 h-6 text-violet-400 -rotate-45" />
                </div>
              </div>
              <div className="absolute inset-[-20px] border border-violet-500/[0.08] rotate-45" />
            </div>

            <div className="text-center space-y-3 max-w-sm">
              <h2 className="text-3xl font-bold tracking-tight text-white font-mono">Authenticate</h2>
              <p className="text-sm text-zinc-500 leading-relaxed">
                Connect your Lace wallet or provide a recovery seed to access the private NFT launchpad.
              </p>
            </div>

            <WalletConnect />

            <div className="flex items-center gap-6 pt-4">
              {['ZK-SHIELDED', 'ON-CHAIN PROOF', 'PREPROD LIVE'].map((tag) => (
                <span key={tag} className="text-[9px] tracking-[0.2em] text-zinc-700 font-mono">{tag}</span>
              ))}
            </div>
          </div>

        ) : (
          /* ── CONNECTED STATE ── */
          <div className="space-y-20">

            {/* ── PAGE HEADER ── */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-10 pb-12 border-b border-white/[0.04]">
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <span className="text-[9px] tracking-[0.3em] text-violet-500 font-mono uppercase">Protocol v0.22 · Compact Runtime</span>
                </div>
                <h1 className="text-[56px] font-black tracking-[-0.03em] text-white leading-[0.92] font-mono uppercase">
                  NFT<br />
                  <span style={{ WebkitTextStroke: '1px rgba(139,92,246,0.6)', color: 'transparent' }}>Launchpad</span>
                </h1>
                <p className="text-sm text-zinc-500 max-w-xs leading-relaxed">
                  Deploy encrypted NFT factories. Ownership and supply remain privately shielded.
                </p>

                <div className="flex items-center gap-3 pt-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 border border-white/[0.06] bg-white/[0.02]">
                    <Box className="w-3.5 h-3.5 text-violet-400" />
                    <span className="text-[10px] font-mono text-zinc-400">{collections.length} factories</span>
                  </div>
                  {selectedContract && (
                    <div className="flex items-center gap-2 px-3 py-1.5 border border-violet-500/20 bg-violet-500/[0.04]">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[10px] font-mono text-violet-400">registry mode</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Active context panel */}
              <div className="w-full lg:w-[380px]">
                <div className="border border-white/[0.05] bg-white/[0.015] p-6 relative">
                  {/* Corner accents */}
                  <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-violet-500/30" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-violet-500/30" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-violet-500/30" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-violet-500/30" />

                  {selectedContract ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] tracking-[0.25em] text-zinc-600 font-mono uppercase">Active Context</span>
                        <ShieldCheck className="w-3.5 h-3.5 text-violet-500/50" />
                      </div>
                      <code className="text-[11px] font-mono text-violet-400 block break-all leading-relaxed">
                        {selectedContract}
                      </code>
                      <button
                        onClick={() => setSelectedContract(null)}
                        className="w-full py-2.5 border border-white/[0.06] bg-transparent hover:bg-white/[0.03] text-zinc-500 hover:text-zinc-300 text-[10px] font-mono tracking-widest uppercase transition-all flex items-center justify-center gap-2"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        Clear Selection
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-6 gap-3 opacity-30">
                      <LayoutGrid className="w-8 h-8 text-zinc-600" />
                      <span className="text-[10px] font-mono text-zinc-600 tracking-widest uppercase">No Factory Selected</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── MAIN GRID ── */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-16">

              {/* Left column */}
              <div className="space-y-20">

                {/* Registry Gallery */}
                <section className="space-y-8">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <span className="text-[9px] tracking-[0.3em] text-zinc-600 font-mono uppercase">01 / Factory Registry</span>
                      <h2 className="text-xl font-bold font-mono text-white tracking-tight">Collections</h2>
                    </div>
                    <button
                      onClick={refreshData}
                      className="w-9 h-9 border border-white/[0.06] flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:border-white/10 transition-all"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <CollectionList
                    collections={collections}
                    onSelect={setSelectedContract}
                    selectedAddress={selectedContract}
                  />
                </section>

                {/* Launch form (only when no collection selected) */}
                {!selectedContract && (
                  <section className="space-y-8">
                    <div className="space-y-1">
                      <span className="text-[9px] tracking-[0.3em] text-zinc-600 font-mono uppercase">02 / Deploy</span>
                      <h2 className="text-xl font-bold font-mono text-white tracking-tight">New Factory</h2>
                    </div>
                    <LaunchpadForm onCreate={createCollection} isLoading={isLoading} addLog={addLog} />
                  </section>
                )}

                {/* Mint + NFT area (when collection selected) */}
                {selectedContract && (
                  <div className="space-y-20">
                    <section className="space-y-8">
                      <div className="space-y-1">
                        <span className="text-[9px] tracking-[0.3em] text-zinc-600 font-mono uppercase">02 / Protocol</span>
                        <h2 className="text-xl font-bold font-mono text-white tracking-tight">Mint NFT</h2>
                      </div>
                      <MintForm onMint={(meta) => mint(selectedContract, meta)} isLoading={isLoading} addLog={addLog} />
                    </section>

                    <section className="space-y-8">
                      <div className="space-y-1">
                        <span className="text-[9px] tracking-[0.3em] text-zinc-600 font-mono uppercase">03 / Inventory</span>
                        <h2 className="text-xl font-bold font-mono text-white tracking-tight">Your Tokens</h2>
                      </div>
                      <NFTList
                        nfts={userNfts.filter(n => n.collectionAddress === selectedContract)}
                        onVerify={async (id) => addLog(`Verifying Token #${id}... [ZK-PROOF-CLIENT-SIDE]`)}
                        onTransfer={async (id, rec) => addLog(`Initiating Transfer of Token #${id} to ${rec}...`)}
                      />
                    </section>
                  </div>
                )}
              </div>

              {/* Right sidebar — Node Monitor */}
              <aside className="space-y-6">
                <div className="sticky top-28">
                  {/* Terminal */}
                  <div className="border border-white/[0.05] bg-[#060606] flex flex-col h-[520px] relative">
                    <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-violet-500/30" />
                    <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-violet-500/30" />

                    {/* Terminal header */}
                    <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/[0.04]">
                      <Terminal className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-[9px] tracking-[0.25em] font-mono text-zinc-600 uppercase">Node Monitor</span>
                      <div className="ml-auto flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${isLoading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
                        <span className="text-[9px] font-mono text-zinc-700">{isLoading ? 'ACTIVE' : 'IDLE'}</span>
                      </div>
                    </div>

                    {/* Log area */}
                    <div className="flex-1 overflow-y-auto p-5 font-mono text-[10px] space-y-3 custom-scrollbar">
                      {log.length === 0 ? (
                        <div className="text-zinc-800 space-y-1">
                          <p>{'>'} System ready.</p>
                          <p>{'>'} Awaiting ZK witness data...</p>
                          <p className="animate-pulse">{'>'} _</p>
                        </div>
                      ) : (
                        log.map((entry: string, i: number) => (
                          <div key={i} className="flex gap-3">
                            <span className="text-violet-900 shrink-0 select-none">{'>'}</span>
                            <span className="text-zinc-500 leading-relaxed">{entry}</span>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-violet-500/30" />
                    <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-violet-500/30" />
                  </div>

                  {/* Architecture notes */}
                  <div className="mt-4 border border-white/[0.04] p-5 space-y-4">
                    <span className="text-[9px] tracking-[0.25em] text-zinc-700 font-mono uppercase">Architecture</span>
                    <div className="space-y-3 pt-1">
                      {[
                        ['Multi-Contract', 'Each collection is an independent on-chain instance.'],
                        ['Global Registry', 'State persists across browser sessions automatically.'],
                        ['ZK Constraints', 'Supply caps enforced at circuit level; immutable post-deploy.'],
                      ].map(([title, desc]) => (
                        <div key={title} className="flex gap-3">
                          <div className="w-px bg-violet-500/20 shrink-0 mt-1" style={{ height: '1em' }} />
                          <p className="text-[10px] text-zinc-600 leading-relaxed">
                            <span className="text-zinc-400 font-medium">{title}:</span> {desc}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </aside>

            </div>
          </div>
        )}
      </div>
    </main>
  );
}