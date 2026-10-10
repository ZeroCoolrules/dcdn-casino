import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

const NEON = "#ff00ff";
const CYAN = "#00ffff";
const INK = "#0c061a";

export default function ManualDepositForm({ onSubmitted, walletCtx }) {
  const [amount, setAmount] = useState(1000);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [deposits, setDeposits] = useState([]);

  async function loadMine() {
    try {
      const res = await base44.entities.Deposit.filter({}, { sort: "-created_date", limit: 5 });
      setDeposits(res.items || []);
    } catch {}
  }

  useEffect(() => { loadMine(); }, []);

  async function submit() {
    setErr("");
    setMsg("");
    if (!amount || amount <= 0) { setErr("Enter a deposit amount"); return; }
    setBusy(true);
    try {
      await base44.entities.Deposit.create({ amount: Number(amount), method: "manual", reference, status: "pending" });
      setMsg("Deposit request submitted — pending operator approval.");
      setReference("");
      await loadMine();
      onSubmitted && onSubmitted();
    } catch (e) {
      setErr(e.message || "Submission failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="p-6 flex flex-col gap-4" style={{ background: "linear-gradient(180deg,#160a2b,#0c061a)", border: "1px solid " + NEON, boxShadow: "0 0 14px rgba(255,0,255,0.25)" }}>
      <div className="text-[11px] uppercase tracking-widest font-black" style={{ color: NEON }}>Manual Cash Deposit</div>
      <p className="text-sm leading-snug" style={{ color: "rgba(255,255,255,0.7)" }}>
        Enter your deposit amount and an optional reference (receipt id, payment note). An operator reviews and credits your vault.
      </p>
      <label className="text-[10px] uppercase tracking-widest font-black" style={{ color: CYAN }}>Amount (DCDN)</label>
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value))}
        disabled={busy}
        className="text-white px-3 py-2 font-black text-lg disabled:opacity-50"
        style={{ background: INK, border: "1px solid " + CYAN, boxShadow: "0 0 8px rgba(0,255,255,0.25)" }}
      />
      <label className="text-[10px] uppercase tracking-widest font-black" style={{ color: CYAN }}>Reference (optional)</label>
      <input
        type="text"
        value={reference}
        onChange={(e) => setReference(e.target.value.slice(0, 120))}
        disabled={busy}
        placeholder="Receipt / note"
        className="text-white px-3 py-2 text-sm disabled:opacity-50"
        style={{ background: INK, border: "1px solid rgba(255,255,255,0.2)" }}
      />
      <button
        onClick={submit}
        disabled={busy}
        className="uppercase tracking-widest py-3 px-4 text-lg font-black disabled:opacity-50"
        style={{ fontFamily: "Impact, sans-serif", background: CYAN, color: INK, boxShadow: "0 0 14px rgba(0,255,255,0.6)" }}
      >
        {busy ? "Submitting…" : "Submit Deposit Request"}
      </button>
      {msg && <div className="text-xs uppercase tracking-wide" style={{ color: CYAN }}>{msg}</div>}
      {err && <div className="text-xs uppercase tracking-wide" style={{ color: NEON }}>{err}</div>}

      {deposits.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-2" style={{ borderTop: "1px dashed rgba(0,255,255,0.25)" }}>
          <div className="text-[10px] uppercase tracking-widest font-black" style={{ color: CYAN }}>Your Recent Requests</div>
          {deposits.map((d) => (
            <div key={d.id} className="flex justify-between text-xs py-1" style={{ borderBottom: "1px solid rgba(0,255,255,0.12)" }}>
              <span className="text-white font-bold">{d.amount} DCDN</span>
              <span className="font-black" style={statusColor(d.status)}>{d.status}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function statusColor(s) {
  if (s === "approved") return { color: CYAN, textShadow: "0 0 8px rgba(0,255,255,0.6)" };
  if (s === "rejected") return { color: NEON };
  return { color: "rgba(255,255,255,0.7)" };
}