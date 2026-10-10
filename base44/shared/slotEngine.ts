// Provably-fair slot engine with tunable house edge (RTP).
// Shared between backend functions — do not duplicate.

export interface TierTable {
  // [multiplier, cumulative probability upper bound]
  tiers: Array<{ mult: number; label: string; prob: number }>;
  loseProb: number;
}

// Base tier table calibrated to ~96% RTP.
// Expected return = sum(mult * prob) ≈ 0.96
const BASE_TIERS_96 = [
  { mult: 2, label: "Two-Bit", prob: 0.20 },
  { mult: 5, label: "Skim", prob: 0.06 },
  { mult: 20, label: "Heist", prob: 0.008 },
  { mult: 100, label: "Syndicate", prob: 0.0005 },
  { mult: 1000, label: "Dead Man's Jackpot", prob: 0.00005 },
];

export function buildTierTable(targetRtp: number): TierTable {
  const scale = Math.max(0.5, Math.min(1.05, targetRtp / 96));
  const tiers = BASE_TIERS_96.map((t) => ({ ...t, prob: t.prob * scale }));
  const winProb = tiers.reduce((s, t) => s + t.prob, 0);
  return { tiers, loseProb: Math.max(0, 1 - winProb) };
}

// SHA-256 hex of a string (Web Crypto, async).
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Deterministic float in [0,1) from a hex hash (first 8 hex chars = 32 bits).
export function hashToFloat(hash: string, offset = 0): number {
  const slice = hash.slice(offset, offset + 8);
  const int = parseInt(slice, 16);
  return (int % 1_000_000) / 1_000_000;
}

// Pick a multiplier tier from a float in [0,1) and a tier table.
export function pickTier(roll: number, table: TierTable): { mult: number; label: string } {
  let acc = table.loseProb;
  if (roll < acc) return { mult: 0, label: "Bust" };
  for (const t of table.tiers) {
    acc += t.prob;
    if (roll < acc) return { mult: t.mult, label: t.label };
  }
  // fallback: smallest win
  return { mult: table.tiers[0].mult, label: table.tiers[0].label };
}

// Mob-themed reel symbols (emoji for crisp rendering without asset deps).
export const REEL_SYMBOLS = [
  { id: "vault", icon: "🏦", name: "Vault" },
  { id: "tommy", icon: "🔫", name: "Tommy Gun" },
  { id: "cigar", icon: "🚬", name: "Cigar" },
  { id: "briefcase", icon: "💼", name: "Briefcase" },
  { id: "mustang", icon: "🏎️", name: "Mustang" },
  { id: "crown", icon: "👑", name: "Don's Crown" },
  { id: "ring", icon: "💍", name: "Pinkie Ring" },
];

// Payline row-paths across the 5 reels (3 rows). The lobby slot UI mirrors
// these for the neon line overlay.
export const LINE_PATHS = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
];

function randSym(rng: () => number): string {
  return REEL_SYMBOLS[Math.floor(rng() * REEL_SYMBOLS.length)].id;
}

function leftRun(grid: string[][], path: number[]): number {
  const sym = grid[0][path[0]];
  let n = 1;
  for (let r = 1; r < 5; r++) {
    if (grid[r][path[r]] === sym) n++;
    else break;
  }
  return n;
}

function anyLineWins(grid: string[][], paths: number[][]): boolean {
  return paths.some((p) => leftRun(grid, p) >= 3);
}

// Build a 5x3 reel grid. On a win, force a winning line (chosen at random
// from the active lines) of a common symbol; on a bust, ensure no active
// line shows a 3+ left-aligned match. grid[reel][row].
export function buildReels(mult: number, rng: () => number, activeLines = 5): string[][] {
  const paths = LINE_PATHS.slice(0, Math.max(1, Math.min(5, activeLines)));
  const nReels = 5;
  const rows = 3;

  function randomGrid(): string[][] {
    const grid: string[][] = [];
    for (let r = 0; r < nReels; r++) {
      const col: string[] = [];
      for (let row = 0; row < rows; row++) col.push(randSym(rng));
      grid.push(col);
    }
    return grid;
  }

  if (mult > 0) {
    const winIdx = Math.floor(rng() * paths.length);
    const winPath = paths[winIdx];
    const winSym = REEL_SYMBOLS[Math.floor(rng() * 3)].id; // vault/tommy/cigar
    const others = paths.filter((_, i) => i !== winIdx);
    let grid: string[][] = randomGrid();
    for (let r = 0; r < nReels; r++) grid[r][winPath[r]] = winSym;
    let attempts = 0;
    while (anyLineWins(grid, others) && attempts < 40) {
      grid = randomGrid();
      for (let r = 0; r < nReels; r++) grid[r][winPath[r]] = winSym;
      attempts++;
    }
    return grid;
  }

  let grid: string[][] = randomGrid();
  let attempts = 0;
  while (anyLineWins(grid, paths) && attempts < 40) {
    grid = randomGrid();
    attempts++;
  }
  if (anyLineWins(grid, paths)) {
    for (const p of paths) {
      if (leftRun(grid, p) >= 3) grid[0][p[0]] = randSym(rng);
    }
  }
  return grid;
}

// Full provably-fair spin resolution.
export interface SpinInput {
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  rtp: number;
  activeLines?: number;
}
export interface SpinResult {
  multiplier: number;
  label: string;
  reels: string[][];
  serverSeed: string;
  serverHash: string;
  clientSeed: string;
  nonce: number;
  roll: number;
}

export async function resolveSpin(input: SpinInput): Promise<SpinResult> {
  const serverHash = await sha256Hex(input.serverSeed);
  const combo = `${input.serverSeed}:${input.clientSeed}:${input.nonce}`;
  const hash = await sha256Hex(combo);
  const roll = hashToFloat(hash, 0);
  const table = buildTierTable(input.rtp);
  const { mult, label } = pickTier(roll, table);
  // deterministic secondary rng for reel dressing
  let s = parseInt(hash.slice(8, 16), 16) || 12345;
  const rng = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s % 1_000_000) / 1_000_000;
  };
  const reels = buildReels(mult, rng, input.activeLines ?? 5);
  return {
    multiplier: mult,
    label,
    reels,
    serverSeed: input.serverSeed,
    serverHash,
    clientSeed: input.clientSeed,
    nonce: input.nonce,
    roll,
  };
}

export function randomSeed(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}