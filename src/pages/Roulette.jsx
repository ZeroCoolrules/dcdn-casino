import React, { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import VideoChatPanel from "@/components/VideoChatPanel";

const NEON = "#ff00ff";
const CYAN = "#00ffff";
const INK = "#0c061a";
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const CHIPS = [1, 5, 10, 25, 100];
const OUTSIDE = [
  { type: "low", label: "1–18" },
  { type: "even", label: "Even" },
  { type: "red", label: "Red" },
  { type: "black", label: "Black" },
  { type: "odd", label: "Odd" },
  { type: "high", label: "19–36" },
];

const keyOf = (b) => b.type + (b.value ?? "");
const pocketBg = (n) => (n === 0 ? "#0f8a4b" : RED.has(n) ? "#d1124a" : "#151021");
const impact = { fontFamily: "Impact, Haettenschweiler, sans-serif" };

export default function Roulette() {
  const { wallet } = useOutletContext();
  const [chip, setChip] = useState(5);
  const [bets, setBets] = useState({});
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [showProof, setShowProof] = useState(false);

  const total = Object.values(bets).reduce((s, b) => s + b.amount, 0);

  function place(type, value) {
    if (spinning) return;
    const b = { type, value };
    const k = keyOf(b);
    setBets((prev) => ({ ...prev, [k]: { ...b, amount: (prev[k]?.amount || 0) + chip } }));
  }

  async function spin() {
    if (!total || spinning) return;
    setSpinning(true);
    setError("");
    setResult(null);
    try {
      const res = await base44.functions.invoke("spinRoulette", {
        bets: Object.values(bets),
        mode: wallet && wallet.mode === "real" ? "real" : "free",
        client_seed: Math.random().toString(36).slice(2, 10),
      });
      const r = res.data;
      if (!r || r.ok === false || r.error) throw new Error((r && r.error) || "Spin failed");
      await new Promise((ok) => setTimeout(ok, 1200));
      setResult(r);
      setHistory((h) => [r.number, ...h].slice(0, 14));
      wallet.refresh && wallet.refresh();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Spin failed");
    } finally {
      setSpinning(false);
    }
  }

  const chipOn = (type, value) => bets[keyOf({ type, value })]?.amount;

  function Cell({ type, value, label, bg, className = "" }) {
    const amt = chipOn(type, value);
    const hit = result && result.bets?.some((b) => b.win && b.type === type && (b.value ?? null) === (value ?? null));
    return (
      <button
        onClick={() => place(type, value)}
        className={"relative text-white font-black text-sm py-2.5 " + className}
        style={{
          ...impact,
          background: bg || "#1a0b33",
          border: "1px solid " + (hit ? CYAN : "rgba(255,255,255,0.15)"),
          boxShadow: hit ? "0 0 14px " + CYAN : "none",
        }}
      >
        {label ?? value}
        {amt ? (
          <span className="absolute -top-1.5 -right-1.5 text-[10px] px-1 rounded-full" style={{ background: NEON, color: "#fff", boxShadow: "0 0 6px " + NEON }}>
            {amt}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <style>{`@keyframes wheelspin{to{transform:rotate(1440deg)}}`}</style>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Link to="/" className="no-underline text-xs uppercase tracking-widest font-bold" style={{ color: CYAN }}>← Back to floor</Link>
        <div className="text-[10px] uppercase tracking-widest text-white">
          European single zero · RTP <span className="font-black" style={{ color: CYAN }}>97.3%</span> · Provably Fair
        </div>
      </div>

      <section className="p-5 flex flex-col gap-5" style={{ background: "linear-gradient(180deg,#160a2b,#0c061a)", border: "1px solid " + NEON, boxShadow: "0 0 18px rgba(255,0,255,0.35)" }}>
        <h1 className="text-[clamp(28px,4vw,44px)] uppercase text-white text-center leading-none" style={{ ...impact, textShadow: "0 0 14px rgba(255,0,255,0.6)" }}>
          Wheel of the Don
        </h1>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
          <div
            className="w-36 h-36 rounded-full flex items-center justify-center"
            style={{
              background: "conic-gradient(#d1124a 0 10%,#151021 0 20%,#d1124a 0 30%,#151021 0 40%,#0f8a4b 0 45%,#d1124a 0 55%,#151021 0 65%,#d1124a 0 75%,#151021 0 85%,#d1124a 0 95%,#151021 0)",
              border: "4px solid " + CYAN,
              boxShadow: "0 0 20px rgba(0,255,255,0.6)",
              animation: spinning ? "wheelspin 1.2s cubic-bezier(.2,.7,.3,1)" : "none",
            }}
          >
            <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl text-white" style={{ ...impact, background: result ? pocketBg(result.number) : INK, border: "2px solid " + NEON }}>
              {spinning ? "…" : result ? result.number : "?"}
            </div>
          </div>
          <div className="text-center sm:text-left min-w-[200px]">
            {result ? (
              <>
                <div className="text-xs uppercase tracking-widest" style={{ color: CYAN }}>Ball landed</div>
                <div className="text-3xl text-white uppercase" style={impact}>#{result.number} {result.color}</div>
                <div className="text-lg" style={{ ...impact, color: result.payout > 0 ? CYAN : "rgba(255,255,255,0.6)" }}>
                  {result.payout > 0 ? `Won ${result.payout} DCDN` : `Lost ${result.stake} DCDN`}
                </div>
              </>
            ) : (
              <div className="text-sm uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.7)" }}>Pick a chip, tap the table, spin.</div>
            )}
            {error && <div className="text-sm mt-2" style={{ color: NEON }}>{error}</div>}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <div className="min-w-[620px] grid gap-1" style={{ gridTemplateColumns: "48px repeat(12, 1fr) 56px" }}>
            <Cell type="straight" value={0} bg={pocketBg(0)} className="row-span-3" />
            {[3, 2, 1].map((row) => (
              <React.Fragment key={row}>
                {Array.from({ length: 12 }, (_, c) => c * 3 + row).map((n) => (
                  <Cell key={n} type="straight" value={n} bg={pocketBg(n)} />
                ))}
                <Cell type="column" value={row} label="2:1" />
              </React.Fragment>
            ))}
            <div />
            {[1, 2, 3].map((d) => (
              <Cell key={d} type="dozen" value={d} label={`${d === 1 ? "1st" : d === 2 ? "2nd" : "3rd"} 12`} className="col-span-4" />
            ))}
            <div />
            <div />
            {OUTSIDE.map((o) => (
              <Cell key={o.type} type={o.type} label={o.label} className="col-span-2" bg={o.type === "red" ? "#d1124a" : o.type === "black" ? "#151021" : undefined} />
            ))}
            <div />
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3 pt-3" style={{ borderTop: "1px solid rgba(255,0,255,0.3)" }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-widest font-black" style={{ color: CYAN }}>Chip</span>
            {CHIPS.map((c) => (
              <button
                key={c}
                onClick={() => setChip(c)}
                className="w-11 h-11 rounded-full text-sm font-black"
                style={{ ...impact, background: chip === c ? NEON : "#1a0b33", color: "#fff", border: "2px dashed " + (chip === c ? "#fff" : CYAN) }}
              >
                {c}
              </button>
            ))}
            <button onClick={() => !spinning && setBets({})} className="text-[11px] uppercase tracking-widest font-black px-3 py-2" style={{ color: CYAN, border: "1px solid " + CYAN }}>
              Clear
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-white" style={impact}>Stake {total} DCDN</span>
            <button
              onClick={spin}
              disabled={!total || spinning}
              className="uppercase tracking-widest px-7 py-3 text-lg disabled:opacity-40"
              style={{ ...impact, background: CYAN, color: INK, boxShadow: "0 0 16px rgba(0,255,255,0.7)" }}
            >
              {spinning ? "Spinning…" : "Spin"}
            </button>
          </div>
        </div>

        {history.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-widest font-black mr-1" style={{ color: CYAN }}>Last</span>
            {history.map((n, i) => (
              <span key={i} className="w-7 h-7 flex items-center justify-center text-xs text-white" style={{ ...impact, background: pocketBg(n) }}>{n}</span>
            ))}
          </div>
        )}

        {result && (
          <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.7)" }}>
            <button onClick={() => setShowProof((s) => !s)} className="uppercase tracking-widest font-black" style={{ color: CYAN }}>
              {showProof ? "Hide" : "Show"} fairness proof
            </button>
            {showProof && (
              <div className="mt-2 font-mono break-all flex flex-col gap-1">
                <div>server_seed: {result.server_seed}</div>
                <div>server_hash: {result.server_hash}</div>
                <div>client_seed: {result.client_seed} · nonce: {result.nonce}</div>
                <div>pocket = uniform int(37) from HMAC-SHA256(server_seed, "client_seed:nonce:0")</div>
              </div>
            )}
          </div>
        )}
      </section>

      <VideoChatPanel gameTitle="Wheel of the Don" />
    </div>
  );
}
