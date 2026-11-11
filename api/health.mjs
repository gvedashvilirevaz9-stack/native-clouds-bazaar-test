import {agentConfig} from './_lib/x402.mjs';
import {shopifyConfigured} from './_lib/shopify.mjs';
export default function handler(req, res) {
  const a = agentConfig();
  res.status(200).json({ok: true, app: 'Native Clouds · Bazaar test', mcp: '/api/mcp', mcpTokenRequired: !!process.env.MCP_TOKEN, shopify: shopifyConfigured(), agentWallet: a.wallet, agentNetworks: a.networks, x402PayEnabled: a.payEnabled, time: new Date().toISOString()});
}
