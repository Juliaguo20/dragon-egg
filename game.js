import * as THREE from 'three';
import {DRAGONS,STORY,CARDS,EGG,POWER,ATTACKS} from './content.js';
import {FLOOR,rand,V,mat,mesh,preload,prop,shadow,rockGeo,cracks,makeDragon,gem,flame,cloud,Effects} from './world.js';
import {startSensor,sensorActive,drag,updateCamera} from './ar.js';

const $=id=>document.getElementById(id);
const show=(id,v=true)=>$(id).classList.toggle('hidden',!v);
const clamp=THREE.MathUtils.clamp, TAU=Math.PI*2;
const SAVE='dragon-egg-quest-v1';

/* ---------- renderer ---------- */
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2)); $('view').appendChild(renderer.domElement);
const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(66,1,.01,50), world=new THREE.Group();
scene.add(new THREE.HemisphereLight(0xdbe8ff,0x4a342a,1.7));
const sun=new THREE.DirectionalLight(0xffd2a0,2.2); sun.position.set(1,2,1.5); scene.add(sun,world);
const fx=new Effects(scene);
function resize(){renderer.setSize(innerWidth,innerHeight); camera.aspect=innerWidth/innerHeight; camera.setViewOffset(innerWidth,innerHeight,0,innerHeight*.08,innerWidth,innerHeight)}
addEventListener('resize',resize); resize();

/* ---------- sound ---------- */
let ac, noiseBuf, windGain, muted=false;
function initAudio(){
  if(ac){ac.resume();return}
  const AC=window.AudioContext||window.webkitAudioContext; if(!AC)return;
  ac=new AC(); ac.resume();
  noiseBuf=ac.createBuffer(1,ac.sampleRate*2,ac.sampleRate); const d=noiseBuf.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  const s=ac.createBufferSource(), f=ac.createBiquadFilter(); s.buffer=noiseBuf; s.loop=true; f.type='bandpass'; f.frequency.value=450;
  windGain=ac.createGain(); windGain.gain.value=0; s.connect(f).connect(windGain).connect(ac.destination); s.start();
}
function tone(freq,end,dur,delay=0,type='triangle',vol=.22){
  if(!ac||muted)return; const o=ac.createOscillator(),g=ac.createGain(),t=ac.currentTime+delay;
  o.type=type; o.frequency.setValueAtTime(freq,t); o.frequency.exponentialRampToValueAtTime(end,t+dur);
  g.gain.setValueAtTime(.001,t); g.gain.exponentialRampToValueAtTime(vol,t+.02); g.gain.exponentialRampToValueAtTime(.001,t+dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t+dur+.02);
}
function noise(freq,dur,vol=.35,delay=0){
  if(!ac||muted)return; const s=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain(),t=ac.currentTime+delay;
  s.buffer=noiseBuf; f.type='lowpass'; f.frequency.value=freq; g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.001,t+dur);
  s.connect(f).connect(g).connect(ac.destination); s.start(t,Math.random(),dur+.02);
}
const sfx={
  thud:()=>tone(150,70,.14,0,'sine',.35),
  echo:()=>[0,.28].forEach(d=>tone(620,380,.2,d,'sine',.3)),
  crack:()=>[0,.06,.12,.19].forEach(d=>noise(3500,.05,.4,d)),
  chirp:()=>[0,.28].forEach(d=>tone(520,1300,.2,d)),
  win:()=>[523,659,784,1047].forEach((f,i)=>tone(f,f*1.01,.3,i*.14)),
  bad:()=>tone(220,90,.45,0,'sawtooth',.15),
  roar:()=>{tone(180,55,.9,0,'sawtooth',.22);noise(500,.9,.3)},
  power:k=>k==='water'?[0,.1,.2,.3].forEach(d=>noise(1800,.25,.25,d)):noise(k==='fire'?700:1100,.9,.4)
};

/* ---------- state ---------- */
let S={step:0,mode:'app',hints:0,misses:0,startAt:0,hearts:3,battle:false};
const save=()=>{try{localStorage.setItem(SAVE,JSON.stringify(S))}catch(e){}};
const saved=()=>{try{return JSON.parse(localStorage.getItem(SAVE))}catch(e){return null}};
const clearSave=()=>{try{localStorage.removeItem(SAVE)}catch(e){}};

let phase='loading', T=0, phaseT=0, run=0;
let tickers=[], tapHandler=null, moveHandler=null, holding=false, lastP=null, downAt=null, windy=false, ambient=null, tracked=null;
const dragons={};
const clock=new THREE.Clock();

/* Timers that are cancelled automatically when the scene changes. */
function later(sec,fn){const id=run;let t=sec;tickers.push(dt=>{if(id!==run)return false;t-=dt;if(t<=0){fn();return false}return true})}
function every(fn){const id=run;tickers.push(dt=>id===run&&fn(dt)!==false)}
function tween(sec,fn,done){let t=0;every(dt=>{t+=dt;const k=Math.min(1,t/sec);fn(k*k*(3-2*k),k);if(k===1){done&&done();return false}})}

