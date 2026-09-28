import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import OBSWebSocket from 'obs-websocket-js';
import './styles.css';

const obs=new OBSWebSocket();
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
const uid=()=>Math.random().toString(36).slice(2,9);
const normalizeVdo=url=>{const s=String(url||'').trim();if(!s)return'';try{const u=new URL(s);if(/(^|\.)vdo\.ninja$/i.test(u.hostname)){if(!u.searchParams.has('autostart'))u.searchParams.set('autostart','1');if(!u.searchParams.has('cleanoutput')&&!u.searchParams.has('clean'))u.searchParams.set('cleanoutput','');if(!u.searchParams.has('transparent'))u.searchParams.set('transparent','');}return u.toString()}catch{return s}};
const load=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}};
const blankGuests=()=>Array.from({length:6},(_,i)=>({id:i+1,name:`Invitado ${i+1}`,url:'',visible:false,audio:true,x:0,y:0,w:640,h:360}));
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
  base.guests=blankGuests().map((d,i)=>({...d,...(base.guests[i]||{})}));
  if(base.participantsEnabled==null) base.participantsEnabled=false;
  if(!Array.isArray(base.layers)) base.layers=['background','media','participants'];
  base.layers=['background','media','participants'].filter(x=>base.layers.includes(x)).concat(base.layers.filter(x=>!['background','media','participants'].includes(x)));
  return base;
};
const loadScenes=()=>{const raw=load('v8Scenes',starter());return Array.isArray(raw)&&raw.length?raw.map(normalizeScene):starter()};

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
   {(scene.guests||[]).filter(g=>g.visible&&g.url).map(g=><div className="p-guest" key={`${g.id}-${g.url}`} style={{left:`${g.x/19.2}%`,top:`${g.y/10.8}%`,width:`${g.w/19.2}%`,height:`${g.h/10.8}%`}}><iframe src={normalizeVdo(g.url)} allow="autoplay; fullscreen; picture-in-picture" allowTransparency="true" loading="eager" title={g.name} style={{pointerEvents:interactive?'auto':'none'}}/></div>)}
 </div>;
}
function Output(){
 const [live,setLive]=useState({scene:null,fadeMs:350,version:0});
 const [prev,setPrev]=useState(null);
 const [preloadScenes,setPreloadScenes]=useState([]);
 const liveRef=useRef(live),timer=useRef(),lastVersion=useRef(-1);
 const apply=n=>{const next=n||{scene:null,fadeMs:350,version:0};if(Number(next.version||0)===Number(lastVersion.current))return;lastVersion.current=Number(next.version||0);const ms=clamp(next.fadeMs??350,0,3000);setPrev(liveRef.current);liveRef.current=next;setLive(next);clearTimeout(timer.current);timer.current=setTimeout(()=>setPrev(null),ms+140)};
 useEffect(()=>{let stopped=false,pollProgram,pollPreload;const tickProgram=async()=>{try{const r=await fetch(`/api/program?t=${Date.now()}`,{cache:'no-store'});if(r.ok){const d=await r.json();if(!stopped)apply(d)}}catch{};if(!stopped)pollProgram=setTimeout(tickProgram,250)};const tickPreload=async()=>{try{const r=await fetch(`/api/preload?t=${Date.now()}`,{cache:'no-store'});if(r.ok){const d=await r.json();if(!stopped&&Array.isArray(d?.scenes))setPreloadScenes(d.scenes)}}catch{};if(!stopped)pollPreload=setTimeout(tickPreload,700)};tickProgram();tickPreload();return()=>{stopped=true;clearTimeout(pollProgram);clearTimeout(pollPreload);clearTimeout(timer.current)}},[]);
 const scene=live?.scene;
 return <div className="program-root persistent-output">
   <MediaPreloader scenes={preloadScenes}/>
   <PersistentCurrentCanvas scenes={preloadScenes} scene={scene} fadeMs={live?.fadeMs??350}/>
   {prev?.scene&&<div className="persistent-visual leaving" style={{'--fade':`${clamp(live?.fadeMs??350,0,3000)}ms`}}><SceneVisualOnly scene={prev.scene}/></div>}
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
 return <div className="persistent-vdo-root" style={{zIndex:pIndex}}>{pool.map(item=>{const g=activeByUrl.get(item.url);const active=!!g;return <div className={`persistent-vdo ${active?'active':''}`} key={item.url} style={active?{left:`${g.x/19.2}%`,top:`${g.y/10.8}%`,width:`${g.w/19.2}%`,height:`${g.h/10.8}%`,'--camfade':`${clamp(fadeMs,0,3000)}ms`}:{'--camfade':`${clamp(fadeMs,0,3000)}ms`}}><iframe src={item.url} allow="autoplay; fullscreen; picture-in-picture" allowTransparency="true" loading="eager" title={g?.name||item.name}/></div>})}</div>;
}

