// cohostChat — the AI casino co-host for the social video floor.
// Takes a conversation history + the game the player is at, returns a short
// in-character reply plus a TTS audio URL so the AI partner can "speak".
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const history = Array.isArray(body.messages) ? body.messages : [];
    const gameTitle = String(body.gameTitle || 'the slots');

    const convo = history
      .slice(-10)
      .map((m) => `${m.role === 'user' ? 'Player' : 'Cohost'}: ${String(m.content || '').slice(0, 600)}`)
      .join('\n');

    const prompt =
      'You are "Vivian Volt", the AI co-host of Dreamcadian Casino — a neon-arcade crypto slots lounge with a late-80s synthwave vibe. ' +
      'You are on a video chat with a player who is spinning ' + gameTitle + '. ' +
      'Keep replies to 1-3 short sentences. Be upbeat, a little cheeky, in the voice of a cool casino host: hype wins, console losses, keep the table fun. ' +
      'Never say you are an AI or a language model. Stay in character.\n\n' +
      convo + '\nCohost:';

    const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      model: 'automatic',
    });
    const reply = typeof llmRes === 'string'
      ? llmRes
      : (llmRes && (llmRes.text || llmRes.output)) || 'Spin it again, hotshot.';

    let audioUrl = null;
    try {
      const tts = await base44.asServiceRole.integrations.Core.GenerateSpeech({
        text: String(reply).slice(0, 500),
        voice: 'sunny',
      });
      audioUrl = tts && tts.url ? tts.url : null;
    } catch (e) {
      audioUrl = null;
    }

    return Response.json({ reply, audioUrl });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}