function setPhase(p){
  phase=p; phaseT=0; run++; tickers=[]; tapHandler=moveHandler=null; windy=false; tracked=null;
  show('meter',false); show('scanner',false); show('hearts',p==='battle');
  $('dock').classList.toggle('pass',false); clue(''); actions();
}
function clearWorld(){world.clear();fx.clear();loose.forEach(o=>scene.remove(o));loose=[];ambient=null;Object.values(dragons).forEach(d=>scene.remove(d.root))}
let loose=[];
/* Turn the scene so that "angle 0" is wherever the player is facing now. */
function recenter(){const f=camera.getWorldDirection(V());if(Math.hypot(f.x,f.z)>.05)world.rotation.y=Math.atan2(-f.x,-f.z);else world.rotation.y=0;world.updateMatrixWorld(true)}
const at=(deg,dist,y)=>{const a=THREE.MathUtils.degToRad(deg);return V(Math.sin(a)*dist,y,-Math.cos(a)*dist)};
const worldPos=o=>o.getWorldPosition(V());
const inFront=(x,y,z)=>world.worldToLocal(camera.localToWorld(V(x,y,-z)));
const lookHint=()=>sensorActive()?'Move your phone to look around.':'Drag to look around.';
const say=t=>{$('msg').textContent=t};
const clue=t=>{$('clue').textContent=t};
function actions(...list){
  $('actions').replaceChildren(...list.map(([label,fn,alt])=>{const b=document.createElement('button');b.textContent=label;if(alt)b.className='alt';b.onclick=()=>{initAudio();fn(b)};return b}));
}
function hud(){
  const done=CARDS.slice(0,S.step);
  $('count').textContent=`🥚 ${done.filter(c=>c.type==='egg').length}/3   💎 ${done.filter(c=>c.type==='gem').length}/3`;
  $('hearts').textContent='❤️'.repeat(S.hearts)+'🖤'.repeat(3-S.hearts);
}
function meter(v){show('meter');$('fill').style.width=clamp(v,0,1)*100+'%'}
function place(d,pos,scale){d.root.position.copy(pos);d.root.scale.setScalar(scale);d.root.rotation.set(0,0,0);d.spin.rotation.set(0,0,0);d.play('Flying_loop');world.add(d.root);return d}
/* Keeps a dragon circling around the player until paused. */
function fly(d,{angle=0,dist=2.3,y=.15,speed=.5}={}){
  const o={a:angle,paused:false,blend:1,from:V()};
  o.resume=()=>{o.from.copy(d.root.position);o.blend=0;o.paused=false;d.play('Flying_loop')};
  every(dt=>{
    if(o.paused)return; o.a+=speed*dt;
    const p=V(Math.sin(o.a)*dist,y+Math.sin(T*1.7+angle)*.18,-Math.cos(o.a)*dist);
    o.blend=Math.min(1,o.blend+dt*.8); d.root.position.copy(o.blend<1?o.from.clone().lerp(p,o.blend):p);
    const dir=Math.sign(speed); d.root.rotation.set(0,Math.atan2(Math.cos(o.a)*dir,Math.sin(o.a)*dir),0);
  });
  return o;
}
function face(d,target){const p=world.localToWorld(d.root.position.clone());d.root.lookAt(target.x,p.y,target.z)}
/* Fly to a spot, then turn toward a target. */
function swoop(d,to,target,sec,done){const from=d.root.position.clone();tween(sec,k=>{d.root.position.lerpVectors(from,to,k);face(d,target)},done)}
function aim(o){
  const v=worldPos(o).applyMatrix4(camera.matrixWorldInverse), n=v.clone().applyMatrix4(camera.projectionMatrix);
  return {on:v.z<0&&Math.abs(n.x)<.95&&n.y<.8&&n.y>-.5,v,n};
}
function track(o,label,delay=0){tracked={o,label,from:T+delay}}
function drawArrow(){
  const el=$('arrow'), a=tracked&&T>=tracked.from?aim(tracked.o):null;
  if(!a||a.on){show('arrow',false);return}
  const side=Math.atan2(a.v.x,-a.v.z); let x=innerWidth/2,y=innerHeight*.4,text;
  if(Math.abs(side)>.28){const r=side>0;x=r?innerWidth-85:85;text=r?`${tracked.label} ▶`:`◀ ${tracked.label}`}
  else if(a.v.y>0){y=innerHeight*.18;text=`▲ ${tracked.label}`}else{y=innerHeight*.58;text=`▼ ${tracked.label}`}
  el.textContent=text; el.style.left=x+'px'; el.style.top=y+'px'; show('arrow');
}
/* Small drifting particles all around, so the real room becomes the scene. */
function weather(kind){ambient={kind,t:0}}

/* ---------- camera and QR ---------- */
const video=$('video'), qrCanvas=document.createElement('canvas');
let stream=null;
async function openCamera(){
  if(stream&&stream.getVideoTracks().some(t=>t.readyState==='live')){video.play().catch(()=>{});return true}
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280}},audio:false});
    video.srcObject=stream; show('video'); await video.play(); return true;
  }catch(e){console.warn('camera unavailable',e.name);stream=null;show('video',false);return false}
}
function parseCard(text){
  const t=String(text).trim(); let id=null;
  try{id=new URL(t).searchParams.get('card')}catch(e){}
  return CARDS.find(c=>c.id===id||c.code===t.toUpperCase())||null;
}
/* Returns true when the card is the one the player needs now. */
function useCard(card){
  const need=CARDS[S.step];
  if(!card)return false;
  if(card!==need){
    const i=CARDS.indexOf(card);
    say(i<S.step?'You already used this card. Follow your new clue.':'Not here yet! Check your clue and try another place.');
    sfx.bad(); return false;
  }
  show('codebox',false); sfx.chirp();
  card.type==='egg'?eggScene(card):gemScene(card);
  return true;
}

