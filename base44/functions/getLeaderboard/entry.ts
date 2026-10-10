// getLeaderboard — public, privacy-safe leaderboard of the top players by total
// winnings. Wallet reads are admin-only under RLS, so the service role builds the
// board server-side and returns only masked handles plus aggregate totals — never
// emails, ids that need protection, or balances.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

const TOP = 10;

function handleFor(user: any): string {
  const name = String((user && user.full_name) || '').trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      return parts[0] + ' ' + parts[parts.length - 1].charAt(0).toUpperCase() + '.';
    }
    return parts[0];
  }
  const email = String((user && user.email) || '').trim();
  if (email) {
    const local = email.split('@')[0];
    if (local.length <= 2) return local;
    return local.charAt(0) + '•••' + local.slice(-1);
  }
  return 'Player';
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // Each user owns one vault; total_won is the running winnings counter, so the
    // top winners are simply the highest-total_won vaults.
    const wallets = await base44.asServiceRole.entities.Wallet.filter(
      { total_won: { $gt: 0 } },
      { sort: '-total_won', limit: TOP }
    );
    const rows = (wallets && wallets.items) || [];
    if (!rows.length) return Response.json({ entries: [] });

    const userIds = rows.map((w: any) => w.created_by_id).filter(Boolean);
    let users: any[] = [];
    if (userIds.length) {
      const ures = await base44.asServiceRole.entities.User.filter({ id: { $in: userIds } });
      users = Array.isArray(ures) ? ures : (ures.items || []);
    }
    const userById = new Map(users.map((u: any) => [u.id, u]));

    const entries = rows.map((w: any, i: number) => {
      const u = userById.get(w.created_by_id);
      return {
        rank: i + 1,
        user_id: w.created_by_id,
        handle: u ? handleFor(u) : 'Player',
        total_won: Number(w.total_won || 0),
        spins: Number(w.spins || 0),
        mode: w.mode || 'free',
      };
    });

    return Response.json({ entries });
  } catch (error) {
    return Response.json({ error: (error as Error).message || 'leaderboard failed' }, { status: 500 });
  }
}