// spinRoulette — "Wheel of the Don", European single-zero roulette.
// The player sends one or more bets; the server picks the pocket with the
// provably-fair stream, debits the total stake and credits winnings in ONE
// atomic wallet update (compare-and-swap), then records a Round.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { settleWallet } from '../../shared/walletSettle.ts';
import { getOrCreateWallet, readWallet, round2 } from '../../shared/walletLedger.ts';
import { randomSeed } from '../../shared/fairRng.ts';
import { validateBet, settleBets, spinWheel } from '../../shared/rouletteEngine.ts';

const MIN_CHIP = 1;
const MAX_TOTAL_STAKE = 1000;
const MAX_BETS = 20;
const MAX_SETTLE_ATTEMPTS = 6;

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const mode = body.mode === 'real' ? 'real' : 'free';
    const clientSeed = String(body.client_seed || user.id).slice(0, 64);
    const rawBets = Array.isArray(body.bets) ? body.bets : [];
    if (!rawBets.length) return Response.json({ error: 'Place at least one bet' }, { status: 400 });
    if (rawBets.length > MAX_BETS) return Response.json({ error: `At most ${MAX_BETS} bets per spin` }, { status: 400 });

    const bets = rawBets.map(validateBet);
    if (bets.some((b) => !b)) return Response.json({ error: 'Invalid bet' }, { status: 400 });
    if (bets.some((b) => b!.amount < MIN_CHIP)) {
      return Response.json({ error: `Minimum chip is ${MIN_CHIP} DCDN` }, { status: 400 });
    }
    const totalStake = round2(bets.reduce((s, b) => s + b!.amount, 0));
    if (totalStake > MAX_TOTAL_STAKE) {
      return Response.json({ error: `Total stake per spin is capped at ${MAX_TOTAL_STAKE} DCDN` }, { status: 400 });
    }

    let wallet = await getOrCreateWallet(base44, user.id, mode);
    if ((wallet.mode || 'free') !== mode) {
      return Response.json(
        { error: mode === 'real' ? 'Real-stakes play requires a deposited, real-stakes vault.' : 'This vault is in real-stakes mode.' },
        { status: 400 },
      );
    }

    for (let attempt = 0; attempt < MAX_SETTLE_ATTEMPTS; attempt++) {
      if ((wallet.balance || 0) < totalStake) {
        return Response.json({ error: 'Insufficient DCDN balance', balance: wallet.balance }, { status: 400 });
      }
      const nonce = (wallet.nonce || 0) + 1;
      const serverSeed = randomSeed();
      const wheel = await spinWheel(serverSeed, clientSeed, nonce);
      const result = settleBets(bets as any, wheel.number);
      const newBalance = round2((wallet.balance || 0) - result.stake + result.payout);

      const { applied } = await settleWallet(base44.asServiceRole, {
        walletId: wallet.id,
        expectedVersion: wallet.version || 0,
        set: {
          balance: newBalance,
          spins: (wallet.spins || 0) + 1,
          total_wagered: round2((wallet.total_wagered || 0) + result.stake),
          total_won: round2((wallet.total_won || 0) + result.payout),
          nonce,
        },
      });

      if (applied) {
        await base44.entities.Round.create({
          game_id: 'roulette',
          game_title: 'Wheel of the Don',
          mode,
          bet: result.stake,
          multiplier: result.stake > 0 ? round2(result.payout / result.stake) : 0,
          payout: result.payout,
          label: `#${wheel.number} ${wheel.color}`,
          server_hash: wheel.serverHash,
          client_seed: clientSeed,
          nonce,
          roll: wheel.number,
        }).catch(() => {});

        return Response.json({
          ok: true,
          number: wheel.number,
          color: wheel.color,
          bets: result.lines,
          stake: result.stake,
          payout: result.payout,
          balance: newBalance,
          server_seed: serverSeed,
          server_hash: wheel.serverHash,
          client_seed: clientSeed,
          nonce,
        });
      }
      wallet = await readWallet(base44, user.id);
      if (!wallet) return Response.json({ error: 'Wallet vanished mid-spin' }, { status: 500 });
    }
    return Response.json({ error: 'Settlement busy — please retry the spin' }, { status: 503 });
  } catch (error) {
    return Response.json({ error: (error as Error).message || 'spin failed' }, { status: 500 });
  }
}