/* Dragons you have already hatched keep flying around you. */
function companions(){
  CARDS.slice(0,S.step).filter(c=>c.type==='egg').forEach((c,i)=>{
    const fed=CARDS.slice(0,S.step).some(g=>g.type==='gem'&&g.dragon===c.dragon), a=.35+i*2.1, y=.4+i*.08;
    place(dragons[c.dragon],at(a*57.3,2.3,y),fed?.9:.55); fly(dragons[c.dragon],{angle:a,dist:2.3,y,speed:.45});
  });
}

/* ---------- hunt ---------- */
function hunt(){
  const card=CARDS[S.step]; setPhase('hunt'); clearWorld(); recenter(); companions(); hud(); save();
  const app=S.mode==='app';
  let level=0;
  say(app?card.whisper:`Next treasure: ${card.title}. Find the next paper clue!`);
  clue(app?`“${card.clue}”`:'');
  const buttons=()=>{
    const list=[['📷 Scan QR card',scan]];
    if(app){
      list.push([level===0?'💡 Hint':level===1?'💡 Show the answer':'💡 Answer shown',b=>{
        if(level>=2)return; level++; S.hints++; save(); clue(level===1?card.hint:card.answer); buttons();
      },true]);
      list.push(['🔊 Read aloud',()=>{try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance($('clue').textContent);u.lang='en-US';u.rate=.9;speechSynthesis.speak(u)}catch(e){}},true]);
    }
    actions(...list);
    if(list.length>2){ // hint and read-aloud share one row
      const row=document.createElement('div');row.className='row';row.append(...[...$('actions').children].slice(1));$('actions').append(row);
    }
  };
  buttons();
}
async function scan(){
  setPhase('scan'); say('Opening the camera…');
  actions(['Type the code instead',codeBox,true],['Back to clue',hunt,true]);
  const id=run, ok=await openCamera(); if(id!==run)return;
  if(!ok){say('The camera is not available. Type the code printed on the card.');return}
  show('scanner'); say('Point the camera at the QR card.');
  let wait=0, mute=0, last=null;
  every(dt=>{
    wait-=dt; mute-=dt; if(wait>0||video.readyState<2||!window.jsQR)return; wait=.15;
    const w=Math.min(640,video.videoWidth), h=Math.round(w*video.videoHeight/video.videoWidth); if(!w||!h)return;
    qrCanvas.width=w; qrCanvas.height=h; const g=qrCanvas.getContext('2d',{willReadFrequently:true}); g.drawImage(video,0,0,w,h);
    const r=window.jsQR(g.getImageData(0,0,w,h).data,w,h,{inversionAttempts:'dontInvert'}); if(!r)return;
    const c=parseCard(r.data);
    if(c===last&&mute>0)return; last=c; mute=3;
    if(!c){say('That is not a quest card. Look for a Dragon Egg Quest card.');return}
    useCard(c);
  });
}
function codeBox(){$('code').value='';$('codemsg').textContent='';show('codebox')}
$('codeback').onclick=()=>show('codebox',false);
$('codeok').onclick=()=>{
  const c=parseCard($('code').value); $('code').blur();
  if(!c){$('codemsg').textContent='That code does not match. Check the letters.';return}
  if(!useCard(c))$('codemsg').textContent='Not the card you need now. Check your clue.';
};

/* ---------- touch ---------- */
const ray=new THREE.Raycaster(), ndc=new THREE.Vector2();
function hit(e,objects){ndc.set(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2);ray.setFromCamera(ndc,camera);return ray.intersectObjects(objects,true)[0]}
const near=(e,o,r=90)=>{if(!aim(o).on&&worldPos(o).applyMatrix4(camera.matrixWorldInverse).z>0)return false;const [x,y]=screenOf(o);return Math.hypot(e.clientX-x,e.clientY-y)<r};
const screenOf=o=>{const v=worldPos(o).project(camera);return[(v.x+1)/2*innerWidth,(1-v.y)/2*innerHeight]};
$('touch').addEventListener('pointerdown',e=>{initAudio();holding=true;lastP=[e.clientX,e.clientY];downAt=[e.clientX,e.clientY];try{$('touch').setPointerCapture(e.pointerId)}catch(x){}});
$('touch').addEventListener('pointermove',e=>{if(!holding)return;const p=[e.clientX,e.clientY];if(moveHandler)moveHandler(lastP,p);else drag(p[0]-lastP[0],p[1]-lastP[1]);lastP=p});
$('touch').addEventListener('pointerup',e=>{const tap=downAt&&Math.hypot(e.clientX-downAt[0],e.clientY-downAt[1])<16;holding=false;lastP=downAt=null;if(tap&&tapHandler)tapHandler(e)});
$('touch').addEventListener('pointercancel',()=>{holding=false;lastP=downAt=null});
let debugEgg=null, debugTarget=null;

