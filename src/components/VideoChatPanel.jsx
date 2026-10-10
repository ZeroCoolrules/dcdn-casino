import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Video, VideoOff, SkipForward, X, Users, Bot, Send } from "lucide-react";

const NEON = "#ff00ff";
const CYAN = "#00ffff";
const INK = "#0c061a";

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];
const AI_AVATAR = "https://media.base44.com/images/public/6abce6018ce27c0f6bd6cc03/0925406c6_generated_image.png";
const AI_FALLBACK_MS = 12000;
const AI_GREETING = "Hey hotshot — floor's quiet, so I'm riding shotgun. How are those reels treating you?";

export default function VideoChatPanel({ gameTitle }) {
  const [open, setOpen] = useState(false);
  const [joined, setJoined] = useState(false);
  const [status, setStatus] = useState("");
  const [partnerHere, setPartnerHere] = useState(false);
  const [error, setError] = useState("");
  const [aiMode, setAiMode] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [aiInput, setAiInput] = useState("");
  const [aiThinking, setAiThinking] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const audioRef = useRef(null);
  const lobbyRef = useRef(null);
  const pairRef = useRef(null);
  const lobbySubRef = useRef(null);
  const pairSubRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const roleRef = useRef(null);
  const connIdRef = useRef(null);
  const fallbackTimerRef = useRef(null);
  const aiModeRef = useRef(false);
  const transcriptRef = useRef([]);

  useEffect(() => { aiModeRef.current = aiMode; }, [aiMode]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

  useEffect(() => {
    let connId = sessionStorage.getItem("vc_connId");
    if (!connId) { connId = crypto.randomUUID(); sessionStorage.setItem("vc_connId", connId); }
    connIdRef.current = connId;
    return () => {
      teardownPC();
      closePair();
      closeLobby();
      stopCamera();
      clearFallback();
    };
  }, []);

  function clearFallback() {
    if (fallbackTimerRef.current) { clearTimeout(fallbackTimerRef.current); fallbackTimerRef.current = null; }
  }

  async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
  }

  function stopCamera() {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }

  function teardownPC() {
    if (pcRef.current) { try { pcRef.current.close(); } catch {} pcRef.current = null; }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setPartnerHere(false);
  }

  function closeLobby() {
    if (lobbySubRef.current) { try { lobbySubRef.current.unsubscribe(); } catch {} lobbySubRef.current = null; }
    if (lobbyRef.current) { try { lobbyRef.current.close(); } catch {} lobbyRef.current = null; }
  }

  function closePair() {
    if (pairSubRef.current) { try { pairSubRef.current.unsubscribe(); } catch {} pairSubRef.current = null; }
    if (pairRef.current) { try { pairRef.current.close(); } catch {} pairRef.current = null; }
  }

  function makePC() {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const stream = localStreamRef.current;
    if (stream) stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.ontrack = (e) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
      setPartnerHere(true);
    };
    pc.onicecandidate = (e) => {
      if (e.candidate && pairRef.current) pairRef.current.send({ type: "ice", candidate: e.candidate.toJSON() });
    };
    pcRef.current = pc;
    return pc;
  }

  function enterAiMode(reason) {
    closeLobby();
    teardownPC();
    closePair();
    clearFallback();
    setAiMode(true);
    setStatus("Matched with AI co-host");
    setPartnerHere(true);
    const greeting = { role: "cohost", content: reason ? `Partner dipped — ${AI_GREETING}` : AI_GREETING };
    setTranscript([greeting]);
  }

  function connectToLobby() {
    setStatus("Searching for a partner…");
    setError("");
    const conn = base44.actors.Matchmaker("lobby").connect({ id: connIdRef.current });
    lobbyRef.current = conn;
    const sub = conn.subscribe((msg) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "searching") setStatus("Searching for a partner…");
      else if (msg.type === "paired") {
        clearFallback();
        roleRef.current = msg.role;
        closeLobby();
        connectToPair(msg.room, msg.role);
      }
    });
    lobbySubRef.current = sub;
    clearFallback();
    fallbackTimerRef.current = setTimeout(() => {
      if (!aiModeRef.current) enterAiMode(false);
    }, AI_FALLBACK_MS);
  }

  async function connectToPair(roomId, role) {
    setStatus("Connecting to partner…");
    setAiMode(false);
    const conn = base44.actors.VideoChat(roomId).connect({ id: connIdRef.current });
    pairRef.current = conn;
    const pc = makePC();
    const sub = conn.subscribe((msg) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "waiting") setStatus("Waiting for partner to join…");
      else if (msg.type === "peer_ready") {
        setStatus("Partner connected — establishing video…");
        if (role === "offer") sendOffer(pc);
      } else if (msg.type === "offer") handleOffer(pc, msg.sdp);
      else if (msg.type === "answer") pc.setRemoteDescription(new RTCSessionDescription(msg.sdp)).catch(() => {});
      else if (msg.type === "ice") { if (msg.candidate) pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {}); }
      else if (msg.type === "peer_left") {
        const reason = msg.reason;
        if (aiModeRef.current) return;
        // briefly try AI fallback so the player isn't dropped cold
        enterAiMode(true);
      }
    });
    pairSubRef.current = sub;
  }

  async function sendOffer(pc) {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (pairRef.current) pairRef.current.send({ type: "offer", sdp: offer });
    } catch (e) { setError(e.message || "offer failed"); }
  }

  async function handleOffer(pc, sdp) {
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (pairRef.current) pairRef.current.send({ type: "answer", sdp: answer });
    } catch (e) { setError(e.message || "answer failed"); }
  }

  async function join() {
    try {
      await startCamera();
      setJoined(true);
      base44.entities.EventLog.create({ type: "video_chat_join" }).catch(() => {});
      connectToLobby();
    } catch (e) {
      setError(e.message || "Camera/mic access denied");
      setJoined(false);
    }
  }

  function leave() {
    clearFallback();
    teardownPC();
    closePair();
    closeLobby();
    stopCamera();
    setJoined(false);
    setAiMode(false);
    setTranscript([]);
    setStatus("");
    setError("");
  }

  function skip() {
    if (aiMode) {
      // re-roll out of AI mode back into the real queue
      setAiMode(false);
      setTranscript([]);
      setPartnerHere(false);
      setStatus("Searching for a partner…");
      connectToLobby();
      return;
    }
    if (pairRef.current) { try { pairRef.current.send({ type: "skip" }); } catch {} }
    teardownPC();
    closePair();
    setStatus("Skipped — searching again…");
    connectToLobby();
  }

  async function sendAiMessage() {
    const text = aiInput.trim();
    if (!text || aiThinking) return;
    const next = [...transcriptRef.current, { role: "user", content: text }];
    setTranscript(next);
    setAiInput("");
    setAiThinking(true);
    setError("");
    try {
      const res = await base44.functions.invoke("cohostChat", { messages: next, gameTitle: gameTitle || "the slots" });
      const data = res && res.data ? res.data : res;
      const reply = data && data.reply ? data.reply : "Spin it again, hotshot.";
      const audioUrl = data && data.audioUrl ? data.audioUrl : null;
      setTranscript((t) => [...t, { role: "cohost", content: reply }]);
      if (audioUrl && audioRef.current) {
        audioRef.current.src = audioUrl;
        setAiSpeaking(true);
        audioRef.current.play().catch(() => {});
      }
    } catch (e) {
      setError(e.message || "Cohost went dark");
    } finally {
      setAiThinking(false);
    }
  }

  const showAi = joined && aiMode;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col" style={{ width: 304 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 uppercase tracking-widest text-sm font-black w-full justify-between"
        style={{ fontFamily: "Impact, sans-serif", color: "#fff", background: joined ? NEON : "#160a2b", border: "1px solid " + (joined ? NEON : CYAN), boxShadow: joined ? "0 0 12px rgba(255,0,255,0.6)" : "0 0 10px rgba(0,255,255,0.3)" }}
      >
        <span className="flex items-center gap-2">
          {joined ? (aiMode ? <Bot className="w-4 h-4" /> : <Video className="w-4 h-4" />) : <Users className="w-4 h-4" />} Social Floor
        </span>
        {joined && <span className="text-[10px] tracking-widest" style={{ color: showAi ? "#fff" : INK }}>{showAi ? "AI" : "LIVE"}</span>}
      </button>

      {open && (
        <div className="flex flex-col gap-2 p-2.5" style={{ background: "linear-gradient(180deg,#160a2b,#0c061a)", border: "1px solid " + CYAN, boxShadow: "0 0 12px rgba(0,255,255,0.25)" }}>
          {/* Partner tile (remote video OR AI avatar) */}
          <div className="relative aspect-video w-full overflow-hidden" style={{ background: INK, border: "1px solid " + (showAi ? NEON : "rgba(0,255,255,0.3)"), boxShadow: showAi ? "0 0 12px rgba(255,0,255,0.4)" : "none" }}>
            {showAi ? (
              <img src={AI_AVATAR} alt="AI co-host" className="w-full h-full object-cover" style={{ filter: "contrast(115%) saturate(125%)", opacity: aiSpeaking ? 1 : 0.85 }} />
            ) : (
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
            )}
            {!showAi && !partnerHere && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center px-2">
                <VideoOff className="w-5 h-5" style={{ color: "rgba(255,255,255,0.4)" }} />
                <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>{joined ? status || "No partner yet" : "Off the floor"}</span>
              </div>
            )}
            {showAi && aiSpeaking && (
              <div className="absolute bottom-0 left-0 right-0 h-1" style={{ background: "linear-gradient(90deg," + NEON + "," + CYAN + ")", boxShadow: "0 0 8px " + NEON }} />
            )}
            <span className="absolute top-1 left-1 text-[9px] uppercase tracking-widest font-black px-1.5 py-0.5" style={{ color: showAi ? "#fff" : INK, background: showAi ? NEON : CYAN }}>
              {showAi ? "AI Cohost" : "Partner"}
            </span>
          </div>

          {/* Local self tile */}
          <div className="relative aspect-video w-32 overflow-hidden ml-auto" style={{ background: INK, border: "1px solid " + NEON, boxShadow: "0 0 8px rgba(255,0,255,0.35)" }}>
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
            <span className="absolute top-1 left-1 text-[9px] uppercase tracking-widest font-black px-1.5 py-0.5" style={{ color: "#fff", background: NEON }}>You</span>
          </div>

          {/* AI chat transcript */}
          {showAi && (
            <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto px-1 py-1" style={{ borderTop: "1px dashed rgba(0,255,255,0.2)", borderBottom: "1px dashed rgba(0,255,255,0.2)" }}>
              {transcript.map((m, i) => (
                <div key={i} className={"text-[11px] leading-snug " + (m.role === "user" ? "text-right" : "text-left")} style={{ color: m.role === "user" ? "#fff" : CYAN }}>
                  <span className="font-black uppercase tracking-widest text-[8px] mr-1" style={{ color: m.role === "user" ? NEON : CYAN }}>{m.role === "user" ? "You" : "Vivian"}</span>
                  {m.content}
                </div>
              ))}
              {aiThinking && <div className="text-[10px] italic" style={{ color: "rgba(255,255,255,0.5)" }}>Vivian is thinking…</div>}
            </div>
          )}

          {/* AI chat input */}
          {showAi && (
            <div className="flex gap-1.5">
              <input
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendAiMessage(); }}
                placeholder="Talk to Vivian…"
                className="flex-1 px-2 py-1.5 text-[11px] text-white"
                style={{ background: INK, border: "1px solid " + CYAN }}
              />
              <button onClick={sendAiMessage} disabled={aiThinking} className="px-2 py-1.5 disabled:opacity-50" style={{ background: NEON }}>
                <Send className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          )}

          {status && joined && !showAi && <div className="text-[10px] uppercase tracking-widest" style={{ color: CYAN }}>{status}</div>}
          {error && <div className="text-[10px] uppercase tracking-wide" style={{ color: NEON }}>{error}</div>}

          {/* Controls */}
          <div className="flex gap-2">
            {!joined ? (
              <button onClick={join} className="flex-1 uppercase tracking-widest py-2 text-xs font-black" style={{ fontFamily: "Impact, sans-serif", background: CYAN, color: INK, boxShadow: "0 0 10px rgba(0,255,255,0.5)" }}>Join Floor</button>
            ) : (
              <>
                <button onClick={skip} className="flex-1 uppercase tracking-widest py-2 text-xs font-black flex items-center justify-center gap-1" style={{ fontFamily: "Impact, sans-serif", background: NEON, color: "#fff", boxShadow: "0 0 10px rgba(255,0,255,0.5)" }}>
                  <SkipForward className="w-3 h-3" /> {showAi ? "Find Real" : "Skip"}
                </button>
                <button onClick={leave} className="flex-1 uppercase tracking-widest py-2 text-xs font-black flex items-center justify-center gap-1" style={{ fontFamily: "Impact, sans-serif", background: INK, color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }}>
                  <X className="w-3 h-3" /> Leave
                </button>
              </>
            )}
          </div>
          <div className="text-[9px] uppercase tracking-widest pt-1" style={{ color: "rgba(255,255,255,0.4)", borderTop: "1px dashed rgba(0,255,255,0.2)" }}>
            Random pairing · peer-to-peer video · AI co-host fallback · 21+
          </div>
        </div>
      )}

      <audio ref={audioRef} onEnded={() => setAiSpeaking(false)} hidden />
    </div>
  );
}