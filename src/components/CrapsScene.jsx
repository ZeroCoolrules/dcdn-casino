import React from "react";

const NEON = "#ff00ff";
const CYAN = "#00ffff";
const INK = "#0c061a";
const IMG = "https://media.base44.com/images/public/6abce6018ce27c0f6bd6cc03/86f4d0f6d_generated_image.png";

const PIPS = {
  1: ["m"],
  2: ["tl", "br"],
  3: ["tl", "m", "br"],
  4: ["tl", "tr", "bl", "br"],
  5: ["tl", "tr", "m", "bl", "br"],
  6: ["tl", "tr", "ml", "mr", "bl", "br"],
};
const CELLS = ["tl", "tc", "tr", "ml", "m", "mr", "bl", "bc", "br"];

function Die({ face }) {
  return (
    <div
      className="relative w-9 h-9 rounded-md"
      style={{
        background: "linear-gradient(145deg,#ffffff,#d7dbe6)",
        boxShadow: "0 0 10px rgba(0,255,255,0.6), inset 0 -2px 4px rgba(0,0,0,0.25)",
      }}
    >
      <div className="grid grid-cols-3 grid-rows-3 w-full h-full p-1 gap-0.5">
        {Array.from({ length: 9 }).map((_, i) => {
          const on = PIPS[face].includes(CELLS[i]);
          return (
            <div key={i} className="flex items-center justify-center">
              {on && <span className="w-1.5 h-1.5 rounded-full" style={{ background: INK }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CrapsScene() {
  return (
    <section
      className="relative overflow-hidden"
      style={{ border: "1px solid " + CYAN, boxShadow: "0 0 18px rgba(0,255,255,0.35)" }}
    >
      <style>{`
        @keyframes dicetoss {
          0% { transform: translate(-30px,0) rotateX(0) rotateY(0) rotateZ(0); opacity:0; }
          10% { opacity:1; }
          42% { transform: translate(36vw,-78px) rotateX(720deg) rotateY(540deg) rotateZ(300deg); }
          74% { transform: translate(66vw,-12px) rotateX(1180deg) rotateY(880deg) rotateZ(520deg); }
          84% { transform: translate(72vw,2px) rotateX(1240deg) rotateY(940deg) rotateZ(560deg); }
          92% { transform: translate(71vw,-5px) rotateX(1270deg) rotateY(970deg) rotateZ(575deg); }
          100% { transform: translate(72vw,0) rotateX(1290deg) rotateY(985deg) rotateZ(585deg); opacity:0; }
        }
        @keyframes dicetoss2 {
          0% { transform: translate(-30px,0) rotateX(0) rotateY(0) rotateZ(0); opacity:0; }
          12% { opacity:1; }
          44% { transform: translate(34vw,-92px) rotateX(-720deg) rotateY(540deg) rotateZ(-300deg); }
          76% { transform: translate(62vw,-14px) rotateX(-1180deg) rotateY(880deg) rotateZ(-520deg); }
          85% { transform: translate(68vw,2px) rotateX(-1240deg) rotateY(940deg) rotateZ(-560deg); }
          93% { transform: translate(67vw,-6px) rotateX(-1270deg) rotateY(970deg) rotateZ(-575deg); }
          100% { transform: translate(68vw,0) rotateX(-1290deg) rotateY(-985deg) rotateZ(-585deg); opacity:0; }
        }
      `}</style>

      <img
        src={IMG}
        alt="Craps table scene"
        className="w-full h-[340px] md:h-[420px] object-cover"
        style={{ filter: "contrast(115%) saturate(125%) brightness(0.78)" }}
      />
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(12,6,26,0.35) 0%, rgba(12,6,26,0.78) 78%, rgba(12,6,26,0.95) 100%)" }}
      />

      <div className="absolute top-0 left-0 right-0 p-6 md:p-9 flex flex-col gap-2">
        <div className="text-[11px] uppercase tracking-widest font-black" style={{ color: CYAN, textShadow: "0 0 8px rgba(0,255,255,0.6)" }}>
          Live Floor · Table 7
        </div>
        <h2
          className="text-white uppercase leading-[0.95]"
          style={{ fontFamily: "Impact, Haettenschweiler, sans-serif", fontSize: "clamp(28px,4vw,46px)", textShadow: "0 0 14px rgba(255,0,255,0.55)" }}
        >
          Step Up to the Table
        </h2>
        <p className="text-white/75 text-sm max-w-[420px] leading-snug">
          Hot shooter on the felt — the crowd leans in as the dice fly. Pure casino energy, right from the lobby.
        </p>
      </div>

      <div className="absolute left-0 right-0 bottom-[18%] px-4 pointer-events-none" style={{ perspective: "600px" }}>
        <div className="relative h-16">
          <div className="absolute left-0" style={{ animation: "dicetoss 4s cubic-bezier(0.25,0.6,0.35,1) infinite", transformStyle: "preserve-3d", filter: "drop-shadow(0 0 6px rgba(0,255,255,0.5))" }}>
            <Die face={5} />
          </div>
          <div className="absolute left-0" style={{ animation: "dicetoss2 4s cubic-bezier(0.25,0.6,0.35,1) infinite", animationDelay: "0.4s", transformStyle: "preserve-3d", filter: "drop-shadow(0 0 6px rgba(255,0,255,0.5))" }}>
            <Die face={2} />
          </div>
        </div>
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 px-6 py-3 flex items-center justify-between"
        style={{ background: "linear-gradient(180deg, rgba(12,6,26,0) 0%, rgba(12,6,26,0.9) 100%)" }}
      >
        <span className="text-[10px] uppercase tracking-widest font-black" style={{ color: NEON, textShadow: "0 0 8px rgba(255,0,255,0.6)" }}>
          Come out roll · 7 or 11
        </span>
        <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.7)" }}>
          Hot streak · 5 shooters
        </span>
      </div>
    </section>
  );
}