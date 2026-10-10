import React, { useEffect, useState, useRef } from "react";
import { useParams, useOutletContext, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { REEL_SYMBOLS } from "@/lib/reelSymbols";
import VideoChatPanel from "@/components/VideoChatPanel";

const SYM_MAP = Object.fromEntries(REEL_SYMBOLS.map((s) => [s.id, s]));
const NEON = "#ff00ff";
const CYAN = "#00ffff";
const INK = "#0c061a";
const PURPLE = "#1a0b33";

const PAYLINES = [
  { id: 1, color: "#00ffff", path: [1, 1, 1, 1, 1] },
  { id: 2, color: "#ff00ff", path: [0, 0, 0, 0, 0] },
  { id: 3, color: "#ffe600", path: [2, 2, 2, 2, 2] },
  { id: 4, color: "#ff7a00", path: [0, 1, 2, 1, 0] },
  { id: 5, color: "#00ff9d", path: [2, 1, 0, 1, 2] },
];

function evalPaylines(grid, activeCount) {
  const wins = [];
  for (let i = 0; i < activeCount; i++) {
    const p = PAYLINES[i];
    const sym = grid[0][p.path[0]];
    let n = 1;
    for (let r = 1; r < 5; r++) { if (grid[r][p.path[r]] === sym) n++; else break; }
    if (n >= 3) wins.push(p);
  }
  return wins;
}

const trapezoid = "polygon(6% 0, 94% 0, 100% 100%, 0 100%)";
const gradText = {
  background: "linear-gradient(90deg,#00ffff 0%,#ffffff 100%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
};

function randomReel() {
  const ids = REEL_SYMBOLS.map((s) => s.id);
  return [0, 1, 2].map(() => ids[Math.floor(Math.random() * ids.length)]);
}
function defaultReels() {
  return [
    ["vault", "tommy", "cigar"],
    ["briefcase", "mustang", "crown"],
    ["ring", "vault", "tommy"],
    ["cigar", "briefcase", "mustang"],
    ["crown", "ring", "vault"],
  ];
}

export default function SlotGame() {
  const { id } = useParams();
  const { wallet } = useOutletContext();
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bet, setBet] = useState(10);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [showProof, setShowProof] = useState(false);
  const [clientSeed, setClientSeed] = useState("");
  const [activeLines, setActiveLines] = useState(5);
  const [reelDisplay, setReelDisplay] = useState(defaultReels());
  const [settled, setSettled] = useState([true, true, true, true, true]);
  const mounted = useRef(true);
  const reelTimerRef = useRef(null);
  const settledRef = useRef([true, true, true, true, true]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (reelTimerRef.current) clearInterval(reelTimerRef.current);
    };
  }, []);

  useEffect(() => {
    base44.entities.Game.get(id)
      .then((g) => {
        setGame(g);
        setBet(g.min_bet || 10);
        base44.entities.EventLog.create({ type: "game_view", game_id: g.id, game_title: g.title }).catch(() => {});
      })
      .finally(() => setLoading(false));
  }, [id]);

  function stopReelTimer() {
    if (reelTimerRef.current) { clearInterval(reelTimerRef.current); reelTimerRef.current = null; }
  }

  async function spin() {
    if (!game || spinning) return;
    setSpinning(true);
    setError("");
    setResult(null);
    setSettled([false, false, false, false, false]);
    settledRef.current = [false, false, false, false, false];

    if (reelTimerRef.current) clearInterval(reelTimerRef.current);
    reelTimerRef.current = setInterval(() => {
      setReelDisplay((prev) => prev.map((col, ci) => (settledRef.current[ci] ? col : randomReel())));
    }, 70);

    const seed = clientSeed || Math.random().toString(36).slice(2, 10);
    let r;
    try {
      const res = await base44.functions.invoke("spinSlot", {
        game_id: game.id,
        bet: Number(bet),
        mode: wallet && wallet.mode === "real" ? "real" : "free",
        client_seed: seed,
        active_lines: activeLines,
      });
      r = res.data;
      if (r.ok === false || r.error) throw new Error(r.error || "Spin failed");
    } catch (e) {
      stopReelTimer();
      setError(e.message || "Spin failed");
      setSpinning(false);
      setSettled([true, true, true, true, true]);
      settledRef.current = [true, true, true, true, true];
      return;
    }

    const finalReels = r.reels && r.reels.length === 5 ? r.reels : defaultReels();
    let settledCount = 0;
    finalReels.forEach((col, ci) => {
      setTimeout(() => {
        setReelDisplay((prev) => { const n = prev.slice(); n[ci] = col; return n; });
        settledRef.current[ci] = true;
        setSettled((prev) => { const n = prev.slice(); n[ci] = true; return n; });
        settledCount += 1;
        if (settledCount === 5) {
          stopReelTimer();
          setResult(r);
          setHistory((h) => [{ ...r, ts: Date.now() }, ...h].slice(0, 8));
          wallet.refresh && wallet.refresh();
          setSpinning(false);
        }
      }, 350 + ci * 300);
    });
  }

  if (loading) return <div className="text-center py-20 uppercase tracking-widest" style={{ color: CYAN }}>Loading reel…</div>;
  if (!game) return <div className="text-center py-20 uppercase" style={{ color: NEON }}>Game not found</div>;

  const won = result && result.multiplier > 0;
  const winningLines = result && !spinning ? evalPaylines(reelDisplay, activeLines) : [];

  return (
    <div className="flex flex-col gap-5">
      <style>{`
        @keyframes reelbob {0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
        @keyframes reelsnap {0%{transform:translateY(-20px)}55%{transform:translateY(5px)}78%{transform:translateY(-3px)}100%{transform:translateY(0)}}
        @keyframes neonpulse {0%,100%{box-shadow:0 0 12px rgba(0,255,255,0.5)}50%{box-shadow:0 0 24px rgba(0,255,255,0.95),0 0 40px rgba(255,0,255,0.45)}}
        @keyframes winpulse {0%,100%{transform:scale(1);filter:drop-shadow(0 0 6px rgba(0,255,255,0.6))}50%{transform:scale(1.045);filter:drop-shadow(0 0 18px rgba(0,255,255,0.95))}}
        @keyframes winglow {0%,100%{box-shadow:inset 0 0 18px rgba(255,0,255,0.18),0 0 14px rgba(0,255,255,0.35)}50%{box-shadow:inset 0 0 26px rgba(255,0,255,0.4),0 0 32px rgba(0,255,255,0.8)}}
        @keyframes scanline {0%{background-position:0 0}100%{background-position:0 -120px}}
        @keyframes winspark {0%{opacity:0;transform:translateY(0) scale(0.6)}30%{opacity:1}100%{opacity:0;transform:translateY(-48px) scale(1.15)}}
      `}</style>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Link to="/" className="no-underline text-xs uppercase tracking-widest font-bold" style={{ color: CYAN, textShadow: "0 0 8px rgba(0,255,255,0.6)" }}>← Back to floor</Link>
        <div className="text-[10px] uppercase tracking-widest text-white">
          RTP <span className="font-black" style={{ color: CYAN }}>{game.rtp}%</span> · Provably Fair
        </div>
      </div>

      {/* Reel cabinet */}
      <div
        className="p-[3px]"
        style={{
          background: "linear-gradient(180deg,#e9eef5 0%,#9aa3b4 22%,#ffffff 45%,#5b6273 78%,#c9d2dd 100%)",
          boxShadow: "0 0 24px rgba(0,255,255,0.35), 0 0 40px rgba(255,0,255,0.25)",
        }}
      >
        <div className="relative" style={{ background: INK }}>
          {/* neon light strips */}
          <div className="absolute top-0 bottom-0 left-0 w-[6px]" style={{ background: "linear-gradient(180deg," + NEON + "," + CYAN + ")", boxShadow: "0 0 12px " + NEON }} />
          <div className="absolute top-0 bottom-0 right-0 w-[6px]" style={{ background: "linear-gradient(180deg," + CYAN + "," + NEON + ")", boxShadow: "0 0 12px " + CYAN }} />

          <div className="px-6 pt-6 pb-7 flex flex-col gap-5 relative" style={{ background: "linear-gradient(180deg,#160a2b 0%,#0c061a 100%)" }}>
            <div className="pointer-events-none absolute inset-0 opacity-[0.10]" style={{ background: "repeating-linear-gradient(0deg, rgba(0,255,255,0.6) 0px, rgba(0,255,255,0.6) 1px, transparent 2px, transparent 5px)", animation: "scanline 7s linear infinite" }} />
            {/* Title banner */}
            <div className="flex justify-center">
              <div
                className="px-10 py-2 text-xl uppercase tracking-widest"
                style={{
                  clipPath: trapezoid,
                  background: "linear-gradient(180deg,#2d4bff 0%,#1a2fcc 100%)",
                  fontFamily: "Impact, Haettenschweiler, sans-serif",
                  boxShadow: "0 0 14px rgba(0,255,255,0.5)",
                }}
              >
                <span style={gradText}>{game.title}</span>
              </div>
            </div>

            {/* Reel grid */}
            <div
              className="grid grid-cols-5 gap-2 p-3 relative"
              style={{
                background: "#06030f",
                border: "1px solid " + (won ? CYAN : "rgba(0,255,255,0.4)"),
                boxShadow: won ? undefined : "inset 0 0 18px rgba(255,0,255,0.18)",
                animation: won ? "winglow 1.1s ease-in-out infinite" : undefined,
              }}
            >
              {reelDisplay.map((col, ci) => {
                const reelSpinning = spinning && !settled[ci];
                return (
                  <div key={ci} className="flex flex-col gap-2" style={reelSpinning ? { animation: "reelbob 0.4s ease-in-out infinite" } : { animation: "reelsnap 0.42s cubic-bezier(0.2,0.8,0.2,1)" }}>
                    {col.map((symId, ri) => {
                      const isPayline = ri === 1;
                      return (
                        <div
                          key={ri}
                          className="h-20 flex items-center justify-center text-4xl"
                          style={{
                            background: isPayline ? "#241048" : "#120827",
                            border: isPayline ? "1px solid " + CYAN : "1px solid rgba(255,255,255,0.08)",
                            boxShadow: isPayline ? (reelSpinning ? "0 0 18px rgba(0,255,255,0.85)" : "0 0 12px rgba(0,255,255,0.5)") : "none",
                            filter: reelSpinning ? "blur(2.6px)" : "none",
                            opacity: reelSpinning && !isPayline ? 0.5 : 1,
                          }}
                        >
                          <span>{SYM_MAP[symId]?.icon || "🎰"}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Neon paylines */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 60" preserveAspectRatio="none" style={{ overflow: "visible" }}>
                {PAYLINES.slice(0, activeLines).map((p) => {
                  const win = winningLines.some((w) => w.id === p.id);
                  const pts = p.path.map((row, ci) => `${ci * 20 + 10},${row * 20 + 10}`).join(" ");
                  return (
                    <polyline
                      key={p.id}
                      points={pts}
                      fill="none"
                      stroke={p.color}
                      strokeWidth={win ? 4 : 2}
                      vectorEffect="non-scaling-stroke"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ opacity: spinning ? 0 : win ? 1 : 0.28, filter: win ? `drop-shadow(0 0 5px ${p.color})` : "none", transition: "opacity 0.25s ease" }}
                    />
                  );
                })}
              </svg>

              {/* Win sparkles */}
              {won && (
                <div key={history[0]?.ts} className="pointer-events-none absolute inset-0 overflow-hidden">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <span
                      key={i}
                      className="absolute w-1.5 h-1.5 rounded-full"
                      style={{
                        left: (10 + i * 15) + "%",
                        top: "42%",
                        background: i % 2 ? CYAN : NEON,
                        boxShadow: "0 0 8px " + (i % 2 ? CYAN : NEON),
                        animation: "winspark 1s ease-out " + (i * 0.08) + "s forwards",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Result banner */}
            <div className="flex justify-center">
              <div
                className="px-12 py-3 text-center uppercase tracking-widest text-lg"
                style={{
                  clipPath: trapezoid,
                  background: won
                    ? "linear-gradient(180deg,#2d4bff 0%,#1a2fcc 100%)"
                    : "linear-gradient(180deg,#1a0b33 0%,#0c061a 100%)",
                  border: "1px solid " + (won ? CYAN : "rgba(255,255,255,0.2)"),
                  boxShadow: won ? "0 0 16px rgba(0,255,255,0.6)" : "none",
                  fontFamily: "Impact, sans-serif",
                  animation: won ? "winpulse 0.9s ease-in-out infinite" : undefined,
                }}
              >
                {spinning ? (
                  <span style={gradText}>Spinning the drum…</span>
                ) : !result ? (
                  <span className="text-white">Pull the lever</span>
                ) : won ? (
                  <span style={gradText}>WIN — {result.label} · {result.multiplier}×{winningLines.length ? ` · L${winningLines.map((w) => w.id).join("/")}` : ""}</span>
                ) : (
                  <span style={{ color: NEON, textShadow: "0 0 10px rgba(255,0,255,0.7)" }}>Bust — house takes the cut</span>
                )}
              </div>
            </div>

            {result && (
              <div className="flex items-center justify-between flex-wrap gap-2 text-sm text-white/70">
                <span>Bet <span className="text-white font-black">{result.bet} DCDN</span></span>
                <span>Payout <span className={won ? "" : "text-white"} style={won ? { color: CYAN, textShadow: "0 0 8px rgba(0,255,255,0.6)" } : {}}>{result.payout} DCDN</span></span>
                <span>Balance <span className="text-white font-black">{result.balance?.toLocaleString(undefined, { maximumFractionDigits: 2 })} DCDN</span></span>
                <button onClick={() => setShowProof((v) => !v)} className="underline text-xs uppercase tracking-widest" style={{ color: CYAN }}>
                  {showProof ? "Hide" : "Inspect"} Reel Hash
                </button>
              </div>
            )}

            {showProof && result && (
              <div className="text-[10px] font-mono break-all p-3" style={{ color: "rgba(255,255,255,0.55)", background: "#06030f", border: "1px solid rgba(0,255,255,0.25)" }}>
                <div>server_hash: {result.server_hash}</div>
                <div>server_seed: {result.server_seed}</div>
                <div>client_seed: {result.client_seed}</div>
                <div>nonce: {result.nonce} · roll: {result.roll}</div>
                <div className="mt-1" style={{ color: CYAN }}>Verify: SHA256(server_seed:client_seed:nonce) first 8 hex → roll = (int mod 1e6)/1e6</div>
              </div>
            )}

            {error && <div className="text-sm uppercase tracking-wide text-center" style={{ color: NEON }}>{error}</div>}

            {/* Controls */}
            <div className="flex items-end gap-4 flex-wrap">
              <div className="flex flex-col">
                <label className="text-[10px] uppercase tracking-widest font-black mb-1" style={{ color: CYAN }}>Bet (DCDN)</label>
                <select
                  value={bet}
                  onChange={(e) => setBet(Number(e.target.value))}
                  className="px-3 py-2 font-black text-white"
                  style={{ background: INK, border: "1px solid " + CYAN, boxShadow: "0 0 8px rgba(0,255,255,0.3)" }}
                >
                  {[game.min_bet, game.min_bet * 5, game.min_bet * 10, game.min_bet * 25, game.max_bet].map((v) => (
                    <option key={v} value={v} style={{ background: INK }}>{v} DCDN</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-[10px] uppercase tracking-widest font-black mb-1" style={{ color: CYAN }}>Paylines</label>
                <div className="flex items-center gap-2 px-2 py-1.5" style={{ background: INK, border: "1px solid " + NEON, boxShadow: "0 0 8px rgba(255,0,255,0.3)" }}>
                  <button onClick={() => setActiveLines((n) => Math.max(1, n - 1))} disabled={spinning} className="w-6 h-6 text-sm font-black text-white disabled:opacity-40" style={{ background: "#1a0b33", border: "1px solid rgba(255,255,255,0.2)" }}>−</button>
                  <span className="text-base font-black text-white" style={{ fontFamily: "Impact, sans-serif" }}>{activeLines}</span>
                  <button onClick={() => setActiveLines((n) => Math.min(5, n + 1))} disabled={spinning} className="w-6 h-6 text-sm font-black text-white disabled:opacity-40" style={{ background: "#1a0b33", border: "1px solid rgba(255,255,255,0.2)" }}>+</button>
                  <div className="flex items-center gap-1 ml-1">
                    {PAYLINES.slice(0, activeLines).map((p) => (
                      <span key={p.id} className="w-2 h-2 rounded-full" style={{ background: p.color, boxShadow: `0 0 5px ${p.color}` }} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex flex-col">
                <label className="text-[10px] uppercase tracking-widest font-black mb-1" style={{ color: CYAN }}>Client Seed (provably fair)</label>
                <input
                  value={clientSeed}
                  onChange={(e) => setClientSeed(e.target.value.slice(0, 32))}
                  placeholder="random"
                  className="px-3 py-2 font-mono text-sm w-48 text-white"
                  style={{ background: INK, border: "1px solid rgba(255,255,255,0.2)" }}
                />
              </div>
              <button
                onClick={spin}
                disabled={spinning}
                className="no-underline uppercase tracking-widest py-3.5 px-9 text-2xl disabled:opacity-50"
                style={{
                  fontFamily: "Impact, sans-serif",
                  background: CYAN,
                  color: INK,
                  boxShadow: "0 0 16px rgba(0,255,255,0.7)",
                  animation: spinning ? undefined : "neonpulse 1.6s ease-in-out infinite",
                }}
              >
                {spinning ? "…" : "Pull Lever"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <section className="p-4" style={{ background: "#160a2b", border: "1px solid " + NEON, boxShadow: "0 0 12px rgba(255,0,255,0.25)" }}>
          <div className="text-sm uppercase tracking-widest font-black mb-2" style={{ fontFamily: "Impact, sans-serif", color: CYAN }}>
            Recent Spins
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {history.map((h, i) => (
              <div key={i} className="flex-shrink-0 px-3 py-2 text-xs" style={{ background: INK, border: "1px solid rgba(0,255,255,0.3)" }}>
                <div className="font-black" style={h.multiplier > 0 ? { color: CYAN, textShadow: "0 0 8px rgba(0,255,255,0.6)" } : { color: "rgba(255,255,255,0.5)" }}>
                  {h.multiplier > 0 ? `${h.multiplier}×` : "Bust"}
                </div>
                <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>{h.bet} → {h.payout}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <VideoChatPanel gameTitle={game?.title} />
    </div>
  );
}