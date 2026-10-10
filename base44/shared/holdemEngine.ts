// Shared Texas Hold'em engine: provably-fair deck shuffle + 5-card hand
// evaluation. Pure, no IO — called from the dealHoldem backend function.

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const SUITS = ['s', 'h', 'd', 'c'];
const RANK_VAL = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

export function randomSeed() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

// mulberry32 PRNG seeded from a 32-bit int (derived from a SHA-256 digest).
export function makeRng(seedInt) {
  let a = seedInt >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fullDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push(r + s);
  return d;
}

export function shuffleDeck(seedInt) {
  const deck = fullDeck();
  const rng = makeRng(seedInt);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
  return deck;
}

function cardVal(c) { return RANK_VAL[c[0]]; }
function cardSuit(c) { return c[1]; }

// Score a 5-card hand as a comparable array: [category, ...kickers desc].
// 8 straight flush, 7 quads, 6 full house, 5 flush, 4 straight,
// 3 trips, 2 two pair, 1 pair, 0 high card.
function score5(five) {
  const vals = five.map(cardVal).sort((a, b) => b - a);
  const suits = five.map(cardSuit);
  const isFlush = suits.every((s) => s === suits[0]);
  const unique = [];
  for (const v of vals) if (unique[unique.length - 1] !== v) unique.push(v);
  let isStraight = false;
  let straightHigh = 0;
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) { isStraight = true; straightHigh = unique[0]; }
    if (unique[0] === 14 && unique[1] === 5 && unique[4] === 2) { isStraight = true; straightHigh = 5; }
  }
  const counts = {};
  for (const v of vals) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.keys(counts).map((k) => [Number(k), counts[k]]).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  if (isStraight && isFlush) return [8, straightHigh];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1] && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
  if (isFlush) return [5].concat(vals);
  if (isStraight) return [4, straightHigh];
  if (groups[0][1] === 3) return [3, groups[0][0], groups[1][0], groups[2][0]];
  if (groups[0][1] === 2 && groups[1] && groups[1][1] === 2) return [2, groups[0][0], groups[1][0], groups[2][0]];
  if (groups[0][1] === 2) return [1, groups[0][0], groups[1][0], groups[2][0], groups[3][0]];
  return [0].concat(vals);
}

function cmpScore(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const av = a[i] == null ? 0 : a[i];
    const bv = b[i] == null ? 0 : b[i];
    if (av !== bv) return av - bv;
  }
  return 0;
}

// Best 5-card hand from 7 cards (2 hole + 5 community): all C(7,2)=21 exclusions.
export function bestHand(seven) {
  let best = null;
  let bestCards = null;
  for (let i = 0; i < seven.length; i++) {
    for (let j = i + 1; j < seven.length; j++) {
      const five = seven.filter((_, k) => k !== i && k !== j);
      const sc = score5(five);
      if (!best || cmpScore(sc, best) > 0) { best = sc; bestCards = five; }
    }
  }
  return { score: best, cards: bestCards };
}

const HAND_NAMES = ['High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'];
export function handName(score) { return HAND_NAMES[score[0]] || 'Hand'; }
export function compareHands(a, b) { return cmpScore(a, b); }