/* ---------- eggs ---------- */
function eggScene(card){
  const kind=card.dragon, info=EGG[kind];
  setPhase('find'); clearWorld(); recenter(); weather(kind); companions();
  say(`${info.find} ${lookHint()}`);
  const spots=[-8,-72,68,-140,142].map(a=>a+rand(-12,12));
  const which=1+Math.floor(Math.random()*4); // never the rock straight ahead: the player has to turn
  let egg, shine, knocks=0, stuck=false;
  const rocks=spots.map((deg,i)=>{
    const geo=rockGeo(), hue={fire:[.02,.08,.36],water:[.56,.22,.58],wind:[.6,.05,.44]}[kind];
    const m=mesh(geo,mat(new THREE.Color().setHSL(hue[0],hue[1],hue[2]+rand(-.03,.03))));
    const p=at(deg,rand(1.45,1.8),FLOOR);
    m.position.set(p.x,FLOOR-geo.boundingBox.min.y*1.35,p.z); m.scale.setScalar(1.35); m.rotation.y=-THREE.MathUtils.degToRad(deg);
    m.userData={y:m.position.y,flip:0}; world.add(m);
    const sh=shadow(.19); sh.position.copy(p); world.add(sh);
    for(const side of [-.26,.27]){
      let t;
      if(kind==='wind'){t=prop('grass_large',rand(.12,.19),0xc3a35a);t.userData.sway=true}
      else if(kind==='water')t=mesh(new THREE.ConeGeometry(.03,rand(.1,.2),5),mat(0xd9f6ff,{roughness:.2}),0,.06,0);
      else t=mesh(new THREE.OctahedronGeometry(rand(.025,.045)),new THREE.MeshBasicMaterial({color:0xff6a2a}),0,.03,0);
      const g=new THREE.Group(); g.add(t); g.userData=t.userData; const q=at(deg+side*38,1.65,FLOOR); g.position.copy(q); world.add(g);
    }
    if(i===which){egg=m;shine=cracks(geo,{fire:0xff3d12,water:0x8fe6ff,wind:0xa8fff4}[kind]);m.add(shine)}
    return m;
  });
  // cracks are generated on the +z side, which already faces the player after the yaw above
  const ring=mesh(new THREE.TorusGeometry(.22,.012,6,36),new THREE.MeshBasicMaterial({color:0xffe27a}),egg.position.x,FLOOR+.015,egg.position.z);
  ring.rotation.x=Math.PI/2; ring.visible=false; world.add(ring); debugEgg=egg;
  const ripple=()=>{for(const d of [0,.28])later(d,()=>{
    const r=mesh(new THREE.TorusGeometry(.17,.008,6,36),new THREE.MeshBasicMaterial({color:0xbdf2ff,transparent:true}),egg.position.x,FLOOR+.025,egg.position.z);
    r.rotation.x=Math.PI/2; world.add(r);
    tween(.8,k=>{r.scale.setScalar(1+k*1.5);r.material.opacity=1-k},()=>world.remove(r));
  })};
  tapHandler=e=>{
    const h=hit(e,rocks); if(!h)return; let o=h.object; while(o&&!rocks.includes(o))o=o.parent; if(!o)return;
    if(o===egg){
      if(kind==='water'&&knocks===0){knocks++;sfx.echo();ripple();say('Knock, knock! Something inside answered. Tap it again to pick it up.');return}
      hatch(card,egg,shine);return;
    }
    if(kind==='water')sfx.thud();
    if(!o.userData.flip){o.userData.flip=.001;S.misses++;say('Just a rock. Keep looking around!')}
  };
  every(dt=>{
    const cyc=phaseT%4.5, late=cyc-.55, wob=late>0&&late<1.2?Math.sin(late/1.2*Math.PI):0;
    if(kind==='wind'){
      egg.rotation.z=Math.sin(T*16)*.13*wob*(stuck?1.8:1); shine.userData.mat.opacity=wob*(stuck?1:.8);
    }else if(kind==='fire'){
      const pulse=Math.max(0,Math.sin(phaseT*2.1))**4; shine.userData.mat.opacity=pulse*(stuck?1:.85);
      egg.material.emissive.setHex(0xff2200); egg.material.emissiveIntensity=stuck?pulse*.35:0;
    }else{
      shine.userData.mat.opacity=knocks?.7:0;
      if(stuck&&phaseT%3<dt){ripple();sfx.echo()}
    }
    rocks.forEach(r=>{const u=r.userData;if(u.flip){u.flip+=dt/1.1;const f=Math.min(u.flip,1);r.rotation.x=f*TAU;r.position.y=u.y+Math.sin(f*Math.PI)*.2;if(u.flip>=1){u.flip=0;r.rotation.x=0;r.position.y=u.y}}});
    ring.scale.setScalar(1+.08*Math.sin(T*6));
  });
  windy=kind==='wind';
  later(25,()=>{stuck=true;say(info.stuck)});
  later(45,()=>{ring.visible=true;track(egg,'Egg');say('Need help? Follow the arrow and tap the rock in the yellow ring.')});
}

