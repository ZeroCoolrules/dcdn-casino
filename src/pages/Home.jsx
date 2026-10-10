import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import GameCard from "@/components/GameCard";
import CrapsScene from "@/components/CrapsScene";

const NEON = "#ff00ff";
const CYAN = "#00ffff";
const INK = "#0c061a";

export default function Home() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.Game.filter({}, { sort: "order", limit: 50 })
      .then((res) => setGames(res.items || []))
      .finally(() => setLoading(false));
  }, []);

  const featured = games.find((g) => g.featured) || games[0];

  return (
    <div className="flex flex-col gap-5">
      {/* Hero panel */}
      {featured && (
        <section
          className="grid md:grid-cols-[1.2fr_0.8fr] relative overflow-clip"
          style={{
            border: "1px solid " + NEON,
            boxShadow: "0 0 18px rgba(255,0,255,0.45)",
          }}
        >
          <div className="relative min-h-[380px]" style={{ background: INK }}>
              <img
                src="https://media.base44.com/images/public/6abce6018ce27c0f6bd6cc03/86f4d0f6d_generated_image.png"
                alt={featured.title}
                className="w-full h-full object-cover absolute inset-0"
                style={{ filter: "contrast(115%) saturate(125%) brightness(0.82)" }}
              />
            <span
              className="absolute top-4 left-4 px-3 py-1.5 text-base uppercase z-10 text-white"
              style={{
                fontFamily: "Impact, sans-serif",
                background: "rgba(255,0,255,0.92)",
                boxShadow: "0 0 12px rgba(255,0,255,0.8)",
              }}
            >
              Featured Reel · {featured.rtp}% RTP
            </span>
          </div>

          <div
            className="p-9 flex flex-col justify-between gap-6"
            style={{ background: "linear-gradient(135deg,#1a0b33 0%,#0c061a 100%)" }}
          >
            <div>
              <div
                className="text-sm tracking-widest uppercase"
                style={{ fontFamily: "Impact, sans-serif", color: CYAN, textShadow: "0 0 8px rgba(0,255,255,0.6)" }}
              >
                High Stakes Neon Slot // Issue #09
              </div>
              <h1
                className="text-[clamp(34px,5vw,60px)] uppercase leading-[0.95] text-white mt-2"
                style={{ fontFamily: "Impact, Haettenschweiler, sans-serif", textShadow: "0 0 14px rgba(255,0,255,0.6)" }}
              >
                {featured.title}
              </h1>
              <p className="text-white/70 text-[15px] leading-snug max-w-[440px] mt-3">{featured.blurb}</p>
            </div>

            <div
              className="grid grid-cols-2 gap-3 p-3.5"
              style={{ background: INK, border: "1px solid " + CYAN, boxShadow: "0 0 10px rgba(0,255,255,0.25)" }}
            >
              <div className="flex flex-col">
                <span className="text-[10px] tracking-widest uppercase font-bold" style={{ color: CYAN }}>Current Pot</span>
                <span className="text-2xl text-white" style={{ fontFamily: "Impact, sans-serif" }}>
                  {featured.jackpot?.toLocaleString() || 0} DCDN
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] tracking-widest uppercase font-bold" style={{ color: CYAN }}>Max Multiplier</span>
                <span className="text-2xl text-white" style={{ fontFamily: "Impact, sans-serif" }}>
                  {featured.max_multiplier?.toLocaleString()}×
                </span>
              </div>
            </div>

            <Link
              to={`/play/${featured.id}`}
              className="inline-block text-center text-[#0c061a] no-underline uppercase tracking-widest py-3.5 px-7 text-2xl"
              style={{ fontFamily: "Impact, sans-serif", background: CYAN, boxShadow: "0 0 16px rgba(0,255,255,0.7)" }}
            >
              Pull Lever · {featured.min_bet} DCDN
            </Link>
          </div>
        </section>
      )}

      {/* Table games */}
      <div className="grid gap-3.5 grid-cols-1 md:grid-cols-3">
        {[
          { to: "/blackjack", title: "Back Room Blackjack", line: "6 decks · 3:2 blackjack · double down", tag: "Pays 3:2" },
          { to: "/roulette", title: "Wheel of the Don", line: "European single zero · 35:1 straight up", tag: "97.3% RTP" },
          { to: "/holdem", title: "Neon Hold'em", line: "6-seat cash tables · 5% rake", tag: "Live tables" },
        ].map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className="no-underline p-5 flex flex-col gap-2"
            style={{ background: "linear-gradient(135deg,#1a0b33 0%,#0c061a 100%)", border: "1px solid " + CYAN, boxShadow: "0 0 12px rgba(0,255,255,0.25)" }}
          >
            <span className="text-[10px] uppercase tracking-widest font-black" style={{ color: NEON }}>{t.tag}</span>
            <span className="text-2xl uppercase text-white leading-none" style={{ fontFamily: "Impact, sans-serif", textShadow: "0 0 10px rgba(0,255,255,0.5)" }}>{t.title}</span>
            <span className="text-xs text-white/70">{t.line}</span>
          </Link>
        ))}
      </div>

      <CrapsScene />

      {/* Section strip */}
      <div
        className="px-4 py-2 flex items-baseline justify-between flex-wrap gap-2"
        style={{ background: "#160a2b", border: "1px solid " + NEON, boxShadow: "0 0 12px rgba(255,0,255,0.25)" }}
      >
        <span className="text-2xl uppercase tracking-wide text-white" style={{ fontFamily: "Impact, sans-serif", textShadow: "0 0 10px rgba(0,255,255,0.5)" }}>
          Quick-Play Neon Reels
        </span>
        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: CYAN }}>
          Provably Fair · Zero Lag · On-Chain Settle
        </span>
      </div>

      {/* Games grid */}
      {loading ? (
        <div className="text-center py-16 uppercase tracking-widest text-sm" style={{ color: CYAN }}>Loading the reels…</div>
      ) : (
        <div className="grid gap-3.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {games.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
      )}
    </div>
  );
}