import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import GameConfigEditor from "@/components/GameConfigEditor";
import { useAuth } from "@/lib/AuthContext";

const NEON = "#ff00ff";
const CYAN = "#00ffff";
const INK = "#0c061a";

// The backend already enforces admin-only writes (Game RLS, approveDeposit); this
// gate keeps non-admins from seeing the console at all.
export default function OperatorPortal() {
  const { user, isAuthenticated, isLoadingAuth, navigateToLogin } = useAuth();
  if (isLoadingAuth) return null;
  if (!isAuthenticated || user?.role !== "admin") {
    return (
      <section className="p-8 max-w-xl mx-auto flex flex-col gap-4 text-center" style={{ background: "linear-gradient(180deg,#160a2b,#0c061a)", border: "1px solid " + NEON, boxShadow: "0 0 14px rgba(255,0,255,0.25)" }}>
        <div className="text-2xl uppercase tracking-wide text-white" style={{ fontFamily: "Impact, sans-serif" }}>Operators only</div>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
          {isAuthenticated ? "This console is restricted to casino admins." : "Log in with an admin account to open the operator console."}
        </p>
        {!isAuthenticated && (
          <button
            onClick={navigateToLogin}
            className="uppercase tracking-widest py-3 px-4 text-lg font-black self-center"
            style={{ fontFamily: "Impact, sans-serif", background: CYAN, color: INK, boxShadow: "0 0 14px rgba(0,255,255,0.6)" }}
          >
            Log in
          </button>
        )}
      </section>
    );
  }
  return <OperatorConsole />;
}

