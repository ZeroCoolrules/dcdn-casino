import React, { useEffect, useState, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Trophy, RefreshCw, Crown } from "lucide-react";

const NEON = "#ff00ff";
const CYAN = "#00ffff";
const INK = "#0c061a";

export default function Leaderboard() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [meId, setMeId] = useState(null);
  const pollRef = useRef(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await base44.functions.invoke("getLeaderboard", {});
      const data = res.data || {};
      setEntries(data.entries || []);
      setUpdatedAt(new Date());
    } catch {
      // keep last known board on error
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    base44.auth.me().then((u) => { if (u) setMeId(u.id); }).catch(() => {});
    load();
    pollRef.current = setInterval(() => load(true), 6000);
    let unsub = null;
    try {
      unsub = base44.entities.Round.subscribe(() => { load(true); });
    } catch {}
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      try { unsub && unsub(); } catch {}
    };
  }, [load]);

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);
  const podiumOrder = [1, 0, 2];

  const podiumHeight = { 1: "h-40", 2: "h-28", 3: "h-24" };
  const podiumTone = {
    1: { bg: NEON, glow: "0 0 18px rgba(255,0,255,0.6)" },
    2: { bg: CYAN, glow: "0 0 14px rgba(0,255,255,0.5)" },
    3: { bg: "#7c3aed", glow: "0 0 12px rgba(124,58,237,0.6)" },
  };

  return (
    <div className="flex flex-col gap-5">
      <div
        className="px-4 py-2 flex items-baseline justify-between flex-wrap gap-2"
        style={{ background: "#160a2b", border: "1px solid " + NEON, boxShadow: "0 0 12px rgba(255,0,255,0.3)" }}
      >
        <span className="text-2xl uppercase tracking-wide text-white flex items-center gap-2" style={{ fontFamily: "Impact, sans-serif", textShadow: "0 0 10px rgba(0,255,255,0.5)" }}>
          <Trophy className="w-5 h-5" style={{ color: NEON }} /> High Rollers
        </span>
        <span className="text-[11px] font-bold uppercase tracking-widest flex items-center gap-2" style={{ color: CYAN }}>
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: CYAN, boxShadow: "0 0 6px " + CYAN, animation: "lbPulse 1.6s infinite" }} />
          Live · top 10 by total winnings
        </span>
      </div>

      {/* Podium */}
      <div className="grid grid-cols-3 gap-3 items-end">
        {podiumOrder.map((idx) => {
          const e = top3[idx];
          if (!e) return <div key={idx} />;
          const place = idx + 1;
          const t = podiumTone[place];
          const isMe = meId && e.user_id === meId;
          return (
            <div key={e.user_id || idx} className="flex flex-col items-center gap-2">
              {place === 1 && <Crown className="w-5 h-5" style={{ color: NEON, filter: "drop-shadow(0 0 6px rgba(255,0,255,0.8))" }} />}
              <div
                className={`w-full flex flex-col items-center justify-end px-3 pb-3 pt-4 ${podiumHeight[place]}`}
                style={{ background: "linear-gradient(180deg,#160a2b,#0c061a)", border: "1px solid " + t.bg, boxShadow: t.glow }}
              >
                <span className="text-3xl font-black" style={{ fontFamily: "Impact, sans-serif", color: t.bg, textShadow: "0 0 10px " + t.bg }}>#{place}</span>
                <span className="text-xs uppercase tracking-widest font-black mt-1 text-center break-all leading-tight" style={{ color: isMe ? NEON : "#fff", fontFamily: "Impact, sans-serif" }}>
                  {e.handle}{isMe ? " (you)" : ""}
                </span>
                <span className="text-sm font-black mt-1" style={{ color: CYAN }}>
                  {e.total_won.toLocaleString()} <span className="text-[10px]">$DCDN</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Remaining ranks */}
      <section style={{ background: "linear-gradient(180deg,#160a2b,#0c061a)", border: "1px solid " + CYAN, boxShadow: "0 0 14px rgba(0,255,255,0.18)" }}>
        {loading ? (
          <div className="p-8 text-center text-xs uppercase tracking-widest" style={{ color: CYAN }}>Tallying the floor…</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-xs uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>No winners yet — be the first to spin.</div>
        ) : (
          <div className="flex flex-col">
            {rest.map((e) => {
              const isMe = meId && e.user_id === meId;
              return (
                <div
                  key={e.user_id}
                  className="grid grid-cols-12 items-center gap-2 px-4 py-3"
                  style={{ borderBottom: "1px dashed rgba(0,255,255,0.18)", background: isMe ? "rgba(255,0,255,0.08)" : "transparent" }}
                >
                  <span className="col-span-1 text-lg font-black" style={{ fontFamily: "Impact, sans-serif", color: CYAN }}>#{e.rank}</span>
                  <span className="col-span-6 sm:col-span-5 text-sm uppercase tracking-wide font-black break-all" style={{ color: isMe ? NEON : "#fff", fontFamily: "Impact, sans-serif" }}>
                    {e.handle}{isMe ? " (you)" : ""}
                  </span>
                  <span className="col-span-3 sm:col-span-3 text-[10px] uppercase tracking-widest text-right" style={{ color: "rgba(255,255,255,0.5)" }}>{e.spins} spins</span>
                  <span className="col-span-2 text-right text-sm font-black" style={{ color: CYAN }}>
                    {e.total_won.toLocaleString()} <span className="text-[9px]">$DCDN</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>
          {updatedAt ? "Updated " + updatedAt.toLocaleTimeString() : "—"}
        </span>
        <button
          onClick={() => load(false)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-widest font-black disabled:opacity-50"
          style={{ fontFamily: "Impact, sans-serif", color: INK, background: CYAN, boxShadow: "0 0 10px rgba(0,255,255,0.5)" }}
        >
          <RefreshCw className={"w-3 h-3 " + (refreshing ? "animate-spin" : "")} /> Refresh
        </button>
      </div>

      <style>{`@keyframes lbPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}