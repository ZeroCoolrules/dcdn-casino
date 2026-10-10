import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  hasInjectedWallet,
  connectWallet,
  getConnectedAccount,
  sendDcdnTransfer,
  waitForReceipt,
} from "@/lib/dcdnWallet";

const NEON = "#ff00ff";
const CYAN = "#00ffff";
const INK = "#0c061a";

export default function DepositPanel({ onCredited, walletCtx }) {
  const [account, setAccount] = useState(null);
  const [info, setInfo] = useState(null);
  const [amount, setAmount] = useState(1000);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function ensureConnected() {
    if (!hasInjectedWallet()) {
      setErr("No injected wallet found. Install MetaMask or a compatible Web3 wallet to deposit on-chain.");
      return null;
    }
    try {
      let acc = await getConnectedAccount();
      if (!acc) acc = await connectWallet();
      setAccount(acc);
      const res = await base44.functions.invoke("getDepositInfo", {});
      const d = res.data;
      if (d && d.error) throw new Error(d.error);
      setInfo(d);
      return acc;
    } catch (e) {
      setErr(e.message || "Connection failed");
      return null;
    }
  }

  async function deposit() {
    setErr("");
    setMsg("");
    const acc = await ensureConnected();
    if (!acc || !info) return;
    if (!amount || amount <= 0) {
      setErr("Enter a deposit amount");
      return;
    }
    setBusy(true);
    setMsg("Requesting wallet signature…");
    try {
      const { txHash } = await sendDcdnTransfer({
        contractAddress: info.contractAddress,
        toAddress: info.houseAddress,
        amount: Number(amount),
        decimals: info.decimals,
      });
      setMsg("Transaction sent. Waiting for on-chain confirmation…");
      await waitForReceipt(txHash);
      setMsg("Confirmed on-chain. Requesting ownership signature…");
      const message = "Dream Casino vault deposit: " + txHash;
      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [message, acc],
      });
      setMsg("Verifying signature with QuickNode and crediting your vault…");
      const verify = await base44.functions.invoke("verifyDeposit", { tx_hash: txHash, signature });
      const v = verify.data;
      if (!v || v.ok === false || v.error) throw new Error((v && v.error) || "Verification failed");
      setMsg(`Credited ${v.amount} DCDN. New vault balance: ${v.balance} DCDN`);
      onCredited && onCredited();
      walletCtx && walletCtx.refresh && walletCtx.refresh();
    } catch (e) {
      setErr(e.message || "Deposit failed");
      setMsg("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="p-6 flex flex-col gap-4"
      style={{ background: "linear-gradient(180deg,#160a2b,#0c061a)", border: "1px solid " + NEON, boxShadow: "0 0 14px rgba(255,0,255,0.25)" }}
    >
      <div className="text-[11px] uppercase tracking-widest font-black" style={{ color: NEON }}>Deposit DCDN Tokens</div>
      <p className="text-sm leading-snug" style={{ color: "rgba(255,255,255,0.7)" }}>
        On-chain deposits transfer DCDN from your connected wallet to the house vault address, then QuickNode verifies the on-chain receipt before your off-chain ledger is credited.
      </p>
      <div className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.6)" }}>
        Connected Wallet: <span className="font-mono text-white">{account || "not connected"}</span>
      </div>
      {info && (
        <div className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.6)" }}>
          House Vault: <span className="font-mono" style={{ color: CYAN }}>{info.houseAddress}</span> · Decimals {info.decimals}
        </div>
      )}
      <label className="text-[10px] uppercase tracking-widest font-black" style={{ color: CYAN }}>Amount (DCDN)</label>
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value))}
        disabled={busy}
        className="text-white px-3 py-2 font-black text-lg disabled:opacity-50"
        style={{ background: INK, border: "1px solid " + CYAN, boxShadow: "0 0 8px rgba(0,255,255,0.25)" }}
      />
      <button
        onClick={deposit}
        disabled={busy}
        className="uppercase tracking-widest py-3 px-4 text-lg font-black disabled:opacity-50"
        style={{ fontFamily: "Impact, sans-serif", background: CYAN, color: INK, boxShadow: "0 0 14px rgba(0,255,255,0.6)" }}
      >
        {busy ? "Processing…" : account ? "Sign & Deposit On-Chain" : "Connect Wallet & Deposit"}
      </button>
      {msg && <div className="text-xs uppercase tracking-wide" style={{ color: CYAN }}>{msg}</div>}
      {err && <div className="text-xs uppercase tracking-wide" style={{ color: NEON }}>{err}</div>}
    </section>
  );
}