'use client';

import { Collection } from '../hooks/useLaunchpad';
import { Box, Database, CheckCircle } from 'lucide-react';

interface CollectionListProps {
  collections: Collection[];
  onSelect: (addr: string) => void;
  selectedAddress: string | null;
}

export default function CollectionList({ collections, onSelect, selectedAddress }: CollectionListProps) {
  if (collections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 border border-dashed border-white/[0.04] text-center">
        <Database className="w-8 h-8 text-zinc-800 mb-4" />
        <p className="text-[10px] font-mono tracking-[0.2em] text-zinc-700 uppercase">No factories deployed</p>
        <p className="text-[10px] font-mono text-zinc-800 mt-1">Deploy below to get started</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {collections.map((col) => {
        const isSelected = selectedAddress === col.contractAddress;

        return (
          <button
            key={col.contractAddress}
            onClick={() => onSelect(col.contractAddress)}
            className={`group relative text-left p-6 border transition-all duration-200 active:scale-[0.99] ${
              isSelected
                ? 'border-violet-500/30 bg-violet-500/[0.03]'
                : 'border-white/[0.05] bg-white/[0.01] hover:border-white/10 hover:bg-white/[0.025]'
            }`}
          >
            {/* Corner accents — only on selected */}
            {isSelected && (
              <>
                <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-violet-500/50" />
                <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-violet-500/50" />
                <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-violet-500/50" />
                <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-violet-500/50" />
              </>
            )}

            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 border flex items-center justify-center shrink-0 transition-colors ${
                    isSelected ? 'border-violet-500/30 bg-violet-500/10' : 'border-white/[0.06] bg-white/[0.02]'
                  }`}>
                    <Box className={`w-3.5 h-3.5 transition-colors ${isSelected ? 'text-violet-400' : 'text-zinc-600 group-hover:text-zinc-400'}`} />
                  </div>
                  <h4 className="text-sm font-bold font-mono text-white truncate">{col.name}</h4>
                </div>
                {isSelected && (
                  <div className="shrink-0">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  </div>
                )}
              </div>

              <p className="text-[11px] text-zinc-600 leading-relaxed line-clamp-2 font-mono">
                {col.description}
              </p>

              <div className="pt-4 border-t border-white/[0.04] flex items-end justify-between">
                <div className="space-y-1">
                  <span className="text-[8px] tracking-[0.2em] font-mono text-zinc-700 uppercase">Supply Cap</span>
                  <div className="text-2xl font-black font-mono text-white leading-none">
                    {col.maxSupply || (col as any).supply || '∞'}
                  </div>
                </div>
                <code className="text-[9px] font-mono text-zinc-700 block">
                  {col.contractAddress.slice(0, 10)}…
                </code>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}