// Browser injected-provider (MetaMask) helpers for DCDN ERC-20 transfers.

const TRANSFER_SELECTOR = "0xa9059cbb"; // transfer(address,uint256)

function getProvider() {
  if (typeof window === "undefined") return null;
  return window.ethereum || null;
}

export function hasInjectedWallet() {
  return !!getProvider();
}

export async function connectWallet() {
  const provider = getProvider();
  if (!provider) throw new Error("No injected wallet found. Install MetaMask or a compatible Web3 wallet.");
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  return accounts && accounts[0];
}

export async function getConnectedAccount() {
  const provider = getProvider();
  if (!provider) return null;
  const accounts = await provider.request({ method: "eth_accounts" });
  return accounts && accounts[0] ? accounts[0] : null;
}

function padAddress(addr) {
  return addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function padAmount(amountBigInt) {
  return amountBigInt.toString(16).padStart(64, "0");
}

function buildTransferData(toAddress, amount, decimals) {
  const raw = BigInt(Math.round(amount * Math.pow(10, decimals)));
  return "0x" + TRANSFER_SELECTOR.slice(2) + padAddress(toAddress) + padAmount(raw);
}

// Sends an ERC-20 transfer of `amount` (whole tokens) from the connected wallet
// to `toAddress` via the DCDN contract. Returns the tx hash + sender.
export async function sendDcdnTransfer({ contractAddress, toAddress, amount, decimals }) {
  const provider = getProvider();
  if (!provider) throw new Error("No injected wallet found.");
  const from = await connectWallet();
  const data = buildTransferData(toAddress, amount, decimals);
  const txHash = await provider.request({
    method: "eth_sendTransaction",
    params: [{ from, to: contractAddress, data }],
  });
  return { txHash, from };
}

// Poll the injected provider for a receipt; resolves once mined.
export async function waitForReceipt(txHash, timeoutMs = 120000) {
  const provider = getProvider();
  if (!provider) throw new Error("No injected wallet found.");
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const receipt = await provider.request({ method: "eth_getTransactionReceipt", params: [txHash] });
    if (receipt) return receipt;
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Timed out waiting for on-chain confirmation");
}