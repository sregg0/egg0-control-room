import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import OBSWebSocket from 'obs-websocket-js';
import './styles.css';

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
async function publish(state){const r=await fetch(`/api/program?t=${Date.now()}`,{method:'POST',headers:{'Content-Type':'application/json','Cache-Control':'no-store'},cache:'no-store',body:JSON.stringify(state)});const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error(d?.error||`No se pudo enviar al aire (HTTP ${r.status})`);const check=await fetch(`/api/program?t=${Date.now()}`,{cache:'no-store'});const saved=await check.json().catch(()=>null);if(!check.ok||Number(saved?.version)!==Number(state.version))throw new Error('El servidor recibió el cambio pero no pudo verificarlo');return d}

function isVideo(asset){return !!asset&&(((asset.type||'').startsWith('video/'))||/\.(mp4|webm|mov|m4v)$/i.test(asset.url||''));}

function SceneRenderer({scene,interactive=false}){
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
   if(key==='participants') return hasParticipants?<div key="participants-layer" className="participants-layer" style={layerStyle}><ParticipantsOutput scene={{...scene,background:null}} interactive={interactive}/></div>:null;
   return null;
 };
 const anyVisual=!!scene.asset||!!scene.background?.url||hasParticipants;
 return <div className="scene-composite">{layers.map(renderLayer)}{!anyVisual&&<div className="empty-program"><span>{scene.name}<small>Carga un archivo para ver el preview</small></span></div>}</div>;
}
function ParticipantsOutput({scene,interactive=false}){
 return <div className="participants-output">
   {scene.background?.url&&<img className="p-bg" src={scene.background.url} alt="" style={{opacity:clamp(scene.bgOpacity??35,0,100)/100}}/>}
   {(scene.guests||[]).filter(g=>g.visible).map(g=><div className="p-guest" key={`${g.id}-${g.url}`} style={{left:`${g.x/19.2}%`,top:`${g.y/10.8}%`,width:`${g.w/19.2}%`,height:`${g.h/10.8}%`}}>{g.mode==='board'?<BoardViewer boardId={g.boardId}/>:g.url?<iframe src={normalizeVdo(g.url)} allow="autoplay; fullscreen; picture-in-picture" allowTransparency="true" loading="eager" title={g.name} style={{pointerEvents:interactive?'auto':'none'}}/>:null}</div>)}
 </div>;
}
// V17 TV TRANSITIONS: Prepare the incoming *whole* scene off-air and crossfade
// complete scene canvases. Never animate individual cameras across scene cuts.
function Output(){
 const [program,setProgram]=useState({scene:null,fadeMs:300,version:0});
 const [incoming,setIncoming]=useState(null);
 const [preloadScenes,setPreloadScenes]=useState([]);
 const [fadeStarted,setFadeStarted]=useState(false);
 const programRef=useRef(program),incomingRef=useRef(null),lastVersion=useRef(-1);
 const timer=useRef(null),commitTimer=useRef(null);
 const incomingRefSet=n=>{incomingRef.current=n;setIncoming(n)};
 const apply=n=>{
   const next=n||{scene:null,fadeMs:300,version:0};
   if(Number(next.version||0)===Number(lastVersion.current))return;
   lastVersion.current=Number(next.version||0);
   clearTimeout(timer.current);clearTimeout(commitTimer.current);
   // A new TAKE during a transition replaces the queued target; the on-air
   // program always remains visible until the next target has been staged.
   if(!programRef.current?.scene){programRef.current=next;setProgram(next);incomingRefSet(null);return}
   incomingRefSet(next);setFadeStarted(false);
   // Give React one short render window to mount the incoming canvas.
   // Never add a fixed 1.4-second camera wait to the TAKE.
   const wait=40;
   timer.current=setTimeout(()=>{
     if(incomingRef.current!==next)return;
     setFadeStarted(true);
     const duration=clamp(next.fadeMs??300,0,3000);
     commitTimer.current=setTimeout(()=>{programRef.current=next;setProgram(next);incomingRefSet(null);setFadeStarted(false)},duration+40);
   },wait);
 };
 useEffect(()=>{let stopped=false,pollProgram,pollPreload;
  const tickProgram=async()=>{try{const r=await fetch(`/api/program?t=${Date.now()}`,{cache:'no-store'});if(r.ok){const d=await r.json();if(!stopped)apply(d)}}catch{};if(!stopped)pollProgram=setTimeout(tickProgram,250)};
  const tickPreload=async()=>{try{const r=await fetch(`/api/preload?t=${Date.now()}`,{cache:'no-store'});if(r.ok){const d=await r.json();if(!stopped&&Array.isArray(d?.scenes))setPreloadScenes(d.scenes)}}catch{};if(!stopped)pollPreload=setTimeout(tickPreload,700)};
  tickProgram();tickPreload();return()=>{stopped=true;clearTimeout(pollProgram);clearTimeout(pollPreload);clearTimeout(timer.current);clearTimeout(commitTimer.current)}
 },[]);
 const duration=clamp(incoming?.fadeMs??300,0,3000);
 return <div className="program-root persistent-output">
   <MediaPreloader scenes={preloadScenes}/>
   <div className="tv-scene tv-onair"><PersistentCurrentCanvas scenes={[]} scene={program?.scene} fadeMs={0}/></div>
   {incoming?.scene&&<div className={`tv-scene tv-incoming ${fadeStarted?'tv-take':''}`} style={{'--tv-duration':`${duration}ms`}}><PersistentCurrentCanvas scenes={[]} scene={incoming.scene} fadeMs={0}/></div>}
 </div>;
}
function PersistentCurrentCanvas({scenes,scene,fadeMs}){
 if(!scene)return <div className="persistent-current"><div className="empty-program"><span>Sin escena</span></div><PersistentVdoPool scenes={scenes} scene={null} fadeMs={fadeMs}/></div>;
 const layers=Array.isArray(scene.layers)?scene.layers:['background','media','participants'];
 const bgZ=Math.max(0,layers.indexOf('background'))+1,mediaZ=Math.max(0,layers.indexOf('media'))+1;
 const a=scene.asset;
 return <div className="persistent-current">
   {scene.background?.url&&<img className="layer-bg" src={scene.background.url} alt="" style={{zIndex:bgZ,opacity:clamp(scene.bgOpacity??35,0,100)/100}}/>}
   {a&&(isVideo(a)?<video key={a.url} className={`media ${scene.fit||'cover'}`} style={{zIndex:mediaZ}} src={a.url} autoPlay playsInline loop={scene.loop!==false} muted={scene.muted!==false}/>:<img key={a.url} className={`media ${scene.fit||'cover'}`} style={{zIndex:mediaZ}} src={a.url} alt=""/>)}
   <PersistentVdoPool scenes={scenes} scene={scene} fadeMs={fadeMs}/>
 </div>;
}
function SceneVisualOnly({scene}){
 if(!scene)return <div className="empty-program"><span>Sin escena</span></div>;
 const layers=Array.isArray(scene.layers)?scene.layers:['background','media','participants'];
 const render=(key,index)=>{const z=index+1;if(key==='background')return scene.background?.url?<img key="bg" className="layer-bg" src={scene.background.url} alt="" style={{zIndex:z,opacity:clamp(scene.bgOpacity??35,0,100)/100}}/>:null;if(key==='media'){const a=scene.asset;return a?(isVideo(a)?<video key={a.url} className={`media ${scene.fit||'cover'}`} style={{zIndex:z}} src={a.url} autoPlay playsInline loop={scene.loop!==false} muted={scene.muted!==false}/>:<img key={a.url} className={`media ${scene.fit||'cover'}`} style={{zIndex:z}} src={a.url} alt=""/>):null}return null};
 return <div className="scene-composite">{layers.map(render)}</div>;
}
function MediaPreloader({scenes}){
 const assets=[];const seen=new Set();for(const s of scenes||[]){for(const a of [s?.asset,s?.background])if(a?.url&&!seen.has(a.url)){seen.add(a.url);assets.push(a)}}
 return <div className="preload-cache" aria-hidden="true">{assets.map(a=>isVideo(a)?<video key={a.url} src={a.url} preload="auto" muted playsInline/>:<img key={a.url} src={a.url} alt=""/>)}</div>;
}
function PersistentVdoPool({scenes,scene,fadeMs}){
 const pool=useMemo(()=>{const map=new Map();for(const s of [...(scenes||[]),...(scene?[scene]:[])]){for(const g of s?.guests||[]){const url=normalizeVdo(g?.url);if(url&&!map.has(url))map.set(url,{url,name:g?.name||'Invitado'})}}return [...map.values()]},[scenes,scene]);
 const activeByUrl=useMemo(()=>{const map=new Map();if(scene?.participantsEnabled){for(const g of scene?.guests||[]){const url=normalizeVdo(g?.url);if(url&&g.visible)map.set(url,g)}}return map},[scene]);
 const layers=Array.isArray(scene?.layers)?scene.layers:['background','media','participants'];const pIndex=Math.max(0,layers.indexOf('participants'))+1;
 return <div className="persistent-vdo-root" style={{zIndex:pIndex}}>{pool.map(item=>{const g=activeByUrl.get(item.url);const active=!!g&&g.mode!=='board';return <div className={`persistent-vdo ${active?'active':''}`} key={item.url} style={active?{left:`${g.x/19.2}%`,top:`${g.y/10.8}%`,width:`${g.w/19.2}%`,height:`${g.h/10.8}%`,'--camfade':`${clamp(fadeMs,0,3000)}ms`}:{'--camfade':`${clamp(fadeMs,0,3000)}ms`}}><iframe src={item.url} allow="autoplay; fullscreen; picture-in-picture" allowTransparency="true" loading="eager" title={g?.name||item.name}/></div>})}{(scene?.participantsEnabled?scene.guests||[]:[]).filter(g=>g.visible&&g.mode==='board').map(g=><div key={'board-'+g.id} className="persistent-board" style={{left:`${g.x/19.2}%`,top:`${g.y/10.8}%`,width:`${g.w/19.2}%`,height:`${g.h/10.8}%`}}><BoardViewer boardId={g.boardId}/></div>)}</div>;
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
 const [fadeMs,setFadeMs]=useState(()=>Number(localStorage.getItem('v17FadeMs')||300));
 const [dirty,setDirty]=useState(false),[notice,setNotice]=useState(''),[sending,setSending]=useState(false),[liveName,setLiveName]=useState('—'),[bridgeOk,setBridgeOk]=useState(false);
 const [host,setHost]=useState(localStorage.getItem('obsHost')||'ws://127.0.0.1:4455');
 const [password,setPassword]=useState(localStorage.getItem('obsPassword')||'');
 const [connected,setConnected]=useState(false),[obsStatus,setObsStatus]=useState('Desconectado');
 const [streaming,setStreaming]=useState(false),[recording,setRecording]=useState(false),[inputs,setInputs]=useState([]);
 const tabs=['En vivo','Perfiles','Audio','Fuentes','Configuración'];
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
 useEffect(()=>{const t=setTimeout(()=>{fetch('/api/preload',{method:'POST',headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({scenes,version:Date.now()})}).catch(()=>{})},180);return()=>clearTimeout(t)},[scenes]);
 useEffect(()=>localStorage.setItem('v17FadeMs',String(fadeMs)),[fadeMs]);
 useEffect(()=>{fetch('/api/health',{cache:'no-store'}).then(r=>r.json()).then(d=>setBridgeOk(!!d?.ok)).catch(()=>setBridgeOk(false));fetch('/api/program',{cache:'no-store'}).then(r=>r.json()).then(d=>setLiveName(d?.scene?.name||'—')).catch(()=>{})},[]);
 useEffect(()=>{const close=()=>{setConnected(false);setObsStatus('Desconectado')};obs.on('ConnectionClosed',close);return()=>obs.removeAllListeners()},[]);
 const say=m=>{setNotice(m);setTimeout(()=>setNotice(''),3200)};
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
 async function sendOnAir(s=scene){if(!s)return;setSending(true);try{const h=await fetch('/api/health',{cache:'no-store'});if(!h.ok)throw new Error('El servidor de Output no responde. Comprueba que Render esté funcionando.');const ver=Date.now();await publish({scene:JSON.parse(JSON.stringify(s)),fadeMs,version:ver});setBridgeOk(true);setLiveName(s.name);setDirty(false);say(`“${s.name}” está al aire`)}catch(e){setBridgeOk(false);say(e.message||'No se pudo enviar al aire')}finally{setSending(false)}}
 async function setMedia(s,file){try{const a=await uploadFile(file);patchScene(s.id,{asset:a});say(`Archivo cargado: ${file.name}`)}catch(e){say(e.message)}}
 async function setBackground(s,file){try{const a=await uploadFile(file);patchScene(s.id,{background:a});say(`Fondo cargado: ${file.name}`)}catch(e){say(e.message)}}
 async function connectObs(){try{setObsStatus('Conectando…');await obs.connect(host,password||undefined);localStorage.setItem('obsHost',host);localStorage.setItem('obsPassword',password);setConnected(true);setObsStatus('Conectado');const il=await obs.call('GetInputList');setInputs(il.inputs||[]);setStreaming((await obs.call('GetStreamStatus')).outputActive);setRecording((await obs.call('GetRecordStatus')).outputActive);say('OBS conectado. Esta versión no crea ni cambia escenas de OBS.')}catch(e){setConnected(false);setObsStatus('Error');say(e?.message||'No se pudo conectar')}}
 async function toggleStream(){try{const r=await obs.call(streaming?'StopStream':'StartStream');setStreaming(r.outputActive??!streaming)}catch(e){say(e.message)}}
 async function toggleRecord(){try{const r=await obs.call(recording?'StopRecord':'StartRecord');setRecording(r.outputActive??!recording)}catch(e){say(e.message)}}
 async function toggleMute(name){try{const s=await obs.call('GetInputMute',{inputName:name});await obs.call('SetInputMute',{inputName:name,inputMuted:!s.inputMuted});say(`${name}: ${s.inputMuted?'audio activado':'mute'}`)}catch(e){say(e.message)}}
 const audio=useMemo(()=>inputs.filter(i=>/audio|mic|desktop|capture|browser|ffmpeg/i.test(i.inputKind||'')),[inputs]);

 return <div className="app">
   <header><div><div className="eyebrow">SREGGO • CONTROL ROOM V17</div><h1>Panel de Producción</h1></div><div className="status"><span className={connected?'dot on':'dot'}/>{connected?'OBS conectado':'OBS opcional'} <span className={bridgeOk?'bridge-ok':'bridge-bad'}>● Output {bridgeOk?'listo':'sin conexión'}</span> <span className="live-tag">AL AIRE: <b>{liveName}</b></span></div></header>
   {notice&&<div className="notice">{notice}</div>}
   <nav>{tabs.map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t}</button>)}</nav>

   {tab==='En vivo'&&<section className="hero-grid"><div className="card"><h2>Salida actual</h2><div className="big-number">{liveName}</div><div className="row wrap"><button className="primary" disabled={sending||!scene} onClick={()=>sendOnAir(scene)}>{sending?'Enviando…':'Actualizar / Enviar al aire'}</button><button disabled={!connected} onClick={toggleStream}>{streaming?'Detener stream':'Iniciar stream'}</button><button disabled={!connected} onClick={toggleRecord}>{recording?'Detener grabación':'Iniciar grabación'}</button></div><p className="hint">La fuente de OBS debe usar <code>{outputUrl}</code> a 1920×1080.</p></div><div className="card"><h2>Preview seleccionado</h2><Preview scene={scene} scenes={scenes}/></div></section>}

   {tab==='Perfiles'&&<section>
     <div className="card"><div className="title-row"><div><h2>Perfiles de producción</h2><p className="muted">Cada perfil tiene escenas y participantes independientes.</p></div><div className="row wrap"><button className="primary" onClick={addProfile}>+ Crear perfil</button><button onClick={renameProfile}>Renombrar</button><button onClick={duplicateProfile}>Duplicar</button><button className="danger" onClick={deleteProfile}>Eliminar</button></div></div><div className="scene-grid">{profiles.map(p=><button key={p.id} className={p.id===profile?.id?'scene current':'scene'} onClick={()=>choose(p.id,'')}>📁 {p.name}<small>{p.scenes.length} escenas</small></button>)}</div></div>
     <div className="controlbar"><div><span className={dirty?'pending-pill':'pending-pill clean'}>{dirty?'CAMBIOS SIN PUBLICAR':'SIN CAMBIOS'}</span><span className="muted"> El preview cambia aquí, pero OBS no cambia hasta “Enviar al aire”.</span></div><div className="row wrap"><label className="inline-control">Fade <input type="number" min="0" max="2000" step="50" value={fadeMs} onChange={e=>setFadeMs(clamp(e.target.value,0,2000))}/> ms</label><button className="primary" disabled={sending||!scene} onClick={()=>sendOnAir(scene)}>{sending?'Enviando…':'Actualizar / Enviar al aire'}</button></div></div>
     <div className="scenes-layout"><div className="card scene-library"><div className="title-row"><h2>Escenas — {profile?.name}</h2><div className="row wrap"><button onClick={()=>addScene(false)}>+ Escena</button><button onClick={()=>addScene(true)}>+ Escena con participantes</button></div></div><div className="scene-grid">{scenes.map(s=><button key={s.id} className={s.id===scene?.id?'scene current':'scene'} onClick={()=>choose(profile.id,s.id)}><span className="scene-dot"/>{s.name}<small>{s.participantsEnabled?'Archivo + Participantes':'Archivo'}</small></button>)}</div></div>
       <div className="card preview-card"><div className="title-row"><h2>Preview de escena — 1920 × 1080</h2><span className="preview-name">{scene?.name}</span></div><Preview scene={scene} scenes={scenes}/></div>
     </div>
     {scene&&<div className="card editor-card"><div className="scene-head"><label className="name-edit">Nombre de la escena<input value={scene.name} onChange={e=>patchScene(scene.id,{name:e.target.value})}/></label><div className="row"><button onClick={()=>moveScene(scene.id,-1)}>← Mover</button><button onClick={()=>moveScene(scene.id,1)}>Mover →</button><button onClick={duplicateScene}>Duplicar escena</button><button className="danger" onClick={()=>removeScene(scene.id)}>Eliminar</button></div></div><MediaEditor scene={scene} patch={p=>patchScene(scene.id,p)} onFile={f=>setMedia(scene,f)}/><LayerEditor scene={scene} patch={p=>patchScene(scene.id,p)}/><div className="participants-toggle-row"><label className="switchline"><input type="checkbox" checked={!!scene.participantsEnabled} onChange={e=>patchScene(scene.id,{participantsEnabled:e.target.checked})}/><span>Participantes en esta escena</span><b>{scene.participantsEnabled?'ACTIVADOS':'DESACTIVADOS'}</b></label></div>{scene.participantsEnabled&&<ParticipantsEditor scene={scene} patch={p=>patchScene(scene.id,p)} onBackground={f=>setBackground(scene,f)} onMode={(guestId,mode)=>fetch('/api/program/mode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sceneId:scene.id,guestId,mode})}).catch(()=>{})}/>}</div>}
   </section>}

   {tab==='Audio'&&<section><div className="card"><h2>Mezclador rápido de OBS</h2><p className="muted">Conecta WebSocket en Configuración. Esta función solo controla audio; no toca escenas de OBS.</p><div className="scene-grid">{audio.map(i=><button className="scene" key={i.inputName} disabled={!connected} onClick={()=>toggleMute(i.inputName)}>🎚 {i.inputName}</button>)}</div></div></section>}
   {tab==='Fuentes'&&<section><div className="card"><h2>Fuentes detectadas en OBS</h2><p className="muted">Solo lectura.</p><div className="source-list">{inputs.map(i=><div key={i.inputName}><b>{i.inputName}</b><span>{i.inputKind}</span></div>)}</div></div></section>}
   {tab==='Configuración'&&<section><div className="card settings"><h2>OBS WebSocket (opcional)</h2><p className="muted">Conexión directa desde este navegador a OBS. La dirección 127.0.0.1 solo funciona desde la misma PC donde está OBS; el control remoto del staff se configurará en un paso posterior.</p><label>Servidor<input value={host} onChange={e=>setHost(e.target.value)} placeholder="ws://127.0.0.1:4455"/></label><label>Contraseña<input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label><div className="row"><button className="primary" onClick={connectObs}>Conectar a OBS</button><span>{obsStatus}</span></div><hr/><h2>Fuente de navegador</h2><div className="output-info"><code>{outputUrl}</code><p className="muted">Ancho 1920 · Alto 1080</p></div></div></section>}
 </div>;
}

function Preview({scene,scenes}){return <div className="preview-shell"><div className="screen"><PreviewPersistentCanvas scene={scene} scenes={scenes}/></div></div>}
function PreviewPersistentCanvas({scene,scenes}){
 if(!scene)return <div className="empty-program"><span>Sin escena</span></div>;
 const layers=Array.isArray(scene.layers)?scene.layers:['background','media','participants'];
 const bgZ=Math.max(0,layers.indexOf('background'))+1,mediaZ=Math.max(0,layers.indexOf('media'))+1;
 const a=scene.asset;
 const anyVisual=!!scene.asset||!!scene.background?.url||!!scene.participantsEnabled;
 return <div className="persistent-current preview-persistent">
   {scene.background?.url&&<img className="layer-bg" src={scene.background.url} alt="" style={{zIndex:bgZ,opacity:clamp(scene.bgOpacity??35,0,100)/100}}/>}
   {a&&(isVideo(a)?<video key={a.url} className={`media ${scene.fit||'cover'}`} style={{zIndex:mediaZ}} src={a.url} autoPlay playsInline loop={scene.loop!==false} muted={scene.muted!==false}/>:<img key={a.url} className={`media ${scene.fit||'cover'}`} style={{zIndex:mediaZ}} src={a.url} alt=""/>)}
   <PersistentVdoPool scenes={scenes} scene={scene} fadeMs={0}/>
   {!anyVisual&&<div className="empty-program"><span>{scene.name}<small>Carga un archivo para ver el preview</small></span></div>}
 </div>;
}
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
