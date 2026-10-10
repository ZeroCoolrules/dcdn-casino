import React, { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import VideoChatPanel from "@/components/VideoChatPanel";

const NEON = "#ff00ff";
const CYAN = "#00ffff";
const INK = "#0c061a";
const impact = { fontFamily: "Impact, Haettenschweiler, sans-serif" };
const SUIT = { S: "♠", H: "♥", D: "♦", C: "♣" };
const BETS = [5, 10, 25, 50, 100];

const OUTCOME_TEXT = {
  blackjack: "Blackjack! Pays 3:2",
  win: "You win",
  push: "Push — stake returned",
  lose: "House wins",
  bust: "Bust",
};

function PlayingCard({ code }) {
  if (code === "??") {
    return (
      <div className="w-16 h-24 flex items-center justify-center text-2xl" style={{ background: "repeating-linear-gradient(45deg,#2a0f4d 0 6px,#1a0b33 6px 12px)", border: "2px solid " + NEON, boxShadow: "0 0 10px rgba(255,0,255,0.5)" }}>
        <span style={{ color: NEON, ...impact }}>D</span>
      </div>
    );
  }
  const suit = code.slice(-1);
  const rank = code.slice(0, -1);
  const red = suit === "H" || suit === "D";
  return (
    <div className="w-16 h-24 bg-white flex flex-col justify-between p-1.5" style={{ border: "2px solid " + CYAN, boxShadow: "0 0 10px rgba(0,255,255,0.45)", color: red ? "#d1124a" : "#111" }}>
      <span className="text-lg leading-none font-black">{rank}</span>
      <span className="text-2xl leading-none self-center">{SUIT[suit]}</span>
      <span className="text-lg leading-none font-black self-end rotate-180">{rank}</span>
    </div>
  );
}

function Hand({ title, cards, total }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-[11px] uppercase tracking-widest font-black" style={{ color: CYAN }}>
        {title} {cards.length ? `· ${total}` : ""}
      </div>
      <div className="flex gap-2 min-h-24">
        {cards.map((c, i) => <PlayingCard key={i} code={c} />)}
      </div>
    </div>
  );
}

export default function Blackjack() {
  const { wallet } = useOutletContext();
  const [bet, setBet] = useState(10);
  const [hand, setHand] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showProof, setShowProof] = useState(false);

  async function call(payload) {
    setBusy(true);
    setError("");
    try {
      const res = await base44.functions.invoke("playBlackjack", payload);
      const r = res.data;
      if (r && r.hand !== undefined) setHand(r.hand);
      if (!r || r.ok === false || r.error) throw new Error((r && r.error) || "Request failed");
      wallet.refresh && wallet.refresh();
    } catch (e) {
      const data = e?.response?.data;
      if (data?.hand) setHand(data.hand);
      setError(data?.error || e.message || "Request failed");
    } finally {
      setBusy(false);
    }
  }

  // Resume a hand left open (e.g. after a refresh).
  useEffect(() => { call({ action: "state" }); }, []);

  const live = hand && hand.status === "player_turn";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Link to="/" className="no-underline text-xs uppercase tracking-widest font-bold" style={{ color: CYAN }}>← Back to floor</Link>
        <div className="text-[10px] uppercase tracking-widest text-white">
          6 decks · Dealer stands on 17 · Blackjack pays 3:2 · Provably Fair
        </div>
      </div>

      <section className="p-6 flex flex-col gap-6" style={{ background: "radial-gradient(ellipse at center,#0d3b2e 0%,#0c061a 75%)", border: "1px solid " + CYAN, boxShadow: "0 0 18px rgba(0,255,255,0.35)" }}>
        <h1 className="text-[clamp(28px,4vw,44px)] uppercase text-white text-center leading-none" style={{ ...impact, textShadow: "0 0 14px rgba(0,255,255,0.6)" }}>
          Back Room Blackjack
        </h1>

        <Hand title="Dealer" cards={hand?.dealer_cards || []} total={hand?.dealer_total} />

        <div className="text-center min-h-8">
          {hand && hand.status === "settled" && (
            <div className="text-2xl uppercase" style={{ ...impact, color: hand.payout > 0 ? CYAN : NEON, textShadow: "0 0 10px currentColor" }}>
              {OUTCOME_TEXT[hand.outcome] || hand.outcome}
              {hand.payout > 0 ? ` · ${hand.payout} DCDN` : ""}
            </div>
          )}
          {live && <div className="text-sm uppercase tracking-widest text-white/80">Stake {hand.wager} DCDN · your move</div>}
          {error && <div className="text-sm mt-1" style={{ color: NEON }}>{error}</div>}
        </div>

        <Hand title="You" cards={hand?.player_cards || []} total={hand?.player_total} />

        <div className="flex items-center justify-center gap-3 flex-wrap pt-3" style={{ borderTop: "1px solid rgba(0,255,255,0.25)" }}>
          {live ? (
            <>
              <button disabled={busy} onClick={() => call({ action: "hit", hand_id: hand.hand_id })} className="uppercase tracking-widest px-6 py-3 text-lg disabled:opacity-40" style={{ ...impact, background: CYAN, color: INK }}>Hit</button>
              <button disabled={busy} onClick={() => call({ action: "stand", hand_id: hand.hand_id })} className="uppercase tracking-widest px-6 py-3 text-lg disabled:opacity-40" style={{ ...impact, background: NEON, color: "#fff" }}>Stand</button>
              {hand.can_double && (
                <button disabled={busy} onClick={() => call({ action: "double", hand_id: hand.hand_id })} className="uppercase tracking-widest px-6 py-3 text-lg disabled:opacity-40" style={{ ...impact, background: "#ffe600", color: INK }}>Double</button>
              )}
            </>
          ) : (
            <>
              <span className="text-[10px] uppercase tracking-widest font-black" style={{ color: CYAN }}>Bet</span>
              {BETS.map((b) => (
                <button key={b} onClick={() => setBet(b)} className="w-12 h-12 rounded-full text-sm" style={{ ...impact, background: bet === b ? NEON : "#1a0b33", color: "#fff", border: "2px dashed " + (bet === b ? "#fff" : CYAN) }}>{b}</button>
              ))}
              <button
                disabled={busy}
                onClick={() => call({ action: "deal", bet, mode: wallet && wallet.mode === "real" ? "real" : "free", client_seed: Math.random().toString(36).slice(2, 10) })}
                className="uppercase tracking-widest px-8 py-3 text-xl disabled:opacity-40"
                style={{ ...impact, background: CYAN, color: INK, boxShadow: "0 0 16px rgba(0,255,255,0.7)" }}
              >
                {busy ? "Dealing…" : `Deal · ${bet} DCDN`}
              </button>
            </>
          )}
        </div>

        {hand && (
          <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.7)" }}>
            <button onClick={() => setShowProof((s) => !s)} className="uppercase tracking-widest font-black" style={{ color: CYAN }}>
              {showProof ? "Hide" : "Show"} fairness proof
            </button>
            {showProof && (
              <div className="mt-2 font-mono break-all flex flex-col gap-1">
                <div>server_hash (committed at deal): {hand.server_hash}</div>
                <div>server_seed: {hand.server_seed || "revealed when the hand ends"}</div>
                <div>client_seed: {hand.client_seed} · nonce: {hand.nonce}</div>
                <div>shoe = Fisher–Yates shuffle of 6 decks using HMAC-SHA256(server_seed, "client_seed:nonce:block")</div>
              </div>
            )}
          </div>
        )}
      </section>

      <VideoChatPanel gameTitle="Back Room Blackjack" />
    </div>
  );
}
