// Provably-fair random stream shared by the table games (roulette, blackjack).
//
// Every random draw is HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}:${cursor}`),
// so anyone holding the revealed server seed, their client seed and the nonce can
// replay the exact outcome. Integers are drawn with rejection sampling so every
// outcome is exactly equally likely (no modulo bias).

async function hmacHex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
  return Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomSeed(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// A deterministic stream of uint32 values. Each HMAC block yields 8 words.
export class FairStream {
  private buf: number[] = [];
  private block = 0;
  private serverSeed: string;
  private clientSeed: string;
  private nonce: number;
  constructor(serverSeed: string, clientSeed: string, nonce: number) {
    this.serverSeed = serverSeed;
    this.clientSeed = clientSeed;
    this.nonce = nonce;
  }

  private async refill() {
    const hex = await hmacHex(this.serverSeed, `${this.clientSeed}:${this.nonce}:${this.block++}`);
    for (let i = 0; i < 64; i += 8) this.buf.push(parseInt(hex.slice(i, i + 8), 16));
  }

  async nextUint32(): Promise<number> {
    if (!this.buf.length) await this.refill();
    return this.buf.shift() as number;
  }

  // Uniform integer in [0, n) via rejection sampling.
  async int(n: number): Promise<number> {
    if (!Number.isInteger(n) || n <= 0 || n > 0x100000000) throw new Error("bad range");
    const limit = Math.floor(0x100000000 / n) * n;
    for (;;) {
      const v = await this.nextUint32();
      if (v < limit) return v % n;
    }
  }
}
