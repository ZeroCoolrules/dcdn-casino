import React from "react";
import { Link } from "react-router-dom";

const NEON = "#ff00ff";
const CYAN = "#00ffff";
const INK = "#0c061a";

export default function GameCard({ game }) {
  const featured = game.featured;
  const img = game.image_url;
  return (
    <div
      className="flex flex-col justify-between no-underline"
      style={{
        background: "linear-gradient(180deg,#160a2b 0%,#0c061a 100%)",
        border: "1px solid " + (featured ? NEON : "rgba(0,255,255,0.5)"),
        boxShadow: featured ? "0 0 16px rgba(255,0,255,0.5)" : "0 0 10px rgba(0,255,255,0.18)",
      }}
    >
      <div
        className="px-3.5 py-3 flex justify-between items-center"
        style={{ background: INK, borderBottom: "1px solid rgba(0,255,255,0.3)" }}
      >
        <span
          style={{
            fontSize: "9px",
            fontWeight: 900,
            letterSpacing: "1px",
            textTransform: "uppercase",
            padding: "3px 8px",
            color: featured ? "#0c061a" : "#ffffff",
            background: featured ? NEON : "transparent",
            border: featured ? "none" : "1px solid " + CYAN,
            boxShadow: featured ? "0 0 10px rgba(255,0,255,0.7)" : "none",
          }}
        >
          {game.type === "slot" ? "Progressive" : game.type === "cards" ? "PvP Cards" : "Live Table"}
        </span>
        <span className="text-[10px] font-black tracking-widest uppercase" style={{ color: CYAN }}>
          {game.type === "slot" ? "Reel" : "Table"} 0{game.order}
        </span>
      </div>

      {img && (
        <div className="h-24 overflow-hidden" style={{ borderBottom: "1px solid rgba(0,255,255,0.2)" }}>
          <img src={img} alt={game.title} className="w-full h-full object-cover" style={{ filter: "contrast(115%) saturate(125%) brightness(0.85)" }} />
        </div>
      )}

      <div className="p-4 flex flex-col gap-3">
        <div
          className="text-xl uppercase leading-none tracking-wide text-white"
          style={{ fontFamily: "Impact, Haettenschweiler, sans-serif", textShadow: "0 0 10px rgba(255,0,255,0.45)" }}
        >
          {game.title}
        </div>
        <p className="text-xs leading-snug" style={{ color: "rgba(255,255,255,0.6)" }}>{game.blurb}</p>
        <div className="flex justify-between pt-2.5" style={{ borderTop: "1px dashed rgba(0,255,255,0.25)" }}>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold" style={{ color: CYAN }}>Min Bet</span>
            <span className="text-base text-white" style={{ fontFamily: "Impact, sans-serif" }}>{game.min_bet} DCDN</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase font-bold" style={{ color: CYAN }}>{game.type === "slot" ? "Max Mult" : "RTP"}</span>
            <span className="text-base text-white" style={{ fontFamily: "Impact, sans-serif" }}>
              {game.type === "slot" ? `${game.max_multiplier}×` : `${game.rtp}%`}
            </span>
          </div>
        </div>
      </div>

      <Link
        to={`/play/${game.id}`}
        className="block no-underline text-center py-3 text-base uppercase tracking-widest transition-colors"
        style={{
          fontFamily: "Impact, sans-serif",
          background: INK,
          color: CYAN,
          borderTop: "1px solid " + CYAN,
        }}
      >
        {game.type === "slot" ? "Spin The Drum →" : "Take A Seat →"}
      </Link>
    </div>
  );
}