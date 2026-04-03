'use client';

import { useState } from 'react';
import { Rocket, Hash, Info, Zap } from 'lucide-react';

interface CollectionFormProps {
  onCreate: (name: string, desc: string, supply: number) => Promise<any>;
  isLoading: boolean;
  addLog: (msg: string) => void;
}

export default function LaunchpadForm({ onCreate, isLoading, addLog }: CollectionFormProps) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [supply, setSupply] = useState(100);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !desc || supply <= 0) return;

    addLog(`Creating collection: ${name}...`);
    try {
      await onCreate(name, desc, supply);
      addLog(`Collection "${name}" deployed.`);
      setName('');
      setDesc('');
    } catch (e: any) {
      addLog(`Deploy failed: ${e.message}`);
    }
  };

  return (
    <div className="relative border border-white/[0.05] bg-white/[0.01] p-8">
      {/* Corner accents */}
      <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-violet-500/30" />
      <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-violet-500/30" />
      <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-violet-500/30" />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-violet-500/30" />

      <form onSubmit={handleSubmit} className="space-y-7">

        {/* Name */}
        <div className="space-y-2">
          <label className="text-[9px] tracking-[0.25em] font-mono text-zinc-600 uppercase">Collection Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Midnight Genesis"
            className="w-full bg-black/40 border border-white/[0.06] px-4 py-3 text-sm font-mono text-zinc-200 placeholder:text-zinc-800 focus:outline-none focus:border-violet-500/30 transition-all"
          />
        </div>

        {/* Supply */}
        <div className="grid grid-cols-[1fr_auto] gap-4 items-end">
          <div className="space-y-2">
            <label className="text-[9px] tracking-[0.25em] font-mono text-zinc-600 uppercase">Max Supply</label>
            <div className="relative">
              <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-700" />
              <input
                type="number"
                required
                min={1}
                value={supply}
                onChange={(e) => setSupply(parseInt(e.target.value))}
                className="w-full bg-black/40 border border-white/[0.06] pl-10 pr-4 py-3 text-sm font-mono text-zinc-200 focus:outline-none focus:border-violet-500/30 transition-all"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 py-3 border border-white/[0.04] bg-transparent h-[46px]">
            <Info className="w-3.5 h-3.5 text-violet-500/30 shrink-0" />
            <span className="text-[9px] font-mono text-zinc-700 leading-tight">Immutable post-deploy</span>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <label className="text-[9px] tracking-[0.25em] font-mono text-zinc-600 uppercase">Description (On-chain)</label>
          <textarea
            required
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="A private world of rare artifacts..."
            className="w-full bg-black/40 border border-white/[0.06] px-4 py-3 text-sm font-mono text-zinc-400 placeholder:text-zinc-800 focus:outline-none focus:border-violet-500/30 transition-all resize-none min-h-[90px]"
            spellCheck="false"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-mono text-[11px] tracking-[0.2em] uppercase py-4 transition-all active:scale-[0.99]"
        >
          {isLoading ? (
            <>
              <div className="w-3.5 h-3.5 border border-white/30 border-t-white rounded-full animate-spin" />
              Generating ZK Proof...
            </>
          ) : (
            <>
              <Rocket className="w-3.5 h-3.5" />
              Deploy Factory
            </>
          )}
        </button>
      </form>
    </div>
  );
}