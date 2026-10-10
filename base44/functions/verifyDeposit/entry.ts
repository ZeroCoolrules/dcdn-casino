import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets, waitUntil } from 'base44:runtime';
import { rpcCall, parseDepositFromReceipt, readDecimals } from '../../shared/dcdnChain.ts';
import { settleWallet } from '../../shared/walletSettle.ts';
import { recoverPersonalSignAddress } from '../../shared/ethVerify.ts';
import { sendDepositAlert } from '../../shared/gmailAlert.ts';

// Verifies an on-chain DCDN deposit by reading the transaction receipt from the
// QuickNode RPC, confirming an ERC-20 Transfer to the house wallet, then
// crediting the player's off-chain Wallet ledger.
//
// Security:
//  - The caller MUST prove they control the on-chain sender. The frontend has the
//    depositor sign a message binding this signature to the deposit tx; we
//    recover the signing address and require it to equal the on-chain sender
//    (deposit.from). An attacker who merely watches a victim's confirmed
//    transfer cannot credit it to their own vault because they cannot sign as
//    the victim's address. The wallet_address is bound from this verified
//    signature on the first credit, and subsequent credits must come from the
//    same bound address.
//  - Idempotency is enforced GLOBALLY via CreditedDeposit keyed by tx hash. The
//    CreditedDeposit row is created FIRST as the atomic claim on the tx, before
//    any wallet is touched; a concurrent claim that lost the race is rolled
//    back, so a tx can be credited at most once across the whole app.
//  - The wallet credit is atomic (compare-and-swap on wallet.version).
//  - Free-play credits are never commingled into a real-stakes vault: crediting
//    requires the vault to already be in real-stakes mode (or be an empty free
//    vault receiving its first deposit).

const MAX_SETTLE_ATTEMPTS = 6;
const SIGNATURE_PREFIX = 'Dream Casino vault deposit: ';

