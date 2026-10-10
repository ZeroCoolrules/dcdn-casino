import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveSpin, randomSeed } from '../../shared/slotEngine.ts';
import { settleWallet } from '../../shared/walletSettle.ts';

// Provably-fair slot spin resolver with house-edge (RTP) control.
// Deducts bet from the player's wallet, credits winnings, records the round.
//
// Security:
//  - The Game record is operator-controlled (admin-only create/update), but the
//    effective RTP is still clamped server-side so a misconfigured row can never
//    push the expected return above the house-safe ceiling.
//  - Bet is enforced against the game's min_bet/max_bet server-side.
//  - Wallet settlement is atomic (compare-and-swap on wallet.version) so
//    concurrent spins can never over-wager or lose an update.
//  - Entity-derived values interpolated into the admin alert email are escaped.

const MAX_RTP = 96;
const MIN_RTP = 50;
const MAX_SETTLE_ATTEMPTS = 6;
const MAJOR_WIN_MULTIPLIER = 50;

function escHtml(s: any): string {
  // Emit real HTML entities (built from charCode so the source never holds a
  // literal ampersand-entity that could be silently decoded back to identity).
  const AMP = String.fromCharCode(38);
  return String(s == null ? '' : s)
    .replace(/&/g, AMP + 'amp;')
    .replace(/</g, AMP + 'lt;')
    .replace(/>/g, AMP + 'gt;')
    .replace(/"/g, AMP + 'quot;')
    .replace(/'/g, AMP + '#39;');
}

function plainText(s: any): string {
  return String(s == null ? '' : s).replace(/[<>]/g, '').slice(0, 80);
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const gameId = String(body.game_id || '');
    const bet = Number(body.bet || 0);
    const mode = body.mode === 'real' ? 'real' : 'free';
    const clientSeed = String(body.client_seed || user.id).slice(0, 64);
    const activeLines = Math.max(1, Math.min(5, Number(body.active_lines) || 5));

    if (!gameId) return Response.json({ error: 'game_id required' }, { status: 400 });
    if (!Number.isFinite(bet) || bet <= 0) return Response.json({ error: 'bet must be > 0' }, { status: 400 });

    // Load game definition. Reject unknown ids explicitly rather than 500ing.
    let game;
    try {
      game = await base44.entities.Game.get(gameId);
    } catch {
      return Response.json({ error: 'Unknown game' }, { status: 400 });
    }

    // Enforce the game's stake limits server-side.
    const minBet = Number(game.min_bet) || 1;
    const maxBet = Number(game.max_bet) || minBet;
    if (bet < minBet || bet > maxBet) {
      return Response.json({ error: `Bet must be between ${minBet} and ${maxBet} DCDN` }, { status: 400 });
    }

    // Effective RTP is clamped server-side so a tampered/misconfigured Game row
    // cannot push the expected return above the house-safe ceiling.
    const rtp = Math.min(MAX_RTP, Math.max(MIN_RTP, Number(game.rtp) || 96));

    // Load or create the player's wallet. Wallet writes are admin-only, so the
    // vault is created server-side via the service role. Complimentary credits
    // are never minted here — they come only from the one-time claimFreeStake
    // grant, so a spin can never mint balance.
    let wallet;
    const wres = await base44.entities.Wallet.filter({ created_by_id: user.id }, { limit: 1 });
    wallet = wres.items && wres.items[0];
    if (!wallet) {
      wallet = await base44.asServiceRole.entities.Wallet.create({
        balance: 0,
        mode,
        total_wagered: 0,
        total_won: 0,
        spins: 0,
        nonce: 0,
        version: 0,
        wallet_address: '',
        free_stake_claimed: false,
        has_deposited: false,
      });
    }

    // Enforce mode server-side: the requested play mode must match the vault's
    // mode, so complimentary free credits can never be wagered in real-stakes
    // play and deposited funds are not spent as free play without an explicit
    // server-side mode switch.
    if ((wallet.mode || 'free') !== mode) {
      return Response.json(
        { error: mode === 'real' ? 'Real-stakes play requires a deposited, real-stakes vault.' : 'This vault is in real-stakes mode.' },
        { status: 400 }
      );
    }

    // Atomic settlement loop: compare-and-swap on wallet.version so concurrent
    // spins can never over-wager or overwrite each other's result. Each lost
    // race is retried with a fresh nonce/server seed (still provably fair).
    let spin = null;
    let payout = 0;
    let newBalance = 0;
    let settled = false;
    for (let attempt = 0; attempt < MAX_SETTLE_ATTEMPTS; attempt++) {
      if ((wallet.balance || 0) < bet) {
        return Response.json({ error: 'Insufficient DCDN balance', balance: wallet.balance }, { status: 400 });
      }
      const nonce = (wallet.nonce || 0) + 1;
      const serverSeed = randomSeed();
      const attemptSpin = await resolveSpin({ serverSeed, clientSeed, nonce, rtp, activeLines });
      const attemptPayout = Math.round(bet * attemptSpin.multiplier * 100) / 100;
      const attemptBalance = Math.round((wallet.balance - bet + attemptPayout) * 100) / 100;

      const applied = await settleWallet(base44.asServiceRole, {
        walletId: wallet.id,
        expectedVersion: wallet.version || 0,
        set: {
          balance: attemptBalance,
          spins: (wallet.spins || 0) + 1,
          total_wagered: (wallet.total_wagered || 0) + bet,
          total_won: (wallet.total_won || 0) + attemptPayout,
          nonce,
        },
      });
      if (applied) {
        spin = attemptSpin;
        payout = attemptPayout;
        newBalance = attemptBalance;
        settled = true;
        await base44.entities.Round.create({
          game_id: game.id,
          game_title: game.title,
          mode,
          bet,
          multiplier: attemptSpin.multiplier,
          payout: attemptPayout,
          label: attemptSpin.label,
          reels: attemptSpin.reels,
          server_hash: attemptSpin.serverHash,
          client_seed: attemptSpin.clientSeed,
          nonce,
          roll: attemptSpin.roll,
        });
        break;
      }
      // Race lost: re-read and retry with a fresh nonce/server seed.
      const refreshed = await base44.entities.Wallet.filter({ created_by_id: user.id }, { limit: 1 });
      wallet = refreshed.items && refreshed.items[0];
      if (!wallet) return Response.json({ error: 'Wallet vanished mid-spin' }, { status: 500 });
    }

    if (!settled) {
      return Response.json({ error: 'Settlement busy — please retry the spin' }, { status: 503 });
    }

    // Major-win alert — notify operators so they can watch the house balance.
    // All entity-derived values are escaped before interpolation.
    if (spin.multiplier >= MAJOR_WIN_MULTIPLIER && payout > 0) {
      try {
        const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
        const adminList = Array.isArray(admins) ? admins : (admins.items || []);
        if (adminList.length) {
          const gameTitleEsc = escHtml(game.title);
          const playerEsc = escHtml(user.email || user.id);
          const labelEsc = escHtml(spin.label);
          const hashEsc = escHtml(spin.serverHash);
          const subject = `🎰 Major win — ${spin.multiplier}x on ${plainText(game.title)} (${mode} play)`;
          const html = (
            `<div style="font-family:Arial,sans-serif;background:#0c061a;color:#fff;padding:24px;max-width:560px">` +
              `<div style="font-size:22px;font-weight:900;letter-spacing:2px;color:#00ffff;text-shadow:0 0 8px rgba(0,255,255,.6)">DREAM CASINO · MAJOR WIN</div>` +
              `<div style="height:2px;background:linear-gradient(90deg,#00ffff,#ff00ff);margin:12px 0 20px"></div>` +
              `<table style="width:100%;font-size:14px;color:#e5e7eb">` +
                `<tr><td style="color:#9ca3af;padding:4px 0">Game</td><td style="text-align:right;font-weight:700">${gameTitleEsc}</td></tr>` +
                `<tr><td style="color:#9ca3af;padding:4px 0">Player</td><td style="text-align:right">${playerEsc}</td></tr>` +
                `<tr><td style="color:#9ca3af;padding:4px 0">Mode</td><td style="text-align:right">${mode === 'real' ? 'Real stakes' : 'Free play'}</td></tr>` +
                `<tr><td style="color:#9ca3af;padding:4px 0">Bet</td><td style="text-align:right">${bet} DCDN</td></tr>` +
                `<tr><td style="color:#9ca3af;padding:4px 0">Multiplier</td><td style="text-align:right;color:#ff00ff;font-weight:900;font-size:18px">${spin.multiplier}x</td></tr>` +
                `<tr><td style="color:#9ca3af;padding:4px 0">Payout</td><td style="text-align:right;color:#00ffff;font-weight:900">${payout} DCDN</td></tr>` +
                `<tr><td style="color:#9ca3af;padding:4px 0">Player balance now</td><td style="text-align:right">${newBalance} DCDN</td></tr>` +
                `<tr><td style="color:#9ca3af;padding:4px 0">Round label</td><td style="text-align:right">${labelEsc}</td></tr>` +
              `</table>` +
              `<div style="margin-top:18px;font-size:12px;color:#6b7280">Provably-fair · server_hash ${hashEsc} · nonce ${spin.nonce}</div>` +
            `</div>`
          );
          await Promise.all(adminList.map((a) =>
            base44.asServiceRole.integrations.Core.SendEmail({
              to: a.email,
              subject,
              html,
            }).catch(() => {})
          ));
        }
      } catch (_) { /* never let alerting break a spin */ }
    }

    return Response.json({
      ok: true,
      multiplier: spin.multiplier,
      label: spin.label,
      reels: spin.reels,
      payout,
      bet,
      balance: newBalance,
      server_seed: spin.serverSeed,
      server_hash: spin.serverHash,
      client_seed: spin.clientSeed,
      nonce: spin.nonce,
      roll: spin.roll,
      rtp,
    });
  } catch (error) {
    return Response.json({ error: error.message || 'spin failed' }, { status: 500 });
  }
}