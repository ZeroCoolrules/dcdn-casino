import React from "react";
import { Link } from "react-router-dom";

const NEON = "#ff00ff";
const CYAN = "#00ffff";

export default function About() {
  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      <div
        className="px-4 py-3"
        style={{ background: "#160a2b", border: "1px solid " + NEON, boxShadow: "0 0 12px rgba(255,0,255,0.3)" }}
      >
        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: CYAN }}>About the House</span>
      </div>

      <section className="p-8 flex flex-col gap-5" style={{ background: "linear-gradient(180deg,#160a2b,#0c061a)", border: "1px solid " + CYAN, boxShadow: "0 0 14px rgba(0,255,255,0.25)" }}>
        <h1 className="text-4xl uppercase text-white" style={{ fontFamily: "Impact, Haettenschweiler, sans-serif", textShadow: "0 0 14px rgba(255,0,255,0.6)" }}>
          About Dream Casino
        </h1>

        <p className="text-white/80 text-[15px] leading-relaxed">
          Dream Casino is a dual-token, neon-arcade casino platform that fuses cinematic,
          movie-inspired slot reels with social video-chat and real-time Texas Hold'em. Built
          on the DCDN token ledger, the app runs a free off-chain play mode for casual spins
          and an on-chain real-stakes mode for deposit-backed wagers settled through a
          QuickNode JSON-RPC node. Every spin is provably fair, with a verifiable server hash,
          client seed, and nonce exposed to the player, and the house edge is clamped
          server-side so no misconfigured game row can ever push the expected return past the
          safe ceiling. Wallet settlement is atomic, using compare-and-swap on a version field
          so concurrent wagers can never over-spend or lose an update.
        </p>

        <p className="text-white/80 text-[15px] leading-relaxed">
          The platform is designed for players who want more than a flat spin button. A live
          Hold'em lobby pairs users at cash tables with automatic seat assignment and
          provably-fair dealing, while the social video-chat layer matches players with real
          peers or an AI co-host based on their preferences. The game library is curated with
          marquee-style cards, progressive jackpots, and per-game RTP and bonus-hit labels, all
          wrapped in a synthwave aesthetic of hot magenta and electric cyan. Operators get a
          dedicated portal for monitoring wagering KPIs, player traffic, deposit approvals,
          and settlement history.
        </p>

        <p className="text-white/80 text-[15px] leading-relaxed">
          Dream Casino is built and operated by the Dreamcadian team on the Base44 platform,
          with an emphasis on transparent settlement, responsible play, and a consistent
          cinematic feel across every surface. Free-play credits carry no real-world value and
          are never commingled with deposited balances. Real-stakes play requires an on-chain
          deposit signed by the sender's own wallet, and credited deposits are guarded by a
          global idempotency ledger so a transaction can never be paid out twice. We continue
          to expand the game library, the live tables, and the social layer as the community
          grows.
        </p>

        <div className="flex gap-3 pt-2 flex-wrap">
          <Link to="/" className="no-underline px-5 py-2.5 text-sm font-black uppercase tracking-widest" style={{ fontFamily: "Impact, sans-serif", background: CYAN, color: "#0c061a", boxShadow: "0 0 12px rgba(0,255,255,0.6)" }}>
            Back to the Floor
          </Link>
          <Link to="/contact" className="no-underline px-5 py-2.5 text-sm font-black uppercase tracking-widest text-white" style={{ fontFamily: "Impact, sans-serif", background: NEON, boxShadow: "0 0 12px rgba(255,0,255,0.6)" }}>
            Contact the House
          </Link>
        </div>
      </section>
    </div>
  );
}