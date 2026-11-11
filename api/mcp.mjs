// Bazaar MCP server — Streamable HTTP transport, stateless, plain JSON responses (no SSE needed).
// Add to Claude: Settings → Connectors → Add custom connector → https://<your-app>.vercel.app/api/mcp?key=<MCP_TOKEN>
// If MCP_TOKEN is set in Vercel, every call must carry it (?key=… or "Authorization: Bearer …").
// Paying (x402_pay) is impossible without MCP_TOKEN.
import {TOOLS} from './_lib/tools.mjs';

const PROTOCOL = '2025-06-18';
const ok = (id, result) => ({jsonrpc: '2.0', id, result});
const err = (id, code, message) => ({jsonrpc: '2.0', id, error: {code, message}});

function authorized(req) {
  const t = process.env.MCP_TOKEN; if (!t) return true;
  const q = new URL(req.url, 'http://x').searchParams.get('key'); const h = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return q === t || h === t;
}

async function handle(m) {
  const {id, method, params = {}} = m;
  if (method === 'initialize') return ok(id, {protocolVersion: params.protocolVersion || PROTOCOL, capabilities: {tools: {listChanged: false}}, serverInfo: {name: 'native-clouds-bazaar', version: '0.1.0'},
    instructions: 'Bazaar (buying side) of Native Clouds. Call status first. People pay from their own wallet (payment_request → payment_verify). The agent test wallet pays only x402 URLs within server limits and only with confirm:true after the person agrees. Never invent addresses or prices.'});
  if (method === 'ping') return ok(id, {});
  if (method === 'tools/list') return ok(id, {tools: Object.entries(TOOLS).map(([name, t]) => ({name, description: t.description, inputSchema: t.inputSchema}))});
  if (method === 'tools/call') {
    const t = TOOLS[params.name]; if (!t) return err(id, -32602, 'Unknown tool: ' + params.name);
    try { const r = await t.run(params.arguments || {}); return ok(id, {content: [{type: 'text', text: JSON.stringify(r, null, 1)}], structuredContent: r}); }
    catch (e) { return ok(id, {content: [{type: 'text', text: 'Error: ' + (e?.message || String(e))}], isError: true}); }
  }
  if (method === 'resources/list') return ok(id, {resources: []});
  if (method === 'prompts/list') return ok(id, {prompts: []});
  return err(id, -32601, 'Method not found: ' + method);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, mcp-session-id, mcp-protocol-version'); res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!authorized(req)) return res.status(401).json(err(null, -32001, 'Unauthorized: add ?key=<MCP_TOKEN> to the URL'));
  if (req.method === 'GET') return res.status(405).setHeader('Allow', 'POST').json({info: 'Native Clouds Bazaar MCP. POST JSON-RPC here.', tools: Object.keys(TOOLS)});
  if (req.method !== 'POST') return res.status(405).end();
  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json(err(null, -32700, 'Parse error')); } }
  const batch = Array.isArray(body) ? body : [body];
  const out = [];
  for (const m of batch) { if (!m || m.jsonrpc !== '2.0') { out.push(err(m?.id ?? null, -32600, 'Invalid request')); continue; } if (m.id === undefined) continue; out.push(await handle(m)); }
  if (!out.length) return res.status(202).end();
  return res.status(200).json(Array.isArray(body) ? out : out[0]);
}
