import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const uploadsDir=path.join(__dirname,'uploads');
fs.mkdirSync(uploadsDir,{recursive:true});
const stateFile=path.join(__dirname,'.program-state.json');
let program={scene:null,fadeMs:350,version:0};
try{program=JSON.parse(fs.readFileSync(stateFile,'utf8'))||program}catch{}
const clients=new Set();
const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml','.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.m4v':'video/x-m4v'};
function json(res,status,obj){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(obj));}
function safeName(name='asset'){
 const ext=path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g,'').slice(0,10);
 const base=path.basename(name,ext).replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'asset';
 return `${base}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}${ext}`;
}
function controlRoomApi(){return {name:'control-room-api',configureServer(server){server.middlewares.use((req,res,next)=>{
 let u;try{u=new URL(req.url||'/','http://127.0.0.1')}catch{return next()};const pathname=u.pathname;
 if(pathname==='/api/health')return json(res,200,{ok:true,version:11,mode:'vite-integrated-fallback'});
 if(pathname==='/api/program'&&req.method==='GET')return json(res,200,program);
 if(pathname==='/api/program/events'&&req.method==='GET'){
   res.statusCode=200;res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-cache, no-transform');res.setHeader('Connection','keep-alive');res.write(`data: ${JSON.stringify(program)}\n\n`);clients.add(res);
   const hb=setInterval(()=>{try{res.write(': ping\n\n')}catch{}},15000);req.on('close',()=>{clearInterval(hb);clients.delete(res)});return;
 }
 if(pathname==='/api/program'&&req.method==='POST'){
   let body='';req.setEncoding('utf8');req.on('data',c=>{body+=c;if(body.length>8*1024*1024){json(res,413,{ok:false,error:'Estado demasiado grande'});req.destroy()}});
   req.on('end',()=>{if(res.writableEnded)return;try{const nextState=JSON.parse(body||'{}');if(!nextState||typeof nextState!=='object')throw new Error('Estado inválido');program=nextState;fs.writeFileSync(stateFile,JSON.stringify(program));const packet=`data: ${JSON.stringify(program)}\n\n`;for(const c of [...clients]){try{c.write(packet)}catch{clients.delete(c)}}json(res,200,{ok:true,receivers:clients.size,version:program.version||0});}catch(e){json(res,400,{ok:false,error:e.message||'JSON inválido'})}});return;
 }
 if(pathname==='/api/upload'&&req.method==='POST'){
   const original=u.searchParams.get('name')||'asset';const filename=safeName(original);const dest=path.join(uploadsDir,filename);const out=fs.createWriteStream(dest);let size=0,failed=false;
   req.on('data',chunk=>{size+=chunk.length;if(size>250*1024*1024){failed=true;out.destroy();try{fs.unlinkSync(dest)}catch{};json(res,413,{ok:false,error:'Archivo demasiado grande (máx. 250 MB)'});req.destroy()}});req.pipe(out);
   out.on('finish',()=>{if(failed||res.writableEnded)return;json(res,200,{ok:true,url:`/uploads/${encodeURIComponent(filename)}`,name:original,size})});out.on('error',e=>{if(!res.writableEnded)json(res,500,{ok:false,error:e.message})});return;
 }
 if(pathname.startsWith('/uploads/')){
   const f=decodeURIComponent(pathname.slice('/uploads/'.length));const full=path.join(uploadsDir,path.basename(f));if(!fs.existsSync(full)){res.statusCode=404;return res.end('Not found')};const ext=path.extname(full).toLowerCase();res.statusCode=200;res.setHeader('Content-Type',mime[ext]||'application/octet-stream');res.setHeader('Cache-Control','no-cache');return fs.createReadStream(full).pipe(res);
 }
 next();
});}}}
export default defineConfig({server:{host:'0.0.0.0',port:5173,strictPort:true},plugins:[controlRoomApi()]});
