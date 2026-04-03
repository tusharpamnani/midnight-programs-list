'use client';

import { useState } from 'react';
import { Tag, ShieldCheck, ArrowUpRight } from 'lucide-react';
import { OwnedNFT } from '../types/nft';

interface NFTListProps {
  nfts: OwnedNFT[];
  onVerify: (id: string) => Promise<any>;
  onTransfer: (id: string, recipient: string) => Promise<any>;
}

export default function NFTList({ nfts, onVerify, onTransfer }: NFTListProps) {
  const [selectedNFT, setSelectedNFT] = useState<string | null>(null);
  const [recipient, setRecipient] = useState('');
  const [verifying, setVerifying] = useState<Record<string, boolean>>({});

  const handleVerify = async (id: string) => {
    setVerifying(prev => ({ ...prev, [id]: true }));
    try { await onVerify(id); }
    finally { setVerifying(prev => ({ ...prev, [id]: false })); }
  };

  const handleTransfer = async (id: string) => {
    if (!recipient) return;
    try {
      await onTransfer(id, recipient);
      setSelectedNFT(null);
      setRecipient('');
    } catch (e) { console.error(e); }
  };

  if (nfts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 border border-dashed border-white/[0.04]">
        <Tag className="w-8 h-8 text-zinc-800 mb-4" />
        <p className="text-[10px] font-mono tracking-[0.2em] text-zinc-700 uppercase">No tokens in this collection</p>
        <p className="text-[10px] font-mono text-zinc-800 mt-1">Mint above to populate your inventory</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {nfts.map((nft) => {
        let meta: any = {};
        try { meta = JSON.parse(nft.metadata); }
        catch { meta = { name: `NFT #${nft.tokenId}`, description: nft.metadata }; }

        return (
          <div
            key={nft.tokenId}
            className="group relative flex flex-col border border-white/[0.05] bg-white/[0.01] hover:border-white/10 hover:bg-white/[0.02] transition-all duration-200"
          >
            {/* Corner accents on hover */}
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-violet-500/0 group-hover:border-violet-500/40 transition-colors" />
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-violet-500/0 group-hover:border-violet-500/40 transition-colors" />
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-violet-500/0 group-hover:border-violet-500/40 transition-colors" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-violet-500/0 group-hover:border-violet-500/40 transition-colors" />

            {/* Image */}
            {meta.image && (
              <div className="relative h-40 border-b border-white/[0.04] overflow-hidden bg-black/50">
                <img
                  src={meta.image}
                  alt={meta.name}
                  className="w-full h-full object-cover opacity-70 group-hover:opacity-90 group-hover:scale-[1.02] transition-all duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-transparent to-transparent" />
                {/* Token ID badge */}
                <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/70 border border-white/[0.08] px-2 py-1">
                  <span className="text-[9px] font-mono text-zinc-500 tracking-widest">#{nft.tokenId}</span>
                </div>
              </div>
            )}

            <div className="p-5 flex-1 flex flex-col space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="text-sm font-bold font-mono text-white truncate">{meta.name || `NFT #${nft.tokenId}`}</h4>
                  {!meta.image && (
                    <span className="text-[9px] font-mono text-zinc-700">#{nft.tokenId}</span>
                  )}
                </div>
                <button
                  onClick={() => handleVerify(nft.tokenId)}
                  disabled={verifying[nft.tokenId]}
                  title="Verify ZK Proof"
                  className="w-7 h-7 border border-white/[0.05] flex items-center justify-center text-zinc-700 hover:text-emerald-400 hover:border-emerald-500/20 transition-all shrink-0"
                >
                  {verifying[nft.tokenId]
                    ? <div className="w-3 h-3 border border-white/20 border-t-white rounded-full animate-spin" />
                    : <ShieldCheck className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Description */}
              {meta.description && (
                <p className="text-[10px] font-mono text-zinc-600 line-clamp-2 leading-relaxed">
                  {meta.description}
                </p>
              )}

              {/* Hash */}
              <div className="space-y-1">
                <span className="text-[8px] tracking-[0.2em] font-mono text-zinc-700 uppercase">Commitment Hash</span>
                <p className="text-[9px] font-mono text-zinc-700 truncate">{nft.metadataHash}</p>
              </div>

              {/* Explorer link */}
              {nft.txId && (
                <a
                  href={`https://preprod.midnightexplorer.com/tx/0x${nft.txId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[9px] font-mono text-violet-600 hover:text-violet-400 transition-colors uppercase tracking-widest"
                >
                  Explorer
                  <ArrowUpRight className="w-2.5 h-2.5" />
                </a>
              )}

              {/* Transfer */}
              <div className="pt-2 mt-auto">
                {selectedNFT === nft.tokenId ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="mn_addr..."
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      className="w-full bg-black/50 border border-white/[0.06] px-3 py-2 text-[10px] font-mono text-zinc-300 placeholder:text-zinc-800 focus:outline-none focus:border-violet-500/30 transition-all"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleTransfer(nft.tokenId)}
                        className="flex-1 bg-violet-600 hover:bg-violet-500 text-white text-[9px] font-mono tracking-widest uppercase py-2 transition-all"
                      >
                        Transfer
                      </button>
                      <button
                        onClick={() => setSelectedNFT(null)}
                        className="px-3 border border-white/[0.06] text-zinc-500 hover:text-zinc-300 text-[9px] font-mono py-2 transition-all"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setSelectedNFT(nft.tokenId)}
                    className="w-full flex items-center justify-center gap-2 border border-white/[0.05] hover:border-white/10 text-zinc-600 hover:text-zinc-300 text-[9px] font-mono tracking-widest uppercase py-2 transition-all"
                  >
                    <ArrowUpRight className="w-3 h-3" />
                    Transfer
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}