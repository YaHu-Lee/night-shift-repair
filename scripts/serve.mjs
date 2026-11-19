import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve('.m0-build'),port=Number(process.env.PORT)||4173;
createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const file=resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+sep)){res.writeHead(404).end();return;}
  try {const bytes=await readFile(file);res.writeHead(200,{'Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[extname(file)]??'application/octet-stream','Cache-Control':'no-store'}).end(bytes);}
  catch{res.writeHead(404).end();}
}).listen(port,'127.0.0.1',()=>console.log('http://127.0.0.1:'+port));
