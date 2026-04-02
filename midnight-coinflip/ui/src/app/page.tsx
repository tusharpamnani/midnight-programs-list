"use client";

import { useState } from "react";
import { RefreshCcw, Hand, Lock, Fingerprint } from "lucide-react";
import { Coin } from "@/components/Coin";
import { TimelineStepper, LoadingPhase } from "@/components/TimelineStepper";
import { Toast } from "@/components/Toast";
import { ResultCard } from "@/components/ResultCard";
import { commit, reveal, getResult, verify } from "@/lib/api";

type GameState = "idle" | "committed" | "chosen" | "revealed" | "verified";

export default function Home() {
  const [gameState, setGameState] = useState<GameState>("idle");
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [commitHash, setCommitHash] = useState<string | null>(null);
  const [userChoice, setUserChoice] = useState<"HEADS" | "TAILS" | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [result, setResult] = useState<"HEADS" | "TAILS" | null>(null);
  const [isVerified, setIsVerified] = useState<boolean | null>(null);

  const startFlip = async () => {
    try {
      setLoadingPhase("locking");
      setError(null);
      setGameState("idle");
      setCommitHash(null);
      setUserChoice(null);
      setSecret(null);
      setResult(null);
      setIsVerified(null);

      const hash = await commit();
      setCommitHash(hash);
      setGameState("committed");
    } catch (err: any) {
      console.error(err);
      setError("Failed to seal commitment on the blockchain. Check connection.");
      setGameState("idle");
    } finally {
      setLoadingPhase(null);
    }
  };

  const handleChoice = async (choice: "HEADS" | "TAILS") => {
    try {
      setUserChoice(choice);
      setGameState("chosen");
      setLoadingPhase("revealing");
      setError(null);

      const revSecret = await reveal();
      setSecret(revSecret);
      setGameState("revealed");
      
      setLoadingPhase("verifying");
      // Add deliberate delay to build anticipation
      await new Promise(r => setTimeout(r, 1200));

      const sysResult = await getResult(revSecret);
      setResult(sysResult);

      const verified = await verify(revSecret, commitHash!);
      setIsVerified(verified);
      setGameState("verified");

    } catch (err: any) {
      console.error(err);
      setError("Cryptographic verification failed or network timeout.");
    } finally {
      setLoadingPhase(null);
    }
  };

  const resetGame = () => {
    setGameState("idle");
    setLoadingPhase(null);
    setError(null);
    setCommitHash(null);
    setUserChoice(null);
    setSecret(null);
    setResult(null);
    setIsVerified(null);
  };

  return (
    <main className="min-h-screen relative flex flex-col pt-16 pb-32 px-4 sm:px-6 overflow-x-hidden">
      <div className="max-w-xl mx-auto w-full relative z-10">
        
        {/* Header */}
        <header className="text-center mb-12 relative animate-fade-in">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-brand-purple/20 rounded-full blur-[100px] -z-10 animate-pulse" />
          
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4 text-transparent bg-clip-text bg-gradient-to-br from-white via-white/90 to-brand-purple/70">
            Provably Fair
          </h1>
          <p className="text-muted text-sm sm:text-base font-medium max-w-sm mx-auto leading-relaxed">
            Test a provably fair coin flip powered by Midnight cryptography. Zero trust required.
          </p>
        </header>

        {/* Dynamic Interactive Area */}
        <div className="flex flex-col items-center">
          
          <Coin 
            flipping={loadingPhase === "revealing" || loadingPhase === "verifying"} 
            result={gameState === "verified" ? result : null} 
          />

          {/* Idle State Preview & CTA */}
          {gameState === "idle" && !loadingPhase && (
            <div className="w-full flex flex-col items-center animate-slide-up mt-6">
              
              <button 
                onClick={startFlip}
                className="px-12 py-5 bg-gradient-to-r from-brand-purple-dark to-brand-purple hover:from-brand-purple hover:to-brand-purple-dark text-white rounded-2xl font-bold tracking-[0.2em] text-lg shadow-[0_0_40px_rgba(168,85,247,0.3)] transition-all duration-300 hover:scale-105 active:scale-95 flex items-center gap-3 w-full sm:w-auto justify-center group z-20 relative"
              >
                <Fingerprint className="w-6 h-6 group-hover:scale-110 transition-transform duration-500 opacity-80" />
                FLIP COIN
              </button>

              <div className="mt-16 grid grid-cols-3 gap-4 text-center max-w-md w-full opacity-60">
                <div className="flex flex-col gap-2 relative">
                  <div className="mx-auto w-10 h-10 rounded-full glass-panel flex items-center justify-center border-white/5">
                    <Lock className="w-4 h-4 text-white/80" />
                  </div>
                  <span className="text-xs font-medium tracking-wide">1. System Locks</span>
                  <div className="hidden sm:block absolute top-5 left-[60%] right-[-40%] h-[1px] bg-gradient-to-r from-white/20 to-transparent" />
                </div>
                <div className="flex flex-col gap-2 relative">
                  <div className="mx-auto w-10 h-10 rounded-full glass-panel flex items-center justify-center border-white/5">
                    <Hand className="w-4 h-4 text-white/80" />
                  </div>
                  <span className="text-xs font-medium tracking-wide">2. You Choose</span>
                  <div className="hidden sm:block absolute top-5 left-[60%] right-[-40%] h-[1px] bg-gradient-to-r from-white/20 to-transparent" />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="mx-auto w-10 h-10 rounded-full glass-panel flex items-center justify-center border-white/5">
                    <RefreshCcw className="w-4 h-4 text-white/80" />
                  </div>
                  <span className="text-xs font-medium tracking-wide">3. Fair Reveal</span>
                </div>
              </div>

            </div>
          )}

          {/* Chronological Timeline */}
          {(gameState !== "idle" || loadingPhase === "locking") && (
            <TimelineStepper 
              gameState={gameState}
              loadingPhase={loadingPhase}
              commitHash={commitHash}
              userChoice={userChoice}
              secret={secret}
              result={result}
              isVerified={isVerified}
              onChoice={handleChoice}
            />
          )}

          {/* Ultimate Result Phase */}
          {gameState === "verified" && (
            <div className="w-full mt-8 animate-slide-up">
              <ResultCard result={result} userChoice={userChoice} />
              
              <div className="mt-8 flex justify-center">
                <button 
                  onClick={resetGame}
                  className="px-8 py-4 glass-panel hover:bg-white/10 text-white rounded-xl font-bold tracking-widest text-sm transition-all duration-300 active:scale-95 flex items-center gap-2 group"
                >
                  <RefreshCcw className="w-4 h-4 group-hover:-rotate-180 transition-transform duration-500" />
                  NEW ROUND
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      <Toast message={error} onClose={() => setError(null)} />
    </main>
  );
}
