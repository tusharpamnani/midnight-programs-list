'use client';

import { useState } from 'react';
import { Send, FileText } from 'lucide-react';

interface MintFormProps {
  onMint: (metadata: string) => Promise<any>;
  isLoading: boolean;
  addLog: (msg: string) => void;
}

export default function MintForm({ onMint, isLoading, addLog }: MintFormProps) {
  const [name, setName] = useState('Midnight Artifact');
  const [description, setDescription] = useState('Minted via UI with ZK-privacy');
  const [imageUrl, setImageUrl] = useState('/nft-sample.png');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      addLog("Starting mint process...");
      const metadata = JSON.stringify({
        name,
        description,
        image: imageUrl,
        mintedAt: new Date().toISOString()
      });
      addLog(`Metadata validated: ${name}`);
      const res = await onMint(metadata);
      addLog(`Mint successful. Token ID: ${res.tokenId}`);
    } catch (e: any) {
      addLog(`Mint error: ${e.message}`);
    }
  };

  return (
    <div className="relative border border-white/[0.05] bg-white/[0.01] p-8">
      {/* Corner accents */}
      <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-violet-500/30" />
      <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-violet-500/30" />
      <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-violet-500/30" />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-violet-500/30" />

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Name */}
        <div className="space-y-2">
          <label className="text-[9px] tracking-[0.25em] font-mono text-zinc-600 uppercase">Asset Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-black/40 border border-white/[0.06] px-4 py-3 text-sm font-mono text-zinc-200 focus:outline-none focus:border-violet-500/30 transition-all"
          />
        </div>

        {/* Image URL + preview */}
        <div className="space-y-2">
          <label className="text-[9px] tracking-[0.25em] font-mono text-zinc-600 uppercase">Image URI</label>
          <div className="grid grid-cols-[1fr_56px] gap-3">
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="w-full bg-black/40 border border-white/[0.06] px-4 py-3 text-[11px] font-mono text-zinc-400 focus:outline-none focus:border-violet-500/30 transition-all"
            />
            <div className="border border-white/[0.05] bg-black/30 overflow-hidden">
              {imageUrl && (
                <img src={imageUrl} alt="" className="w-full h-full object-cover opacity-60" />
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[9px] tracking-[0.25em] font-mono text-zinc-600 uppercase">Description</label>
            <span className="text-[9px] font-mono text-violet-600/50 uppercase tracking-widest">Private</span>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-black/40 border border-white/[0.06] px-4 py-3 text-[11px] font-mono text-zinc-500 focus:outline-none focus:border-violet-500/30 transition-all resize-none min-h-[80px]"
            spellCheck="false"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 border border-violet-500/30 bg-violet-500/[0.06] hover:bg-violet-500/[0.12] disabled:opacity-40 disabled:cursor-not-allowed text-violet-300 font-mono text-[11px] tracking-[0.2em] uppercase py-4 transition-all active:scale-[0.99]"
        >
          {isLoading ? (
            <>
              <div className="w-3.5 h-3.5 border border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
              Generating ZK Proof...
            </>
          ) : (
            <>
              <Send className="w-3.5 h-3.5" />
              Mint Private NFT
            </>
          )}
        </button>
      </form>
    </div>
  );
}