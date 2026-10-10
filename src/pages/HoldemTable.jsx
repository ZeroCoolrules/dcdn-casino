import React, { useEffect, useState, useRef } from "react";
import { useParams, useOutletContext, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import VideoChatPanel from "@/components/VideoChatPanel";

const NEON = "#ff00ff";
const CYAN = "#00ffff";
const INK = "#0c061a";
const SEATS = 6;
const BOT_NAMES = ["Vinny Caruso", "Marlowe Vance", "Cuba Reyes", "Rico Delgado", "Dolores Stax"];

function Card({ card, hidden }) {
  if (hidden || !card) {
    return (
      <div className="w-9 h-12 rounded flex items-center justify-center" style={{ background: "linear-gradient(135deg,#1a0b33,#3a1a5e)", border: "1px solid " + NEON, boxShadow: "inset 0 0 6px rgba(255,0,255,0.5)" }}>
        <span style={{ color: NEON }}>★</span>
      </div>
    );
  }
  const red = card[1] === "h" || card[1] === "d";
  const r = card[0] === "T" ? "10" : card[0];
  const suit = { h: "♥", d: "♦", c: "♣", s: "♠" }[card[1]];
  return (
    <div className="w-9 h-12 rounded flex flex-col items-center justify-center" style={{ background: "#f4f0ff", border: "1px solid rgba(0,0,0,0.3)", color: red ? "#d11a4a" : "#0c061a", fontFamily: "Impact, sans-serif" }}>
      <span style={{ fontSize: 15, lineHeight: 1 }}>{r}</span>
      <span style={{ fontSize: 15, lineHeight: 1 }}>{suit}</span>
    </div>
  );
}

function FaceDown() {
  return (
    <div className="w-9 h-12 rounded flex items-center justify-center" style={{ background: "linear-gradient(135deg,#1a0b33,#3a1a5e)", border: "1px solid " + NEON, boxShadow: "inset 0 0 6px rgba(255,0,255,0.5)" }}>
      <span style={{ color: NEON }}>★</span>
    </div>
  );
}

function Seat({ name, hole, winner, hand, you }) {
  return (
    <div className="flex flex-col items-center gap-1" style={{ minWidth: 96 }}>
      <div className="flex gap-1">
        {hole ? hole.map((c, i) => <Card key={i} card={c} />) : (<><FaceDown /><FaceDown /></>)}
      </div>
      <div
        className="text-[11px] uppercase tracking-widest font-black px-2 py-0.5"
        style={{
          color: you ? INK : "#fff",
          background: you ? CYAN : winner ? NEON : "rgba(255,255,255,0.1)",
          border: "1px solid " + (winner ? NEON : "transparent"),
          boxShadow: winner ? "0 0 10px rgba(255,0,255,0.6)" : "none",
        }}
      >
        {name}
      </div>
      {hand && <div className="text-[10px]" style={{ color: winner ? CYAN : "rgba(255,255,255,0.6)" }}>{hand}</div>}
    </div>
  );
}

export default function HoldemTable() {
  const { tableId } = useParams();
  const tableIndex = Number(tableId) || 0;
  const { wallet } = useOutletContext();
  const [bet, setBet] = useState(20);
  const [balance, setBalance] = useState(null);
  const [mode, setMode] = useState("free");
  const [result, setResult] = useState(null);
  const [dealing, setDealing] = useState(false);
  const [reveal, setReveal] = useState(0);
  const [error, setError] = useState("");
  const [seats, setSeats] = useState(Array(SEATS).fill(null));
  const connRef = useRef(null);

  async function loadWallet() {
    try {
      const res = await base44.entities.Wallet.filter({}, { limit: 1 });
      const w = res.items && res.items[0];
      if (w) { setBalance(w.balance); setMode(w.mode || "free"); }
    } catch (e) {}
  }

  useEffect(() => { loadWallet(); }, []);

  useEffect(() => {
    let id = sessionStorage.getItem("holdem_connId");
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem("holdem_connId", id); }
    const conn = base44.actors.HoldemLobby("lobby").connect({ id });
    connRef.current = conn;
    const sub = conn.subscribe((msg) => {
      if (msg && msg.type === "state") {
        const t = msg.tables && msg.tables[tableIndex];
        if (t) setSeats(t);
      }
    });
    const joinTimer = setTimeout(() => { try { conn.send({ type: "join", table: tableIndex, name: "You" }); } catch (e) {} }, 400);
    return () => {
      clearTimeout(joinTimer);
      try { conn.send({ type: "leave" }); } catch (e) {}
      try { sub.unsubscribe(); } catch (e) {}
      try { conn.close(); } catch (e) {}
    };
  }, [tableIndex]);

  async function deal() {
    if (dealing) return;
    setDealing(true);
    setError("");
    setResult(null);
    setReveal(0);
    try {
      const res = await base44.functions.invoke("dealHoldem", { bet: Number(bet) });
      const r = res.data;
      if (r.error) throw new Error(r.error);
      setResult(r);
      let step = 0;
      const stepFn = () => {
        step += 1;
        setReveal(step);
        if (step < 5) setTimeout(stepFn, 320);
        else {
          setReveal(6);
          setDealing(false);
          wallet.refresh && wallet.refresh();
          loadWallet();
        }
      };
      setTimeout(stepFn, 350);
    } catch (e) {
      setError(e.message || "Deal failed");
      setDealing(false);
    }
  }

  const community = result ? result.community : [];
  const players = result ? result.players : [];
  const won = result && result.winnerSeat === 0;
  const showdown = result && reveal >= 6;

  function botName(s) {
    return (seats[s] && seats[s].name) || BOT_NAMES[s - 1];
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Link to="/holdem" className="no-underline text-xs uppercase tracking-widest font-bold" style={{ color: CYAN, textShadow: "0 0 8px rgba(0,255,255,0.6)" }}>← Back to lobby</Link>
        <div className="text-[10px] uppercase tracking-widest text-white">
          Table {tableIndex + 1} · {mode === "real" ? "Cash Play" : "Free Play"} · Balance {balance == null ? "—" : Number(balance).toLocaleString()} DCDN
        </div>
      </div>

      {/* Felt table */}
      <section
        className="p-6 relative"
        style={{
          background: "radial-gradient(ellipse at center,#10321f 0%,#081410 70%)",
          border: "2px solid #1f6b3a",
          boxShadow: "0 0 24px rgba(0,255,255,0.2), inset 0 0 40px rgba(0,0,0,0.5)",
          borderRadius: 20,
        }}
      >
        <div className="flex justify-center gap-6 mb-4">
          {[2, 3, 4].map((s) => (
            <Seat key={s} name={result ? players[s].name : botName(s)} hole={showdown ? players[s].hole : null} winner={result && result.winnerSeat === s} hand={showdown ? players[s].handName : null} />
          ))}
        </div>

        <div className="flex flex-col items-center gap-3 my-4">
          <div className="text-[10px] uppercase tracking-widest font-black" style={{ color: CYAN }}>Community</div>
          <div className="flex gap-2 min-h-[48px] items-center">
            {community.length === 0 && <span className="text-white/40 text-xs uppercase tracking-widest">Awaiting the deal</span>}
            {community.map((c, i) => (
              <div key={i} style={{ opacity: i < reveal ? 1 : 0.15, transition: "opacity 0.3s" }}>
                <Card card={c} />
              </div>
            ))}
          </div>
          {result && <div className="text-sm" style={{ color: NEON, textShadow: "0 0 8px rgba(255,0,255,0.6)" }}>Pot {result.pot} DCDN{result.rake ? ` · rake ${result.rake}` : ""}</div>}
        </div>

        <div className="flex justify-center items-end gap-6 mt-4">
          <Seat name={result ? players[1].name : botName(1)} hole={showdown ? players[1].hole : null} winner={result && result.winnerSeat === 1} hand={showdown ? players[1].handName : null} />
          <Seat name="You" hole={result ? players[0].hole : null} winner={won} hand={showdown ? players[0].handName : null} you />
          <Seat name={result ? players[5].name : botName(5)} hole={showdown ? players[5].hole : null} winner={result && result.winnerSeat === 5} hand={showdown ? players[5].handName : null} />
        </div>
      </section>

      <section
        className="p-5 flex flex-col gap-4"
        style={{
          background: "linear-gradient(180deg,#160a2b,#0c061a)",
          border: "1px solid " + (won ? CYAN : NEON),
          boxShadow: "0 0 12px " + (won ? "rgba(0,255,255,0.4)" : "rgba(255,0,255,0.3)"),
        }}
      >
        {showdown && (
          <div className="text-center text-2xl uppercase tracking-widest" style={{ fontFamily: "Impact, sans-serif", color: won ? CYAN : NEON, textShadow: "0 0 12px " + (won ? "rgba(0,255,255,0.7)" : "rgba(255,0,255,0.7)") }}>
            {won ? `You win ${result.payout} DCDN — ${players[0].handName}` : `${result.winnerName} takes the pot — ${players[result.winnerSeat].handName}`}
          </div>
        )}
        {error && <div className="text-center uppercase tracking-wide text-sm" style={{ color: NEON }}>{error}</div>}
        <div className="flex items-end gap-4 flex-wrap justify-center">
          <div className="flex flex-col">
            <label className="text-[10px] uppercase tracking-widest font-black mb-1" style={{ color: CYAN }}>Stakes (DCDN)</label>
            <select value={bet} onChange={(e) => setBet(Number(e.target.value))} className="px-3 py-2 font-black text-white" style={{ background: INK, border: "1px solid " + CYAN }}>
              {[10, 20, 50, 100, 250].map((v) => <option key={v} value={v} style={{ background: INK }}>{v} DCDN</option>)}
            </select>
          </div>
          <button
            onClick={deal}
            disabled={dealing}
            className="uppercase tracking-widest py-3 px-9 text-xl font-black disabled:opacity-50"
            style={{ fontFamily: "Impact, sans-serif", background: dealing ? "#333" : CYAN, color: INK, boxShadow: dealing ? "none" : "0 0 16px rgba(0,255,255,0.7)" }}
          >
            {dealing ? "Dealing…" : "Deal Hand"}
          </button>
        </div>
        {mode !== "real" && (
          <div className="text-center text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>
            Free play — switch to real stakes in the Wager Vault for cash play.
          </div>
        )}
      </section>

      <VideoChatPanel gameTitle="Neon Hold'em" />
    </div>
  );
}