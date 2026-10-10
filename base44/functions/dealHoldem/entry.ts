// dealHoldem — cash-eligible Texas Hold'em hand resolver.
// Authenticated player posts a bet (the table stakes); 5 house bots match it.
// Deals a provably-fair 6-seat hand (2 hole + 5 community), evaluates the best
// 5-card hand for every seat, awards the pot (minus rake) to the winner, and
// settles the player's wallet atomically. Records a Round for the operator books.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { shuffleDeck, bestHand, handName, compareHands, randomSeed } from '../../shared/holdemEngine.ts';
import { settleWallet } from '../../shared/walletSettle.ts';

const RAKE = 0.05;
const SEATS = 6;
const BOT_NAMES = ['Vinny Caruso', 'Marlowe Vance', 'Cuba Reyes', 'Rico Delgado', 'Dolores Stax'];
const MAX_SETTLE_ATTEMPTS = 6;

async function sha256Hex(str) {
  const data = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const bet = Math.max(1, Math.min(1000, Number(body.bet) || 20));
    const clientSeed = String(body.client_seed || user.id).slice(0, 64);

    // Wallet writes are admin-only; create the vault server-side if needed.
    // Complimentary credits are never minted here — only claimFreeStake grants them.
    let wallet;
    const wres = await base44.entities.Wallet.filter({ created_by_id: user.id }, { limit: 1 });
    wallet = wres.items && wres.items[0];
    if (!wallet) {
      wallet = await base44.asServiceRole.entities.Wallet.create({
        balance: 0, mode: 'free', total_wagered: 0, total_won: 0, spins: 0, nonce: 0, version: 0,
        wallet_address: '', free_stake_claimed: false, has_deposited: false,
      });
    }

    // Atomic settlement loop: compare-and-swap on wallet.version so concurrent
    // hands can never over-wager or lose an update. Each lost race is retried
    // with a fresh nonce/server seed (still provably fair).
    let result = null;
    let settled = false;
    for (let attempt = 0; attempt < MAX_SETTLE_ATTEMPTS; attempt++) {
      if ((wallet.balance || 0) < bet) {
        return Response.json({ error: 'Insufficient DCDN balance', balance: wallet.balance }, { status: 400 });
      }

      const serverSeed = randomSeed();
      const nonce = (wallet.nonce || 0) + 1;
      const seedStr = `${serverSeed}:${clientSeed}:${nonce}`;
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seedStr));
      const seedInt = new Uint32Array(digest, 0, 1)[0];
      const serverHash = await sha256Hex(serverSeed);

      const deck = shuffleDeck(seedInt);
      const holes = [];
      for (let s = 0; s < SEATS; s++) holes.push([deck[s], deck[s + SEATS]]);
      const community = deck.slice(SEATS * 2, SEATS * 2 + 5);

      const players = [];
      for (let s = 0; s < SEATS; s++) {
        const seven = holes[s].concat(community);
        const bh = bestHand(seven);
        players.push({
          seat: s,
          name: s === 0 ? 'You' : BOT_NAMES[s - 1],
          hole: holes[s],
          handName: handName(bh.score),
          score: bh.score,
          bestCards: bh.cards,
        });
      }

      let winnerSeat = 0;
      for (let s = 1; s < SEATS; s++) {
        if (compareHands(players[s].score, players[winnerSeat].score) > 0) winnerSeat = s;
      }

      const pot = SEATS * bet;
      const rake = Math.round(pot * RAKE * 100) / 100;
      const payout = winnerSeat === 0 ? Math.round((pot - rake) * 100) / 100 : 0;
      const newBalance = Math.round(((wallet.balance || 0) - bet + payout) * 100) / 100;
      const multiplier = payout > 0 ? Math.round((payout / bet) * 100) / 100 : 0;

      const applied = await settleWallet(base44.asServiceRole, {
        walletId: wallet.id,
        expectedVersion: wallet.version || 0,
        set: {
          balance: newBalance,
          spins: (wallet.spins || 0) + 1,
          total_wagered: (wallet.total_wagered || 0) + bet,
          total_won: (wallet.total_won || 0) + payout,
          nonce,
        },
      });
      if (applied) {
        await base44.entities.Round.create({
          game_id: 'holdem',
          game_title: "Neon Hold'em",
          mode: wallet.mode || 'free',
          bet,
          multiplier,
          payout,
          label: winnerSeat === 0 ? 'Pot Won' : 'Bust',
          reels: [community, holes[0], holes[1], holes[2], holes[3], holes[4], holes[5]],
          server_hash: serverHash,
          client_seed: clientSeed,
          nonce,
          roll: seedInt / 4294967296,
        });
        result = {
          bet, pot, rake, payout, newBalance, multiplier, community, players,
          winnerSeat, winnerName: players[winnerSeat].name, serverSeed, serverHash,
          clientSeed, nonce, roll: seedInt / 4294967296,
        };
        settled = true;
        break;
      }
      // Race lost: re-read and retry with a fresh deal.
      const refreshed = await base44.entities.Wallet.filter({ created_by_id: user.id }, { limit: 1 });
      wallet = refreshed.items && refreshed.items[0];
      if (!wallet) return Response.json({ error: 'Wallet vanished mid-hand' }, { status: 500 });
    }

    if (!settled) {
      return Response.json({ error: 'Settlement busy — please retry the hand' }, { status: 503 });
    }

    return Response.json({
      ok: true,
      bet: result.bet,
      pot: result.pot,
      rake: result.rake,
      payout: result.payout,
      balance: result.newBalance,
      community: result.community,
      players: result.players,
      winnerSeat: result.winnerSeat,
      winnerName: result.winnerName,
      server_seed: result.serverSeed,
      server_hash: result.serverHash,
      client_seed: result.clientSeed,
      nonce: result.nonce,
      roll: result.roll,
    });
  } catch (error) {
    return Response.json({ error: error.message || 'deal failed' }, { status: 500 });
  }
}