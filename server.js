import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const stateFile = path.join(__dirname, '.program-state.json');
const studioFile = path.join(__dirname, '.studio-state.json');
const boardsFile = path.join(__dirname, '.board-state.json');
const preloadFile = path.join(__dirname, '.preload-state.json');
const readJSON=(f,defaultValue)=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch{return defaultValue}};
const saveJSON=(f,value)=>{try{fs.writeFileSync(f,JSON.stringify(value));return true}catch(e){console.error('No se pudo guardar',f,e.message);return false}};
let studio=readJSON(studioFile,{profiles:[],version:0});
let selection={profileId:'',sceneId:'',version:0};
let boards=readJSON(boardsFile,{});
// V18.4: enlaces VDO.Ninja que /output mantiene cargados aunque no estén al aire.
let preload=readJSON(preloadFile,{urls:[],version:0});
if(!preload||!Array.isArray(preload.urls))preload={urls:[],version:0};
// Real-time ephemeral pen strokes; completed strokes still persist through PUT.
const liveBoards = new Map();
const boardStreams = new Map();
const programClients = new Set();
function broadcastProgram() {
  const message = `event: program\ndata: ${JSON.stringify(program)}\n\n`;
  for (const res of programClients) {
    try { res.write(message); } catch { programClients.delete(res); }
  }
}

