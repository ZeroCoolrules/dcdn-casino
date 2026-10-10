import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import VideoChatPanel from "@/components/VideoChatPanel";

const NEON = "#ff00ff";
const CYAN = "#00ffff";
const INK = "#0c061a";
const MAX_TABLES = 6;
const SEATS = 6;

export default function Holdem() {
  const navigate = useNavigate();
  const [tables, setTables] = useState(null);
  const [busy, setBusy] = useState("");
  const [floorFull, setFloorFull] = useState(false);
  const connRef = useRef(null);

  useEffect(() => {
    let id = sessionStorage.getItem("holdem_connId");
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem("holdem_connId", id); }
    const conn = base44.actors.HoldemLobby("lobby").connect({ id });
    connRef.current = conn;
    const sub = conn.subscribe((msg) => {
      if (!msg) return;
      if (msg.type === "state") {
        setTables(msg.tables);
        // clear floor-full once a seat opens up anywhere
        const anyOpen = msg.tables.some((t) => t.some((s) => !s));
        if (anyOpen) setFloorFull(false);
      }
      else if (msg.type === "seated") navigate(`/holdem/${msg.table}`);
      else if (msg.type === "table_full") setBusy("");
      else if (msg.type === "floor_full") { setBusy(""); setFloorFull(true); }
    });
    return () => { try { sub.unsubscribe(); } catch (e) {} try { conn.close(); } catch (e) {} };
  }, []);

  function joinTable(idx) {
    setFloorFull(false);
    setBusy(String(idx));
    if (connRef.current) connRef.current.send({ type: "join", table: idx, name: "Player" });
  }

  function joinAny() {
    setFloorFull(false);
    setBusy("any");
    if (connRef.current) connRef.current.send({ type: "join", name: "Player" });
  }

  const list = tables || [Array(SEATS).fill(null)];
  const openTables = list.filter((t) => t.some((s) => !s)).length;

  return (
    <div className="flex flex-col gap-5">
      <div
        className="px-4 py-2 flex items-baseline justify-between flex-wrap gap-2"
        style={{ background: "#160a2b", border: "1px solid " + NEON, boxShadow: "0 0 12px rgba(255,0,255,0.3)" }}
      >
        <span className="text-2xl uppercase tracking-wide text-white" style={{ fontFamily: "Impact, sans-serif", textShadow: "0 0 10px rgba(0,255,255,0.5)" }}>
          Neon Hold'em · Cash Floor
        </span>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: CYAN }}>
            6 tables max · {openTables} open
          </span>
          <button
            onClick={joinAny}
            disabled={busy === "any" || openTables === 0}
            className="uppercase tracking-widest px-3 py-1 text-[10px] font-black disabled:opacity-40"
            style={{ fontFamily: "Impact, sans-serif", background: NEON, color: "#fff", boxShadow: "0 0 10px rgba(255,0,255,0.5)" }}
          >
            {busy === "any" ? "Seating…" : "Quick Seat"}
          </button>
        </div>
      </div>

      {floorFull && (
        <div
          className="px-4 py-3 flex items-center justify-between flex-wrap gap-2"
          style={{ background: "#1a0b33", border: "1px solid " + NEON, boxShadow: "0 0 14px rgba(255,0,255,0.4)" }}
        >
          <span className="text-sm uppercase tracking-widest font-black" style={{ color: NEON, fontFamily: "Impact, sans-serif" }}>
            Cash floor is full — 6/6 tables running
          </span>
          <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.7)" }}>
            Grab a seat on the social video floor below — you'll be randomly paired with another player or ride with Vivian Volt (AI co-host) while you wait.
          </span>
        </div>
      )}

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {list.map((seats, idx) => {
          const taken = seats.filter((s) => s).length;
          const full = taken >= SEATS;
          return (
            <section
              key={idx}
              className="p-5 flex flex-col gap-3"
              style={{
                background: "linear-gradient(180deg,#160a2b,#0c061a)",
                border: "1px solid " + (full ? NEON : CYAN),
                boxShadow: full ? "0 0 14px rgba(255,0,255,0.4)" : "0 0 12px rgba(0,255,255,0.25)",
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg uppercase font-black" style={{ fontFamily: "Impact, sans-serif", color: full ? NEON : CYAN }}>
                  Table {idx + 1}
                </span>
                <span className="text-[10px] uppercase tracking-widest font-black px-2 py-0.5" style={{ color: INK, background: full ? NEON : CYAN }}>
                  {taken}/{SEATS}
                </span>
              </div>
              <div className="flex gap-1.5">
                {seats.map((s, i) => (
                  <div
                    key={i}
                    className="flex-1 h-3 rounded"
                    style={{
                      background: s ? (i === 0 ? CYAN : NEON) : "rgba(255,255,255,0.12)",
                      boxShadow: s ? "0 0 6px " + (i === 0 ? CYAN : NEON) : "none",
                    }}
                  />
                ))}
              </div>
              <div className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
                {full ? "Full — new table spawning" : `${SEATS - taken} seat${SEATS - taken === 1 ? "" : "s"} open · cash play`}
              </div>
              <button
                onClick={() => joinTable(idx)}
                disabled={full || busy === String(idx)}
                className="uppercase tracking-widest py-2.5 text-sm font-black disabled:opacity-40"
                style={{
                  fontFamily: "Impact, sans-serif",
                  background: full ? "#333" : CYAN,
                  color: INK,
                  boxShadow: full ? "none" : "0 0 12px rgba(0,255,255,0.6)",
                }}
              >
                {full ? "Full" : busy === String(idx) ? "Seating…" : "Take a Seat"}
              </button>
            </section>
          );
        })}
      </div>

      <div className="text-center text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>
        Real-stakes Texas Hold'em · 6 seats per table · provably-fair deal · 5% house rake
      </div>

      <VideoChatPanel gameTitle="Neon Hold'em Lobby" />
    </div>
  );
}