function hatch(card,egg,shine){
  const kind=card.dragon, color={fire:0xff8a2a,water:0xbdf2ff,wind:0xc8fff6}[kind];
  const start=worldPos(egg);
  setPhase('hatch'); sfx.crack(); clearWorld(); weather(kind);
  // the egg now stays in front of the player while it is hatched
  scene.add(egg); loose.push(egg); egg.position.copy(start); egg.rotation.set(0,0,0);
  say(EGG[kind].hatch); $('dock').classList.add('pass');
  let p=0, stage=0, spark=0, ice=null; meter(0);
  if(kind==='water'){ice=mesh(new THREE.BoxGeometry(.4,.46,.4),new THREE.MeshStandardMaterial({color:0xbfefff,transparent:true,opacity:.42,roughness:.1,flatShading:true}));scene.add(ice);loose.push(ice)}
  const span=Math.min(innerWidth,500);
  moveHandler=(a,b)=>{
    if(phaseT<.6)return;
    if(kind==='fire')p+=Math.min(Math.hypot(b[0]-a[0],b[1]-a[1]),80)/(span*7);
    if(kind==='wind'){ // only turning around the egg counts
      const [cx,cy]=screenOf(egg); if(Math.hypot(b[0]-cx,b[1]-cy)<15)return;
      let d=Math.atan2(b[1]-cy,b[0]-cx)-Math.atan2(a[1]-cy,a[0]-cx); d=Math.atan2(Math.sin(d),Math.cos(d));
      p+=Math.min(Math.abs(d),.8)/(TAU*4);
    }
  };
  every(dt=>{
    egg.position.lerp(camera.localToWorld(V(0,-.05,-1.15)),Math.min(1,dt*7));
    if(kind==='water'&&holding&&phaseT>.6)p+=dt/3.5;
    if(!holding)p=Math.max(0,p-dt*.015);
    p=Math.min(p,1); meter(p);
    egg.rotation.z=Math.sin(T*(10+p*18))*(.03+p*.22); shine.userData.mat.opacity=.25+p*.75;
    if(kind==='fire'){egg.material.emissive.setHex(0xff3300);egg.material.emissiveIntensity=p*.5}
    if(ice){ice.position.copy(egg.position);ice.scale.set(1-p*.5,1-p*.85,1-p*.5);ice.position.y-=.2*p}
    spark-=dt;
    if(spark<=0&&(holding||p>.05)){
      spark=.1-p*.06; const a=rand(0,TAU), q=egg.position.clone().add(V(Math.cos(a)*.24,rand(-.12,.18),Math.sin(a)*.24));
      fx.add('spark',color,q,kind==='wind'?V(-Math.sin(a)*.7,.15,Math.cos(a)*.7):V(0,kind==='fire'?.35:-.25,0),.6);
    }
    const st=Math.floor(p*3); if(st>stage&&p<1){stage=st;sfx.crack();fx.burst(0x8d9298,egg.position,6);say(st===1?'A crack! Keep going!':'Almost there!')}
    if(p>=1){born(card,egg.position.clone());return false}
  });
}

function born(card,eggPos){
  const kind=card.dragon, info=EGG[kind], d=dragons[kind];
  setPhase('born'); clearWorld(); recenter(); weather(kind); fx.burst(0x8d9298,eggPos,26); sfx.crack(); sfx.chirp();
  const home=inFront(0,-.05,1.3);
  place(d,home,.7); d.play('Idle_loop'); face(d,V()); say(`A baby ${DRAGONS[kind].name}!`);
  track(d.root,'Baby dragon',.5);
  tween(.6,k=>d.root.scale.setScalar(.15+.55*k));
  later(1.8,()=>{
    say(info.baby);
    if(kind==='wind'){const y=d.root.position.y;tween(1.1,k=>{d.spin.rotation.x=-k*TAU;d.root.position.y=y+Math.sin(k*Math.PI)*.3})}
    else{fx.puff(kind==='fire'?'smoke':'bubble',kind==='fire'?0x333333:0xbdf2ff,d.mouth(),18,.14,.2);sfx.thud()}
  });
  later(3.6,()=>{
    say('It flutters around you. Turn and watch it!'); fly(d,{angle:0,dist:1.7,y:-.1,speed:.55}).resume();
    track(d.root,'Baby dragon');
    actions([`💎 Find the ${DRAGONS[kind].gem}`,()=>{S.step++;hunt()}]);
  });
  hud(); $('count').textContent=$('count').textContent.replace(/🥚 \d/,`🥚 ${CARDS.slice(0,S.step+1).filter(c=>c.type==='egg').length}`);
}

