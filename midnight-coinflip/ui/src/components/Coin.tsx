"use client";
import React from "react";
import { classNames } from "@/lib/utils";

export function Coin({ flipping, result }: { flipping: boolean, result?: "HEADS" | "TAILS" | null }) {
  return (
    <div className="flex flex-col items-center justify-center my-10 animate-float" style={{ perspective: "1000px" }}>
      <div 
        className={classNames(
          "relative w-32 h-32 sm:w-40 sm:h-40 rounded-full flex items-center justify-center transition-all bg-gradient-to-tr from-brand-purple to-brand-blue",
          "shadow-[0_0_50px_rgba(168,85,247,0.3)] border border-white/20",
          flipping ? "animate-flip-3d" : "duration-1000"
        )}
        style={{ transformStyle: "preserve-3d", transform: result === "TAILS" ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >
        {/* Front - HEADS */}
        <div 
          className="absolute inset-0 rounded-full flex flex-col items-center justify-center bg-[#0a0a0a] m-[3px] border border-white/10 overflow-hidden"
          style={{ backfaceVisibility: "hidden" }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(168,85,247,0.3),transparent_50%)]" />
          <span className="text-4xl sm:text-5xl font-bold font-mono tracking-tighter text-white z-10 drop-shadow-md">
            H
          </span>
          <span className="text-[10px] sm:text-xs text-white/50 tracking-[0.2em] mt-1 z-10">HEADS</span>
        </div>

        {/* Back - TAILS */}
        <div 
          className="absolute inset-0 rounded-full flex flex-col items-center justify-center bg-[#0a0a0a] m-[3px] border border-white/10 overflow-hidden"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(59,130,246,0.3),transparent_50%)]" />
          <span className="text-4xl sm:text-5xl font-bold font-mono tracking-tighter text-white z-10 drop-shadow-md">
            T
          </span>
          <span className="text-[10px] sm:text-xs text-white/50 tracking-[0.2em] mt-1 z-10">TAILS</span>
        </div>
      </div>
    </div>
  );
}
