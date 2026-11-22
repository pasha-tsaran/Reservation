import http from 'node:http';
import {createReadStream, existsSync, statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {bookingApi} from './booking.js';
const dist=fileURLToPath(new URL('../dist/',import.meta.url));
if (!existsSync(path.join(dist,'index.html'))) throw new Error('Сначала выполните npm run build');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.woff2':'font/woff2','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((req,res)=>bookingApi(req,res,()=>{
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405).end();return;}
  let url;
  try {url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);} catch {res.writeHead(400).end();return;}
  const file=path.resolve(dist,'.'+(url==='/'?'/index.html':url));
  if (!file.startsWith(path.resolve(dist)+path.sep)||!existsSync(file)||!statSync(file).isFile()){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
  res.setHeader('Cache-Control',url.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache');
  if(req.method==='HEAD') res.end(); else createReadStream(file).pipe(res);
}));
server.listen(Number(process.env.PORT || 4173),process.env.HOST || '127.0.0.1',()=>console.log('Polaris Arena: http://127.0.0.1:'+server.address().port));

