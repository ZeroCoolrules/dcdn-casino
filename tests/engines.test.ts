// Run with: npm run test:engines
// Unit tests for the shared game engines (pure logic, no Base44 backend needed).
import test from "node:test";
import assert from "node:assert/strict";
import { FairStream } from "../base44/shared/fairRng.ts";
import {
  RETURN_MULT, betWins, settleBets, spinWheel, validateBet, type BetType,
} from "../base44/shared/rouletteEngine.ts";
import {
  shuffledShoe, handValue, openingResult, playDealer, compareHands, payoutFor,
} from "../base44/shared/blackjackEngine.ts";

test("fair stream is deterministic and in range", async () => {
  const a = new FairStream("seed", "client", 7);
  const b = new FairStream("seed", "client", 7);
  for (let i = 0; i < 200; i++) {
    const x = await a.int(37);
    assert.equal(x, await b.int(37));
    assert.ok(x >= 0 && x < 37);
  }
  const c = new FairStream("seed", "client", 8);
  const seqA = [], seqC = [];
  const a2 = new FairStream("seed", "client", 7);
  for (let i = 0; i < 10; i++) { seqA.push(await a2.int(1000)); seqC.push(await c.int(1000)); }
  assert.notDeepEqual(seqA, seqC, "different nonce must give a different stream");
});

test("every roulette bet type has exactly 36/37 expected return", () => {
  const bets: { type: BetType; value?: number }[] = [
    { type: "red" }, { type: "black" }, { type: "odd" }, { type: "even" },
    { type: "low" }, { type: "high" },
    { type: "dozen", value: 1 }, { type: "dozen", value: 2 }, { type: "dozen", value: 3 },
    { type: "column", value: 1 }, { type: "column", value: 2 }, { type: "column", value: 3 },
    ...Array.from({ length: 37 }, (_, n) => ({ type: "straight" as BetType, value: n })),
  ];
  for (const b of bets) {
    let wins = 0;
    for (let n = 0; n <= 36; n++) if (betWins({ ...b, amount: 1 }, n)) wins++;
    const ev = (wins * RETURN_MULT[b.type]) / 37;
    assert.ok(Math.abs(ev - 36 / 37) < 1e-12, `${b.type}${b.value ?? ""} EV ${ev}`);
  }
});

test("roulette zero loses all outside bets; settle sums payouts", () => {
  const r = settleBets([{ type: "red", amount: 10 }, { type: "straight", value: 0, amount: 5 }], 0);
  assert.equal(r.stake, 15);
  assert.equal(r.payout, 180);
  assert.equal(validateBet({ type: "straight", value: 37, amount: 1 }), null);
  assert.equal(validateBet({ type: "dozen", value: 0, amount: 1 }), null);
  assert.equal(validateBet({ type: "red", amount: -5 }), null);
  assert.equal(validateBet({ type: "magic", amount: 5 }), null);
});

test("roulette wheel is replayable from seeds and roughly uniform", async () => {
  const one = await spinWheel("s", "c", 1);
  assert.deepEqual(one, await spinWheel("s", "c", 1));
  const counts = new Array(37).fill(0);
  const N = 37 * 300;
  for (let i = 0; i < N; i++) counts[(await spinWheel("srv", "cli", i)).number]++;
  for (const c of counts) assert.ok(c > 200 && c < 420, `pocket count ${c} out of range`);
});

test("blackjack shoe is a full, deterministic 312-card shuffle", async () => {
  const s1 = await shuffledShoe("a", "b", 1);
  const s2 = await shuffledShoe("a", "b", 1);
  assert.deepEqual(s1, s2);
  assert.equal(s1.length, 312);
  const counts = new Map<string, number>();
  for (const c of s1) counts.set(c, (counts.get(c) || 0) + 1);
  assert.equal(counts.size, 52);
  for (const v of counts.values()) assert.equal(v, 6);
  assert.notDeepEqual(s1, await shuffledShoe("a", "b", 2));
});

