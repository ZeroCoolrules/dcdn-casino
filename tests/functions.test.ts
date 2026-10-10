// Run with: npm run test:functions
// Drives the real backend functions (spinRoulette, playBlackjack) against an
// in-memory Base44 mock and checks the money always adds up.
import test from "node:test";
import assert from "node:assert/strict";
import spinRoulette from "../base44/functions/spinRoulette/entry.ts";
import playBlackjack from "../base44/functions/playBlackjack/entry.ts";
import { createClientFromRequest } from "./mocks/base44sdk.ts";

const store = () => (globalThis as any).__store as Map<string, Map<string, any>>;

async function call(fn: (r: Request) => Promise<Response>, user: string | null, body: unknown) {
  const req = new Request("http://x/", {
    method: "POST",
    headers: { "content-type": "application/json", ...(user ? { "x-user": user } : {}) },
    body: JSON.stringify(body),
  });
  const res = await fn(req);
  return { status: res.status, data: await res.json() as any };
}

async function seedWallet(user: string, balance: number, mode = "free") {
  const b44 = createClientFromRequest(new Request("http://x/", { headers: { "x-user": user } }));
  return await b44.asServiceRole.entities.Wallet.create({
    balance, mode, total_wagered: 0, total_won: 0, spins: 0, nonce: 0, version: 0,
  });
}

function walletOf(user: string) {
  return [...store().get("Wallet")!.values()].find((w) => w.created_by_id === user);
}

test("roulette: unauthenticated and bad bets are rejected", async () => {
  assert.equal((await call(spinRoulette, null, { bets: [] })).status, 401);
  await seedWallet("r0", 100);
  assert.equal((await call(spinRoulette, "r0", { bets: [] })).status, 400);
  assert.equal((await call(spinRoulette, "r0", { bets: [{ type: "straight", value: 40, amount: 1 }] })).status, 400);
  assert.equal((await call(spinRoulette, "r0", { bets: [{ type: "red", amount: 101 }] })).status, 400);
  assert.equal(walletOf("r0").balance, 100);
});

test("roulette: balance always equals start - stakes + payouts", async () => {
  await seedWallet("r1", 1000);
  let expected = 1000;
  for (let i = 0; i < 60; i++) {
    const { status, data } = await call(spinRoulette, "r1", {
      bets: [{ type: "red", amount: 5 }, { type: "straight", value: 17, amount: 1 }, { type: "dozen", value: 2, amount: 2 }],
      client_seed: "abc",
    });
    assert.equal(status, 200, JSON.stringify(data));
    expected = Math.round((expected - data.stake + data.payout) * 100) / 100;
    assert.equal(data.balance, expected);
    assert.ok(data.number >= 0 && data.number <= 36);
  }
  const w = walletOf("r1");
  assert.equal(w.balance, expected);
  assert.equal(w.spins, 60);
  assert.equal(w.nonce, 60);
});

test("roulette: mode mismatch is refused", async () => {
  await seedWallet("r2", 100, "real");
  const { status } = await call(spinRoulette, "r2", { bets: [{ type: "red", amount: 5 }], mode: "free" });
  assert.equal(status, 400);
});

test("blackjack: full hands keep the books balanced", async () => {
  await seedWallet("b1", 5000);
  let wagered = 0, paid = 0;
  for (let i = 0; i < 80; i++) {
    let { status, data } = await call(playBlackjack, "b1", { action: "deal", bet: 10, client_seed: "cs" });
    assert.equal(status, 200, JSON.stringify(data));
    let h = data.hand;
    assert.equal(h.server_seed, h.status === "settled" ? h.server_seed : null);
    if (h.status === "player_turn") assert.equal(h.dealer_cards[1], "??", "hole card must stay hidden");
    let steps = 0;
    while (h.status === "player_turn") {
      const action = i % 3 === 0 && h.can_double ? "double" : h.player_total < 15 ? "hit" : "stand";
      ({ status, data } = await call(playBlackjack, "b1", { action, hand_id: h.hand_id }));
      assert.equal(status, 200, JSON.stringify(data));
      h = data.hand;
      assert.ok(++steps < 15);
    }
    assert.ok(h.server_seed, "seed revealed after settle");
    wagered += h.wager;
    paid += h.payout;
    assert.equal(data.balance, Math.round((5000 - wagered + paid) * 100) / 100);
  }
  const hands = [...store().get("BlackjackHand")!.values()].filter((x) => x.player_id === "b1");
  assert.equal(hands.length, 80);
  assert.ok(hands.every((x) => x.status === "settled" && x.paid));
  assert.ok(hands.some((x) => x.doubled));
});

test("blackjack: one live hand at a time, owner-only, insufficient funds", async () => {
  await seedWallet("b2", 30);
  await seedWallet("b3", 30);
  // Find a deal that does not end immediately on a natural.
  let live: any = null;
  for (let i = 0; i < 10 && !live; i++) {
    const { data } = await call(playBlackjack, "b2", { action: "deal", bet: 1, client_seed: "x" + i });
    if (data.hand.status === "player_turn") live = data.hand;
  }
  assert.ok(live);
  const again = await call(playBlackjack, "b2", { action: "deal", bet: 1 });
  assert.equal(again.status, 409);
  const stranger = await call(playBlackjack, "b3", { action: "stand", hand_id: live.hand_id });
  assert.equal(stranger.status, 404);
  const resumed = await call(playBlackjack, "b2", { action: "state" });
  assert.equal(resumed.data.hand.hand_id, live.hand_id);
  await call(playBlackjack, "b2", { action: "stand", hand_id: live.hand_id });
  const broke = await call(playBlackjack, "b3", { action: "deal", bet: 31 });
  assert.equal(broke.status, 400);
  assert.equal(walletOf("b3").balance, 30);
});

test("blackjack: a settled-but-unpaid hand is paid on the next request", async () => {
  await seedWallet("b4", 100);
  const b44 = createClientFromRequest(new Request("http://x/", { headers: { "x-user": "b4" } }));
  await b44.asServiceRole.entities.BlackjackHand.create({
    player_id: "b4", status: "settled", mode: "free", bet: 10, wager: 10, outcome: "win",
    payout: 20, paid: false, version: 3, player_cards: ["KS", "9H"], dealer_cards: ["9D", "8C"],
    server_seed: "s", server_hash: "h", client_seed: "c", nonce: 1,
  });
  const { data } = await call(playBlackjack, "b4", { action: "state" });
  assert.equal(data.balance, 120);
  const again = await call(playBlackjack, "b4", { action: "state" });
  assert.equal(again.data.balance, 120, "must not pay twice");
});
