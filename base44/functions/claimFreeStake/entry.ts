// claimFreeStake — server-side one-time grant of the complimentary free-play
// stake. The browser can no longer write Wallet.balance directly (Wallet writes
// are admin-only), so this is the only path that mints complimentary credits,
// and it can fire at most once per user (guarded by wallet.free_stake_claimed).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { settleWallet } from '../../shared/walletSettle.ts';

const FREE_GRANT = 1000;
const MAX_SETTLE_ATTEMPTS = 6;

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const argUserId = body.user_id ? String(body.user_id) : '';

    // Bind the target user: prefer the authenticated session (client calls) so a
    // caller can never grant credits to another user's vault by passing user_id.
    // Fall back to the workflow-supplied user_id only when there is no session
    // (the signup workflow runs without a user token).
    let userId = '';
    let user = null;
    try { user = await base44.auth.me(); } catch {}
    if (user) {
      userId = user.id;
    } else if (argUserId) {
      userId = argUserId;
    } else {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wres = await base44.asServiceRole.entities.Wallet.filter({ created_by_id: userId }, { limit: 1 });
    let wallet = wres.items && wres.items[0];

    // No wallet yet: create a free vault seeded with the grant, marked claimed.
    if (!wallet) {
      wallet = await base44.asServiceRole.entities.Wallet.create({
        balance: FREE_GRANT,
        mode: 'free',
        total_wagered: 0,
        total_won: 0,
        spins: 0,
        nonce: 0,
        version: 0,
        wallet_address: '',
        free_stake_claimed: true,
        has_deposited: false,
      });
      return Response.json({ ok: true, granted: FREE_GRANT, balance: wallet.balance, mode: 'free' });
    }

    // Never mint complimentary credits into a real-stakes (deposit-backed) vault,
    // and never grant more than once.
    if (wallet.free_stake_claimed) {
      return Response.json({ error: 'Free stake already claimed', balance: wallet.balance }, { status: 409 });
    }
    if (wallet.mode === 'real') {
      return Response.json({ error: 'Real-stakes vaults are not eligible for the complimentary stake' }, { status: 400 });
    }

    // Atomic grant via compare-and-swap so two concurrent claims cannot double-mint.
    for (let attempt = 0; attempt < MAX_SETTLE_ATTEMPTS; attempt++) {
      const newBalance = Math.round(((wallet.balance || 0) + FREE_GRANT) * 100) / 100;
      const applied = await settleWallet(base44.asServiceRole, {
        walletId: wallet.id,
        expectedVersion: wallet.version || 0,
        set: { balance: newBalance, mode: 'free', free_stake_claimed: true },
      });
      if (applied) return Response.json({ ok: true, granted: FREE_GRANT, balance: newBalance, mode: 'free' });
      const refreshed = await base44.asServiceRole.entities.Wallet.filter({ created_by_id: userId }, { limit: 1 });
      wallet = refreshed.items && refreshed.items[0];
      if (!wallet) return Response.json({ error: 'Wallet vanished' }, { status: 500 });
      if (wallet.free_stake_claimed) {
        return Response.json({ error: 'Free stake already claimed', balance: wallet.balance }, { status: 409 });
      }
    }
    return Response.json({ error: 'Settlement busy — please retry' }, { status: 503 });
  } catch (error) {
    return Response.json({ error: error.message || 'claim failed' }, { status: 500 });
  }
}