/* ---------- gems and powers ---------- */
function gemScene(card){
  const kind=card.dragon, D=DRAGONS[kind], d=dragons[kind];
  setPhase('gem'); clearWorld(); recenter(); weather(kind);
  const side=Math.random()<.5?-1:1;
  place(d,at(0,1.9,0),.7); const orbit=fly(d,{angle:0,dist:1.9,y:0,speed:.6*side});
  const g=gem(D.gemColor,.12); const home=at(side*rand(100,165),1.5,-.25); g.position.copy(home); world.add(g); debugTarget=g;
  say(`The ${D.gem} is floating somewhere around you. Find it and tap it! ${lookHint()}`);
  every(()=>{g.rotation.y=T*1.6;g.position.y=home.y+Math.sin(T*3)*.05});
  track(g,D.gem,6);
  tapHandler=e=>{
    if(!near(e,g))return; tapHandler=null; sfx.chirp();
    setPhase('feed'); orbit.paused=true; say('Your dragon swoops in to eat it…'); track(g,D.gem);
    const gp=g.position.clone(), beside=gp.clone().multiplyScalar(.82).add(V(0,.12,0));
    swoop(d,beside,worldPos(g),1.4,()=>{
      tween(.7,k=>{g.position.lerpVectors(gp,world.worldToLocal(d.mouth()),k);g.scale.setScalar(1-k*.85)},()=>{
        world.remove(g); sfx.win(); fx.puff('spark',D.gemColor,worldPos(d.root),50,.5,.4); say('Gulp! Your dragon is growing!'); track(d.root,D.name);
        tween(1.4,k=>d.root.scale.setScalar(.7+.5*k),()=>tryPower(card));
      });
    });
  };
}
function tryPower(card){
  const kind=card.dragon, d=dragons[kind], D=DRAGONS[kind];
  const from=d.root.position.clone();
  setPhase('power'); weather(kind);
  const orbit=fly(d,{angle:Math.atan2(from.x,-from.z),dist:1.9,y:.1,speed:.55}); orbit.resume();
  // the target appears somewhere away from where the player is looking
  const look=inFront(0,0,1), base=Math.atan2(look.x,-look.z)*180/Math.PI, deg=base+(Math.random()<.5?-1:1)*rand(80,140);
  const holder=new THREE.Group(); holder.position.copy(at(deg,1.9,FLOOR+.1)); world.add(holder); let extra, name, height=.4;
  if(kind==='fire'){name='Torch';extra=mesh(new THREE.CylinderGeometry(.03,.045,.45,6),mat(0x6b4a2e),0,.22,0);holder.add(extra);height=.45}
  if(kind==='water'){name='Campfire';extra=flame(2.4);holder.add(extra);height=.15;
    for(const a of [.8,-.8]){const log=mesh(new THREE.CylinderGeometry(.033,.033,.32,6),mat(0x6b4a2e),0,.02,0);log.rotation.set(Math.PI/2,0,a);holder.add(log)}}
  if(kind==='wind'){name='Dark cloud';extra=cloud();holder.position.y=.15;holder.add(extra);height=0}
  const mark=new THREE.Object3D(); mark.position.y=height; holder.add(mark); debugTarget=mark;
  say(`New power! ${POWER[kind].try}`); track(mark,name,4);
  tapHandler=e=>{
    if(!near(e,mark,110))return; tapHandler=null; orbit.paused=true; say('Watch your dragon!'); track(mark,name);
    const target=worldPos(mark);
    swoop(d,inFront(-.32,-.2,1.25),target,1.1,()=>{
      d.play('Attack'); sfx.power(kind); fx.stream(kind,d.mouth(),target,100);
      later(.9,()=>{
        if(kind==='fire'){const f=flame(1.8);f.position.y=height;holder.add(f);every(()=>{f.scale.y=1+Math.sin(T*15)*.15})}
        if(kind==='water'){tween(.8,k=>extra.scale.setScalar(2.4*(1-k)+.001));fx.puff('smoke',0xcccccc,target,14,.15,.25)}
        if(kind==='wind')tween(1,k=>{extra.position.x=k*1.6;extra.userData.mat.opacity=.96*(1-k);extra.rotation.z=k*3});
      });
      later(1.8,()=>{
        orbit.resume(); say(POWER[kind].done); sfx.win(); S.step++; hud(); save(); track(d.root,D.name,2);
        const last=S.step>=CARDS.length;
        actions([last?'⚔️ Face the Storm Dragon':'🥚 Find the next egg',()=>last?battleIntro():hunt()]);
      });
    });
  };
}

