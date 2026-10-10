// European single-zero roulette ("Wheel of the Don").
// 37 pockets, house edge 2.70% on every bet type. Pure functions — the backend
// function handles wallets; this file only decides outcomes and payouts.
import { FairStream, sha256Hex } from "./fairRng.ts";

export const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type BetType =
  | "straight" // value 0..36, pays 35:1
  | "red" | "black" | "odd" | "even" | "low" | "high" // pay 1:1
  | "dozen" // value 1..3 (1-12, 13-24, 25-36), pays 2:1
  | "column"; // value 1..3 (1,4,7… / 2,5,8… / 3,6,9…), pays 2:1

export interface RouletteBet {
  type: BetType;
  value?: number;
  amount: number;
}

// Total returned (stake included) per 1 unit staked on a winning bet.
export const RETURN_MULT: Record<BetType, number> = {
  straight: 36,
  red: 2, black: 2, odd: 2, even: 2, low: 2, high: 2,
  dozen: 3, column: 3,
};

export function validateBet(b: any): RouletteBet | null {
  if (!b || typeof b !== "object") return null;
  const type = String(b.type) as BetType;
  if (!(type in RETURN_MULT)) return null;
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const rounded = Math.round(amount * 100) / 100;
  if (type === "straight") {
    const v = Number(b.value);
    if (!Number.isInteger(v) || v < 0 || v > 36) return null;
    return { type, value: v, amount: rounded };
  }
  if (type === "dozen" || type === "column") {
    const v = Number(b.value);
    if (!Number.isInteger(v) || v < 1 || v > 3) return null;
    return { type, value: v, amount: rounded };
  }
  return { type, amount: rounded };
}

export function betWins(bet: RouletteBet, n: number): boolean {
  if (bet.type === "straight") return bet.value === n;
  if (n === 0) return false; // zero loses every outside bet
  switch (bet.type) {
    case "red": return RED_NUMBERS.has(n);
    case "black": return !RED_NUMBERS.has(n);
    case "odd": return n % 2 === 1;
    case "even": return n % 2 === 0;
    case "low": return n <= 18;
    case "high": return n >= 19;
    case "dozen": return Math.ceil(n / 12) === bet.value;
    case "column": return ((n - 1) % 3) + 1 === bet.value;
  }
  return false;
}

export function settleBets(bets: RouletteBet[], n: number) {
  let stake = 0;
  let payout = 0;
  const lines = bets.map((b) => {
    stake += b.amount;
    const win = betWins(b, n);
    const ret = win ? Math.round(b.amount * RETURN_MULT[b.type] * 100) / 100 : 0;
    payout += ret;
    return { ...b, win, payout: ret };
  });
  return {
    stake: Math.round(stake * 100) / 100,
    payout: Math.round(payout * 100) / 100,
    lines,
  };
}

export function pocketColor(n: number): "green" | "red" | "black" {
  if (n === 0) return "green";
  return RED_NUMBERS.has(n) ? "red" : "black";
}

export async function spinWheel(serverSeed: string, clientSeed: string, nonce: number) {
  const stream = new FairStream(serverSeed, clientSeed, nonce);
  const number = await stream.int(37);
  return { number, color: pocketColor(number), serverHash: await sha256Hex(serverSeed) };
}
