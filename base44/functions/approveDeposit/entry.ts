// approveDeposit — admin-only endpoint that approves or rejects a pending deposit.
// On approve, credits the submitter's off-chain vault ledger atomically
// (compare-and-swap on wallet.version) and marks the deposit approved.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { settleWallet } from '../../shared/walletSettle.ts';

const MAX_SETTLE_ATTEMPTS = 6;

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const depositId = String(body.deposit_id || '').trim();
    const action = body.action === 'reject' ? 'reject' : 'approve';
    if (!depositId) return Response.json({ error: 'deposit_id required' }, { status: 400 });

    const deposit = await base44.asServiceRole.entities.Deposit.get(depositId);
    if (!deposit) return Response.json({ error: 'Deposit not found' }, { status: 404 });
    if (deposit.status !== 'pending') return Response.json({ error: 'Deposit already processed' }, { status: 409 });

    if (action === 'reject') {
      await base44.asServiceRole.entities.Deposit.update(depositId, { status: 'rejected' });
      return Response.json({ ok: true, status: 'rejected' });
    }

    const amount = Number(deposit.amount) || 0;

    // Atomic credit loop. Re-check deposit status each attempt so a concurrent
    // approve is detected (the deposit will no longer be pending) and the wallet
    // is never credited twice for one deposit.
    let newBalance = 0;
    let approved = false;
    for (let attempt = 0; attempt < MAX_SETTLE_ATTEMPTS; attempt++) {
      const dep = await base44.asServiceRole.entities.Deposit.get(depositId);
      if (!dep || dep.status !== 'pending') {
        return Response.json({ error: 'Deposit already processed' }, { status: 409 });
      }
      const ownerRes = await base44.asServiceRole.entities.Wallet.filter(
        { created_by_id: dep.created_by_id },
        { limit: 1 }
      );
      const wallet = ownerRes.items && ownerRes.items[0];
      if (!wallet) return Response.json({ error: 'Player has no vault to credit' }, { status: 404 });

      newBalance = Math.round(((wallet.balance || 0) + amount) * 100) / 100;
      const applied = await settleWallet(base44.asServiceRole, {
        walletId: wallet.id,
        expectedVersion: wallet.version || 0,
        set: {
          balance: newBalance,
          mode: 'real',
          last_deposit_tx: dep.reference || ('manual:' + depositId),
        },
      });
      if (applied) {
        await base44.asServiceRole.entities.Deposit.update(depositId, {
          status: 'approved',
          credited_amount: amount,
        });
        approved = true;
        break;
      }
    }

    if (!approved) {
      return Response.json({ error: 'Settlement busy — please retry the approval' }, { status: 503 });
    }

    return Response.json({ ok: true, status: 'approved', balance: newBalance });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}