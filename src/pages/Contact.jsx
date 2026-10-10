import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, MessageSquare } from "lucide-react";

const NEON = "#ff00ff";
const CYAN = "#00ffff";

export default function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  function submit(e) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) return;
    setSent(true);
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <div
        className="px-4 py-3"
        style={{ background: "#160a2b", border: "1px solid " + NEON, boxShadow: "0 0 12px rgba(255,0,255,0.3)" }}
      >
        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: CYAN }}>Reach the House</span>
      </div>

      <section className="p-8 flex flex-col gap-6" style={{ background: "linear-gradient(180deg,#160a2b,#0c061a)", border: "1px solid " + CYAN, boxShadow: "0 0 14px rgba(0,255,255,0.25)" }}>
        <h1 className="text-4xl uppercase text-white" style={{ fontFamily: "Impact, Haettenschweiler, sans-serif", textShadow: "0 0 14px rgba(255,0,255,0.6)" }}>
          Contact Dream Casino
        </h1>

        <div className="flex flex-col gap-3 text-white/80 text-[15px] leading-relaxed">
          <p>
            Questions about the vault, deposits, provably-fair settlement, or the Hold'em floor?
            Reach the house directly and a floor manager will get back to you.
          </p>
          <a href="mailto:support@dreamcasino.base44.app" className="no-underline flex items-center gap-2" style={{ color: CYAN }}>
            <Mail className="w-4 h-4" /> support@dreamcasino.base44.app
          </a>
        </div>

        {sent ? (
          <div className="p-4 flex items-center gap-2 text-white" style={{ background: "#0c061a", border: "1px solid " + CYAN, boxShadow: "0 0 10px rgba(0,255,255,0.4)" }}>
            <MessageSquare className="w-4 h-4" style={{ color: CYAN }} />
            Thanks — your message is on its way to the floor manager.
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: CYAN }}>Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="px-3 py-2 bg-transparent text-white"
                style={{ border: "1px solid " + CYAN }}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: CYAN }}>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="px-3 py-2 bg-transparent text-white"
                style={{ border: "1px solid " + CYAN }}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: CYAN }}>Message</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={5}
                className="px-3 py-2 bg-transparent text-white"
                style={{ border: "1px solid " + CYAN }}
              />
            </label>
            <button
              type="submit"
              className="self-start px-6 py-2.5 text-sm font-black uppercase tracking-widest text-white"
              style={{ fontFamily: "Impact, sans-serif", background: NEON, boxShadow: "0 0 12px rgba(255,0,255,0.6)" }}
            >
              Send to the House
            </button>
          </form>
        )}

        <Link to="/about" className="no-underline text-sm uppercase tracking-widest" style={{ color: CYAN }}>
          ← About the House
        </Link>
      </section>
    </div>
  );
}