function OperatorConsole() {
  const [games, setGames] = useState([]);
  const [stats, setStats] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [popularity, setPopularity] = useState([]);
  const [traffic, setTraffic] = useState({ pageViews: 0, gameViews: 0, chatJoins: 0 });
  const [deposits, setDeposits] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [busy, setBusy] = useState("");
  const [opError, setOpError] = useState("");

  async function loadAll() {
    setLoading(true);
    try {
      const [gRes, agg, rRes, dRes, dHist] = await Promise.all([
        base44.entities.Game.filter({}, { sort: "order", limit: 50 }),
        base44.entities.Round.aggregate({ groupBy: "game_id", sum: ["bet", "payout"], limit: 100 }),
        base44.entities.Round.filter({}, { sort: "-created_date", limit: 12 }),
        base44.entities.Deposit.filter({ status: "pending" }, { sort: "-created_date", limit: 20 }),
        base44.entities.Deposit.filter({ status: { $in: ["approved", "rejected"] } }, { sort: "-created_date", limit: 8 }),
      ]);
      setGames(gRes.items || []);
      setStats(agg.rows || []);
      setRounds(rRes.items || []);
      setDeposits(dRes.items || []);
      setDecisions(dHist.items || []);
    } catch (e) {}
    finally { setLoading(false); }

    try {
      const [pop, pv, gv, cj] = await Promise.all([
        base44.entities.EventLog.aggregate({ query: { type: "game_view" }, groupBy: "game_title", limit: 100, sort: "-count" }),
        base44.entities.EventLog.count({ type: "page_view" }),
        base44.entities.EventLog.count({ type: "game_view" }),
        base44.entities.EventLog.count({ type: "video_chat_join" }),
      ]);
      setPopularity((pop && pop.rows) || []);
      setTraffic({ pageViews: pv || 0, gameViews: gv || 0, chatJoins: cj || 0 });
    } catch (e) {}
  }

  useEffect(() => { loadAll(); }, []);

  const statsArr = stats || [];
  const totalWagered = statsArr.reduce((s, r) => s + (r.sum_bet || 0), 0);
  const totalPaid = statsArr.reduce((s, r) => s + (r.sum_payout || 0), 0);
  const houseGross = totalWagered - totalPaid;
  const rtp = totalWagered > 0 ? ((totalPaid / totalWagered) * 100).toFixed(2) : "—";
  const totalSpins = statsArr.reduce((s, r) => s + (r.count || 0), 0);

  async function handleDeposit(id, action) {
    setOpError("");
    setBusy(id + ":" + action);
    try {
      const res = await base44.functions.invoke("approveDeposit", { deposit_id: id, action });
      if (res && res.data && res.data.error) throw new Error(res.data.error);
      const [pen, hist] = await Promise.all([
        base44.entities.Deposit.filter({ status: "pending" }, { sort: "-created_date", limit: 20 }),
        base44.entities.Deposit.filter({ status: { $in: ["approved", "rejected"] } }, { sort: "-created_date", limit: 8 }),
      ]);
      setDeposits(pen.items || []);
      setDecisions(hist.items || []);
    } catch (e) {
      setOpError(e.message || "Action failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        className="px-4 py-2 flex items-baseline justify-between flex-wrap gap-2"
        style={{ background: "#160a2b", border: "1px solid " + NEON, boxShadow: "0 0 12px rgba(255,0,255,0.3)" }}
      >
        <span className="text-2xl uppercase tracking-wide text-white" style={{ fontFamily: "Impact, sans-serif", textShadow: "0 0 10px rgba(0,255,255,0.5)" }}>
          Operator Console
        </span>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: CYAN }}>Level 4 Clearance · Clearing House</span>
          <button
            onClick={loadAll}
            className="uppercase tracking-widest px-3 py-1 text-[10px] font-black"
            style={{ fontFamily: "Impact, sans-serif", background: CYAN, color: INK, boxShadow: "0 0 10px rgba(0,255,255,0.5)" }}
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 uppercase tracking-widest" style={{ color: CYAN }}>Auditing the books…</div>
      ) : (
        <>
          {/* KPI grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Total Wagered" value={`${totalWagered.toLocaleString()} DCDN`} tone="cyan" />
            <KPI label="Total Paid Out" value={`${totalPaid.toLocaleString()} DCDN`} tone="white" />
            <KPI label="House Gross" value={`${houseGross.toLocaleString()} DCDN`} tone="neon" />
            <KPI label="Actual RTP" value={`${rtp}%`} tone="cyan" />
          </div>

          {/* Player traffic & popularity */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Page Views" value={traffic.pageViews.toLocaleString()} tone="cyan" />
            <KPI label="Game Opens" value={traffic.gameViews.toLocaleString()} tone="white" />
            <KPI label="Video Chat Joins" value={traffic.chatJoins.toLocaleString()} tone="neon" />
            <KPI label="Pending Deposits" value={deposits.length.toLocaleString()} tone="cyan" />
          </div>

          <section className="p-5" style={{ background: "linear-gradient(180deg,#160a2b,#0c061a)", border: "1px solid " + NEON, boxShadow: "0 0 12px rgba(255,0,255,0.25)" }}>
            <div className="text-lg uppercase tracking-wide font-black mb-3" style={{ fontFamily: "Impact, sans-serif", color: NEON }}>
              Most Played Movie Slots
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-left" style={{ color: "rgba(255,255,255,0.6)", borderBottom: "1px solid rgba(0,255,255,0.3)" }}>
                    <th className="py-2">#</th>
                    <th className="py-2">Slot</th>
                    <th className="py-2">Opens</th>
                  </tr>
                </thead>
                <tbody>
                  {popularity.length === 0 && (
                    <tr><td colSpan={3} className="py-3" style={{ color: "rgba(255,255,255,0.5)" }}>No visits tracked yet.</td></tr>
                  )}
                  {popularity.map((row, i) => (
                    <tr key={row.game_title || i} style={{ borderBottom: "1px solid rgba(0,255,255,0.12)" }}>
                      <td className="py-2.5 font-black" style={{ color: CYAN }}>{i + 1}</td>
                      <td className="py-2.5 text-white font-bold">{row.game_title || "Unknown"}</td>
                      <td className="py-2.5" style={{ color: "rgba(255,255,255,0.8)" }}>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Per-game profitability */}
          <section className="p-5" style={{ background: "linear-gradient(180deg,#160a2b,#0c061a)", border: "1px solid " + CYAN, boxShadow: "0 0 12px rgba(0,255,255,0.2)" }}>
            <div className="text-lg uppercase tracking-wide font-black mb-3" style={{ fontFamily: "Impact, sans-serif", color: CYAN }}>
              Per-Game Profitability
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-left" style={{ color: "rgba(255,255,255,0.6)", borderBottom: "1px solid rgba(0,255,255,0.3)" }}>
                    <th className="py-2">Game</th>
                    <th className="py-2">Spins</th>
                    <th className="py-2">Wagered</th>
                    <th className="py-2">Paid Out</th>
                    <th className="py-2">House Edge</th>
                    <th className="py-2">Target RTP</th>
                  </tr>
                </thead>
                <tbody>
                  {games.map((g) => {
                    const row = statsArr.find((r) => r.game_id === g.id) || { count: 0, sum_bet: 0, sum_payout: 0 };
                    const edge = row.sum_bet ? (row.sum_bet - row.sum_payout) : 0;
                    const actualRtp = row.sum_bet ? ((row.sum_payout / row.sum_bet) * 100).toFixed(1) : "—";
                    return (
                      <tr key={g.id} style={{ borderBottom: "1px solid rgba(0,255,255,0.12)" }}>
                        <td className="py-2.5 text-white font-bold">{g.title}</td>
                        <td className="py-2.5" style={{ color: "rgba(255,255,255,0.6)" }}>{row.count}</td>
                        <td className="py-2.5 text-white">{(row.sum_bet || 0).toLocaleString()}</td>
                        <td className="py-2.5" style={{ color: "rgba(255,255,255,0.6)" }}>{(row.sum_payout || 0).toLocaleString()}</td>
                        <td className="py-2.5 font-black" style={{ color: CYAN }}>{edge.toLocaleString()}</td>
                        <td className="py-2.5" style={{ color: "rgba(255,255,255,0.6)" }}>{g.rtp}% / {actualRtp}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* RTP & bet-limit editor */}
          <GameConfigEditor games={games} onSaved={loadAll} />

          {/* Manual deposit requests */}
          <section className="p-5" style={{ background: "linear-gradient(180deg,#160a2b,#0c061a)", border: "1px solid " + NEON, boxShadow: "0 0 12px rgba(255,0,255,0.25)" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg uppercase tracking-wide font-black" style={{ fontFamily: "Impact, sans-serif", color: NEON }}>
                Manual Deposit Requests
              </div>
              <div className="text-[10px] uppercase tracking-widest font-black px-2 py-1" style={{ color: INK, background: deposits.length > 0 ? NEON : "rgba(255,255,255,0.2)" }}>
                {deposits.length} Pending
              </div>
            </div>
            {opError && <div className="text-[10px] uppercase tracking-wide mb-2" style={{ color: NEON }}>{opError}</div>}
            <div className="flex flex-col gap-1.5">
              {deposits.length === 0 && <div className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>No pending manual deposits.</div>}
              {deposits.map((d) => {
                const isBusy = busy === d.id + ":approve" || busy === d.id + ":reject";
                return (
                  <div key={d.id} className="flex items-center justify-between gap-2 text-xs py-1.5" style={{ borderBottom: "1px solid rgba(0,255,255,0.12)" }}>
                    <div className="flex flex-col">
                      <span className="text-white font-black">{d.amount} DCDN</span>
                      <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.45)" }}>{shortUser(d.created_by_id)} · {fmtDate(d.created_date)}</span>
                    </div>
                    <span className="truncate max-w-[140px] text-center" style={{ color: "rgba(255,255,255,0.6)" }}>{d.reference || "—"}</span>
                    <div className="flex gap-1.5">
                      <button onClick={() => handleDeposit(d.id, "approve")} disabled={isBusy} className="uppercase tracking-widest px-2.5 py-1 text-[10px] font-black disabled:opacity-50" style={{ fontFamily: "Impact, sans-serif", background: CYAN, color: INK }}>{isBusy && busy.endsWith(":approve") ? "…" : "Approve"}</button>
                      <button onClick={() => handleDeposit(d.id, "reject")} disabled={isBusy} className="uppercase tracking-widest px-2.5 py-1 text-[10px] font-black text-white disabled:opacity-50" style={{ fontFamily: "Impact, sans-serif", background: NEON }}>{isBusy && busy.endsWith(":reject") ? "…" : "Reject"}</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {decisions.length > 0 && (
              <div className="mt-4 pt-3" style={{ borderTop: "1px dashed rgba(0,255,255,0.25)" }}>
                <div className="text-[10px] uppercase tracking-widest font-black mb-2" style={{ color: CYAN }}>Recent Decisions</div>
                <div className="flex flex-col gap-1.5">
                  {decisions.map((d) => (
                    <div key={d.id} className="flex justify-between text-xs py-1" style={{ borderBottom: "1px solid rgba(0,255,255,0.08)" }}>
                      <span className="text-white font-bold">{d.amount} DCDN</span>
                      <span className="truncate max-w-[120px]" style={{ color: "rgba(255,255,255,0.5)" }}>{d.reference || "—"}</span>
                      <span className="font-black" style={statusColor(d.status)}>{d.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Treasury + recent rounds */}
          <div className="grid gap-4 md:grid-cols-2">
            <section className="p-5 flex flex-col gap-3" style={{ background: "linear-gradient(180deg,#160a2b,#0c061a)", border: "1px solid " + CYAN, boxShadow: "0 0 12px rgba(0,255,255,0.2)" }}>
              <div className="text-lg uppercase tracking-wide font-black" style={{ fontFamily: "Impact, sans-serif", color: CYAN }}>
                Syndicate Treasury
              </div>
              <ul className="flex flex-col gap-2 text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
                <li className="flex justify-between pb-1.5" style={{ borderBottom: "1px solid rgba(0,255,255,0.15)" }}>
                  <span>Commission Vault</span>
                  <strong className="text-white">{(totalWagered * 0).toLocaleString()} DCDN Liquid (off-chain)</strong>
                </li>
                <li className="flex justify-between pb-1.5" style={{ borderBottom: "1px solid rgba(0,255,255,0.15)" }}>
                  <span>Total Spins Settled</span>
                  <strong className="text-white">{totalSpins.toLocaleString()}</strong>
                </li>
                <li className="flex justify-between pb-1.5" style={{ borderBottom: "1px solid rgba(0,255,255,0.15)" }}>
                  <span>Operator Fee Share</span>
                  <strong className="text-white">15.0% Rev-Share Net</strong>
                </li>
                <li className="flex justify-between pb-1.5">
                  <span>On-Chain Epoch</span>
                  <strong className="text-white">Synced (testnet ready)</strong>
                </li>
              </ul>
              <div className="mt-2 p-3 text-xs" style={{ color: "rgba(255,255,255,0.6)", background: INK, border: "1px solid rgba(0,255,255,0.25)" }}>
                On-chain DCDN settlement requires your QuickNode RPC + DCDN contract ABI wired as secrets (QUICKNODE_RPC_URL, DCDN_CONTRACT_ADDRESS). Add them in App Settings → environment variables to arm real-stakes settlement for testnet/mainnet.
              </div>
            </section>

            <section className="p-5" style={{ background: "linear-gradient(180deg,#160a2b,#0c061a)", border: "1px solid " + NEON, boxShadow: "0 0 12px rgba(255,0,255,0.2)" }}>
              <div className="text-lg uppercase tracking-wide font-black mb-3" style={{ fontFamily: "Impact, sans-serif", color: NEON }}>
                Recent Settlements
              </div>
              <div className="flex flex-col gap-1.5">
                {rounds.length === 0 && <div className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>No spins yet — pull a lever to populate the clearing house.</div>}
                {rounds.map((r) => (
                  <div key={r.id} className="flex justify-between text-xs py-1.5" style={{ borderBottom: "1px solid rgba(0,255,255,0.12)" }}>
                    <span className="text-white font-bold truncate max-w-[140px]">{r.game_title}</span>
                    <span style={{ color: "rgba(255,255,255,0.6)" }}>{r.bet} → {r.payout} DCDN</span>
                    <span className="font-black" style={r.multiplier > 0 ? { color: CYAN, textShadow: "0 0 8px rgba(0,255,255,0.5)" } : { color: "rgba(255,255,255,0.5)" }}>{r.multiplier > 0 ? `${r.multiplier}×` : "Bust"}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function KPI({ label, value, tone }) {
  const toneMap = {
    cyan: { color: CYAN, border: CYAN },
    white: { color: "#ffffff", border: "rgba(0,255,255,0.5)" },
    neon: { color: NEON, border: NEON },
  };
  const t = toneMap[tone] || toneMap.white;
  return (
    <div className="p-4 flex flex-col gap-1" style={{ background: INK, border: "1px solid " + t.border, boxShadow: "0 0 10px rgba(0,255,255,0.18)" }}>
      <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "rgba(255,255,255,0.6)" }}>{label}</span>
      <span className="text-2xl" style={{ fontFamily: "Impact, sans-serif", color: t.color, textShadow: "0 0 10px rgba(0,255,255,0.4)" }}>{value}</span>
    </div>
  );
}

function shortUser(id) {
  if (!id) return "—";
  return String(id).slice(-6);
}

function fmtDate(d) {
  if (!d) return "";
  try { return new Date(d).toLocaleString(); } catch { return ""; }
}

function statusColor(s) {
  if (s === "approved") return { color: CYAN, textShadow: "0 0 8px rgba(0,255,255,0.6)" };
  if (s === "rejected") return { color: NEON };
  return { color: "rgba(255,255,255,0.7)" };
}