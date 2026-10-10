// Atomic compare-and-swap wallet settlement. Uses the wallet's `version` field
// as an optimistic-concurrency token so concurrent settlement attempts
// (spinSlot / dealHoldem / verifyDeposit / approveDeposit) can never over-wager
// or silently overwrite each other's balance update.
//
// The caller reads the wallet, computes absolute post-settlement field values
// (balance, totals, nonce, ...), and passes them in `set` together with the
// `version` it observed. settleWallet only applies the write if the wallet's
// version still matches — guaranteeing the read-modify-write was exclusive.
//
// Migration: wallets created before the `version` field existed have no value.
// When expectedVersion is 0 we match either version:0 or a missing field, so the
// first settlement self-heals existing rows.

export interface SettleInput {
  walletId: string;
  expectedVersion: number;
  set: Record<string, number | string>;
}

export interface SettleResult {
  applied: boolean;
}

export async function settleWallet(base44: any, input: SettleInput): Promise<SettleResult> {
  const filter: any = { id: input.walletId };
  if (input.expectedVersion === 0) {
    filter.$or = [{ version: 0 }, { version: { $exists: false } }];
  } else {
    filter.version = input.expectedVersion;
  }
  const res = await base44.entities.Wallet.updateMany(filter, {
    $set: { ...input.set, version: input.expectedVersion + 1 },
  });
  const updated = (res && (res.updated ?? res.modifiedCount ?? 0)) || 0;
  return { applied: updated >= 1 };
}