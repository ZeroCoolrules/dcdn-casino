// "Back Room Blackjack" — 6-deck shoe, freshly shuffled per hand from the
// provably-fair stream. Rules: dealer hits soft 17, dealer peeks for
// blackjack, blackjack pays 6:5, double down on the first two cards only,
// no splits or insurance (yet). Pure functions; the backend function stores
// the hand and moves money.
import { FairStream } from "./fairRng.ts";

export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const SUITS = ["S", "H", "D", "C"];
export const DECKS = 6;

// A card is encoded as "<rank><suit>", e.g. "10H", "AS".
export async function shuffledShoe(serverSeed: string, clientSeed: string, nonce: number): Promise<string[]> {
  const shoe: string[] = [];
  for (let d = 0; d < DECKS; d++) for (const s of SUITS) for (const r of RANKS) shoe.push(r + s);
  const stream = new FairStream(serverSeed, clientSeed, nonce);
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = await stream.int(i + 1);
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

export function rankOf(card: string): string {
  return card.slice(0, -1);
}

export function handValue(cards: string[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const r = rankOf(c);
    if (r === "A") { aces++; total += 11; }
    else if (r === "J" || r === "Q" || r === "K") total += 10;
    else total += Number(r);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}

export function isBlackjack(cards: string[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

export type Outcome = "blackjack" | "win" | "push" | "lose" | "bust";

// Dealer draws to 17 and hits soft 17 (H17). Returns the new cursor.
export function playDealer(shoe: string[], dealer: string[], cursor: number): number {
  for (;;) {
    const { total, soft } = handValue(dealer);
    if (total > 17 || (total === 17 && !soft)) return cursor;
    dealer.push(shoe[cursor++]);
  }
}

// Total returned to the player (stake included) for a finished hand.
export function payoutFor(outcome: Outcome, wager: number): number {
  const r = (x: number) => Math.round(x * 100) / 100;
  switch (outcome) {
    case "blackjack": return r(wager * 2.2); // 6:5
    case "win": return r(wager * 2);
    case "push": return r(wager);
    default: return 0;
  }
}

export function compareHands(player: string[], dealer: string[]): Outcome {
  const p = handValue(player).total;
  const d = handValue(dealer).total;
  if (p > 21) return "bust";
  if (d > 21 || p > d) return "win";
  if (p === d) return "push";
  return "lose";
}

// Resolves the opening deal. If either side has a natural the hand ends now.
export function openingResult(player: string[], dealer: string[]): Outcome | null {
  const pbj = isBlackjack(player);
  const dbj = isBlackjack(dealer);
  if (pbj && dbj) return "push";
  if (pbj) return "blackjack";
  if (dbj) return "lose";
  return null;
}