test("blackjack hand values and rules", () => {
  assert.deepEqual(handValue(["AS", "KH"]), { total: 21, soft: true });
  assert.equal(handValue(["AS", "AH", "9D"]).total, 21);
  assert.equal(handValue(["KS", "QH", "2D"]).total, 22);
  assert.equal(openingResult(["AS", "KH"], ["9S", "7H"]), "blackjack");
  assert.equal(openingResult(["AS", "KH"], ["AD", "QH"]), "push");
  assert.equal(openingResult(["9S", "7H"], ["AD", "QH"]), "lose");
  assert.equal(openingResult(["9S", "7H"], ["9D", "QH"]), null);
  assert.equal(compareHands(["KS", "QH", "5D"], ["9D", "QH"]), "bust");
  assert.equal(compareHands(["KS", "9H"], ["9D", "QH", "5C"]), "win");
  assert.equal(compareHands(["KS", "9H"], ["9D", "KH"]), "push");
  assert.equal(payoutFor("blackjack", 10), 22);
  assert.equal(payoutFor("win", 10), 20);
  assert.equal(payoutFor("push", 10), 10);
  assert.equal(payoutFor("lose", 10), 0);
  // Dealer hits soft 17 but stands on hard 17.
  const d = ["AS", "6H"];
  playDealer(["2C"], d, 0);
  assert.deepEqual(d, ["AS", "6H", "2C"]);
  const h = ["10S", "7H"];
  playDealer(["2C"], h, 0);
  assert.deepEqual(h, ["10S", "7H"]);
});

test("blackjack simulation with simple basic strategy gives a sane house edge", async () => {
  // Player hits below 12, hits 12-16 against dealer 7+, otherwise stands.
  let staked = 0, returned = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const shoe = await shuffledShoe("sim-seed", "sim-client", i);
    const player = [shoe[0], shoe[2]];
    const dealer = [shoe[1], shoe[3]];
    let cursor = 4;
    staked += 1;
    const nat = openingResult(player, dealer);
    if (nat) { returned += payoutFor(nat, 1); continue; }
    const up = handValue([dealer[0]]).total;
    for (;;) {
      const t = handValue(player).total;
      if (t < 12 || (t < 17 && up >= 7)) player.push(shoe[cursor++]);
      else break;
    }
    if (handValue(player).total <= 21) cursor = playDealer(shoe, dealer, cursor);
    returned += payoutFor(compareHands(player, dealer), 1);
  }
  const rtp = returned / staked;
  // Simple strategy without doubles/splits lands roughly 94-99% RTP.
  assert.ok(rtp > 0.9 && rtp < 1.02, `RTP ${rtp}`);
});

test("deposits credit the house's net amount after DCDN's 1% burn", async () => {
  const { parseDepositFromReceipt, TRANSFER_TOPIC } = await import("../base44/shared/dcdnChain.ts");
  const pad = (a: string) => "0x" + a.slice(2).toLowerCase().padStart(64, "0");
  const token = "0x0602074976325a455BA3Fc53fD43294C5a3ABd66";
  const house = "0x1111111111111111111111111111111111111111";
  const player = "0x2222222222222222222222222222222222222222";
  const zero = "0x0000000000000000000000000000000000000000";
  const amt = (n: bigint) => "0x" + n.toString(16);
  const gross = 100n * 10n ** 18n;
  const receipt = {
    logs: [
      { address: token, topics: [TRANSFER_TOPIC, pad(player), pad(house)], data: amt(gross) },
      { address: token, topics: [TRANSFER_TOPIC, pad(house), pad(zero)], data: amt(gross / 100n) },
    ],
  };
  const d = parseDepositFromReceipt(receipt, token, house)!;
  assert.equal(d.from, player);
  assert.equal(d.amount, 99n * 10n ** 18n);
  // Transfers of a different token, or to someone else, are ignored.
  assert.equal(parseDepositFromReceipt({ logs: [{ ...receipt.logs[0], address: house }] }, token, house), null);
  assert.equal(parseDepositFromReceipt({ logs: [] }, token, house), null);
});
