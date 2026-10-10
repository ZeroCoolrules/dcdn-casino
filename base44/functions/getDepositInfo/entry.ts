import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { readDecimals } from '../../shared/dcdnChain.ts';

// Returns the public on-chain deposit config (contract, house address, decimals)
// so the frontend can build an ERC-20 transfer via the injected wallet.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rpcUrl = secrets.get("QUICKNODE_RPC_URL");
    const contract = secrets.get("DCDN_CONTRACT_ADDRESS");
    const house = secrets.get("HOUSE_WALLET_ADDRESS");
    if (!rpcUrl || !contract || !house) {
      return Response.json(
        { error: 'On-chain deposit not configured. Add QUICKNODE_RPC_URL, DCDN_CONTRACT_ADDRESS, HOUSE_WALLET_ADDRESS as app secrets.' },
        { status: 503 }
      );
    }

    const decimals = await readDecimals(rpcUrl, contract);
    return Response.json({ contractAddress: contract, houseAddress: house, decimals });
  } catch (error) {
    return Response.json({ error: error.message || 'failed' }, { status: 500 });
  }
}