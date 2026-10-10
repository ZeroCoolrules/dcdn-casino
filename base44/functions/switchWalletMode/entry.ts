// switchWalletMode — server-side wallet mode toggle. The browser can no longer
// flip Wallet.mode directly. Deposit-backed balances (has_deposited) may move
// freely between real and free; pure complimentary free credits may never be
// promoted to real-stakes (that would let players wager never-purchased credits
// for real payouts).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { settleWallet } from '../../shared/walletSettle.ts';

const MAX_SETTLE_ATTEMPTS = 6;

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const nextMode = body.mode === 'real' ? 'real' : 'free';

    const wres = await base44.entities.Wallet.filter({ created_by_id: user.id }, { limit: 1 });
    const wallet = wres.items && wres.items[0];
    if (!wallet) return Response.json({ error: 'No vault found' }, { status: 404 });
    if ((wallet.mode || 'free') === nextMode) {
      return Response.json({ ok: true, mode: nextMode, balance: wallet.balance });
    }

    if (nextMode === 'real') {
      // Promoting a pure free-play balance to real stakes would let complimentary
      // credits be wagered for real payouts. Allow only for deposit-backed
      // vaults, or when the complimentary balance is fully spent.
      const depositBacked = wallet.has_deposited === true;
      const hasFreeBalance = (wallet.balance || 0) > 0;
      if (!depositBacked && hasFreeBalance) {
        return Response.json(
          { error: 'Spend your complimentary balance first, or make an on-chain deposit to enable real-stakes play.' },
          { status: 400 }
        );
      }
    }

    for (let attempt = 0; attempt < MAX_SETTLE_ATTEMPTS; attempt++) {
      const applied = await settleWallet(base44.asServiceRole, {
        walletId: wallet.id,
        expectedVersion: wallet.version || 0,
        set: { mode: nextMode },
      });
      if (applied) return Response.json({ ok: true, mode: nextMode, balance: wallet.balance });
      const refreshed = await base44.entities.Wallet.filter({ created_by_id: user.id }, { limit: 1 });
      const w = refreshed.items && refreshed.items[0];
      if (!w) return Response.json({ error: 'Wallet vanished' }, { status: 500 });
      if ((w.mode || 'free') === nextMode) return Response.json({ ok: true, mode: nextMode, balance: w.balance });
    }
    return Response.json({ error: 'Settlement busy — please retry' }, { status: 503 });
  } catch (error) {
    return Response.json({ error: error.message || 'switch failed' }, { status: 500 });
  }
}