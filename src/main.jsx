import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import OBSWebSocket from 'obs-websocket-js';
import './styles.css';
import './theme-egg.css';

const obs=new OBSWebSocket();
const outputUrl=`${window.location.origin}/output`;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
const uid=()=>Math.random().toString(36).slice(2,9);
const normalizeVdo=url=>{const s=String(url||'').trim();if(!s)return'';try{const u=new URL(s);if(/(^|\.)vdo\.ninja$/i.test(u.hostname)){if(!u.searchParams.has('autostart'))u.searchParams.set('autostart','1');if(!u.searchParams.has('cleanoutput')&&!u.searchParams.has('clean'))u.searchParams.set('cleanoutput','');if(!u.searchParams.has('transparent'))u.searchParams.set('transparent','');}return u.toString()}catch{return s}};
const load=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}};
const blankGuests=()=>[];
const newGuest=(count=0)=>({id:uid(),name:`Participante ${count+1}`,url:'',visible:true,audio:true,mode:'camera',boardId:uid()+uid(),boardToken:uid()+uid()+uid(),x:50+(count%5)*70,y:50+(count%4)*60,w:640,h:360});
const mediaScene=(name,participantsEnabled=false)=>({id:uid(),name,type:'media',asset:null,fit:'cover',loop:true,muted:true,participantsEnabled,background:null,bgOpacity:35,guests:blankGuests(),layers:['background','media','participants']});
const starter=()=>[
  mediaScene('INTRO'),
  mediaScene('CAMARA'),
  mediaScene('JUEGO'),
  mediaScene('PARTICIPANTES',true),
  mediaScene('BRB'),
  mediaScene('FINAL')
];
const normalizeScene=s=>{
  const base={...mediaScene(s?.name||'ESCENA'),...s,type:'media'};
  if(s?.type==='participants') base.participantsEnabled=true;
  if(!Array.isArray(base.guests)) base.guests=blankGuests();
  base.guests=base.guests.slice(0,10).filter(Boolean).map(g=>({...newGuest(),...g,id:String(g.id??uid()),boardId:g.boardId||uid()+uid(),boardToken:g.boardToken||uid()+uid()+uid(),mode:g.mode||'camera'}));
  if(base.participantsEnabled==null) base.participantsEnabled=false;
  if(!Array.isArray(base.layers)) base.layers=['background','media','participants'];
  base.layers=['background','media','participants'].filter(x=>base.layers.includes(x)).concat(base.layers.filter(x=>!['background','media','participants'].includes(x)));
  return base;
};
const loadScenes=()=>{const raw=load('v8Scenes',starter());return Array.isArray(raw)&&raw.length?raw.map(normalizeScene):starter()};
const profileFromLegacy=()=>[{id:uid(),name:'Perfil inicial (V16)',scenes:loadScenes()}];
const loadProfiles=()=>{const v=load('v17Profiles',null);return Array.isArray(v)&&v.length?v.map(p=>({...p,scenes:(p.scenes||[]).map(normalizeScene)})):profileFromLegacy()};

