import {agentConfig} from './_lib/x402.mjs';
import {shopifyConfigured} from './_lib/shopify.mjs';
export default function handler(req, res) {
  const a = agentConfig();
  res.status(200).json({ok: true, app: 'Native Clouds · Bazaar test', mcp: '/api/mcp', mcpTokenRequired: !!process.env.MCP_TOKEN, shopify: shopifyConfigured(), coinbaseLogin: '/api/my-shop/auth/session', authSecretSet: !!process.env.AUTH_SECRET, agentWallet: a.wallet, agentMaxPerCallUsdc: a.maxPerCall, agentNetworks: a.networks, x402PayEnabled: a.payEnabled, time: new Date().toISOString()});
}
