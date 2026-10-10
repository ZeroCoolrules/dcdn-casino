import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

const NEON = "#ff00ff";
const CYAN = "#00ffff";
const INK = "#0c061a";

// Inline editor for each game's RTP and bet limits. Game updates are
// admin-only via RLS, so this control only functions for operators.
export default function GameConfigEditor({ games, onSaved }) {
  const [draft, setDraft] = useState({});
  const [savingId, setSavingId] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const d = {};
    (games || []).forEach((g) => {
      d[g.id] = {
        rtp: g.rtp ?? 96,
        min_bet: g.min_bet ?? 10,
        max_bet: g.max_bet ?? 1000,
        max_multiplier: g.max_multiplier ?? 1000,
      };
    });
    setDraft(d);
  }, [games]);

  function setField(id, field, value) {
    setDraft((d) => ({ ...d, [id]: { ...(d[id] || {}), [field]: value } }));
  }

  async function save(g) {
    const v = draft[g.id];
    if (!v) return;
    const rtp = Number(v.rtp);
    const minBet = Number(v.min_bet);
    const maxBet = Number(v.max_bet);
    const maxMult = Number(v.max_multiplier);
    if (!(rtp >= 1 && rtp <= 99)) { setMsg(`RTP for ${g.title} must be between 1 and 99`); return; }
    if (!(minBet >= 1)) { setMsg(`Min bet for ${g.title} must be at least 1`); return; }
    if (!(maxBet >= minBet)) { setMsg(`Max bet must be at least the min bet for ${g.title}`); return; }
    if (!(maxMult >= 1)) { setMsg(`Max multiplier must be at least 1 for ${g.title}`); return; }
    setSavingId(g.id);
    setMsg("");
    try {
      await base44.entities.Game.update(g.id, {
        rtp: rtp,
        min_bet: minBet,
        max_bet: maxBet,
        max_multiplier: maxMult,
      });
      setMsg(`${g.title} updated — changes apply to the next spin.`);
      onSaved && onSaved();
    } catch (e) {
      setMsg(e.message || "Save failed (admins only)");
    } finally {
      setSavingId("");
    }
  }

  return (
    <section className="p-5" style={{ background: "linear-gradient(180deg,#160a2b,#0c061a)", border: "1px solid " + NEON, boxShadow: "0 0 12px rgba(255,0,255,0.25)" }}>
      <div className="text-lg uppercase tracking-wide font-black mb-1" style={{ fontFamily: "Impact, sans-serif", color: NEON }}>
        Game Configuration (RTP & Limits)
      </div>
      <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.55)" }}>
        Set the house edge and bet bounds per game. Changes take effect on the next spin.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-left" style={{ color: "rgba(255,255,255,0.6)", borderBottom: "1px solid rgba(0,255,255,0.3)" }}>
              <th className="py-2">Game</th>
              <th className="py-2">RTP %</th>
              <th className="py-2">Min Bet</th>
              <th className="py-2">Max Bet</th>
              <th className="py-2">Max Mult</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {games.length === 0 && (
              <tr><td colSpan={6} className="py-3" style={{ color: "rgba(255,255,255,0.5)" }}>No games configured.</td></tr>
            )}
            {games.map((g) => {
              const v = draft[g.id] || {};
              return (
                <tr key={g.id} style={{ borderBottom: "1px solid rgba(0,255,255,0.12)" }}>
                  <td className="py-2.5 text-white font-bold">{g.title}</td>
                  <td className="py-2.5"><NumInput value={v.rtp} onChange={(val) => setField(g.id, "rtp", val)} /></td>
                  <td className="py-2.5"><NumInput value={v.min_bet} onChange={(val) => setField(g.id, "min_bet", val)} /></td>
                  <td className="py-2.5"><NumInput value={v.max_bet} onChange={(val) => setField(g.id, "max_bet", val)} /></td>
                  <td className="py-2.5"><NumInput value={v.max_multiplier} onChange={(val) => setField(g.id, "max_multiplier", val)} /></td>
                  <td className="py-2.5">
                    <button
                      onClick={() => save(g)}
                      disabled={savingId === g.id}
                      className="uppercase tracking-widest px-3 py-1 text-[10px] font-black disabled:opacity-50"
                      style={{ fontFamily: "Impact, sans-serif", background: CYAN, color: INK, boxShadow: "0 0 10px rgba(0,255,255,0.5)" }}
                    >
                      {savingId === g.id ? "…" : "Save"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {msg && <div className="text-[11px] uppercase tracking-wide mt-3" style={{ color: CYAN }}>{msg}</div>}
    </section>
  );
}

function NumInput({ value, onChange }) {
  return (
    <input
      type="number"
      step="0.1"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-20 px-2 py-1 bg-transparent text-white text-sm"
      style={{ border: "1px solid " + CYAN }}
    />
  );
}