function App(){
 const [scenes,setScenes]=useState(()=>loadScenes());
 const [selected,setSelected]=useState(()=>scenes[0]?.id||'');
 const [tab,setTab]=useState('En vivo');
 const [fadeMs,setFadeMs]=useState(()=>Number(localStorage.getItem('v8FadeMs')||350));
 const [dirty,setDirty]=useState(false),[notice,setNotice]=useState(''),[sending,setSending]=useState(false),[liveName,setLiveName]=useState('—'),[bridgeOk,setBridgeOk]=useState(false);
 const [host,setHost]=useState(localStorage.getItem('obsHost')||'ws://127.0.0.1:4455');
 const [password,setPassword]=useState(localStorage.getItem('obsPassword')||'');
 const [connected,setConnected]=useState(false),[obsStatus,setObsStatus]=useState('Desconectado');
 const [streaming,setStreaming]=useState(false),[recording,setRecording]=useState(false),[inputs,setInputs]=useState([]);
 const tabs=['En vivo','Escenas','Participantes','Audio','Fuentes','Configuración'];
 const scene=scenes.find(s=>s.id===selected)||scenes[0];
 const participantScenes=scenes.filter(s=>s.participantsEnabled);
 const primaryParticipants=participantScenes.find(s=>s.id===selected)||participantScenes[0];

 useEffect(()=>localStorage.setItem('v8Scenes',JSON.stringify(scenes)),[scenes]);
 useEffect(()=>{const t=setTimeout(()=>{fetch('/api/preload',{method:'POST',headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({scenes,version:Date.now()})}).catch(()=>{})},180);return()=>clearTimeout(t)},[scenes]);
 useEffect(()=>localStorage.setItem('v8FadeMs',String(fadeMs)),[fadeMs]);
 useEffect(()=>{fetch('/api/health',{cache:'no-store'}).then(r=>r.json()).then(d=>setBridgeOk(!!d?.ok)).catch(()=>setBridgeOk(false));fetch('/api/program',{cache:'no-store'}).then(r=>r.json()).then(d=>setLiveName(d?.scene?.name||'—')).catch(()=>{})},[]);
 useEffect(()=>{const close=()=>{setConnected(false);setObsStatus('Desconectado')};obs.on('ConnectionClosed',close);return()=>obs.removeAllListeners()},[]);
 const say=m=>{setNotice(m);setTimeout(()=>setNotice(''),3200)};
 const patchScene=(id,p)=>{setScenes(v=>v.map(s=>s.id===id?{...s,...p}:s));setDirty(true)};
 const selectScene=id=>{setSelected(id);setTab('Escenas')};
 const addScene=(withParticipants=false)=>{const n=mediaScene(withParticipants?'NUEVA PARTICIPANTES':'NUEVA ESCENA',withParticipants);setScenes(v=>[...v,n]);setSelected(n.id);setTab('Escenas');setDirty(true)};
 const removeScene=id=>{if(scenes.length<=1)return say('Debe quedar al menos una escena');const next=scenes.filter(s=>s.id!==id);setScenes(next);setSelected(next[0]?.id||'');setDirty(true)};
 const moveScene=(id,dir)=>setScenes(v=>{const i=v.findIndex(s=>s.id===id),j=i+dir;if(i<0||j<0||j>=v.length)return v;const c=[...v];[c[i],c[j]]=[c[j],c[i]];setDirty(true);return c});
 async function sendOnAir(s=scene){if(!s)return;setSending(true);try{const h=await fetch('/api/health',{cache:'no-store'});if(!h.ok)throw new Error('El servidor local del Output no está activo. Cierra otras terminales y ejecuta npm run dev en V15.');const ver=Date.now();await publish({scene:JSON.parse(JSON.stringify(s)),fadeMs,version:ver});setBridgeOk(true);setLiveName(s.name);setDirty(false);say(`“${s.name}” está al aire`)}catch(e){setBridgeOk(false);say(e.message||'No se pudo enviar al aire')}finally{setSending(false)}}
 async function setMedia(s,file){try{const a=await uploadFile(file);patchScene(s.id,{asset:a});say(`Archivo cargado: ${file.name}`)}catch(e){say(e.message)}}
 async function setBackground(s,file){try{const a=await uploadFile(file);patchScene(s.id,{background:a});say(`Fondo cargado: ${file.name}`)}catch(e){say(e.message)}}
 async function connectObs(){try{setObsStatus('Conectando…');await obs.connect(host,password||undefined);localStorage.setItem('obsHost',host);localStorage.setItem('obsPassword',password);setConnected(true);setObsStatus('Conectado');const il=await obs.call('GetInputList');setInputs(il.inputs||[]);setStreaming((await obs.call('GetStreamStatus')).outputActive);setRecording((await obs.call('GetRecordStatus')).outputActive);say('OBS conectado. Esta versión no crea ni cambia escenas de OBS.')}catch(e){setConnected(false);setObsStatus('Error');say(e?.message||'No se pudo conectar')}}
 async function toggleStream(){try{const r=await obs.call(streaming?'StopStream':'StartStream');setStreaming(r.outputActive??!streaming)}catch(e){say(e.message)}}
 async function toggleRecord(){try{const r=await obs.call(recording?'StopRecord':'StartRecord');setRecording(r.outputActive??!recording)}catch(e){say(e.message)}}
 async function toggleMute(name){try{const s=await obs.call('GetInputMute',{inputName:name});await obs.call('SetInputMute',{inputName:name,inputMuted:!s.inputMuted});say(`${name}: ${s.inputMuted?'audio activado':'mute'}`)}catch(e){say(e.message)}}
 const audio=useMemo(()=>inputs.filter(i=>/audio|mic|desktop|capture|browser|ffmpeg/i.test(i.inputKind||'')),[inputs]);

 return <div className="app">
   <header><div><div className="eyebrow">SREGGO • CONTROL ROOM V16</div><h1>Panel de Producción</h1></div><div className="status"><span className={connected?'dot on':'dot'}/>{connected?'OBS conectado':'OBS opcional'} <span className={bridgeOk?'bridge-ok':'bridge-bad'}>● Output {bridgeOk?'listo':'sin conexión'}</span> <span className="live-tag">AL AIRE: <b>{liveName}</b></span></div></header>
   {notice&&<div className="notice">{notice}</div>}
   <nav>{tabs.map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t}</button>)}</nav>

   {tab==='En vivo'&&<section className="hero-grid"><div className="card"><h2>Salida actual</h2><div className="big-number">{liveName}</div><div className="row wrap"><button className="primary" disabled={sending||!scene} onClick={()=>sendOnAir(scene)}>{sending?'Enviando…':'Actualizar / Enviar al aire'}</button><button disabled={!connected} onClick={toggleStream}>{streaming?'Detener stream':'Iniciar stream'}</button><button disabled={!connected} onClick={toggleRecord}>{recording?'Detener grabación':'Iniciar grabación'}</button></div><p className="hint">La fuente de OBS debe usar <code>http://localhost:5173/output</code> a 1920×1080.</p></div><div className="card"><h2>Preview seleccionado</h2><Preview scene={scene} scenes={scenes}/></div></section>}

   {tab==='Escenas'&&<section>
     <div className="controlbar"><div><span className={dirty?'pending-pill':'pending-pill clean'}>{dirty?'CAMBIOS SIN PUBLICAR':'SIN CAMBIOS'}</span><span className="muted"> El preview cambia aquí, pero OBS no cambia hasta “Enviar al aire”.</span></div><div className="row wrap"><label className="inline-control">Fade <input type="number" min="0" max="2000" step="50" value={fadeMs} onChange={e=>setFadeMs(clamp(e.target.value,0,2000))}/> ms</label><button className="primary" disabled={sending||!scene} onClick={()=>sendOnAir(scene)}>{sending?'Enviando…':'Actualizar / Enviar al aire'}</button></div></div>
     <div className="scenes-layout"><div className="card scene-library"><div className="title-row"><h2>Escenas de la fuente</h2><div className="row wrap"><button onClick={()=>addScene(false)}>+ Escena</button><button onClick={()=>addScene(true)}>+ Escena con participantes</button></div></div><div className="scene-grid">{scenes.map(s=><button key={s.id} className={s.id===scene?.id?'scene current':'scene'} onClick={()=>setSelected(s.id)}><span className="scene-dot"/>{s.name}<small>{s.participantsEnabled?'Archivo + Participantes':'Archivo'}</small></button>)}</div></div>
       <div className="card preview-card"><div className="title-row"><h2>Preview de escena — 1920 × 1080</h2><span className="preview-name">{scene?.name}</span></div><Preview scene={scene} scenes={scenes}/></div>
     </div>
     {scene&&<div className="card editor-card"><div className="scene-head"><label className="name-edit">Nombre de la escena<input value={scene.name} onChange={e=>patchScene(scene.id,{name:e.target.value})}/></label><div className="row"><button onClick={()=>moveScene(scene.id,-1)}>← Mover</button><button onClick={()=>moveScene(scene.id,1)}>Mover →</button><button className="danger" onClick={()=>removeScene(scene.id)}>Eliminar</button></div></div><MediaEditor scene={scene} patch={p=>patchScene(scene.id,p)} onFile={f=>setMedia(scene,f)}/><LayerEditor scene={scene} patch={p=>patchScene(scene.id,p)}/><div className="participants-toggle-row"><label className="switchline"><input type="checkbox" checked={!!scene.participantsEnabled} onChange={e=>patchScene(scene.id,{participantsEnabled:e.target.checked})}/><span>Participantes en esta escena</span><b>{scene.participantsEnabled?'ACTIVADOS':'DESACTIVADOS'}</b></label></div>{scene.participantsEnabled&&<ParticipantsEditor scene={scene} patch={p=>patchScene(scene.id,p)} onBackground={f=>setBackground(scene,f)}/>}</div>}
   </section>}

   {tab==='Participantes'&&<section>{participantScenes.length?<><div className="card"><div className="title-row"><div><h2>Participantes integrados por escena</h2><p className="muted">Cada escena puede activar o desactivar sus propias cámaras. Elige cuál editar.</p></div></div><div className="scene-grid">{participantScenes.map(s=><button key={s.id} className={s.id===primaryParticipants?.id?'scene current':'scene'} onClick={()=>setSelected(s.id)}><span className="scene-dot"/>{s.name}<small>Participantes activados</small></button>)}</div></div>{primaryParticipants&&<><div className="card"><div className="title-row"><div><h2>{primaryParticipants.name}</h2><p className="muted">Preview de la escena con sus participantes.</p></div><button onClick={()=>selectScene(primaryParticipants.id)}>Abrir en Escenas</button></div><Preview scene={primaryParticipants}/></div><ParticipantsEditor scene={primaryParticipants} patch={p=>patchScene(primaryParticipants.id,p)} onBackground={f=>setBackground(primaryParticipants,f)}/><div className="row"><button className="primary" onClick={()=>sendOnAir(primaryParticipants)}>Enviar esta escena al aire</button></div></>}</>:<div className="card"><h2>No hay participantes activados</h2><p className="muted">Ve a Escenas y activa “Participantes en esta escena” en cualquiera de ellas.</p></div>}</section>}

   {tab==='Audio'&&<section><div className="card"><h2>Mezclador rápido de OBS</h2><p className="muted">Conecta WebSocket en Configuración. Esta función solo controla audio; no toca escenas de OBS.</p><div className="scene-grid">{audio.map(i=><button className="scene" key={i.inputName} disabled={!connected} onClick={()=>toggleMute(i.inputName)}>🎚 {i.inputName}</button>)}</div></div></section>}
   {tab==='Fuentes'&&<section><div className="card"><h2>Fuentes detectadas en OBS</h2><p className="muted">Solo lectura.</p><div className="source-list">{inputs.map(i=><div key={i.inputName}><b>{i.inputName}</b><span>{i.inputKind}</span></div>)}</div></div></section>}
   {tab==='Configuración'&&<section><div className="card settings"><h2>OBS WebSocket (opcional)</h2><p className="muted">No se usa para crear ni cambiar escenas. Solo habilita stream, grabación, audio y lectura de fuentes.</p><label>Servidor<input value={host} onChange={e=>setHost(e.target.value)} placeholder="ws://127.0.0.1:4455"/></label><label>Contraseña<input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label><div className="row"><button className="primary" onClick={connectObs}>Conectar a OBS</button><span>{obsStatus}</span></div><hr/><h2>Fuente de navegador</h2><div className="output-info"><code>http://localhost:5173/output</code><p className="muted">Ancho 1920 · Alto 1080</p></div></div></section>}
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
function ParticipantsEditor({scene,patch,onBackground}){const guests=scene.guests||blankGuests();const setGuests=next=>patch({guests:next});const patchG=(id,p)=>setGuests(guests.map(g=>g.id===id?{...g,...p}:g));const layout=n=>{const cols=n<=1?1:n<=4?2:3,rows=Math.ceil(n/cols),gap=36,w=(1920-gap*(cols+1))/cols,h=(1080-gap*(rows+1))/rows;setGuests(guests.map((g,i)=>i<n?{...g,visible:true,x:gap+(i%cols)*(w+gap),y:gap+Math.floor(i/cols)*(h+gap),w,h}:{...g,visible:false}))};return <div className="participants-editor"><div className="card p-tools"><div className="p-integrated-note">Cámaras integradas en esta escena</div><div><b>Layouts</b> <span className="layout-buttons">{[1,2,3,4,5,6].map(n=><button key={n} onClick={()=>layout(n)}>{n}</button>)}</span></div><label>Fondo/overlay<input type="file" accept="image/*" onChange={e=>onBackground(e.target.files?.[0])}/></label><label>Opacidad <span>{scene.bgOpacity??35}%</span><input type="range" min="0" max="100" value={scene.bgOpacity??35} onChange={e=>patch({bgOpacity:clamp(e.target.value,0,100)})}/></label></div><div className="participants-grid"><div className="card"><h2>Editor XY — 1920 × 1080</h2><XYStage guests={guests} patch={patchG} bg={scene.background} opacity={scene.bgOpacity??35}/></div><div className="guestlist">{guests.map(g=><div className="card guest" key={g.id}><div className="guest-title"><b>#{g.id} {g.name}</b><button className={g.visible?'visibility on':'visibility'} onClick={()=>patchG(g.id,{visible:!g.visible})}>{g.visible?'Ocultar':'Hacer visible'}</button></div><label>Nombre<input value={g.name} onChange={e=>patchG(g.id,{name:e.target.value})}/></label><label>VDO.Ninja<input value={g.url} placeholder="https://vdo.ninja/?view=..." onChange={e=>patchG(g.id,{url:e.target.value})}/></label><div className="xyinputs"><label>X<input type="number" value={Math.round(g.x)} onChange={e=>patchG(g.id,{x:clamp(e.target.value,0,1920-g.w)})}/></label><label>Y<input type="number" value={Math.round(g.y)} onChange={e=>patchG(g.id,{y:clamp(e.target.value,0,1080-g.h)})}/></label><label>W<input type="number" value={Math.round(g.w)} onChange={e=>patchG(g.id,{w:clamp(e.target.value,80,1920)})}/></label><label>H<input type="number" value={Math.round(g.h)} onChange={e=>patchG(g.id,{h:clamp(e.target.value,45,1080)})}/></label></div></div>)}</div></div></div>}
function XYStage({guests,patch,bg,opacity}){const ref=useRef(null),act=useRef(null);const to=(e,r)=>({x:(e.clientX-r.left)/r.width*1920,y:(e.clientY-r.top)/r.height*1080});const down=(e,g,corner=null)=>{e.preventDefault();e.stopPropagation();const r=ref.current.getBoundingClientRect(),p=to(e,r);act.current={id:g.id,corner,p,box:{x:g.x,y:g.y,w:g.w,h:g.h}};e.currentTarget.setPointerCapture?.(e.pointerId)};const move=e=>{const a=act.current;if(!a)return;const r=ref.current.getBoundingClientRect(),p=to(e,r),dx=p.x-a.p.x,dy=p.y-a.p.y,b=a.box;if(!a.corner)return patch(a.id,{x:clamp(b.x+dx,0,1920-b.w),y:clamp(b.y+dy,0,1080-b.h)});let{x,y,w,h}=b;const mw=80,mh=45,c=a.corner;if(c.includes('e'))w=clamp(b.w+dx,mw,1920-b.x);if(c.includes('s'))h=clamp(b.h+dy,mh,1080-b.y);if(c.includes('w')){const nx=clamp(b.x+dx,0,b.x+b.w-mw);w=b.w+(b.x-nx);x=nx}if(c.includes('n')){const ny=clamp(b.y+dy,0,b.y+b.h-mh);h=b.h+(b.y-ny);y=ny}patch(a.id,{x,y,w,h})};return <div className="xy" ref={ref} onPointerMove={move} onPointerUp={()=>act.current=null} onPointerCancel={()=>act.current=null}>{bg?.url&&<img src={bg.url} className="xybg" alt="" style={{opacity:clamp(opacity,0,100)/100}}/>}<div className="safe-frame"/>{guests.filter(g=>g.visible).map(g=><div key={g.id} className="box" style={{left:`${g.x/19.2}%`,top:`${g.y/10.8}%`,width:`${g.w/19.2}%`,height:`${g.h/10.8}%`}} onPointerDown={e=>down(e,g)}><span>#{g.id}</span><small>{g.name}</small>{['nw','ne','sw','se'].map(c=><i key={c} className={`handle ${c}`} onPointerDown={e=>down(e,g,c)}/>)}</div>)}</div>}

const out=window.location.pathname.replace(/\/+$/,'')==='/output';if(out)document.body.classList.add('output-mode');createRoot(document.getElementById('root')).render(out?<Output/>:<App/>);