/* ---------- battle ---------- */
function battleStage(){
  clearWorld(); recenter(); weather('storm');
  place(dragons.storm,at(0,2.8,.35),1.9);
  const boss=dragons.storm, path=fly(boss,{angle:0,dist:2.8,y:.35,speed:.2});
  const team=['fire','water','wind'].map((k,i)=>{const a=(i-1)*2.1+1;const d=place(dragons[k],at(a*57.3,2,-.35),.75);d.orbit=fly(d,{angle:a,dist:2,y:-.38,speed:-.28});return d});
  debugTarget=boss.root; track(boss.root,'Storm Dragon',1);
  return {boss,path,team};
}
function battleIntro(){
  S.battle=true; S.hearts=3; save(); setPhase('intro'); hud(); battleStage(); sfx.roar(); track(dragons.storm.root,'Storm Dragon',1);
  say(`The Storm Dragon is flying around you! Keep it on your screen, then choose the dragon that can stop it. You have 3 hearts. ${lookHint()}`);
  actions(['Start the battle',battle]);
}
function battle(){
  setPhase('battle'); S.hearts=3; hud(); const {boss,path,team}=battleStage();
  const order=[...ATTACKS].sort(()=>Math.random()-.5); let round=0;
  const center=()=>worldPos(boss.root);
  const next=()=>{
    const a=order[round]; let shield, active=true; sfx.roar(); boss.play('Attack'); later(1,()=>boss.play('Flying_loop'));
    path.speed=0;
    if(a.beats==='fire')shield=mesh(new THREE.IcosahedronGeometry(.66,1),new THREE.MeshStandardMaterial({color:0xaee8ff,transparent:true,opacity:.4,flatShading:true,depthWrite:false}));
    if(a.beats==='wind'){shield=cloud();shield.scale.setScalar(2.5)}
    if(shield){world.add(shield);every(()=>{if(!shield.parent)return false;if(active){shield.position.copy(boss.root.position);if(a.beats==='wind')shield.lookAt(0,shield.position.y,0)}})}
    if(a.beats==='water'){let t=0;every(dt=>{if(!active)return false;t-=dt;if(t<=0){t=.1;const m=boss.mouth(),v=m.clone().multiplyScalar(-.45).add(V(rand(-.4,.4),rand(.1,.7),rand(-.4,.4)));fx.add('shell',Math.random()<.5?0xff4a12:0xffa21f,m,v,1,-1.6)}})}
    debugTarget=boss.root; track(boss.root,'Storm Dragon');
    const choose=k=>{
      if(!aim(boss.root).on){
        const warn='Turn your phone and get the Storm Dragon on your screen first!'; say(warn); sfx.thud();
        later(2.5,()=>{if(active&&$('msg').textContent===warn)say(`Round ${round+1} of 3: ${a.text}`)}); return;
      }
      const d=team[['fire','water','wind'].indexOf(k)]; actions(); d.orbit.paused=true; say(`${DRAGONS[k].name}, go!`);
      const target=center();
      swoop(d,inFront(-.3,-.3,1.35),target,.8,()=>{
        d.play('Attack'); sfx.power(k); fx.stream(k,d.mouth(),center(),100);
        if(k!==a.beats){
          later(1.2,()=>{d.orbit.resume();S.hearts--;S.misses++;hud();save();sfx.bad();
            if(S.hearts<=0){active=false;say('Your dragons need a rest. Remember what each power does, then try again!');actions(['Try the battle again',battle]);return}
            say(a.miss);buttons()});
          return;
        }
        later(.8,()=>{
          active=false;
          if(shield){const from=shield.position.clone();tween(.8,k2=>{if(a.beats==='fire'){shield.scale.setScalar(1+k2*.6);shield.material.opacity=.4*(1-k2)}else{shield.position.x=from.x+k2*2.5;shield.userData.mat.opacity=.96*(1-k2)}},()=>world.remove(shield))}
          else fx.puff('smoke',0x999999,center(),30,.5,.3);
          sfx.win(); say(a.win);
        });
        later(2.2,()=>{d.orbit.resume();round++;
          if(round<order.length){ // the boss escapes to another part of the room
            say('It is flying away! Follow it!'); path.speed=(Math.random()<.5?-1:1)*rand(.9,1.2); later(2.4,next);
          }else defeat(boss,path,team)});
      });
    };
    const buttons=()=>{
      actions(...['fire','water','wind'].map(k=>[`${DRAGONS[k].icon} ${DRAGONS[k].name.split(' ')[0]}`,()=>choose(k),true]));
      const row=document.createElement('div');row.className='row';row.append(...$('actions').children);$('actions').append(row);
    };
    say(`Round ${round+1} of 3: ${a.text}`); buttons();
  };
  say('Here it comes! Keep your eyes on it.'); later(2,next);
}
function defeat(boss,path,team){
  actions(); show('hearts',false); say('All three attacks are broken! The Storm Dragon is falling!'); sfx.roar(); path.paused=true; track(boss.root,'Storm Dragon');
  const from=boss.root.position.clone();
  tween(1.8,k=>{boss.root.position.set(from.x*(1+k*.1),from.y-k*1.4,from.z*(1+k*.1));boss.root.rotation.z=k*3.5;boss.root.scale.setScalar(1.9*(1-k*.8))},()=>{
    world.remove(boss.root);
    const st=gem(0xc36bff,.17); st.userData.halo.material.color.set(0xffe27a); st.position.copy(from); world.add(st); debugTarget=st;
    const land=from.clone().setY(0).normalize().multiplyScalar(1.8).setY(-.3);
    tween(1.2,k=>st.position.lerpVectors(from,land,k)); track(st,'Power Stone');
    every(()=>{st.rotation.y=T*1.8;st.userData.halo.scale.setScalar(1+.12*Math.sin(T*5))});
    later(1.3,()=>{say('The Power Stone! Find it and tap it to claim it.');tapHandler=e=>{if(near(e,st,110))finale(st,team)}});
  });
}
function finale(stone,team){
  setPhase('finale'); weather('wind'); sfx.win(); say('The Power Stone shines! Fire, water and wind join together!'); track(stone,'Power Stone');
  const c=stone.position.clone(), up=c.clone().setY(.45);
  every(()=>{stone.rotation.y=T*4});
  tween(1.2,k=>stone.position.lerpVectors(c,up,k));
  // three dragons gather around the stone
  const dir=c.clone().setY(0).normalize(), right=V(-dir.z,0,dir.x);
  team.forEach((d,i)=>{const to=c.clone().addScaledVector(right,(i-1)*.55).addScaledVector(dir,i===1?.45:0).setY(i===1?.1:-.2), s0=d.root.scale.x;
    d.play('Flying_loop'); swoop(d,to,world.localToWorld(c.clone()),1.4); tween(1.4,k=>d.root.scale.setScalar(s0+.2*k))});
  let t=0, a=0, shot=0;
  every(dt=>{ // three-colour tornado
    t+=dt; shot-=dt; a+=dt*9;
    if(t>1.2&&t<6){
      for(const [i,[k,col]] of [['fire',0xff7a1a],['water',0x3fa8ff],['wind',0x9affc8]].entries()){
        for(let j=0;j<2;j++){const h=((t*.55+j*.5+i*.17)%1), ang=a+i*TAU/3+h*8, r=.08+h*.42;
          fx.add(k,col,world.localToWorld(V(c.x+Math.cos(ang)*r,FLOOR+h*1.15,c.z+Math.sin(ang)*r)),V(-Math.sin(ang)*.4,.25,Math.cos(ang)*.4),.45)}
      }
      if(shot<=0){shot=1.1;sfx.power('wind');team.forEach((d,i)=>{d.play('Attack');fx.stream(['fire','water','wind'][i],d.mouth(),worldPos(stone),35)})}
    }
  });
  later(6,()=>{say('Your dragons are strong! Look around and watch them fly!');sfx.win();tracked=null;
    team.forEach((d,i)=>fly(d,{angle:Math.atan2(d.root.position.x,-d.root.position.z),dist:1.9+i*.25,y:i*.22-.1,speed:.75}).resume())});
  later(12,end);
}
function end(){
  setPhase('end'); say('');show('dock',false);
  const lost=3-S.hearts, stars=S.hints<=1&&lost===0?3:S.hints<=5&&lost<=1?2:1;
  const sec=Math.round((Date.now()-S.startAt)/1000);
  $('stars').textContent='★'.repeat(stars)+'☆'.repeat(3-stars);
  $('stats').textContent=`Time ${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')} · Hints ${S.hints} · Hearts left ${S.hearts}`;
  show('end'); clearSave();
}

