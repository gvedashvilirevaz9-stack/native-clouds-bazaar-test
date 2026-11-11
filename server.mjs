import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'web');
const port=Number(process.env.PORT||process.argv[2]||8835);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.mjs':'text/javascript; charset=utf-8','.webp':'image/webp','.wasm':'application/wasm','.ttf':'font/ttf','.pdf':'application/pdf'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/favicon.ico'){res.writeHead(204).end();return;}
  if(url.pathname==='/api/market/region'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({countryCode:null,source:'standalone',note:'Geolocation is not included.'}));return;}
  if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/mcp')){res.writeHead(501,{'Content-Type':'application/json'}).end(JSON.stringify({error:'NOT_INCLUDED_IN_STANDALONE',message:'This package contains only Workshop UI. See HANDOFF-CLAUDE.md.'}));return;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  const p=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!p.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  const data=await fs.readFile(p);res.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(req.method==='HEAD'?undefined:data);
 }catch(e){res.writeHead(e.code==='ENOENT'?404:500).end('File unavailable');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Sunrise Workshop: http://127.0.0.1:${port}\nStop: Ctrl+C. Local-only; no API keys or paid calls.`));
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`Port ${port} is in use. Try: node server.mjs 8836`:e.message);process.exitCode=1});
