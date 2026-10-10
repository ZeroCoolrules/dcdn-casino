// Small helpers around the off-chain DCDN vault used by the table games.
// Mirrors the pattern in spinSlot: wallets are created by the service role,
// and every balance change goes through settleWallet's compare-and-swap so
// concurrent requests can never double-spend or lose an update.
import { settleWallet } from "./walletSettle.ts";

const MAX_SETTLE_ATTEMPTS = 6;

export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

export async function readWallet(base44: any, userId: string) {
  const res = await base44.entities.Wallet.filter({ created_by_id: userId }, { limit: 1 });
  return (res.items && res.items[0]) || null;
}

export async function getOrCreateWallet(base44: any, userId: string, mode: "free" | "real") {
  let wallet = await readWallet(base44, userId);
  if (!wallet) {
    wallet = await base44.asServiceRole.entities.Wallet.create({
      balance: 0,
      mode,
      total_wagered: 0,
      total_won: 0,
      spins: 0,
      nonce: 0,
      version: 0,
      wallet_address: "",
      free_stake_claimed: false,
      has_deposited: false,
    });
  }
  return wallet;
}

// Applies a change computed from the latest wallet state. `compute` returns the
// absolute fields to set, or an error string to abort. Retries on lost races.
export async function updateWallet(
  base44: any,
  userId: string,
  compute: (w: any) => { set: Record<string, number> } | { error: string },
): Promise<{ wallet: any; set: Record<string, number> } | { error: string }> {
  let wallet = await readWallet(base44, userId);
  for (let attempt = 0; attempt < MAX_SETTLE_ATTEMPTS; attempt++) {
    if (!wallet) return { error: "No vault found" };
    const r = compute(wallet);
    if ("error" in r) return r;
    const { applied } = await settleWallet(base44.asServiceRole, {
      walletId: wallet.id,
      expectedVersion: wallet.version || 0,
      set: r.set,
    });
    if (applied) return { wallet, set: r.set };
    wallet = await readWallet(base44, userId);
  }
  return { error: "Settlement busy — please retry" };
}

// Debit a stake. When `bumpNonce` is true (a new round) the provably-fair
// nonce is advanced too; a double down reuses the hand's nonce.
export async function debitStake(base44: any, userId: string, mode: string, amount: number, bumpNonce = true) {
  let nonceUsed = 0;
  const res = await updateWallet(base44, userId, (w) => {
    if ((w.mode || "free") !== mode) {
      return { error: mode === "real" ? "Real-stakes play requires a deposited, real-stakes vault." : "This vault is in real-stakes mode." };
    }
    if ((w.balance || 0) < amount) return { error: "Insufficient DCDN balance" };
    nonceUsed = bumpNonce ? (w.nonce || 0) + 1 : (w.nonce || 0);
    const set: Record<string, number> = {
      balance: round2((w.balance || 0) - amount),
      total_wagered: round2((w.total_wagered || 0) + amount),
    };
    if (bumpNonce) set.nonce = nonceUsed;
    return { set };
  });
  if ("error" in res) return res;
  return { nonce: nonceUsed, balance: res.set.balance };
}

// Credit winnings back to the vault. `countRound` bumps the rounds counter.
export async function creditPayout(base44: any, userId: string, amount: number, countRound = true) {
  return await updateWallet(base44, userId, (w) => ({
    set: {
      balance: round2((w.balance || 0) + amount),
      total_won: round2((w.total_won || 0) + amount),
      ...(countRound ? { spins: (w.spins || 0) + 1 } : {}),
    },
  }));
}

// Undo a debit that could not be applied to a game (e.g. a lost race).
export async function refundStake(base44: any, userId: string, amount: number) {
  return await updateWallet(base44, userId, (w) => ({
    set: {
      balance: round2((w.balance || 0) + amount),
      total_wagered: round2(Math.max(0, (w.total_wagered || 0) - amount)),
    },
  }));
}