function broadcastEvent(name, data) {
  const message = `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of programClients) {
    try { res.write(message); } catch { programClients.delete(res); }
  }
}

function broadcastBoard(id, event) {
  const clients = boardStreams.get(id);
  if (!clients) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) { try { res.write(payload); } catch { clients.delete(res); } }
}

function bodyJSON(req,res,cb,max=2*1024*1024){let body='',large=false;req.setEncoding('utf8');req.on('data',c=>{body+=c;if(body.length>max)large=true});req.on('end',()=>{if(large)return json(res,413,{error:'Solicitud demasiado grande'});try{cb(JSON.parse(body||'{}'))}catch(e){json(res,400,{error:e.message})}})}
function findBoard(id){for(const p of studio.profiles||[])for(const s of p.scenes||[])for(const g of s.guests||[])if(g.boardId===id)return g;return null}
const DEFAULT = { scene: null, fadeMs: 300, version: 0 };
let program = { ...DEFAULT };
try {
  const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  if (saved && typeof saved === 'object') program = { ...DEFAULT, ...saved };
} catch {}

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(body);
}

function safeName(name = 'asset') {
  const ext = path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
  const base = path.basename(name, ext).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'asset';
  return `${base}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}${ext}`;
}
const mime = { '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml','.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.m4v':'video/x-m4v' };

const vite = await createViteServer({ 
  server: { 
    middlewareMode: true,
    allowedHosts: ['egg0-control-room.onrender.com', 'localhost', '127.0.0.1']
  } 
});

const server = http.createServer((req, res) => {
  let u;
  try { u = new URL(req.url || '/', 'http://127.0.0.1'); } catch { u = new URL('/', 'http://127.0.0.1'); }
  const pathname = u.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':'*',
      'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type,Cache-Control'
    });
    return res.end();
  }

  // Shared editor selection (preview only). This endpoint never changes the program output.
  if(pathname==='/api/selection'&&req.method==='GET')return json(res,200,selection);
  if(pathname==='/api/selection'&&req.method==='PUT')return bodyJSON(req,res,next=>{
    if(typeof next.profileId!=='string'||typeof next.sceneId!=='string')return json(res,400,{error:'Selección inválida'});
    const chosen=studio.profiles.find(p=>p.id===next.profileId);
    if(studio.profiles.length && (!chosen || (next.sceneId&&!chosen.scenes.some(s=>s.id===next.sceneId))))return json(res,409,{error:'Perfil o escena desconocidos'});
    selection={profileId:next.profileId,sceneId:next.sceneId,version:Date.now()};
    return json(res,200,{ok:true,...selection});
  });
  if(pathname==='/api/studio'&&req.method==='GET')return json(res,200,studio);
  if(pathname==='/api/studio'&&req.method==='PUT')return bodyJSON(req,res,next=>{
    if(!Array.isArray(next.profiles)||next.profiles.length>100)return json(res,400,{error:'Perfiles inválidos'});
    for(const p of next.profiles){if(!Array.isArray(p.scenes)||p.scenes.length>250)return json(res,400,{error:'Escenas inválidas'});for(const scene of p.scenes)if(!Array.isArray(scene.guests)||scene.guests.length>10)return json(res,400,{error:'Máximo 10 participantes por escena'})}
    studio={profiles:next.profiles,version:Date.now()};saveJSON(studioFile,studio);return json(res,200,{ok:true,version:studio.version})
  },12*1024*1024);
  if(pathname.startsWith('/api/board-stream/') && req.method==='GET'){
    const id=pathname.slice('/api/board-stream/'.length);
    if(!/^[a-zA-Z0-9_-]{8,80}$/.test(id)||!findBoard(id))return json(res,404,{error:'Pizarra no encontrada'});
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
    res.write(`data: ${JSON.stringify({type:'snapshot',strokes:boards[id]||[],working:liveBoards.get(id)||null})}\n\n`);
    if(!boardStreams.has(id))boardStreams.set(id,new Set());
    const clients=boardStreams.get(id);clients.add(res);
    const heartbeat=setInterval(()=>{try{res.write(': keepalive\n\n')}catch{}},20000);
    req.on('close',()=>{clearInterval(heartbeat);clients.delete(res);if(!clients.size)boardStreams.delete(id)});
    return;
  }
  if(pathname.startsWith('/api/board-live/') && req.method==='POST'){
    const id=pathname.slice('/api/board-live/'.length);
    if(!/^[a-zA-Z0-9_-]{8,80}$/.test(id))return json(res,400,{error:'Pizarra inválida'});
    const participant=findBoard(id);
    if(!participant)return json(res,404,{error:'Pizarra no encontrada'});
    if(!participant.boardToken||u.searchParams.get('token')!==participant.boardToken)return json(res,403,{error:'Enlace inválido'});
    return bodyJSON(req,res,next=>{
      const line=next.working;
      if(line!==null&&(!line||!Array.isArray(line.points)||line.points.length>5000||JSON.stringify(line).length>90000))return json(res,400,{error:'Trazo inválido'});
      if(line===null)liveBoards.delete(id);else liveBoards.set(id,line);
      broadcastBoard(id,{type:'working',working:line});
      return json(res,200,{ok:true});
    },100000);
  }
  if(pathname.startsWith('/api/board/')){
    const id=pathname.slice('/api/board/'.length);
    if(!/^[a-zA-Z0-9_-]{8,80}$/.test(id))return json(res,400,{error:'Pizarra inválida'});
    const participant=findBoard(id);
    if(!participant)return json(res,404,{error:'Pizarra no encontrada'});
    const editor=u.searchParams.get('token')===participant.boardToken&&!!participant.boardToken;
    if(req.method==='GET')return json(res,200,{strokes:boards[id]||[],editable:editor});
    if(req.method==='PUT'){
      if(!editor)return json(res,403,{error:'Enlace de edición inválido'});
      return bodyJSON(req,res,next=>{
        if(!Array.isArray(next.strokes)||next.strokes.length>2000)return json(res,400,{error:'Demasiados trazos'});
        if(JSON.stringify(next.strokes).length>1024*1024)return json(res,413,{error:'Pizarra demasiado grande'});
        boards[id]=next.strokes;liveBoards.delete(id);saveJSON(boardsFile,boards);broadcastBoard(id,{type:'saved',strokes:boards[id],working:null});return json(res,200,{ok:true,strokes:boards[id]})
      });
    }
    return json(res,405,{error:'Método no permitido'});
  }

  if (pathname === '/api/health') return json(res, 200, { ok:true, version:"18.4", mode:'persistent-output', programVersion:program.version || 0 });


  if(pathname==='/api/program/mode'&&req.method==='POST')return bodyJSON(req,res,next=>{
    if(!['camera','board'].includes(next.mode))return json(res,400,{error:'Modo inválido'});
    if(program.scene?.id!==next.sceneId)return json(res,200,{ok:true,updated:false});
    const guest=(program.scene.guests||[]).find(g=>String(g.id)===String(next.guestId));
    if(!guest)return json(res,404,{error:'Participante no encontrado'});
    guest.mode=next.mode;program.version=Date.now();saveJSON(stateFile,program);broadcastProgram();
    return json(res,200,{ok:true,updated:true,version:program.version});
  });

  if(pathname==='/api/preload'&&req.method==='GET')return json(res,200,preload);
  if(pathname==='/api/preload'&&req.method==='PUT')return bodyJSON(req,res,next=>{
    if(!Array.isArray(next.urls)||next.urls.length>40||next.urls.some(x=>typeof x!=='string'||x.length>2000))return json(res,400,{error:'Lista de precarga inválida'});
    preload={urls:[...new Set(next.urls.map(x=>x.trim()).filter(Boolean))],version:Date.now()};
    saveJSON(preloadFile,preload);broadcastEvent('preload',preload);
    return json(res,200,{ok:true,...preload});
  });
  // Calienta la caché de /output con los archivos de la escena que el operador está preparando.
  if(pathname==='/api/warm'&&req.method==='POST')return bodyJSON(req,res,next=>{
    if(!Array.isArray(next.assets)||next.assets.length>12||next.assets.some(x=>typeof x!=='string'||x.length>2000||!/^(\/uploads\/|https?:\/\/)/.test(x)))return json(res,400,{error:'Lista inválida'});
    broadcastEvent('warm',{assets:next.assets});
    return json(res,200,{ok:true});
  });

  // Persistent push channel: no 250ms polling delay between a TAKE and /output.
  if (pathname === '/api/program/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    req.socket.setNoDelay(true);
    res.write(`event: program\ndata: ${JSON.stringify(program)}\n\n`);
    res.write(`event: preload\ndata: ${JSON.stringify(preload)}\n\n`);
    programClients.add(res);
    const heartbeat = setInterval(() => { try { res.write(': keepalive\n\n'); } catch {} }, 15000);
    req.on('close', () => { clearInterval(heartbeat); programClients.delete(res); });
    return;
  }

  if (pathname === '/api/program' && req.method === 'GET') {
    return json(res, 200, program);
  }

  if (pathname === '/api/program' && req.method === 'POST') {
    let body = '';
    let tooLarge = false;
    req.setEncoding('utf8');
    req.on('data', chunk => {
      if (tooLarge) return;
      body += chunk;
      if (body.length > 12 * 1024 * 1024) tooLarge = true;
    });
    req.on('end', () => {
      if (tooLarge) return json(res, 413, { ok:false, error:'Estado demasiado grande' });
      try {
        const next = JSON.parse(body || '{}');
        if (!next || typeof next !== 'object') throw new Error('Estado inválido');
        program = {
          scene: next.scene ?? null,
          fadeMs: 300,
          version: Number(next.version) || Date.now()
        };
        // Persistir es útil, pero NUNCA debe impedir mandar al aire.
        broadcastProgram();
        fs.writeFile(stateFile, JSON.stringify(program), err => { if (err) console.warn('[V18.4] No se pudo guardar .program-state.json:', err.message); });
        console.log(`[V18.1] AL AIRE -> ${program.scene?.name || 'SIN ESCENA'} | version ${program.version}`);
        return json(res, 200, { ok:true, version:program.version, sceneName:program.scene?.name || null });
      } catch (e) {
        console.error('[V18.1] Error publicando:', e);
        return json(res, 400, { ok:false, error:e?.message || 'JSON inválido' });
      }
    });
    req.on('error', e => {
      if (!res.writableEnded) json(res, 500, { ok:false, error:e?.message || 'Error de red local' });
    });
    return;
  }

  if (pathname === '/api/upload' && req.method === 'POST') {
    const original = u.searchParams.get('name') || 'asset';
    const filename = safeName(original);
    const dest = path.join(uploadsDir, filename);
    const out = fs.createWriteStream(dest);
    let size = 0;
    let failed = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 250 * 1024 * 1024 && !failed) {
        failed = true;
        out.destroy();
        try { fs.unlinkSync(dest); } catch {}
        if (!res.writableEnded) json(res, 413, { ok:false, error:'Archivo demasiado grande (máx. 250 MB)' });
      }
    });
    req.pipe(out);
    out.on('finish', () => {
      if (failed || res.writableEnded) return;
      json(res, 200, { ok:true, url:`/uploads/${encodeURIComponent(filename)}`, name:original, size });
    });
    out.on('error', e => { if (!res.writableEnded) json(res, 500, { ok:false, error:e.message }); });
    return;
  }

  if (pathname.startsWith('/uploads/')) {
    const f = decodeURIComponent(pathname.slice('/uploads/'.length));
    const full = path.join(uploadsDir, path.basename(f));
    if (!fs.existsSync(full)) { res.statusCode = 404; return res.end('Not found'); }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, { 'Content-Type':mime[ext] || 'application/octet-stream', 'Cache-Control':'public, max-age=31536000, immutable' });
    return fs.createReadStream(full).pipe(res);
  }

  vite.middlewares(req, res, () => {
    if (!res.writableEnded) { res.statusCode = 404; res.end('Not found'); }
  });
});

const PORT = Number(process.env.PORT) || 5173;
server.listen(PORT, '0.0.0.0', () => console.log(`SREGGO Control Room V17 escuchando en puerto ${PORT}`));
