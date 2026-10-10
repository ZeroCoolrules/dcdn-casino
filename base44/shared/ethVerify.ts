// Ethereum personal_sign recovery, shared by backend functions.
// Recovers the address that signed `message` (EIP-191 personal_sign), so a
// backend function can prove the caller controls an on-chain sender before
// crediting a deposit to that address.
import { ethers } from 'npm:ethers@6.13.4';

export function recoverPersonalSignAddress(message: string, signature: string): string {
  const addr = ethers.verifyMessage(message, signature);
  return String(addr).toLowerCase();
}