/* ---------- loop ---------- */
function frame(){
  const dt=Math.min(clock.getDelta(),.05); T+=dt; phaseT+=dt;
  const now=tickers; tickers=[]; const keep=now.filter(f=>f(dt)!==false), id=run;
  tickers=keep.concat(tickers);
  const cyc=phaseT%4.5, gust=windy&&cyc<1.5?Math.sin(cyc/1.5*Math.PI):0;
  if(windGain)windGain.gain.value=muted?0:gust*.22;
  world.children.forEach((g,i)=>{if(g.userData.sway)g.rotation.z=-gust*(.5+.08*Math.sin(T*14+i))});
  if(ambient){
    ambient.t-=dt;
    if(ambient.t<=0){
      const k=ambient.kind; ambient.t=k==='wind'?(gust>.2?.04:.3):.09;
      const p=at(rand(0,360),rand(1.3,3),rand(FLOOR,.7)), v={fire:V(0,rand(.15,.35),0),water:V(0,-rand(.12,.25),0),wind:V(rand(.8,1.7),0,0),storm:V(rand(-.5,.5),rand(-.5,.1),0)}[k];
      const c={fire:0xff8a2a,water:0xe8fbff,wind:0xe9fffb,storm:0xb58cff}[k];
      fx.add('spark',c,world.localToWorld(p),v,1.4);
    }
  }
  world.updateMatrixWorld(true);
  Object.values(dragons).forEach(d=>{if(d.root.parent)d.update(dt)});
  updateCamera(camera); drawArrow(); fx.update(dt); renderer.render(scene,camera);
}

/* ---------- start ---------- */
function begin(resume){
  startSensor(); initAudio(); show('start',false); show('hud'); show('dock'); renderer.setAnimationLoop(frame);
  if(resume){S={...S,...saved()}}else{S={step:0,mode:document.querySelector('[name=mode]:checked').value,hints:0,misses:0,startAt:Date.now(),hearts:3,battle:false}}
  // Restore dragons that already exist, then go to the current step.
  openCamera().finally(()=>{
    const wanted=parseCard(location.href);
    if(S.step>=CARDS.length)battleIntro(); else{hunt(); if(wanted&&wanted===CARDS[S.step])useCard(wanted)}
  });
}
$('story').textContent=STORY;
$('go').onclick=()=>begin(false);
$('resume').onclick=()=>begin(true);
$('again').onclick=()=>{show('arrow',false);clearSave();show('end',false);show('credits',false);show('dock',false);show('hud',false);setPhase('start');clearWorld();history.replaceState(null,'',location.pathname);show('resume',false);show('start')};
$('credbtn').onclick=()=>$('credits').classList.toggle('hidden');
$('mute').onclick=()=>{muted=!muted;$('mute').textContent=muted?'Sound off':'Sound on'};

window.__game={get phase(){return phase},get step(){return S.step},get target(){return debugTarget},
  eggAt:()=>screenOf(debugEgg),targetAt:()=>screenOf(debugTarget),
  /* phone angles that point at an object (used for testing) */
  angles:name=>{const p=worldPos(name==='egg'?debugEgg:name==='boss'?dragons.storm.root:debugTarget),d=180/Math.PI;return{alpha:Math.atan2(-p.x,-p.z)*d,beta:90+Math.atan2(p.y,Math.hypot(p.x,p.z))*d,gamma:0}}};

(async()=>{
  try{
    await preload();
    for(const k of ['fire','water','wind','storm'])dragons[k]=await makeDragon(k);
    $('go').disabled=false; $('go').textContent='Start the quest';
    const s=saved(); if(s&&(s.step>0||s.battle)){show('resume')}
  }catch(e){console.error(e);$('go').textContent='Loading failed. Please refresh.'}
})();