async function alreadyCredited(base44: any, txHash: string): Promise<boolean> {
  const prior = await base44.asServiceRole.entities.CreditedDeposit.filter({ tx_hash: txHash });
  const list = Array.isArray(prior) ? prior : (prior.items || []);
  return list.length > 0;
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rpcUrl = secrets.get("QUICKNODE_RPC_URL");
    const contract = secrets.get("DCDN_CONTRACT_ADDRESS");
    const house = secrets.get("HOUSE_WALLET_ADDRESS");
    if (!rpcUrl || !contract || !house) {
      return Response.json({ error: 'On-chain deposit not configured.' }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const txHash = String(body.tx_hash || '').trim();
    const signature = String(body.signature || '').trim();
    if (!txHash.startsWith('0x')) return Response.json({ error: 'tx_hash required' }, { status: 400 });
    if (!signature.startsWith('0x')) {
      return Response.json({ error: 'A wallet signature proving ownership of the deposit sender is required.' }, { status: 400 });
    }

    // Global idempotency check before touching the chain.
    if (await alreadyCredited(base44, txHash)) {
      return Response.json({ ok: false, duplicate: true, error: 'This deposit was already credited' }, { status: 409 });
    }

    const receipt: any = await rpcCall(rpcUrl, "eth_getTransactionReceipt", [txHash]);
    if (!receipt) {
      return Response.json(
        { ok: false, pending: true, error: 'Transaction not yet confirmed on QuickNode. Retry in a few seconds.' },
        { status: 202 }
      );
    }
    if (receipt.status !== "0x1") {
      return Response.json({ error: 'Transaction failed on-chain' }, { status: 400 });
    }

    const deposit = parseDepositFromReceipt(receipt, contract, house);
    if (!deposit) {
      return Response.json({ error: 'No DCDN transfer to the house wallet found in this transaction' }, { status: 400 });
    }

    const decimals = await readDecimals(rpcUrl, contract);
    const whole = Math.round((Number(deposit.amount) / Math.pow(10, decimals)) * 100) / 100;
    const fromAddr = deposit.from.toLowerCase();

    // Proof of ownership: the signature over "<prefix><txHash>" must recover to
    // the on-chain sender. This closes deposit-credit theft by an attacker who
    // only watches the chain.
    const message = SIGNATURE_PREFIX + txHash;
    let recovered: string;
    try {
      recovered = recoverPersonalSignAddress(message, signature);
    } catch {
      return Response.json({ error: 'Invalid deposit signature' }, { status: 400 });
    }
    if (recovered !== fromAddr) {
      return Response.json({ error: 'Signature does not match the deposit sender' }, { status: 403 });
    }

    // Atomic claim on this tx: create the CreditedDeposit row BEFORE crediting
    // the wallet. If a concurrent request also created a row, the one with the
    // earliest created_date wins; the loser rolls its row back and returns 409.
    // This makes the tx-claim the serialization point instead of a check-then-
    // create TOCTOU on the wallet.
    const claim = await base44.asServiceRole.entities.CreditedDeposit.create({
      tx_hash: txHash,
      from_address: fromAddr,
      amount: whole,
      wallet_id: '',
    });
    const allClaims = await base44.asServiceRole.entities.CreditedDeposit.filter(
      { tx_hash: txHash },
      { sort: 'created_date', limit: 50 }
    );
    const claimList = Array.isArray(allClaims) ? allClaims : (allClaims.items || []);
    if (claimList.length > 1 && claimList[0].id !== claim.id) {
      try { await base44.asServiceRole.entities.CreditedDeposit.delete(claim.id); } catch {}
      return Response.json({ ok: false, duplicate: true, error: 'This deposit was already credited' }, { status: 409 });
    }

    // Load or create the player's wallet.
    let wallet;
    const wres = await base44.entities.Wallet.filter({ created_by_id: user.id }, { limit: 1 });
    wallet = wres.items && wres.items[0];

    if (!wallet) {
      // First-ever vault for this user: create it bound to the verified on-chain
      // sender, in real-stakes mode, funded by this deposit.
      wallet = await base44.asServiceRole.entities.Wallet.create({
        balance: whole,
        mode: 'real',
        total_wagered: 0,
        total_won: 0,
        spins: 0,
        nonce: 0,
        version: 0,
        wallet_address: fromAddr,
        last_deposit_tx: txHash,
        free_stake_claimed: false,
        has_deposited: true,
      });
      try {
        await base44.asServiceRole.entities.CreditedDeposit.update(claim.id, { wallet_id: wallet.id });
      } catch {}
      waitUntil(sendDepositAlert(base44, { amount: whole, fromAddress: fromAddr, txHash, balance: whole }));
      return Response.json({ ok: true, amount: whole, from: deposit.from, balance: whole, tx_hash: txHash });
    }

    // Existing vault: the deposit must come from the address already bound to it.
    const bound = (wallet.wallet_address || '').toLowerCase();
    if (bound && bound !== fromAddr) {
      try { await base44.asServiceRole.entities.CreditedDeposit.delete(claim.id); } catch {}
      return Response.json({ error: 'Deposit sender does not match your bound wallet address' }, { status: 403 });
    }
    if (!bound) {
      // No address bound yet (e.g. a free-play vault created without a deposit):
      // bind the verified sender now.
      await base44.asServiceRole.entities.Wallet.update(wallet.id, { wallet_address: fromAddr }).catch(() => {});
    }

    // Never commingle complimentary free credits into a real-stakes credit. The
    // vault must already be in real-stakes mode, or be an empty free vault that
    // is now receiving its first deposit.
    if (wallet.mode !== 'real') {
      if ((wallet.balance || 0) > 0 && wallet.has_deposited !== true) {
        try { await base44.asServiceRole.entities.CreditedDeposit.delete(claim.id); } catch {}
        return Response.json(
          { error: 'Spend your complimentary balance first, then switch to real-stakes mode before depositing.' },
          { status: 400 }
        );
      }
    }

    // Atomic credit via compare-and-swap on wallet.version. The CreditedDeposit
    // claim above already serializes this tx, so a concurrent credit attempt
    // for the same tx returns 409 on the idempotency re-check.
    let newBalance = wallet.balance;
    let credited = false;
    for (let attempt = 0; attempt < MAX_SETTLE_ATTEMPTS; attempt++) {
      newBalance = Math.round(((wallet.balance || 0) + whole) * 100) / 100;
      const applied = await settleWallet(base44.asServiceRole, {
        walletId: wallet.id,
        expectedVersion: wallet.version || 0,
        set: {
          balance: newBalance,
          mode: 'real',
          last_deposit_tx: txHash,
          has_deposited: true,
        },
      });
      if (applied) {
        try { await base44.asServiceRole.entities.CreditedDeposit.update(claim.id, { wallet_id: wallet.id }); } catch {}
        credited = true;
        break;
      }
      const refreshed = await base44.entities.Wallet.filter({ created_by_id: user.id }, { limit: 1 });
      wallet = refreshed.items && refreshed.items[0];
      if (!wallet) return Response.json({ error: 'Wallet vanished mid-credit' }, { status: 500 });
    }

    if (!credited) {
      try { await base44.asServiceRole.entities.CreditedDeposit.delete(claim.id); } catch {}
      return Response.json({ error: 'Settlement busy — please retry the deposit' }, { status: 503 });
    }

    waitUntil(sendDepositAlert(base44, { amount: whole, fromAddress: fromAddr, txHash, balance: newBalance }));
    return Response.json({ ok: true, amount: whole, from: deposit.from, balance: newBalance, tx_hash: txHash });
  } catch (error) {
    return Response.json({ error: error.message || 'verify failed' }, { status: 500 });
  }
}