async function uploadFile(file){
 if(!file)return null;
 const r=await fetch(`/api/upload?name=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});
 const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.error||`Upload HTTP ${r.status}`);return {url:d.url,name:file.name,type:file.type||''};
}
async function publish(state){
 const r=await fetch('/api/program',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify(state)});
 const d=await r.json().catch(()=>null);
 if(!r.ok||!d?.ok)throw new Error(d?.error||`No se pudo enviar al aire (HTTP ${r.status})`);
 return d;
}

function isVideo(asset){return !!asset&&(((asset.type||'').startsWith('video/'))||/\.(mp4|webm|mov|m4v)$/i.test(asset.url||''));}

function SceneRenderer({scene,interactive=false,externalVdo=false}){
 if(!scene)return <div className="empty-program"><span>Sin escena</span></div>;
 // scene.layers is stored BACK -> FRONT. Higher index = visually in front.
 const layers=Array.isArray(scene.layers)?scene.layers:['background','media','participants'];
 const hasParticipants=!!scene.participantsEnabled;
 const renderLayer=(key,index)=>{
   const layerStyle={zIndex:index+1};
   if(key==='background') return scene.background?.url?<img key="background" className="layer-bg" src={scene.background.url} alt="" style={{...layerStyle,opacity:clamp(scene.bgOpacity??35,0,100)/100}}/>:null;
   if(key==='media'){
     const a=scene.asset;
     return a?(isVideo(a)?<video key={`media-${a.url}`} className={`media ${scene.fit||'cover'}`} style={layerStyle} src={a.url} autoPlay playsInline loop={scene.loop!==false} muted={scene.muted!==false} controls={interactive}/>:<img key={`media-${a.url}`} className={`media ${scene.fit||'cover'}`} style={layerStyle} src={a.url} alt=""/>):null;
   }
   if(key==='participants') return hasParticipants?<div key="participants-layer" className="participants-layer" style={layerStyle}><ParticipantsOutput scene={{...scene,background:null}} interactive={interactive} externalVdo={externalVdo}/></div>:null;
   return null;
 };
 const anyVisual=!!scene.asset||!!scene.background?.url||hasParticipants;
 return <div className="scene-composite">{layers.map(renderLayer)}{!anyVisual&&<div className="empty-program"><span>{scene.name}<small>Carga un archivo para ver el preview</small></span></div>}</div>;
}
function ParticipantsOutput({scene,interactive=false,externalVdo=false}){
 return <div className="participants-output">
   {scene.background?.url&&<img className="p-bg" src={scene.background.url} alt="" style={{opacity:clamp(scene.bgOpacity??35,0,100)/100}}/>}
   {(scene.guests||[]).filter(g=>g.visible).map(g=><div className="p-guest" key={`${g.id}-${g.url}`} style={{left:`${g.x/19.2}%`,top:`${g.y/10.8}%`,width:`${g.w/19.2}%`,height:`${g.h/10.8}%`}}>{g.mode==='board'?<BoardViewer boardId={g.boardId}/>:g.url&&!externalVdo?<iframe src={normalizeVdo(g.url)} allow="autoplay; fullscreen; picture-in-picture" allowTransparency="true" loading="eager" title={g.name} style={{pointerEvents:interactive?'auto':'none'}}/>:null}</div>)}
 </div>;
}
const preloadScene=scene=>{const urls=[scene?.asset&&!isVideo(scene.asset)?scene.asset.url:null,scene?.background?.url].filter(Boolean);if(!urls.length)return Promise.resolve();const loads=urls.map(u=>{const i=new Image();i.src=u;return(i.decode?i.decode():Promise.resolve()).catch(()=>{})});return Promise.race([Promise.all(loads),new Promise(r=>setTimeout(r,2500))])};
// V18.3: ABSOLUTE DIRECT CUT. No transition or transition layers in /output.
// A newly received program replaces the previous composition in the same React commit.

// V18.4: los iframes de VDO.Ninja viven en un pool persistente. Un iframe movido en el DOM se recarga,
// así que se mantienen montados (ocultos si no están al aire) y solo cambian de posición.

// V18.11: panel de diagnóstico. Abre /output?debug=1 para ver si los iframes de VDO.Ninja se recrean.
const DBG=typeof location!=='undefined'&&new URLSearchParams(location.search).has('debug');
const dbgLog=[],dbgStat={},dbgRefs={};
const PARK=typeof location!=='undefined'?(new URLSearchParams(location.search).get('park')||''):'';
const NOMUTE=typeof location!=='undefined'&&new URLSearchParams(location.search).has('nomute');
const dlog=(label,msg,kind)=>{if(!DBG)return;const st=dbgStat[label]=dbgStat[label]||{mounts:0,loads:0,state:'—'};if(kind==='mount')st.mounts++;if(kind==='load')st.loads++;if(kind==='state')st.state=msg;dbgLog.unshift(`${(performance.now()/1000).toFixed(1)}s  ${label}: ${msg}`);dbgLog.length=Math.min(dbgLog.length,9)};
function DebugPanel(){
 const [,tick]=useState(0);const [show,setShow]=useState(true);useEffect(()=>{const t=setInterval(()=>tick(n=>n+1),500);const k=e=>{if(e.key==='d'||e.key==='D')setShow(v=>!v)};window.addEventListener('keydown',k);return()=>{clearInterval(t);window.removeEventListener('keydown',k)}},[]);
 if(!show)return null;
 return <pre style={{position:'fixed',left:6,bottom:6,zIndex:99999,margin:0,padding:6,background:'rgba(0,0,0,.85)',color:'#7CFFB2',font:'10px/1.3 ui-monospace,Consolas,monospace',maxWidth:'42vw',maxHeight:'45vh',overflow:'hidden',pointerEvents:'none',whiteSpace:'pre-wrap',wordBreak:'break-all'}}>{`PÁGINA hace ${(performance.now()/1000).toFixed(1)}s · modo park=${PARK||'normal'} · tecla D = ocultar\n`}{Object.entries(dbgStat).map(([k,v])=>{const el=dbgRefs[k]?.current;let g='';if(el){const b=el.getBoundingClientRect();g=`  caja:${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}x${Math.round(b.height)} op:${getComputedStyle(el).opacity} z:${getComputedStyle(el).zIndex}`}return `${k}  montajes:${v.mounts}  cargas:${v.loads}  ${v.state}${g}\n`+(v.stats?`   stats (hace ${((performance.now()-v.statsAt)/1000).toFixed(0)}s): ${v.stats}\n`:'')}).join('')}{'\n'}{dbgLog.join('\n')}</pre>;
}
function VdoFrame({src,geom,z}){
 const ref=useRef(null),slotRef=useRef(null);const active=!!geom;
 const label=(()=>{try{const u=new URL(src);return u.searchParams.get('view')||u.searchParams.get('push')||u.searchParams.get('room')||src.slice(-14)}catch{return src.slice(-14)}})();
 useEffect(()=>{dlog(label,'MONTADO (iframe nuevo)','mount');if(DBG)dbgRefs[label]=slotRef;return()=>{dlog(label,'DESMONTADO');if(DBG&&dbgRefs[label]===slotRef)delete dbgRefs[label]}},[]);
 useEffect(()=>{if(!DBG)return;const t=setInterval(()=>{try{const w=ref.current?.contentWindow;w?.postMessage({getStats:true},'*');w?.postMessage({getDetailedState:true},'*')}catch{}},2000);return()=>clearInterval(t)},[]);
 useEffect(()=>{if(!DBG)return;let last='';const h=e=>{if(e.source!==ref.current?.contentWindow)return;const d=e.data;const act=d&&typeof d==='object'?String(d.action||Object.keys(d)[0]||''):'';let t='';try{t=JSON.stringify(d)}catch{t=String(d)}
   // VDO.Ninja manda estadísticas cada segundo: se guardan en una sola línea en vez de llenar el log.
   if(/^view-stats/.test(act))return;
   if(/stats|detail/i.test(act)){const st=dbgStat[label]=dbgStat[label]||{mounts:0,loads:0,state:'—'};st.stats=t.slice(0,420);st.statsAt=performance.now();return}
   if(t===last)return;last=t;dlog(label,'VDO: '+t.slice(0,110))};window.addEventListener('message',h);return()=>window.removeEventListener('message',h)},[]);
 useEffect(()=>{dlog(label,active?'AL AIRE (visible)':'OCULTO (precargado)','state')},[active]);
 const sendMute=()=>{if(NOMUTE)return;try{ref.current?.contentWindow?.postMessage({mute:!active},'*')}catch{}};
 useEffect(sendMute,[active]);
 const style=active?{left:`${geom.x/19.2}%`,top:`${geom.y/10.8}%`,width:`${geom.w/19.2}%`,height:`${geom.h/10.8}%`,opacity:1,zIndex:z}:PARK==='faint'?{left:0,top:0,width:320,height:180,opacity:.02,zIndex:z}:PARK==='tiny'?{left:0,top:0,width:16,height:9,opacity:1,zIndex:-1}:{left:0,top:0,width:'100%',height:'100%',opacity:1,zIndex:-1};
 // V18.12: parqueado a tamaño completo (no 320x180) para que VDO.Ninja no baje resolución/fps al ocultarse.
 // V18.11: oculto = opacidad 1 pero DETRÁS del fondo opaco de la escena (z-index negativo). Con opacity:0 Chrome congelaba el video.
 return <div className="vdo-slot" ref={slotRef} style={style}><iframe ref={ref} src={src} onLoad={()=>{dlog(label,'iframe CARGADO (onload)','load');sendMute()}} allow="autoplay; fullscreen; picture-in-picture" allowTransparency="true" loading="eager" title="vdo" style={{pointerEvents:'none'}}/></div>;
}
// Evita que alguien pegue la URL de /output como "participante": se mostraría a sí misma sin fin.
const isSelfOutput=k=>{try{const u=new URL(k);return u.origin===location.origin&&/^\/output\/?$/.test(u.pathname)}catch{return false}};
function VdoPool({scene,preloadUrls}){
 const active=new Map();
 if(scene?.participantsEnabled)for(const g of scene.guests||[])if(g.visible&&g.mode!=='board'&&g.url){const k=normalizeVdo(g.url);if(!isSelfOutput(k)&&!active.has(k))active.set(k,g)}
 // V18.11: los participantes de la escena anterior se quedan conectados (ocultos) un corte más,
 // para poder volver a esa escena sin esperar a que VDO.Ninja se reconecte.
 const hist=useRef({scene:null,activeKeys:[],kept:[]});
 if(hist.current.scene!==scene)hist.current={scene,activeKeys:[...active.keys()],kept:hist.current.activeKeys};
 const wanted=PARK==='none'?[...active.keys()]:[...new Set([...preloadUrls.map(normalizeVdo).filter(k=>k&&!isSelfOutput(k)),...active.keys(),...hist.current.kept])];
 // V18.12: orden ESTABLE. Si cambia el orden de los hijos, React mueve el iframe en el DOM y el navegador lo recarga
 // (VDO.Ninja se reconecta y la cámara se ve pegada/negra). Los nuevos se añaden al final y nunca se reordenan.
 const order=useRef([]);
 {const w=new Set(wanted);order.current=order.current.filter(k=>w.has(k));for(const k of wanted)if(!order.current.includes(k))order.current.push(k)}
 const keys=order.current;
 const layers=Array.isArray(scene?.layers)?scene.layers:['background','media','participants'];
 const z=(layers.indexOf('participants')+1)||3;
 return <div className="vdo-pool">{keys.map(k=><VdoFrame key={k} src={k} geom={active.get(k)} z={z}/>)}</div>;
}
// V18.4: calienta caché/decodificación de archivos de la escena que se está preparando.
const warmCache=new Map();
function warmAsset(u){
 if(!u||warmCache.has(u))return;
 let el;
 if(/\.(mp4|webm|mov|m4v)(\?|$)/i.test(u)){el=document.createElement('video');el.preload='auto';el.muted=true;el.src=u;el.load()}
 else{el=new Image();el.src=u;if(el.decode)el.decode().catch(()=>{})}
 warmCache.set(u,el);
 if(warmCache.size>16){const k=warmCache.keys().next().value;const old=warmCache.get(k);if(old?.tagName==='VIDEO'){old.removeAttribute('src');old.load()}warmCache.delete(k)}
}
function Output(){
 const [scene,setScene]=useState(null);
 const versionRef=useRef(0);
 const [preloadUrls,setPreloadUrls]=useState([]);
 const tokenRef=useRef(0);
 useEffect(()=>{
   let stopped=false;
   let fallback=null;
   const accept=payload=>{
     if(stopped||!payload?.scene)return;
     const version=Number(payload.version)||0;
     if(version && version<=versionRef.current)return;
     if(version)versionRef.current=version;
     // V18.4: la escena anterior sigue visible hasta que las imágenes nuevas estén decodificadas.
     // Es un corte directo (sin fade): evita el negro mientras se descarga la imagen.
     const token=++tokenRef.current;
     preloadScene(payload.scene).then(()=>{if(stopped||token!==tokenRef.current)return;setScene(payload.scene)});
   };
   const refresh=async()=>{try{
     const r=await fetch('/api/program',{cache:'no-store'});
     if(r.ok)accept(await r.json());
   }catch{}};
   refresh();
   fetch('/api/preload',{cache:'no-store'}).then(r=>r.json()).then(d=>{if(!stopped&&Array.isArray(d.urls))setPreloadUrls(d.urls)}).catch(()=>{});
   const stream=new EventSource('/api/program/events');
   stream.addEventListener('preload',e=>{try{const d=JSON.parse(e.data);if(Array.isArray(d.urls))setPreloadUrls(d.urls)}catch{}});
   stream.addEventListener('warm',e=>{try{for(const u of JSON.parse(e.data).assets||[])warmAsset(u)}catch{}});
   stream.addEventListener('program',e=>{try{accept(JSON.parse(e.data))}catch{}});
   stream.onerror=()=>{if(!fallback)fallback=setInterval(()=>{if(stream.readyState!==EventSource.OPEN)refresh()},1500)};
   return()=>{stopped=true;stream.close();if(fallback)clearInterval(fallback)};
 },[]);
 return <div className="program-root output-direct-cut">
   {scene?<SceneRenderer scene={scene} externalVdo/>:<div className="empty-program"><span>Sin escena</span></div>}
   <VdoPool scene={scene} preloadUrls={preloadUrls}/>
   {DBG&&<DebugPanel/>}
 </div>;
}

function PreloadPanel({profile,selectedScene,say,mode,setMode}){
 const auto=mode!=='manual';
 const [urls,setUrls]=useState([]);const ver=useRef(0),lastEdit=useRef(0);
 useEffect(()=>{let stopped=false;const pull=async()=>{try{const r=await fetch('/api/preload',{cache:'no-store'});const d=await r.json();if(stopped||!Array.isArray(d.urls))return;if(d.version!==ver.current&&Date.now()-lastEdit.current>1500){ver.current=d.version;setUrls(d.urls)}}catch{}};pull();const t=setInterval(pull,2500);return()=>{stopped=true;clearInterval(t)}},[]);
 const save=async next=>{const clean=[...new Set(next)];lastEdit.current=Date.now();setUrls(clean);try{const r=await fetch('/api/preload',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({urls:clean})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Error');ver.current=d.version}catch(e){say(e.message||'No se pudo guardar la precarga')}};
 const guestsOf=sc=>(sc.guests||[]).filter(g=>g.url&&g.mode!=='board').map(g=>({name:g.name,url:normalizeVdo(g.url),scene:sc.name}));
 const all=(profile?.scenes||[]).flatMap(guestsOf);
 const unique=[];for(const g of all){const f=unique.find(u=>u.url===g.url);if(f)f.scenes.push(g.scene);else unique.push({...g,scenes:[g.scene]})}
 const known=new Set(unique.map(u=>u.url));
 const others=urls.filter(u=>!known.has(normalizeVdo(u)));
 const on=u=>urls.some(x=>normalizeVdo(x)===u);
 const toggle=u=>save(on(u)?urls.filter(x=>normalizeVdo(x)!==u):[...urls,u]);
 return <section><div className="card"><h2>Precarga de participantes</h2><p className="muted">Los participantes precargados se mantienen conectados y ocultos dentro de <code>/output</code>. Al enviar una escena al aire solo cambian de posición: no se recargan y no aparece pantalla negra.</p>
 <div className="row wrap" style={{marginBottom:6}}>{[['always','Siempre cargados'],['auto','Automático (escena seleccionada)'],['manual','Manual']].map(([k,l])=><button key={k} className={mode===k?'primary':''} onClick={()=>setMode(k)}>{l}</button>)}</div>
 <p className="hint">{mode==='always'?'Todos los participantes de las escenas con participantes de este perfil se mantienen conectados y ocultos en /output, estén o no en la escena seleccionada. Si un participante aparece en varias escenas, usa el mismo enlace para que cuente como una sola conexión.':mode==='auto'?'Solo se conectan los participantes de la escena que tienes seleccionada.':'Tú eliges qué participantes se precargan.'}</p>
 <div className="row wrap" style={{marginTop:12}}><button className="primary" disabled={auto||!selectedScene} onClick={()=>{const add=guestsOf(selectedScene).map(g=>g.url);save([...urls,...add]);say(add.length?`Precargando ${add.length} participante(s) de “${selectedScene.name}”`:'Esa escena no tiene participantes con enlace')}}>Precargar escena seleccionada{selectedScene?` · ${selectedScene.name}`:''}</button><button disabled={auto} onClick={()=>save([...urls,...unique.map(u=>u.url)])}>Precargar todos del perfil</button><button className="danger" disabled={auto} onClick={()=>save([])}>Vaciar precarga</button></div><p className="hint">Activos: <b>{urls.length}</b>. {auto?'La lista la gestiona el modo seleccionado. ':''}Cada participante precargado consume ancho de banda y CPU en la PC de OBS.</p></div>
 <div className="card"><h2>Participantes del perfil — {profile?.name}</h2><div className="source-list">{unique.map(u=><label key={u.url} className="check preload-row"><input type="checkbox" disabled={auto} checked={on(u.url)} onChange={()=>toggle(u.url)}/><span><b>{u.name||'Participante'}</b><small style={{display:'block',color:'#817c88'}}>{u.scenes.join(' · ')}</small></span><em className={on(u.url)?'preload-on':'preload-off'}>{on(u.url)?'PRECARGADO':'—'}</em></label>)}{!unique.length&&<p className="muted">Ninguna escena de este perfil tiene participantes con enlace VDO.Ninja.</p>}</div></div>
 {others.length>0&&<div className="card"><h2>Otros enlaces precargados</h2><div className="source-list">{others.map(u=><div key={u}><code style={{wordBreak:'break-all',fontSize:11}}>{u}</code><button disabled={auto} onClick={()=>save(urls.filter(x=>x!==u))}>Quitar</button></div>)}</div></div>}</section>;
}
function BoardCanvas({strokes,working,background='#ffffff'}){
 const ref=useRef(null);
 useEffect(()=>{const c=ref.current;if(!c)return;const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle=background;ctx.fillRect(0,0,c.width,c.height);for(const line of [...strokes,...(working?[working]:[])]){const pts=line.points||[];if(!pts.length)continue;ctx.strokeStyle=line.color||'#111';ctx.fillStyle=line.color||'#111';ctx.lineWidth=line.size||4;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(const point of pts.slice(1))ctx.lineTo(point[0],point[1]);if(pts.length===1){ctx.arc(pts[0][0],pts[0][1],Math.max(1,ctx.lineWidth/2),0,Math.PI*2);ctx.fill()}else ctx.stroke()}},[strokes,working,background]);return <canvas ref={ref} width="1280" height="720" className="board-canvas"/>;
}
function BoardViewer({boardId}){
 const [strokes,setStrokes]=useState([]),[working,setWorking]=useState(null);
 useEffect(()=>{
  if(!boardId)return;
  let stopped=false;
  const refresh=async()=>{try{const r=await fetch(`/api/board/${encodeURIComponent(boardId)}`,{cache:'no-store'});if(r.ok){const b=await r.json();if(!stopped)setStrokes(b.strokes||[])}}catch{}};
  refresh();
  const stream=new EventSource(`/api/board-stream/${encodeURIComponent(boardId)}`);
  stream.onmessage=e=>{try{const update=JSON.parse(e.data);if(stopped)return;if(update.type==='snapshot'||update.type==='saved')setStrokes(update.strokes||[]);if('working' in update)setWorking(update.working)}catch{}};
  // Fallback for temporary disconnects and older deployments.
  const poll=setInterval(()=>{if(stream.readyState!==EventSource.OPEN)refresh()},1000);
  return()=>{stopped=true;stream.close();clearInterval(poll)};
 },[boardId]);
 return <BoardCanvas strokes={strokes} working={working}/>;
}
function BoardPage(){
 const id=location.pathname.split('/')[2],token=new URLSearchParams(location.search).get('token')||'';
 const [strokes,setStrokes]=useState([]),[working,setWorking]=useState(null),[color,setColor]=useState('#161616'),[size,setSize]=useState(5),[error,setError]=useState('');
 const frame=useRef(null),workingRef=useRef(null),strokesRef=useRef([]),lastLiveRef=useRef(0);
 const fetchBoard=async()=>{const r=await fetch(`/api/board/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`,{cache:'no-store'});if(!r.ok)throw Error('Enlace inválido o caducado');const b=await r.json();strokesRef.current=b.strokes||[];setStrokes(strokesRef.current)};
 useEffect(()=>{let active=true;const poll=async()=>{try{await fetchBoard();if(active)setError('')}catch(e){if(active)setError(e.message)}};poll();const t=setInterval(()=>{if(!workingRef.current)poll()},900);return()=>{active=false;clearInterval(t)}},[id,token]);
 const point=e=>{const rect=frame.current.getBoundingClientRect();return [Math.round((e.clientX-rect.left)/rect.width*1280),Math.round((e.clientY-rect.top)/rect.height*720)]};
 const sendLive=line=>{fetch(`/api/board-live/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({working:line}),keepalive:false}).catch(()=>{});};
 const down=e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);const line={color,size,points:[point(e)]};workingRef.current=line;setWorking(line);sendLive(line);lastLiveRef.current=Date.now()};
 const move=e=>{if(!workingRef.current)return;const line={...workingRef.current,points:[...workingRef.current.points,point(e)]};workingRef.current=line;setWorking(line);if(Date.now()-lastLiveRef.current>=45){lastLiveRef.current=Date.now();sendLive(line)}};
 const save=async(next)=>{const r=await fetch(`/api/board/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({strokes:next})});if(!r.ok)throw Error('No se pudo guardar la pizarra');const data=await r.json();strokesRef.current=data.strokes;setStrokes(data.strokes)};
 const up=async()=>{const line=workingRef.current;if(!line)return;workingRef.current=null;setWorking(null);sendLive(line);try{await save([...strokesRef.current,line])}catch(e){setError(e.message);sendLive(null)}};
 return <div className="board-page"><header><div><div className="eyebrow">EGG0LIMPIADAS · PIZARRA EN DIRECTO</div><h1>Tu pizarra</h1></div></header><div className="board-toolbar"><label>Color <input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label><label>Grosor <input type="range" min="1" max="30" value={size} onChange={e=>setSize(Number(e.target.value))}/></label><button onClick={()=>setColor('#ffffff')}>Borrador blanco</button><button onClick={()=>save(strokesRef.current.slice(0,-1)).catch(e=>setError(e.message))}>Deshacer</button><button className="danger" onClick={()=>{if(window.confirm('¿Borrar todo?'))save([]).catch(e=>setError(e.message))}}>Limpiar</button></div>{error&&<div className="notice">{error}</div>}<div ref={frame} className="board-drawing" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}><BoardCanvas strokes={strokes} working={working}/></div><p className="muted">Tus dibujos aparecen en directo cuando producción muestra tu pizarra. No cierres esta pestaña durante la actividad.</p></div>
}

function App(){
 const [profiles,setProfiles]=useState(loadProfiles);
 const lastLocalEdit=useRef(Date.now()),lastRemoteVersion=useRef(0),fromRemote=useRef(false);
 const [studioReady,setStudioReady]=useState(false);
 const updateProfiles=change=>{lastLocalEdit.current=Date.now();setProfiles(change)};
 const [profileId,setProfileId]=useState(()=>load('v17SelectedProfile',null));
 const profile=profiles.find(p=>p.id===profileId)||profiles[0];
 const scenes=profile?.scenes||[];
 const setScenes=fn=>updateProfiles(prev=>prev.map(p=>p.id===(profile?.id)?{...p,scenes:typeof fn==='function'?fn(p.scenes):fn}:p));
 const [selected,setSelected]=useState('');
 const selectionReady=useRef(false), remoteSelection=useRef(false), lastSelectionVersion=useRef(0), lastSelectionEdit=useRef(0);
 const [tab,setTab]=useState('En vivo');
 const [dirty,setDirty]=useState(false),[notice,setNotice]=useState(''),[sending,setSending]=useState(false),[liveName,setLiveName]=useState('—'),[bridgeOk,setBridgeOk]=useState(false);
 const [host,setHost]=useState(localStorage.getItem('obsHost')||'ws://127.0.0.1:4455');
 const [password,setPassword]=useState(localStorage.getItem('obsPassword')||'');
 const [connected,setConnected]=useState(false),[obsStatus,setObsStatus]=useState('Desconectado');
 const [streaming,setStreaming]=useState(false),[recording,setRecording]=useState(false),[inputs,setInputs]=useState([]);
 const tabs=['En vivo','Precarga','Perfiles','Audio','Fuentes','Configuración'];
 const scene=scenes.find(s=>s.id===selected)||scenes[0];

 useEffect(()=>localStorage.setItem('v17SelectedProfile',profile?.id||''),[profile?.id]);
 // Profile and scene selection belongs to the shared production preview, not localStorage.
 const choose=(pid,sid)=>{lastSelectionEdit.current=Date.now();setProfileId(pid);setSelected(sid||'')};
 useEffect(()=>{let stopped=false;const pull=async()=>{try{
   const r=await fetch('/api/selection',{cache:'no-store'});if(!r.ok)return;
   const d=await r.json();if(stopped)return;
   if(d.version>lastSelectionVersion.current && Date.now()-lastSelectionEdit.current>1300){
     lastSelectionVersion.current=d.version;
     if(d.profileId){remoteSelection.current=true;setProfileId(d.profileId);setSelected(d.sceneId||'')}
   }
   selectionReady.current=true;
 }catch{}};pull();const timer=setInterval(pull,800);return()=>{stopped=true;clearInterval(timer)}},[]);
 useEffect(()=>{if(!selectionReady.current||!profile?.id)return;
   if(remoteSelection.current){remoteSelection.current=false;return}
   const timer=setTimeout(async()=>{try{
     const r=await fetch('/api/selection',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({profileId:profile.id,sceneId:scene?.id||''})});
     if(r.ok){const d=await r.json();lastSelectionVersion.current=d.version}
   }catch{}},300);return()=>clearTimeout(timer)
 },[profile?.id,scene?.id]);

 useEffect(()=>localStorage.setItem('v17Profiles',JSON.stringify(profiles)),[profiles]);
 useEffect(()=>{if(fromRemote.current){fromRemote.current=false;return}if(!studioReady||!profiles.length)return;const t=setTimeout(()=>fetch('/api/studio',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({profiles,version:Date.now()})}).catch(()=>{}),450);return()=>clearTimeout(t)},[profiles]);
 useEffect(()=>{let stopped=false;const pull=async()=>{try{const r=await fetch('/api/studio',{cache:'no-store'});const d=await r.json();if(stopped)return;setStudioReady(true);if(!Array.isArray(d.profiles)||!d.profiles.length)return;if(d.version>lastRemoteVersion.current&&Date.now()-lastLocalEdit.current>2500){lastRemoteVersion.current=d.version;fromRemote.current=true;setProfiles(d.profiles.map(p=>({...p,scenes:(p.scenes||[]).map(normalizeScene)})))}}catch{if(!stopped)setStudioReady(true)}};pull();const t=setInterval(pull,2200);return()=>{stopped=true;clearInterval(t)}},[]);
 useEffect(()=>{fetch('/api/health',{cache:'no-store'}).then(r=>r.json()).then(d=>setBridgeOk(!!d?.ok)).catch(()=>setBridgeOk(false));fetch('/api/program',{cache:'no-store'}).then(r=>r.json()).then(d=>setLiveName(d?.scene?.name||'—')).catch(()=>{})},[]);
 useEffect(()=>{const close=()=>{setConnected(false);setObsStatus('Desconectado')};obs.on('ConnectionClosed',close);return()=>obs.removeAllListeners()},[]);
 const say=m=>{setNotice(m);setTimeout(()=>setNotice(''),3200)};
 const [preloadMode,setPreloadMode]=useState(()=>{const m=load('preloadMode','always');return['always','auto','manual'].includes(m)?m:'always'});
 useEffect(()=>{try{localStorage.setItem('preloadMode',JSON.stringify(preloadMode))}catch{}},[preloadMode]);
 // V18.11: al seleccionar una escena (antes de enviarla), /output ya calienta sus archivos.
 const warmKey=[scene?.asset?.url,scene?.background?.url].filter(Boolean).join('|');
 useEffect(()=>{if(!warmKey)return;const t=setTimeout(()=>fetch('/api/warm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assets:warmKey.split('|')})}).catch(()=>{}),250);return()=>clearTimeout(t)},[scene?.id,warmKey]);
 const guestUrls=sc=>(sc.guests||[]).filter(g=>g.url&&g.mode!=='board').map(g=>normalizeVdo(g.url)).filter(k=>!isSelfOutput(k));
 const preloadKey=scene&&scene.participantsEnabled?[...new Set(guestUrls(scene))].join('\n'):'';
 const alwaysKey=[...new Set((profile?.scenes||[]).filter(sc=>sc.participantsEnabled).flatMap(guestUrls))].slice(0,40).join('\n');
 // 'always': todos los participantes del perfil siempre conectados · 'auto': solo los de la escena seleccionada · 'manual': lo decides tú
 const wantKey=preloadMode==='always'?(studioReady&&profile?alwaysKey:null):preloadMode==='auto'?(scene?preloadKey:null):null;
 useEffect(()=>{if(wantKey===null)return;const t=setTimeout(()=>fetch('/api/preload',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({urls:wantKey?wantKey.split('\n'):[]})}).catch(()=>{}),500);return()=>clearTimeout(t)},[wantKey]);
 const patchScene=(id,p)=>{setScenes(v=>v.map(s=>s.id===id?{...s,...p}:s));setDirty(true)};
 const selectScene=id=>{choose(profile.id,id);setTab('Perfiles')};
 const addProfile=()=>{const name=window.prompt('Nombre del perfil','Nuevo perfil');if(!name?.trim())return;const id=uid();updateProfiles(v=>[...v,{id,name:name.trim(),scenes:[mediaScene('NUEVA ESCENA',true)]}]);choose(id,'');};
 const renameProfile=()=>{const name=window.prompt('Nuevo nombre',profile.name);if(name?.trim())updateProfiles(v=>v.map(p=>p.id===profile.id?{...p,name:name.trim()}:p))};
 const duplicateProfile=()=>{const id=uid();const duplicate=JSON.parse(JSON.stringify(profile));duplicate.id=id;duplicate.name+=' (copia)';duplicate.scenes=duplicate.scenes.map(s=>({...s,id:uid(),guests:s.guests.map(g=>({...g,id:uid(),boardId:uid()+uid(),boardToken:uid()+uid()+uid()}))}));updateProfiles(v=>[...v,duplicate]);choose(id,'')};
 const deleteProfile=()=>{if(profiles.length===1)return say('Debes conservar un perfil');if(!window.confirm('¿Eliminar este perfil y todas sus escenas?'))return;updateProfiles(v=>v.filter(p=>p.id!==profile.id));choose(profiles.find(p=>p.id!==profile.id)?.id,'')};
 const duplicateScene=()=>{if(!scene)return;const copy=JSON.parse(JSON.stringify(scene));copy.id=uid();copy.name+=' (copia)';copy.guests=copy.guests.map(g=>({...g,id:uid(),boardId:uid()+uid(),boardToken:uid()+uid()+uid()}));setScenes(v=>[...v,copy]);choose(profile.id,copy.id)};
 const addScene=(withParticipants=false)=>{const n=mediaScene(withParticipants?'NUEVA PARTICIPANTES':'NUEVA ESCENA',withParticipants);setScenes(v=>[...v,n]);choose(profile.id,n.id);setTab('Perfiles');setDirty(true)};
 const removeScene=id=>{if(scenes.length<=1)return say('Debe quedar al menos una escena');const next=scenes.filter(s=>s.id!==id);setScenes(next);choose(profile.id,next[0]?.id||'');setDirty(true)};
 const moveScene=(id,dir)=>setScenes(v=>{const i=v.findIndex(s=>s.id===id),j=i+dir;if(i<0||j<0||j>=v.length)return v;const c=[...v];[c[i],c[j]]=[c[j],c[i]];setDirty(true);return c});
 async function sendOnAir(s=scene){if(!s)return;setSending(true);try{const ver=Date.now();await publish({scene:JSON.parse(JSON.stringify(s)),version:ver});setBridgeOk(true);setLiveName(s.name);setDirty(false);say(`“${s.name}” está al aire`)}catch(e){setBridgeOk(false);say(e.message||'No se pudo enviar al aire')}finally{setSending(false)}}
 async function setMedia(s,file){try{const a=await uploadFile(file);patchScene(s.id,{asset:a});say(`Archivo cargado: ${file.name}`)}catch(e){say(e.message)}}
 async function setBackground(s,file){try{const a=await uploadFile(file);patchScene(s.id,{background:a});say(`Fondo cargado: ${file.name}`)}catch(e){say(e.message)}}
 async function connectObs(){try{setObsStatus('Conectando…');await obs.connect(host,password||undefined);localStorage.setItem('obsHost',host);localStorage.setItem('obsPassword',password);setConnected(true);setObsStatus('Conectado');const il=await obs.call('GetInputList');setInputs(il.inputs||[]);setStreaming((await obs.call('GetStreamStatus')).outputActive);setRecording((await obs.call('GetRecordStatus')).outputActive);say('OBS conectado. Esta versión no crea ni cambia escenas de OBS.')}catch(e){setConnected(false);setObsStatus('Error');say(e?.message||'No se pudo conectar')}}
 async function toggleStream(){try{const r=await obs.call(streaming?'StopStream':'StartStream');setStreaming(r.outputActive??!streaming)}catch(e){say(e.message)}}
 async function toggleRecord(){try{const r=await obs.call(recording?'StopRecord':'StartRecord');setRecording(r.outputActive??!recording)}catch(e){say(e.message)}}
 async function toggleMute(name){try{const s=await obs.call('GetInputMute',{inputName:name});await obs.call('SetInputMute',{inputName:name,inputMuted:!s.inputMuted});say(`${name}: ${s.inputMuted?'audio activado':'mute'}`)}catch(e){say(e.message)}}
 const audio=useMemo(()=>inputs.filter(i=>/audio|mic|desktop|capture|browser|ffmpeg/i.test(i.inputKind||'')),[inputs]);

 return <div className="app">
   <header><div><div className="eyebrow">SREGGO • CONTROL ROOM V18.12</div><h1>Panel de Producción</h1></div><div className="status"><span className={connected?'dot on':'dot'}/>{connected?'OBS conectado':'OBS opcional'} <span className={bridgeOk?'bridge-ok':'bridge-bad'}>● Output {bridgeOk?'listo':'sin conexión'}</span> <span className="live-tag">AL AIRE: <b>{liveName}</b></span></div></header>
   {notice&&<div className="notice">{notice}</div>}
   <nav>{tabs.map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t}</button>)}</nav>

   {tab==='En vivo'&&<section className="hero-grid"><div className="card"><h2>Salida actual</h2><div className="big-number">{liveName}</div><div className="row wrap"><button className="primary" disabled={sending||!scene} onClick={()=>sendOnAir(scene)}>{sending?'Enviando…':'Actualizar / Enviar al aire'}</button><button disabled={!connected} onClick={toggleStream}>{streaming?'Detener stream':'Iniciar stream'}</button><button disabled={!connected} onClick={toggleRecord}>{recording?'Detener grabación':'Iniciar grabación'}</button></div><p className="hint">La fuente de OBS debe usar <code>{outputUrl}</code> a 1920×1080.</p></div><div className="card"><h2>Preview seleccionado</h2><Preview scene={scene} scenes={scenes}/></div></section>}

   {tab==='Perfiles'&&<section>
     <div className="card"><div className="title-row"><div><h2>Perfiles de producción</h2><p className="muted">Cada perfil tiene escenas y participantes independientes.</p></div><div className="row wrap"><button className="primary" onClick={addProfile}>+ Crear perfil</button><button onClick={renameProfile}>Renombrar</button><button onClick={duplicateProfile}>Duplicar</button><button className="danger" onClick={deleteProfile}>Eliminar</button></div></div><div className="scene-grid">{profiles.map(p=><button key={p.id} className={p.id===profile?.id?'scene current':'scene'} onClick={()=>choose(p.id,'')}>📁 {p.name}<small>{p.scenes.length} escenas</small></button>)}</div></div>
     <div className="controlbar"><div><span className={dirty?'pending-pill':'pending-pill clean'}>{dirty?'CAMBIOS SIN PUBLICAR':'SIN CAMBIOS'}</span><span className="muted"> El preview cambia aquí, pero OBS no cambia hasta “Enviar al aire”.</span></div><div className="row wrap"><span className="muted">Corte directo · sin transición</span><button className="primary" disabled={sending||!scene} onClick={()=>sendOnAir(scene)}>{sending?'Enviando…':'Actualizar / Enviar al aire'}</button></div></div>
     <div className="scenes-layout"><div className="card scene-library"><div className="title-row"><h2>Escenas — {profile?.name}</h2><div className="row wrap"><button onClick={()=>addScene(false)}>+ Escena</button><button onClick={()=>addScene(true)}>+ Escena con participantes</button></div></div><div className="scene-grid">{scenes.map(s=><button key={s.id} className={s.id===scene?.id?'scene current':'scene'} onClick={()=>choose(profile.id,s.id)}><span className="scene-dot"/>{s.name}<small>{s.participantsEnabled?'Archivo + Participantes':'Archivo'}</small></button>)}</div></div>
       <div className="card preview-card"><div className="title-row"><h2>Preview de escena — 1920 × 1080</h2><span className="preview-name">{scene?.name}</span></div><Preview scene={scene} scenes={scenes}/></div>
     </div>
     {scene&&<div className="card editor-card"><div className="scene-head"><label className="name-edit">Nombre de la escena<input value={scene.name} onChange={e=>patchScene(scene.id,{name:e.target.value})}/></label><div className="row"><button onClick={()=>moveScene(scene.id,-1)}>← Mover</button><button onClick={()=>moveScene(scene.id,1)}>Mover →</button><button onClick={duplicateScene}>Duplicar escena</button><button className="danger" onClick={()=>removeScene(scene.id)}>Eliminar</button></div></div><MediaEditor scene={scene} patch={p=>patchScene(scene.id,p)} onFile={f=>setMedia(scene,f)}/><LayerEditor scene={scene} patch={p=>patchScene(scene.id,p)}/><div className="participants-toggle-row"><label className="switchline"><input type="checkbox" checked={!!scene.participantsEnabled} onChange={e=>patchScene(scene.id,{participantsEnabled:e.target.checked})}/><span>Participantes en esta escena</span><b>{scene.participantsEnabled?'ACTIVADOS':'DESACTIVADOS'}</b></label></div>{scene.participantsEnabled&&<ParticipantsEditor scene={scene} patch={p=>patchScene(scene.id,p)} onBackground={f=>setBackground(scene,f)} onMode={(guestId,mode)=>fetch('/api/program/mode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sceneId:scene.id,guestId,mode})}).catch(()=>{})}/>}</div>}
   </section>}

   {tab==='Precarga'&&<PreloadPanel profile={profile} selectedScene={scene} say={say} mode={preloadMode} setMode={setPreloadMode}/>}
   {tab==='Audio'&&<section><div className="card"><h2>Mezclador rápido de OBS</h2><p className="muted">Conecta WebSocket en Configuración. Esta función solo controla audio; no toca escenas de OBS.</p><div className="scene-grid">{audio.map(i=><button className="scene" key={i.inputName} disabled={!connected} onClick={()=>toggleMute(i.inputName)}>🎚 {i.inputName}</button>)}</div></div></section>}
   {tab==='Fuentes'&&<section><div className="card"><h2>Fuentes detectadas en OBS</h2><p className="muted">Solo lectura.</p><div className="source-list">{inputs.map(i=><div key={i.inputName}><b>{i.inputName}</b><span>{i.inputKind}</span></div>)}</div></div></section>}
   {tab==='Configuración'&&<section><div className="card settings"><h2>OBS WebSocket (opcional)</h2><p className="muted">Conexión directa desde este navegador a OBS. La dirección 127.0.0.1 solo funciona desde la misma PC donde está OBS; el control remoto del staff se configurará en un paso posterior.</p><label>Servidor<input value={host} onChange={e=>setHost(e.target.value)} placeholder="ws://127.0.0.1:4455"/></label><label>Contraseña<input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label><div className="row"><button className="primary" onClick={connectObs}>Conectar a OBS</button><span>{obsStatus}</span></div><hr/><h2>Fuente de navegador</h2><div className="output-info"><code>{outputUrl}</code><p className="muted">Ancho 1920 · Alto 1080</p></div></div></section>}
 </div>;
}

function Preview({scene,scenes}){return <div className="preview-shell"><div className="screen"><PreviewPersistentCanvas scene={scene} scenes={scenes}/></div></div>}
function PreviewPersistentCanvas({scene}){return <SceneRenderer scene={scene}/>;}

function MediaEditor({scene,patch,onFile}){return <div className="media-editor"><div><h2>Archivo de la escena</h2><input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" onChange={e=>onFile(e.target.files?.[0])}/>{scene.asset?<div className="asset-ok">✓ {scene.asset.name}</div>:<div className="muted">Carga una imagen o video. El preview aparecerá arriba inmediatamente.</div>}</div><div className="row wrap"><label>Ajuste<select value={scene.fit||'cover'} onChange={e=>patch({fit:e.target.value})}><option value="cover">Cubrir pantalla</option><option value="contain">Mostrar completo</option><option value="fill">Estirar</option></select></label>{isVideo(scene.asset)&&<><label className="check"><input type="checkbox" checked={scene.loop!==false} onChange={e=>patch({loop:e.target.checked})}/> Repetir video</label><label className="check"><input type="checkbox" checked={scene.muted!==false} onChange={e=>patch({muted:e.target.checked})}/> Sin audio</label></>}</div></div>}
function LayerEditor({scene,patch}){
 const labels={background:'Fondo / overlay',media:'Archivo de escena',participants:'Participantes'};
 const layers=Array.isArray(scene.layers)?scene.layers:['background','media','participants']; // back -> front
 const [dragKey,setDragKey]=useState(null);
 const move=(key,dir)=>{const i=layers.indexOf(key),j=i+dir;if(i<0||j<0||j>=layers.length)return;const n=[...layers];[n[i],n[j]]=[n[j],n[i]];patch({layers:n})};
 const dropOn=(target)=>{
   if(!dragKey||dragKey===target)return setDragKey(null);
   const n=[...layers];const from=n.indexOf(dragKey),to=n.indexOf(target);
   if(from<0||to<0)return setDragKey(null);
   n.splice(from,1);n.splice(to,0,dragKey);patch({layers:n});setDragKey(null);
 };
 const frontToBack=[...layers].reverse();
 return <div className="layer-editor"><div className="title-row"><div><h2>Capas de la escena</h2><p className="muted">Arriba = delante. Puedes arrastrar las filas con el mouse o usar los botones.</p></div></div><div className="layer-list">{frontToBack.map((key,displayIndex)=>{const i=layers.indexOf(key);const active=key!=='participants'||scene.participantsEnabled;return <div className={`layer-row ${active?'':'disabled'} ${dragKey===key?'dragging':''}`} key={key} draggable onDragStart={e=>{setDragKey(key);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',key)}} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='move'}} onDrop={e=>{e.preventDefault();dropOn(key)}} onDragEnd={()=>setDragKey(null)}><span className="layer-grip" title="Arrastra para mover">☰</span><b>{labels[key]||key}</b><span className="layer-pos">{displayIndex+1}</span><div className="row"><button disabled={i===layers.length-1} onClick={()=>move(key,1)}>↑ Delante</button><button disabled={i===0} onClick={()=>move(key,-1)}>↓ Detrás</button></div></div>})}</div><div className="row wrap layer-presets"><button onClick={()=>patch({layers:['background','media','participants']})}>Participantes delante</button><button onClick={()=>patch({layers:['background','participants','media']})}>Participantes detrás del archivo</button><button onClick={()=>patch({layers:['participants','background','media']})}>Participantes al fondo</button></div></div>;
}
function ParticipantsEditor({scene,patch,onBackground,onMode}){
 const guests=scene.guests||[];
 const setGuests=next=>patch({guests:next});
 const patchG=(id,data)=>setGuests(guests.map(g=>g.id===id?{...g,...data}:g));
 const active=guests.filter(g=>g.visible);
 const boardAll=mode=>{setGuests(guests.map(g=>g.visible?{...g,mode}:g));guests.filter(g=>g.visible).forEach(g=>onMode?.(g.id,mode))};
 const add=()=>{if(guests.length>=10)return;setGuests([...guests,newGuest(guests.length)])};
 const layout=n=>{const cols=n<=1?1:n<=4?2:n<=6?3:n<=8?4:5,rows=Math.ceil(n/cols),gap=24,w=(1920-gap*(cols+1))/cols,h=(1080-gap*(rows+1))/rows;setGuests(guests.map((g,i)=>i<n?{...g,visible:true,x:gap+(i%cols)*(w+gap),y:gap+Math.floor(i/cols)*(h+gap),w,h}:g))};
 return <div className="participants-editor"><div className="card p-tools"><div className="p-integrated-note">PARTICIPANTES DE ESTA ESCENA · {guests.length}/10</div><div><b>Layouts</b> <span className="layout-buttons">{[1,2,3,4,5,6,8,10].map(n=><button key={n} onClick={()=>layout(n)}>{n}</button>)}</span></div><label>Fondo/overlay<input type="file" accept="image/*" onChange={e=>onBackground(e.target.files?.[0])}/></label><label>Opacidad <span>{scene.bgOpacity??35}%</span><input type="range" min="0" max="100" value={scene.bgOpacity??35} onChange={e=>patch({bgOpacity:clamp(e.target.value,0,100)})}/></label></div>
 <div className="card"><div className="title-row"><div><h2>Control de pizarras</h2><p className="muted">La pizarra sustituye la cámara en el mismo recuadro. Solo afecta a los participantes visibles.</p></div><div className="row wrap"><button onClick={()=>boardAll('board')}>✎ Todas las pizarras</button><button onClick={()=>boardAll('camera')}>▣ Todas las cámaras</button><button className="primary" disabled={guests.length>=10} onClick={add}>+ Añadir participante</button></div></div></div>
 <div className="participants-grid"><div className="card"><h2>Editor XY — 1920 × 1080</h2><XYStage guests={guests} patch={patchG} bg={scene.background} opacity={scene.bgOpacity??35}/></div><div className="guestlist">{guests.map((g,i)=><div className="card guest" key={g.id}><div className="guest-title"><b>#{i+1} {g.name}</b><div className="row"><button className={g.visible?'visibility on':'visibility'} onClick={()=>patchG(g.id,{visible:!g.visible})}>{g.visible?'Ocultar':'Mostrar'}</button><button className="danger" onClick={()=>setGuests(guests.filter(x=>x.id!==g.id))}>✕</button></div></div><label>Nombre<input value={g.name} onChange={e=>patchG(g.id,{name:e.target.value})}/></label><label>VDO.Ninja<input value={g.url} placeholder="https://vdo.ninja/?view=..." onChange={e=>patchG(g.id,{url:e.target.value})}/></label><div className="board-controls"><b>Modo en directo</b><div className="row wrap"><button className={g.mode!=='board'?'primary':''} onClick={()=>{patchG(g.id,{mode:'camera'});onMode?.(g.id,'camera')}}>▣ Cámara</button><button className={g.mode==='board'?'primary':''} onClick={()=>{patchG(g.id,{mode:'board'});onMode?.(g.id,'board')}}>✎ Pizarra</button></div><p className="muted">Enlace privado del participante (no necesita acceder al Control Room):</p><div className="board-link"><code>{`${location.origin}/pizarra/${g.boardId}?token=${g.boardToken}`}</code><button onClick={()=>navigator.clipboard.writeText(`${location.origin}/pizarra/${g.boardId}?token=${g.boardToken}`).then(()=>alert('Enlace copiado')).catch(()=>window.prompt('Copia el enlace',`${location.origin}/pizarra/${g.boardId}?token=${g.boardToken}`))}>Copiar enlace</button></div><button onClick={()=>{if(!window.confirm('¿Generar un enlace nuevo? El anterior dejará de funcionar.'))return;patchG(g.id,{boardToken:uid()+uid()+uid()})}}>Regenerar enlace</button></div><div className="xyinputs">{[['X','x',1920-g.w],['Y','y',1080-g.h],['W','w',1920],['H','h',1080]].map(([label,key,max])=><label key={key}>{label}<input type="number" value={Math.round(g[key])} onChange={e=>patchG(g.id,{[key]:clamp(e.target.value,key==='w'?80:key==='h'?45:0,max)})}/></label>)}</div></div>)}</div></div></div>
}
function XYStage({guests,patch,bg,opacity}){const ref=useRef(null),act=useRef(null);const to=(e,r)=>({x:(e.clientX-r.left)/r.width*1920,y:(e.clientY-r.top)/r.height*1080});const down=(e,g,corner=null)=>{e.preventDefault();e.stopPropagation();const r=ref.current.getBoundingClientRect(),p=to(e,r);act.current={id:g.id,corner,p,box:{x:g.x,y:g.y,w:g.w,h:g.h}};e.currentTarget.setPointerCapture?.(e.pointerId)};const move=e=>{const a=act.current;if(!a)return;const r=ref.current.getBoundingClientRect(),p=to(e,r),dx=p.x-a.p.x,dy=p.y-a.p.y,b=a.box;if(!a.corner)return patch(a.id,{x:clamp(b.x+dx,0,1920-b.w),y:clamp(b.y+dy,0,1080-b.h)});let{x,y,w,h}=b;const mw=80,mh=45,c=a.corner;if(c.includes('e'))w=clamp(b.w+dx,mw,1920-b.x);if(c.includes('s'))h=clamp(b.h+dy,mh,1080-b.y);if(c.includes('w')){const nx=clamp(b.x+dx,0,b.x+b.w-mw);w=b.w+(b.x-nx);x=nx}if(c.includes('n')){const ny=clamp(b.y+dy,0,b.y+b.h-mh);h=b.h+(b.y-ny);y=ny}patch(a.id,{x,y,w,h})};return <div className="xy" ref={ref} onPointerMove={move} onPointerUp={()=>act.current=null} onPointerCancel={()=>act.current=null}>{bg?.url&&<img src={bg.url} className="xybg" alt="" style={{opacity:clamp(opacity,0,100)/100}}/>}<div className="safe-frame"/>{guests.filter(g=>g.visible).map(g=><div key={g.id} className="box" style={{left:`${g.x/19.2}%`,top:`${g.y/10.8}%`,width:`${g.w/19.2}%`,height:`${g.h/10.8}%`}} onPointerDown={e=>down(e,g)}><span>#{g.id}</span><small>{g.name}</small>{['nw','ne','sw','se'].map(c=><i key={c} className={`handle ${c}`} onPointerDown={e=>down(e,g,c)}/>)}</div>)}</div>}

const out=window.location.pathname.replace(/\/+$/,'')==='/output';const isBoard=window.location.pathname.startsWith('/pizarra/');if(out)document.body.classList.add('output-mode');createRoot(document.getElementById('root')).render(out?<Output/>:isBoard?<BoardPage/>:<App/>);
