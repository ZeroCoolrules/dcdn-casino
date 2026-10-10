// playBlackjack — "Back Room Blackjack", fully server-side.
//
// Actions (POST body):
//   { action: "state" }                                  → current live hand, if any
//   { action: "deal", bet, mode, client_seed }           → debit bet, deal a new hand
//   { action: "hit" | "stand" | "double", hand_id }      → play the live hand
//
// Fairness: at the deal the server commits to sha256(server_seed). The whole
// 6-deck shoe is derived from (server_seed, client_seed, nonce), so the order
// is fixed before the player acts. The seed is only revealed once the hand
// settles, and the browser never sees the dealer's hole card or the shoe.
//
// Money: the stake is debited from the vault before any card is shown. A
// finished hand is first marked settled (compare-and-swap on hand.version) and
// then paid exactly once (the `paid` flag is claimed before crediting).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { randomSeed, sha256Hex } from '../../shared/fairRng.ts';
import {
  shuffledShoe, handValue, openingResult, playDealer, compareHands, payoutFor, type Outcome,
} from '../../shared/blackjackEngine.ts';
import {
  getOrCreateWallet, readWallet, debitStake, creditPayout, refundStake, round2,
} from '../../shared/walletLedger.ts';

const MIN_BET = 1;
const MAX_BET = 500;

function view(hand: any) {
  const live = hand.status === 'player_turn';
  const dealer = hand.dealer_cards || [];
  return {
    hand_id: hand.id,
    status: hand.status,
    mode: hand.mode,
    bet: hand.bet,
    wager: hand.wager,
    doubled: !!hand.doubled,
    player_cards: hand.player_cards || [],
    player_total: handValue(hand.player_cards || []).total,
    dealer_cards: live ? [dealer[0], '??'] : dealer,
    dealer_total: live ? handValue([dealer[0]]).total : handValue(dealer).total,
    can_double: live && (hand.player_cards || []).length === 2,
    outcome: hand.outcome || null,
    payout: hand.payout || 0,
    server_hash: hand.server_hash,
    server_seed: live ? null : hand.server_seed,
    client_seed: hand.client_seed,
    nonce: hand.nonce,
  };
}

async function casHand(base44: any, hand: any, set: Record<string, unknown>): Promise<boolean> {
  const v = hand.version || 0;
  const filter: any = { id: hand.id };
  if (v === 0) filter.$or = [{ version: 0 }, { version: { $exists: false } }];
  else filter.version = v;
  const res = await base44.asServiceRole.entities.BlackjackHand.updateMany(filter, {
    $set: { ...set, version: v + 1 },
  });
  return ((res && (res.updated ?? res.modifiedCount ?? 0)) || 0) >= 1;
}

// Credit a settled hand exactly once.
async function payHand(base44: any, user: any, hand: any) {
  if (hand.status !== 'settled' || hand.paid) return;
  const claimed = await casHand(base44, hand, { paid: true });
  if (!claimed) return; // another request is paying it
  const credited = await creditPayout(base44, user.id, hand.payout || 0, true);
  if ('error' in credited) {
    // Give the claim back so the next request retries the credit.
    const fresh = await base44.asServiceRole.entities.BlackjackHand.get(hand.id);
    await casHand(base44, fresh, { paid: false });
    throw new Error('Could not credit winnings yet — they will be paid on your next action');
  }
  await base44.entities.Round.create({
    game_id: 'blackjack',
    game_title: 'Back Room Blackjack',
    mode: hand.mode,
    bet: hand.wager,
    multiplier: hand.wager > 0 ? round2((hand.payout || 0) / hand.wager) : 0,
    payout: hand.payout || 0,
    label: String(hand.outcome || ''),
    server_hash: hand.server_hash,
    client_seed: hand.client_seed,
    nonce: hand.nonce,
    roll: handValue(hand.player_cards || []).total,
  }).catch(() => {});
}

async function settle(base44: any, user: any, hand: any, outcome: Outcome, extra: Record<string, unknown> = {}) {
  const wager = Number(extra.wager ?? hand.wager);
  const payout = payoutFor(outcome, wager);
  const ok = await casHand(base44, hand, { ...extra, status: 'settled', outcome, payout, paid: false });
  if (!ok) return null;
  const fresh = await base44.asServiceRole.entities.BlackjackHand.get(hand.id);
  await payHand(base44, user, fresh);
  return await base44.asServiceRole.entities.BlackjackHand.get(hand.id);
}

async function liveHand(base44: any, userId: string) {
  const res = await base44.asServiceRole.entities.BlackjackHand.filter(
    { player_id: userId, status: 'player_turn' }, { limit: 1 },
  );
  return (res.items && res.items[0]) || null;
}

