// DCDN on-chain helpers — JSON-RPC reads via QuickNode + ERC-20 Transfer log parsing.
// Shared between backend functions — do not duplicate.

export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const DECIMALS_SELECTOR = "0x313ce567"; // decimals()

export async function rpcCall(rpcUrl: string, method: string, params: any[]): Promise<any> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`RPC error: ${JSON.stringify(json.error)}`);
  return json.result;
}

export function hexToBigInt(hex: string): bigint {
  if (!hex) return 0n;
  return BigInt(hex);
}

export function hexToAddress(hex: string): string {
  if (!hex || hex === "0x") return "";
  return "0x" + hex.slice(hex.length - 40).toLowerCase();
}

function lower(a: string): string {
  return (a || "").toLowerCase();
}

// Read ERC-20 decimals from the contract; falls back to 18 on failure.
export async function readDecimals(rpcUrl: string, contractAddress: string): Promise<number> {
  try {
    const result: any = await rpcCall(rpcUrl, "eth_call", [{ to: contractAddress, data: DECIMALS_SELECTOR }, "latest"]);
    return Number(hexToBigInt(result));
  } catch {
    return 18;
  }
}

export interface ParsedDeposit {
  from: string;
  to: string;
  amount: bigint; // raw token units
}

// Parse a tx receipt for an ERC-20 Transfer to the house wallet.
//
// DCDN auto-burns 1% of every transfer FROM THE RECIPIENT right after it
// lands: the receipt holds Transfer(player -> house, X) followed by
// Transfer(house -> 0x0, X/100). The house therefore only keeps 99%, so the
// credited amount is the house's NET change in this transaction (everything in
// minus everything out), never the gross Transfer value.
export function parseDepositFromReceipt(
  receipt: any,
  contractAddress: string,
  houseAddress: string
): ParsedDeposit | null {
  if (!receipt) return null;
  const contract = lower(contractAddress);
  const house = lower(houseAddress);
  const logs = Array.isArray(receipt.logs) ? receipt.logs : [];
  let from = "";
  let inflow = 0n;
  let outflow = 0n;
  for (const log of logs) {
    if (lower(log.address) !== contract) continue;
    const topics = log.topics || [];
    if (topics[0] !== TRANSFER_TOPIC || topics.length < 3) continue;
    const src = hexToAddress(topics[1]);
    const dst = hexToAddress(topics[2]);
    const value = hexToBigInt(log.data || "0x0");
    if (dst === house && src !== house) {
      if (!from) from = src;
      else if (src !== from) return null; // ambiguous: several senders paid the house
      inflow += value;
    } else if (src === house && dst !== house) {
      outflow += value;
    }
  }
  if (!from || inflow <= outflow) return null;
  return { from, to: house, amount: inflow - outflow };
}
