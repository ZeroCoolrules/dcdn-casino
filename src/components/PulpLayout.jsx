import React, { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Wallet as WalletIcon, Radio, ArrowRight, Trophy } from "lucide-react";

const NEON = "#ff00ff";
const CYAN = "#00ffff";

export default function PulpLayout() {
  const [balance, setBalance] = useState(null);
  const [mode, setMode] = useState("free");
  const location = useLocation();

  async function loadWallet() {
    try {
      const res = await base44.entities.Wallet.filter({}, { limit: 1 });
      const w = res.items && res.items[0];
      if (w) {
        setBalance(w.balance);
        setMode(w.mode || "free");
      } else {
        setBalance(0);
      }
    } catch {
      setBalance(0);
    }
  }

  useEffect(() => {
    loadWallet();
    base44.entities.EventLog.create({ type: "page_view", path: location.pathname }).catch(() => {});
  }, [location.pathname]);

  const isOperator = location.pathname.startsWith("/operator");

  return (
    <div
      className="min-h-screen flex flex-col gap-4 p-4 max-w-[1440px] mx-auto font-[system-ui,-apple-system,sans-serif]"
      style={{
        color: "#ffffff",
        background:
          "linear-gradient(rgba(255,0,255,0.05) 1px, transparent 1px) 0 0 / 42px 42px," +
          "linear-gradient(90deg, rgba(0,255,255,0.05) 1px, transparent 1px) 0 0 / 42px 42px," +
          "#0c061a",
      }}
    >
      {/* Marquee bar */}
      <header
        className="px-4 py-3 flex items-center justify-between gap-4 flex-wrap"
        style={{
          background: "linear-gradient(180deg,#1a0b33 0%,#0c061a 100%)",
          border: "1px solid " + NEON,
          boxShadow: "0 0 12px rgba(255,0,255,0.55), inset 0 0 18px rgba(0,255,255,0.12)",
        }}
      >
        <Link to="/" className="flex items-center gap-3 no-underline">
          <span
            className="px-2.5 py-1 text-xl font-black"
            style={{
              color: "#0c061a",
              background: NEON,
              transform: "skew(-8deg)",
              fontFamily: "Impact, Haettenschweiler, sans-serif",
              boxShadow: "0 0 10px rgba(255,0,255,0.8)",
            }}
          >
            DCDN
          </span>
          <span
            className="text-2xl uppercase leading-none tracking-wide"
            style={{
              fontFamily: "Impact, Haettenschweiler, sans-serif",
              color: NEON,
              textShadow: "0 0 8px rgba(255,0,255,0.9), 0 0 16px rgba(255,0,255,0.5)",
            }}
          >
            Dream Casino
          </span>
        </Link>

        <div className="flex items-center gap-4 flex-wrap">
          <div
            className="px-3 py-1.5 flex flex-col items-end"
            style={{ border: "1px solid " + CYAN, boxShadow: "0 0 8px rgba(0,255,255,0.4)" }}
          >
            <span className="text-[10px] font-black tracking-widest uppercase" style={{ color: CYAN }}>
              {mode === "real" ? "On-Chain Vault" : "Syndicate Vault"}
            </span>
            <span
              className="text-lg font-black tracking-wide text-white"
              style={{ fontFamily: "Impact, sans-serif" }}
            >
              {balance == null ? "—" : balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} $DCDN
            </span>
          </div>
          <Link
            to="/wallet"
            className="no-underline px-4 py-2 text-base uppercase tracking-widest font-black text-white"
            style={{
              fontFamily: "Impact, sans-serif",
              background: NEON,
              boxShadow: "0 0 12px rgba(255,0,255,0.7)",
            }}
          >
            Wager Vault
          </Link>
          <Link
            to="/leaderboard"
            className="no-underline font-extrabold text-xs uppercase tracking-widest"
            style={{
              color: location.pathname.startsWith("/leaderboard") ? "#ffffff" : NEON,
              textShadow: location.pathname.startsWith("/leaderboard") ? "none" : "0 0 8px rgba(255,0,255,0.7)",
              borderBottom: "2px solid " + (location.pathname.startsWith("/leaderboard") ? "#ffffff" : NEON),
            }}
          >
            <Trophy className="inline w-3 h-3 mr-0.5" /> Leaderboard <ArrowRight className="inline w-3 h-3" />
          </Link>
          <Link
            to="/blackjack"
            className="no-underline font-extrabold text-xs uppercase tracking-widest"
            style={{
              color: location.pathname.startsWith("/blackjack") ? "#ffffff" : NEON,
              textShadow: location.pathname.startsWith("/blackjack") ? "none" : "0 0 8px rgba(255,0,255,0.7)",
              borderBottom: "2px solid " + (location.pathname.startsWith("/blackjack") ? "#ffffff" : NEON),
            }}
          >
            Blackjack <ArrowRight className="inline w-3 h-3" />
          </Link>
          <Link
            to="/roulette"
            className="no-underline font-extrabold text-xs uppercase tracking-widest"
            style={{
              color: location.pathname.startsWith("/roulette") ? "#ffffff" : NEON,
              textShadow: location.pathname.startsWith("/roulette") ? "none" : "0 0 8px rgba(255,0,255,0.7)",
              borderBottom: "2px solid " + (location.pathname.startsWith("/roulette") ? "#ffffff" : NEON),
            }}
          >
            Roulette <ArrowRight className="inline w-3 h-3" />
          </Link>
          <Link
            to="/holdem"
            className="no-underline font-extrabold text-xs uppercase tracking-widest"
            style={{
              color: location.pathname.startsWith("/holdem") ? "#ffffff" : NEON,
              textShadow: location.pathname.startsWith("/holdem") ? "none" : "0 0 8px rgba(255,0,255,0.7)",
              borderBottom: "2px solid " + (location.pathname.startsWith("/holdem") ? "#ffffff" : NEON),
            }}
          >
            Hold'em Tables <ArrowRight className="inline w-3 h-3" />
          </Link>
          <Link
            to="/operator"
            className="no-underline font-extrabold text-xs uppercase tracking-widest"
            style={{
              color: isOperator ? "#ffffff" : CYAN,
              textShadow: isOperator ? "none" : "0 0 8px rgba(0,255,255,0.7)",
              borderBottom: "2px solid " + (isOperator ? "#ffffff" : CYAN),
            }}
          >
            Operator Portal <ArrowRight className="inline w-3 h-3" />
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <Outlet context={{ wallet: { balance, mode, refresh: loadWallet } }} />
      </main>

      <footer className="text-[10px] tracking-wide uppercase flex flex-wrap items-center justify-between gap-2 px-2 pt-1" style={{ color: "rgba(255,255,255,0.7)" }}>
        <span className="flex items-center gap-1.5" style={{ color: CYAN }}>
          <Radio className="w-3 h-3" /> QuickNode DCDN node · Provably-fair settlement
        </span>
        <span>Play responsibly · 21+ · Off-chain free play is not a real-money wager</span>
        <div className="flex items-center gap-3">
          <Link to="/about" className="no-underline" style={{ color: CYAN }}>About</Link>
          <Link to="/contact" className="no-underline" style={{ color: CYAN }}>Contact</Link>
          <Link to="/wallet" className="flex items-center gap-1 no-underline" style={{ color: NEON }}>
            <WalletIcon className="w-3 h-3" /> Vault
          </Link>
        </div>
      </footer>
    </div>
  );
}