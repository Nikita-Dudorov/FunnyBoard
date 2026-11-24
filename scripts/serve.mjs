import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../src/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.wav':'audio/wav','.woff2':'font/woff2'};
const port=Number(process.env.PORT)||4173;
createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');const name=decodeURIComponent(url.pathname);
    const file=path.resolve(root,`.${name==='/'?'/index.html':name}`);
    if(!file.startsWith(root))throw new Error('Invalid path');
    const body=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(body);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`FunnyBoard preview: http://localhost:${port}`));
