import React, { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import DepositPanel from "@/components/DepositPanel";
import ManualDepositForm from "@/components/ManualDepositForm";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

const NEON = "#ff00ff";
const CYAN = "#00ffff";
const INK = "#0c061a";

export default function Wallet() {
  const { wallet } = useOutletContext();
  const { isAuthenticated, navigateToLogin } = useAuth();
  const [balance, setBalance] = useState(wallet?.balance ?? null);
  const [mode, setMode] = useState(wallet?.mode ?? "free");
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [claimed, setClaimed] = useState(false);
  const [depositMethod, setDepositMethod] = useState("manual");


  async function load() {
    try {
      const res = await base44.entities.Wallet.filter({}, { limit: 1 });
      const w = res.items && res.items[0];
      if (w) {
        setBalance(w.balance);
        setMode(w.mode || "free");
        setClaimed(!!w.free_stake_claimed);
        setStats({ wagered: w.total_wagered, won: w.total_won, spins: w.spins, address: w.wallet_address });
      }
    } catch {}
  }

  useEffect(() => { load(); }, []);

  async function claimFree() {
    setBusy(true);
    setMsg("");
    try {
      const res = await base44.functions.invoke("claimFreeStake", {});
      const d = res.data;
      if (!d || d.error) throw new Error((d && d.error) || "Claim failed");
      setBalance(d.balance);
      setMode(d.mode || "free");
      setClaimed(true);
      setMsg("+1,000 DCDN complimentary stake added. Hit the reels.");
      wallet.refresh && wallet.refresh();
    } catch (e) {
      // 409 = already claimed (the signup workflow auto-grants the stake).
      // Treat as success and sync state rather than surfacing a raw error.
      const already = /409|already claimed/i.test(e.message || "");
      if (already) {
        setClaimed(true);
        load();
        setMsg("Free stake already active. Spin away.");
      } else {
        setMsg(e.message || "Claim failed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function switchMode(nextMode) {
    setBusy(true);
    setMsg("");
    try {
      const res = await base44.functions.invoke("switchWalletMode", { mode: nextMode });
      const d = res.data;
      if (!d || d.error) throw new Error((d && d.error) || "Switch failed");
      setMode(d.mode);
      setMsg(nextMode === "real" ? "Real-stakes mode armed. Deposit DCDN to wager on-chain." : "Free-play mode. No real value at risk.");
      wallet.refresh && wallet.refresh();
    } catch (e) {
      setMsg(e.message || "Switch failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        className="px-4 py-2 flex items-baseline justify-between flex-wrap gap-2"
        style={{ background: "#160a2b", border: "1px solid " + NEON, boxShadow: "0 0 12px rgba(255,0,255,0.3)" }}
      >
        <span className="text-2xl uppercase tracking-wide text-white" style={{ fontFamily: "Impact, sans-serif", textShadow: "0 0 10px rgba(0,255,255,0.5)" }}>
          The Vault
        </span>
        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: CYAN }}>DCDN Ledger · QuickNode Node</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Balance panel */}
        <section className="p-6 flex flex-col gap-4" style={{ background: "linear-gradient(180deg,#160a2b,#0c061a)", border: "1px solid " + CYAN, boxShadow: "0 0 14px rgba(0,255,255,0.25)" }}>
          <div className="text-[11px] uppercase tracking-widest font-black" style={{ color: CYAN }}>Syndicate Vault Balance</div>
          <div className="text-5xl text-white" style={{ fontFamily: "Impact, sans-serif", textShadow: "0 0 14px rgba(255,0,255,0.5)" }}>
            {balance == null ? "—" : Number(balance).toLocaleString(undefined, { maximumFractionDigits: 2 })} <span className="text-xl" style={{ color: CYAN }}>$DCDN</span>
          </div>
          <div className="text-xs uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.7)" }}>
            Mode: <span className={mode === "real" ? "font-black" : "font-black"} style={mode === "real" ? { color: NEON, textShadow: "0 0 8px rgba(255,0,255,0.6)" } : { color: CYAN }}>{mode === "real" ? "REAL STAKES (ON-CHAIN)" : "FREE PLAY (OFF-CHAIN)"}</span>
          </div>

          {stats && (
            <div className="grid grid-cols-3 gap-2 pt-3" style={{ borderTop: "1px dashed rgba(0,255,255,0.25)" }}>
              <Stat label="Spins" value={stats.spins || 0} />
              <Stat label="Wagered" value={`${(stats.wagered || 0).toLocaleString()} DCDN`} />
              <Stat label="Won" value={`${(stats.won || 0).toLocaleString()} DCDN`} />
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={claimFree}
              disabled={busy || claimed}
              className="flex-1 uppercase tracking-widest py-2.5 px-3 text-sm font-black disabled:opacity-50"
              style={{ fontFamily: "Impact, sans-serif", background: claimed ? "rgba(0,255,255,0.15)" : CYAN, color: claimed ? CYAN : INK, border: "1px solid " + CYAN, boxShadow: claimed ? "none" : "0 0 12px rgba(0,255,255,0.6)" }}
            >
              {claimed ? "Free Stake Active" : "Claim Free Stake"}
            </button>
            <button
              onClick={() => switchMode(mode === "real" ? "free" : "real")}
              disabled={busy}
              className="flex-1 uppercase tracking-widest py-2.5 px-3 text-sm font-black disabled:opacity-50 text-white"
              style={{ fontFamily: "Impact, sans-serif", background: NEON, boxShadow: "0 0 12px rgba(255,0,255,0.6)" }}
            >
              {mode === "real" ? "Switch to Free" : "Switch to Real Stakes"}
            </button>
          </div>
          {msg && <div className="text-xs uppercase tracking-wide" style={{ color: CYAN }}>{msg}</div>}
        </section>

        {/* Deposit panel */}
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <MethodBtn active={depositMethod === "manual"} onClick={() => setDepositMethod("manual")} label="Manual (Default)" tone="cyan" />
            <MethodBtn active={depositMethod === "onchain"} onClick={() => setDepositMethod("onchain")} label="On-Chain (MetaMask)" tone="neon" />
          </div>
          {!isAuthenticated
            ? <LoginToDeposit onLogin={navigateToLogin} />
            : depositMethod === "manual"
              ? <ManualDepositForm onSubmitted={load} walletCtx={wallet} />
              : <DepositPanel onCredited={load} walletCtx={wallet} />}
        </div>
      </div>
    </div>
  );
}

function LoginToDeposit({ onLogin }) {
  return (
    <section className="p-6 flex flex-col gap-4" style={{ background: "linear-gradient(180deg,#160a2b,#0c061a)", border: "1px solid " + NEON, boxShadow: "0 0 14px rgba(255,0,255,0.25)" }}>
      <div className="text-[11px] uppercase tracking-widest font-black" style={{ color: NEON }}>Deposit</div>
      <p className="text-sm leading-snug" style={{ color: "rgba(255,255,255,0.7)" }}>
        Log in or create an account to deposit DCDN into your vault. Deposits are credited to your account, so we need to know who you are first.
      </p>
      <button
        onClick={onLogin}
        className="uppercase tracking-widest py-3 px-4 text-lg font-black"
        style={{ fontFamily: "Impact, sans-serif", background: CYAN, color: INK, boxShadow: "0 0 14px rgba(0,255,255,0.6)" }}
      >
        Log in to deposit
      </button>
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase font-bold" style={{ color: CYAN }}>{label}</span>
      <span className="text-base text-white" style={{ fontFamily: "Impact, sans-serif" }}>{value}</span>
    </div>
  );
}

function MethodBtn({ active, onClick, label, tone }) {
  const c = tone === "neon" ? NEON : CYAN;
  const glow = tone === "neon" ? "0 0 10px rgba(255,0,255,0.6)" : "0 0 10px rgba(0,255,255,0.6)";
  return (
    <button
      onClick={onClick}
      className="flex-1 uppercase tracking-widest py-2 px-3 text-xs font-black"
      style={{ fontFamily: "Impact, sans-serif", color: active ? INK : "#ffffff", background: active ? c : "transparent", border: "1px solid " + c, boxShadow: active ? glow : "none" }}
    >
      {label}
    </button>
  );
}