// Coinbase sign-in for the TEST deployment, with the same routes and session shape as the live portal:
//   GET  /api/my-shop/auth/session   → {authenticated, address, chainId, accountId, provider, expires}
//   POST /api/my-shop/auth/challenge {address}            → {message}   (Sign-In with Ethereum text, Base 8453)
//   POST /api/my-shop/auth/verify    {message, signature} → session     (works for Coinbase Smart Wallet too: ERC-1271/6492)
//   POST /api/my-shop/auth/logout
// In the live portal these routes already exist — this file is NOT carried over (no second auth server).
// The signature only proves "this address is mine". It never moves money.
// Env: AUTH_SECRET (any long random string). Without it a weaker per-project fallback is used (test only).
import crypto from 'node:crypto';
import {createPublicClient, http, getAddress, isAddress} from 'viem';
import {base} from 'viem/chains';
import {createSiweMessage, parseSiweMessage, validateSiweMessage} from 'viem/siwe';

const SECRET = process.env.AUTH_SECRET || crypto.createHash('sha256').update('nc-bazaar-test:' + (process.env.VERCEL_PROJECT_ID || 'local') + ':' + (process.env.VERCEL_GIT_REPO_ID || '')).digest('hex');
const SESSION_DAYS = 7;
const b64u = (s) => Buffer.from(s).toString('base64url');
const sign = (o) => { const p = b64u(JSON.stringify(o)); return p + '.' + crypto.createHmac('sha256', SECRET).update(p).digest('base64url'); };
const unsign = (t) => {
  if (!t || !t.includes('.')) return null; const [p, s] = t.split('.');
  const want = crypto.createHmac('sha256', SECRET).update(p).digest('base64url');
  if (s.length !== want.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want))) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')); return o.exp && o.exp < Date.now() ? null : o; } catch { return null; }
};
const cookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const hostOf = (req) => String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
const httpsOf = (req) => String(req.headers['x-forwarded-proto'] || '').startsWith('https') || !/^(127\.0\.0\.1|localhost)(:|$)/.test(hostOf(req));
const setCookie = (req, name, value, maxAgeSec) => `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${httpsOf(req) ? '; Secure' : ''}`;
const sessionOf = (req) => { const s = unsign(cookies(req).nc_auth); return s ? {authenticated: true, address: s.address, chainId: s.chainId, accountId: s.accountId, provider: s.provider, expires: s.exp} : {authenticated: false}; };
let client = null;
const chain = () => client || (client = createPublicClient({chain: base, transport: http(process.env.BASE_RPC || 'https://mainnet.base.org')}));
const body = (req) => (typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : req.body || {});

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const action = String(req.query?.action || '').toLowerCase();
  try {
    if (action === 'session') return res.status(200).json(sessionOf(req));
    if (req.method !== 'POST') return res.status(405).json({error: 'POST_ONLY'});
    if (action === 'logout') { res.setHeader('Set-Cookie', [setCookie(req, 'nc_auth', '', 0), setCookie(req, 'nc_nonce', '', 0)]); return res.status(200).json({authenticated: false}); }

    if (action === 'challenge') {
      const {address} = body(req); if (!isAddress(String(address || ''))) return res.status(400).json({error: 'ADDRESS_INVALID'});
      const host = hostOf(req); const nonce = crypto.randomBytes(12).toString('hex'); const now = new Date();
      const message = createSiweMessage({domain: host, address: getAddress(address), statement: 'Sign in to Native Clouds. This signature does not move any funds.',
        uri: (httpsOf(req) ? 'https://' : 'http://') + host, version: '1', chainId: base.id, nonce, issuedAt: now, expirationTime: new Date(now.getTime() + 10 * 60e3)});
      res.setHeader('Set-Cookie', setCookie(req, 'nc_nonce', sign({nonce, address: getAddress(address), exp: Date.now() + 10 * 60e3}), 600));
      return res.status(200).json({message});
    }

    if (action === 'verify') {
      const {message, signature} = body(req); const ch = unsign(cookies(req).nc_nonce);
      if (!ch) return res.status(400).json({error: 'CHALLENGE_EXPIRED'});
      if (typeof message !== 'string' || !/^0x[0-9a-fA-F]+$/.test(String(signature || ''))) return res.status(400).json({error: 'BAD_INPUT'});
      const m = parseSiweMessage(message);
      if (m.nonce !== ch.nonce || !m.address || getAddress(m.address) !== ch.address || m.chainId !== base.id) return res.status(400).json({error: 'CHALLENGE_MISMATCH'});
      if (!validateSiweMessage({message: m, domain: hostOf(req), nonce: ch.nonce})) return res.status(400).json({error: 'MESSAGE_INVALID'});
      const ok = await chain().verifyMessage({address: ch.address, message, signature}); // EOA, ERC-1271 and ERC-6492 (smart wallet)
      if (!ok) return res.status(401).json({error: 'SIGNATURE_INVALID'});
      const exp = Date.now() + SESSION_DAYS * 864e5;
      const accountId = 'acct_' + crypto.createHash('sha256').update(ch.address.toLowerCase()).digest('hex').slice(0, 16);
      res.setHeader('Set-Cookie', [setCookie(req, 'nc_auth', sign({address: ch.address, chainId: base.id, accountId, provider: 'coinbase', exp}), SESSION_DAYS * 86400), setCookie(req, 'nc_nonce', '', 0)]);
      return res.status(200).json({authenticated: true, address: ch.address, chainId: base.id, accountId, provider: 'coinbase', expires: exp});
    }
    return res.status(404).json({error: 'UNKNOWN_ACTION'});
  } catch (e) { return res.status(500).json({error: 'AUTH_ERROR', message: String(e?.message || e).slice(0, 200)}); }
}