async function respond(base44: any, userId: string, hand: any, extra: Record<string, unknown> = {}) {
  const w = await readWallet(base44, userId);
  return Response.json({ ok: true, hand: hand ? view(hand) : null, balance: w ? w.balance : 0, ...extra });
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'state');

    // Pay out anything that settled but wasn't credited (e.g. after a crash).
    const unpaid = await base44.asServiceRole.entities.BlackjackHand.filter(
      { player_id: user.id, status: 'settled', paid: false }, { limit: 5 },
    );
    for (const h of unpaid.items || []) await payHand(base44, user, h);

    if (action === 'state') {
      return await respond(base44, user.id, await liveHand(base44, user.id));
    }

    if (action === 'deal') {
      const existing = await liveHand(base44, user.id);
      if (existing) {
        return Response.json({ error: 'Finish your current hand first', hand: view(existing) }, { status: 409 });
      }
      const mode = body.mode === 'real' ? 'real' : 'free';
      const bet = round2(Number(body.bet));
      if (!Number.isFinite(bet) || bet < MIN_BET || bet > MAX_BET) {
        return Response.json({ error: `Bet must be between ${MIN_BET} and ${MAX_BET} DCDN` }, { status: 400 });
      }
      const clientSeed = String(body.client_seed || user.id).slice(0, 64);

      await getOrCreateWallet(base44, user.id, mode);
      const debit = await debitStake(base44, user.id, mode, bet, true);
      if ('error' in debit) return Response.json({ error: debit.error }, { status: 400 });

      const serverSeed = randomSeed();
      const shoe = await shuffledShoe(serverSeed, clientSeed, debit.nonce);
      const player = [shoe[0], shoe[2]];
      const dealer = [shoe[1], shoe[3]];

      let hand;
      try {
        hand = await base44.asServiceRole.entities.BlackjackHand.create({
          player_id: user.id,
          status: 'player_turn',
          mode,
          bet,
          wager: bet,
          doubled: false,
          server_seed: serverSeed,
          server_hash: await sha256Hex(serverSeed),
          client_seed: clientSeed,
          nonce: debit.nonce,
          cursor: 4,
          player_cards: player,
          dealer_cards: dealer,
          outcome: '',
          payout: 0,
          paid: false,
          version: 0,
        });
      } catch (e) {
        await refundStake(base44, user.id, bet);
        throw e;
      }

      const natural = openingResult(player, dealer);
      if (natural) hand = (await settle(base44, user, hand, natural)) || hand;
      return await respond(base44, user.id, hand);
    }

    if (action === 'hit' || action === 'stand' || action === 'double') {
      const handId = String(body.hand_id || '');
      let hand = handId ? await base44.asServiceRole.entities.BlackjackHand.get(handId).catch(() => null) : null;
      if (!hand || hand.player_id !== user.id) return Response.json({ error: 'Hand not found' }, { status: 404 });
      if (hand.status !== 'player_turn') return await respond(base44, user.id, hand);

      const shoe = await shuffledShoe(hand.server_seed, hand.client_seed, hand.nonce);
      const player = [...(hand.player_cards || [])];
      const dealer = [...(hand.dealer_cards || [])];
      let cursor = Number(hand.cursor) || 4;

      if (action === 'hit') {
        player.push(shoe[cursor++]);
        const total = handValue(player).total;
        if (total > 21) {
          hand = (await settle(base44, user, hand, 'bust', { player_cards: player, cursor })) || hand;
        } else if (total === 21) {
          cursor = playDealer(shoe, dealer, cursor);
          const outcome = compareHands(player, dealer);
          hand = (await settle(base44, user, hand, outcome, { player_cards: player, dealer_cards: dealer, cursor })) || hand;
        } else {
          const ok = await casHand(base44, hand, { player_cards: player, cursor });
          if (!ok) return Response.json({ error: 'Hand changed — refresh and try again' }, { status: 409 });
          hand = await base44.asServiceRole.entities.BlackjackHand.get(hand.id);
        }
        return await respond(base44, user.id, hand);
      }

      if (action === 'stand') {
        cursor = playDealer(shoe, dealer, cursor);
        const outcome = compareHands(player, dealer);
        hand = (await settle(base44, user, hand, outcome, { dealer_cards: dealer, cursor })) || hand;
        return await respond(base44, user.id, hand);
      }

      // double: exactly two cards, stake doubles, one more card, then stand.
      if (player.length !== 2) return Response.json({ error: 'You can only double on your first two cards' }, { status: 400 });
      const extra = Number(hand.bet);
      const debit = await debitStake(base44, user.id, hand.mode, extra, false);
      if ('error' in debit) return Response.json({ error: debit.error }, { status: 400 });

      player.push(shoe[cursor++]);
      const wager = round2(Number(hand.bet) * 2);
      let outcome: Outcome;
      if (handValue(player).total > 21) outcome = 'bust';
      else {
        cursor = playDealer(shoe, dealer, cursor);
        outcome = compareHands(player, dealer);
      }
      const settled = await settle(base44, user, hand, outcome, {
        player_cards: player, dealer_cards: dealer, cursor, wager, doubled: true,
      });
      if (!settled) {
        // Someone else moved this hand first; give the extra stake back.
        await refundStake(base44, user.id, extra);
        return Response.json({ error: 'Hand changed — refresh and try again' }, { status: 409 });
      }
      return await respond(base44, user.id, settled);
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: (error as Error).message || 'blackjack failed' }, { status: 500 });
  }
}
