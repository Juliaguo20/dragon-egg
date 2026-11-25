import * as THREE from 'three';
import {DRAGONS,STORY,CARDS,EGG,POWER,ATTACKS} from './content.js';
import {GROUND,rand,V,mat,mesh,preload,scenery,rockGeo,cracks,makeDragon,gem,flame,cloud,Effects} from './world.js';

const $=id=>document.getElementById(id);
const show=(id,v=true)=>$(id).classList.toggle('hidden',!v);
const clamp=THREE.MathUtils.clamp, TAU=Math.PI*2;
const SAVE='dragon-egg-quest-v1';

/* ---------- renderer ---------- */
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2)); $('view').appendChild(renderer.domElement);
const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(48,1,.01,50), world=new THREE.Group();
scene.add(new THREE.HemisphereLight(0xdbe8ff,0x4a342a,1.7));
const sun=new THREE.DirectionalLight(0xffd2a0,2.2); sun.position.set(1,2,1.5); scene.add(sun,world);
const fx=new Effects(scene);
function resize(){
  renderer.setSize(innerWidth,innerHeight); camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  const dist=Math.max(2.15,.76/(Math.tan(THREE.MathUtils.degToRad(24))*camera.aspect));
  camera.position.set(0,dist*.34,dist); camera.lookAt(0,-.17,0);
}
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
let tickers=[], tapHandler=null, moveHandler=null, holding=false, lastP=null, windy=false;
const dragons={};
const clock=new THREE.Clock();

/* Timers that are cancelled automatically when the scene changes. */
function later(sec,fn){const id=run;let t=sec;tickers.push(dt=>{if(id!==run)return false;t-=dt;if(t<=0){fn();return false}return true})}
function every(fn){const id=run;tickers.push(dt=>id===run&&fn(dt)!==false)}
function tween(sec,fn,done){let t=0;every(dt=>{t+=dt;const k=Math.min(1,t/sec);fn(k*k*(3-2*k),k);if(k===1){done&&done();return false}})}

function setPhase(p){
  phase=p; phaseT=0; run++; tickers=[]; tapHandler=moveHandler=null; windy=false;
  show('meter',false); show('scanner',false); show('hearts',p==='battle');
  $('dock').classList.toggle('pass',false); clue(''); actions();
}
function clearWorld(){world.clear();fx.clear()}
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
function place(d,x,z,scale=1,face=0){d.root.position.set(x,GROUND+d.half*scale,z);d.root.scale.setScalar(scale);d.root.rotation.set(0,face,0);d.spin.rotation.set(0,0,0);d.play('Idle_loop');world.add(d.root);return d}

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

/* ---------- hunt ---------- */
function hunt(){
  const card=CARDS[S.step]; setPhase('hunt'); clearWorld(); hud(); save();
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
const near=(e,o,r=90)=>{const [x,y]=screenOf(o);return Math.hypot(e.clientX-x,e.clientY-y)<r};
const screenOf=o=>{const v=o.getWorldPosition(V()).project(camera);return[(v.x+1)/2*innerWidth,(1-v.y)/2*innerHeight]};
$('touch').addEventListener('pointerdown',e=>{initAudio();holding=true;lastP=[e.clientX,e.clientY];try{$('touch').setPointerCapture(e.pointerId)}catch(x){} tapHandler&&tapHandler(e)});
$('touch').addEventListener('pointermove',e=>{if(!holding)return;const p=[e.clientX,e.clientY];moveHandler&&moveHandler(lastP,p);lastP=p});
const release=()=>{holding=false;lastP=null};
$('touch').addEventListener('pointerup',release); $('touch').addEventListener('pointercancel',release);
let debugEgg=null, debugTarget=null;

/* ---------- eggs ---------- */
const slots=[[-.34,.12],[0,.27],[.34,.1],[-.17,-.17],[.18,-.19]];
function eggScene(card){
  const kind=card.dragon, info=EGG[kind];
  setPhase('find'); clearWorld(); const land=scenery(kind); world.add(land);
  say(`${card.place}. ${info.find}`);
  const which=Math.floor(Math.random()*5); let egg, shine, knocks=0, stuck=false;
  const rocks=slots.map(([x,z],i)=>{
    const geo=rockGeo(), hue={fire:[.02,.08,.36],water:[.56,.22,.58],wind:[.6,.05,.44]}[kind];
    const m=mesh(geo,mat(new THREE.Color().setHSL(hue[0],hue[1],hue[2]+rand(-.03,.03))));
    m.position.set(x,GROUND-geo.boundingBox.min.y-.012,z); m.rotation.y=rand(-.4,.4); m.userData={y:m.position.y,flip:0}; world.add(m);
    if(i===which){egg=m;shine=cracks(geo,{fire:0xff3d12,water:0x8fe6ff,wind:0xa8fff4}[kind]);m.add(shine)}
    return m;
  });
  const ring=mesh(new THREE.TorusGeometry(.14,.009,6,36),new THREE.MeshBasicMaterial({color:0xffe27a}),egg.position.x,GROUND+.012,egg.position.z);
  ring.rotation.x=Math.PI/2; ring.visible=false; world.add(ring);
  const ripples=[]; debugEgg=egg;
  const ripple=()=>{for(const d of [0,.28])later(d,()=>{
    const r=mesh(new THREE.TorusGeometry(.12,.006,6,36),new THREE.MeshBasicMaterial({color:0xbdf2ff,transparent:true}),egg.position.x,GROUND+.02,egg.position.z);
    r.rotation.x=Math.PI/2; world.add(r); ripples.push(r);
    tween(.8,(k)=>{r.scale.setScalar(1+k*1.4);r.material.opacity=1-k},()=>world.remove(r));
  })};
  tapHandler=e=>{
    const h=hit(e,rocks); if(!h)return; let o=h.object; while(o&&!rocks.includes(o))o=o.parent; if(!o)return;
    if(o===egg){
      if(kind==='water'&&knocks===0){knocks++;sfx.echo();ripple();say('Knock, knock! Something inside answered. Tap it again to pick it up.');return}
      hatch(card,egg,shine,rocks);return;
    }
    if(kind==='water')sfx.thud();
    if(!o.userData.flip){o.userData.flip=.001;S.misses++;say('Just a rock. Keep looking!')}
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
    rocks.forEach(r=>{const u=r.userData;if(u.flip){u.flip+=dt/1.1;const f=Math.min(u.flip,1);r.rotation.x=f*TAU;r.position.y=u.y+Math.sin(f*Math.PI)*.16;if(u.flip>=1){u.flip=0;r.rotation.x=0;r.position.y=u.y}}});
    ring.scale.setScalar(1+.08*Math.sin(T*6));
  });
  windy=kind==='wind';
  later(20,()=>{stuck=true;say(info.stuck)});
  later(40,()=>{ring.visible=true;say('Need help? Tap the stone in the yellow ring.')});
}

function hatch(card,egg,shine,rocks){
  const kind=card.dragon, color={fire:0xff8a2a,water:0xbdf2ff,wind:0xc8fff6}[kind];
  setPhase('hatch'); sfx.crack(); rocks.forEach(r=>{if(r!==egg)r.visible=false});
  world.children.filter(o=>o.geometry&&o.geometry.type==='TorusGeometry').forEach(o=>o.visible=false);
  egg.rotation.set(0,egg.rotation.y,0); say(EGG[kind].hatch); $('dock').classList.add('pass');
  let p=0, stage=0, spark=0, ice=null; meter(0);
  if(kind==='water'){ice=mesh(new THREE.BoxGeometry(.3,.34,.3),new THREE.MeshStandardMaterial({color:0xbfefff,transparent:true,opacity:.45,roughness:.1,flatShading:true}));ice.position.copy(egg.position);world.add(ice)}
  const span=Math.min(innerWidth,500);
  moveHandler=(a,b)=>{
    if(phaseT<.4)return;
    if(kind==='fire')p+=Math.min(Math.hypot(b[0]-a[0],b[1]-a[1]),80)/(span*7);
    if(kind==='wind'){ // only turning around the egg counts
      const [cx,cy]=screenOf(egg); if(Math.hypot(b[0]-cx,b[1]-cy)<15)return;
      let d=Math.atan2(b[1]-cy,b[0]-cx)-Math.atan2(a[1]-cy,a[0]-cx); d=Math.atan2(Math.sin(d),Math.cos(d));
      p+=Math.min(Math.abs(d),.8)/(TAU*4);
    }
  };
  every(dt=>{
    if(kind==='water'&&holding&&phaseT>.4)p+=dt/3.5;
    if(!holding)p=Math.max(0,p-dt*.015);
    p=Math.min(p,1); meter(p);
    egg.rotation.z=Math.sin(T*(10+p*18))*(.03+p*.22); shine.userData.mat.opacity=.25+p*.75;
    if(kind==='fire'){egg.material.emissive.setHex(0xff3300);egg.material.emissiveIntensity=p*.5}
    if(ice){ice.scale.set(1-p*.5,1-p*.85,1-p*.5);ice.position.y=GROUND+.17*ice.scale.y}
    spark-=dt;
    if(spark<=0&&(holding||p>.05)){
      spark=.1-p*.06; const a=rand(0,TAU), at=egg.position.clone().add(V(Math.cos(a)*.18,rand(-.1,.14),Math.sin(a)*.18));
      fx.add('spark',color,at,kind==='wind'?V(-Math.sin(a)*.6,.15,Math.cos(a)*.6):V(0,kind==='fire'?.3:-.2,0),.6);
    }
    const st=Math.floor(p*3); if(st>stage&&p<1){stage=st;sfx.crack();fx.burst(0x8d9298,egg.position,6);say(st===1?'A crack! Keep going!':'Almost there!')}
    if(p>=1){born(card,egg.position.clone(),ice);return false}
  });
}

function born(card,at,ice){
  const kind=card.dragon, info=EGG[kind], d=dragons[kind];
  setPhase('born'); fx.burst(0x8d9298,at,26); sfx.crack(); if(ice)world.remove(ice);
  world.children.filter(o=>o.geometry&&o.geometry.type==='IcosahedronGeometry'&&o.position.distanceTo(at)<.02).forEach(o=>o.visible=false);
  place(d,0,.08,.7); say(`A baby ${DRAGONS[kind].name}!`); sfx.chirp();
  tween(.6,k=>d.root.scale.setScalar(.15+.55*k));
  later(1.6,()=>{
    say(info.baby);
    if(kind==='wind'){const y=d.root.position.y;tween(1.1,k=>{d.spin.rotation.x=-k*TAU;d.root.position.y=y+Math.sin(k*Math.PI)*.2})}
    else{fx.puff(kind==='fire'?'smoke':'bubble',kind==='fire'?0x333333:0xbdf2ff,d.mouth(),18,.12,.18);sfx.thud()}
  });
  later(3,()=>actions([`💎 Find the ${DRAGONS[kind].gem}`,()=>{S.step++;hunt()}]));
  hud(); $('count').textContent=$('count').textContent.replace(/🥚 \d/,`🥚 ${CARDS.slice(0,S.step+1).filter(c=>c.type==='egg').length}`);
}

/* ---------- gems and powers ---------- */
function gemScene(card){
  const kind=card.dragon, D=DRAGONS[kind], d=dragons[kind];
  setPhase('gem'); clearWorld(); world.add(scenery(kind)); place(d,-.27,.1,.7,.7);
  const g=gem(D.gemColor); g.position.set(.27,GROUND+.28,.15); world.add(g); debugTarget=g;
  say(`You found the ${D.gem}! Tap it to feed your dragon.`);
  every(()=>{g.rotation.y=T*1.6;g.position.y=GROUND+.28+Math.sin(T*3)*.025});
  tapHandler=e=>{
    if(!near(e,g))return; tapHandler=null; setPhase('feed'); sfx.chirp(); say('Gulp! Your dragon is growing…');
    const from=g.position.clone();
    tween(.9,k=>{g.position.lerpVectors(from,d.mouth(),k);g.position.y+=Math.sin(k*Math.PI)*.18;g.scale.setScalar(1-k*.85)},()=>{
      world.remove(g); sfx.win(); fx.puff('spark',D.gemColor,d.root.position,40,.4,.35);
      tween(1.2,k=>{const s=.7+.35*k;d.root.scale.setScalar(s);d.root.position.y=GROUND+d.half*s},()=>tryPower(card));
    });
  };
}
function tryPower(card){
  const kind=card.dragon, d=dragons[kind];
  setPhase('power'); say(`New power! ${POWER[kind].try}`);
  const tx=.34, target=V(tx,GROUND+.2,.1); let extra;
  d.root.rotation.y=Math.PI/2;
  if(kind==='fire'){extra=mesh(new THREE.CylinderGeometry(.02,.03,.26,6),mat(0x6b4a2e),tx,GROUND+.13,.1);world.add(extra)}
  if(kind==='water'){extra=flame(1.6);extra.position.set(tx,GROUND+.02,.1);world.add(extra);target.y=GROUND+.1;
    for(const a of [.8,-.8]){const log=mesh(new THREE.CylinderGeometry(.022,.022,.2,6),mat(0x6b4a2e),tx,GROUND+.025,.1);log.rotation.set(Math.PI/2,0,a);world.add(log)}}
  if(kind==='wind'){extra=cloud();extra.position.set(tx,GROUND+.32,.05);extra.scale.setScalar(.8);world.add(extra);target.y=GROUND+.32}
  let used=false;
  const go=()=>{
    if(used)return; used=true; tapHandler=null; actions(); say('Watch your dragon!'); d.play('Attack'); sfx.power(kind); fx.stream(kind,d.mouth(),target,90);
    later(.9,()=>{
      if(kind==='fire'){const f=flame(1);f.position.set(tx,GROUND+.26,.1);world.add(f);every(()=>{f.scale.y=1+Math.sin(T*15)*.15})}
      if(kind==='water'){tween(.8,k=>extra.scale.setScalar(1.6*(1-k)+.001));fx.puff('smoke',0xcccccc,target,12,.1,.2)}
      if(kind==='wind')tween(1,k=>{extra.position.x=tx+k*1.5;extra.userData.mat.opacity=1-k;extra.rotation.z=k*3});
    });
    later(1.8,()=>{
      d.play('Idle_loop'); say(POWER[kind].done); sfx.win(); S.step++; hud(); save();
      const last=S.step>=CARDS.length;
      actions([last?'⚔️ Face the Storm Dragon':'🥚 Find the next egg',()=>last?battleIntro():hunt()]);
    });
  };
  tapHandler=go; actions([`${DRAGONS[kind].icon} Use power`,go]);
}

/* ---------- battle ---------- */
function battleStage(){
  clearWorld(); world.add(scenery('storm'));
  const boss=place(dragons.storm,0,-.3,1.45); boss.root.position.y=GROUND+.48; boss.play('Flying_loop');
  const team=['fire','water','wind'].map((k,i)=>place(dragons[k],(i-1)*.4,.28,.58,Math.PI));
  every(()=>{if(!boss.fallen)boss.root.position.y=GROUND+.48+Math.sin(T*2.4)*.035}); boss.fallen=false;
  return {boss,team};
}
function battleIntro(){
  S.battle=true; S.hearts=3; save(); setPhase('intro'); hud(); battleStage(); sfx.roar();
  say('The Storm Dragon! Watch its move, then choose the dragon that can stop it. You have 3 hearts.');
  actions(['Start the battle',battle]);
}
function battle(){
  setPhase('battle'); S.hearts=3; hud(); const {boss,team}=battleStage();
  const order=[...ATTACKS].sort(()=>Math.random()-.5); let round=0;
  const center=()=>boss.root.position.clone().add(V(0,0,.12));
  const next=()=>{
    const a=order[round]; let prop; sfx.roar(); boss.play('Attack'); later(1,()=>boss.play('Flying_loop'));
    if(a.beats==='fire'){prop=mesh(new THREE.IcosahedronGeometry(.37,1),new THREE.MeshStandardMaterial({color:0xaee8ff,transparent:true,opacity:.42,flatShading:true,depthWrite:false}));prop.position.copy(center());world.add(prop)}
    if(a.beats==='wind'){prop=cloud();prop.position.copy(center()).add(V(0,-.02,.22));prop.scale.setScalar(1.55);world.add(prop)}
    if(a.beats==='water'){
      prop=new THREE.Group();world.add(prop);let t=0;
      every(dt=>{if(!prop.parent)return false;t-=dt;if(t<=0){t=.12;fx.add('shell',Math.random()<.5?0xff4a12:0xffa21f,boss.mouth(),V(rand(-.5,.5),rand(.1,.6),rand(.2,.7)),.9,-1.8)}});
    }
    debugTarget=a.beats;
    const choose=k=>{
      const d=team[['fire','water','wind'].indexOf(k)]; actions(); d.play('Attack'); sfx.power(k); say(`${DRAGONS[k].name}, go!`);
      fx.stream(k,d.mouth(),center(),90);
      if(k!==a.beats){
        later(1.2,()=>{d.play('Idle_loop');S.hearts--;S.misses++;hud();save();sfx.bad();
          if(S.hearts<=0){say('Your dragons need a rest. Remember what each power does, then try again!');actions(['Try the battle again',battle]);return}
          say(a.miss);buttons()});
        return;
      }
      later(.8,()=>{
        const from=prop.position.clone();
        tween(.8,k2=>{if(a.beats==='fire'){prop.scale.setScalar(1+k2*.5);prop.material.opacity=.42*(1-k2)}
          if(a.beats==='wind'){prop.position.x=from.x+k2*1.6;prop.userData.mat.opacity=1-k2}},()=>world.remove(prop));
        if(a.beats==='water'){world.remove(prop);fx.puff('smoke',0x999999,center(),24,.35,.2)}
        sfx.win(); say(a.win);
      });
      later(2.2,()=>{d.play('Idle_loop');round++;round<order.length?next():defeat(boss,team)});
    };
    const buttons=()=>{
      actions(...['fire','water','wind'].map(k=>[`${DRAGONS[k].icon} ${DRAGONS[k].name.split(' ')[0]}`,()=>choose(k),true]));
      const row=document.createElement('div');row.className='row';row.append(...$('actions').children);$('actions').append(row);
    };
    say(`Round ${round+1} of 3: ${a.text}`); buttons();
  };
  later(.6,next);
}
function defeat(boss,team){
  actions(); show('hearts',false); say('All three attacks are broken! The Storm Dragon is falling!'); sfx.roar(); boss.fallen=true;
  const from=boss.root.position.clone();
  tween(1.8,k=>{boss.root.position.set(from.x+k*.35,from.y-k*1.5,from.z-k*.4);boss.root.rotation.z=k*3.5;boss.root.scale.setScalar(1.45*(1-k*.7))},()=>{
    world.remove(boss.root);
    const st=gem(0xc36bff,.13); st.userData.halo.material.color.set(0xffe27a); st.position.copy(from); world.add(st); debugTarget=st;
    tween(1.2,k=>st.position.set(0,THREE.MathUtils.lerp(from.y,GROUND+.3,k),THREE.MathUtils.lerp(from.z,.02,k)));
    every(()=>{st.rotation.y=T*1.8;st.userData.halo.scale.setScalar(1+.12*Math.sin(T*5))});
    later(1.3,()=>{say('The Power Stone! Tap it to claim it.');tapHandler=e=>{if(near(e,st))finale(st,team)}});
  });
}
function finale(stone,team){
  setPhase('finale'); sfx.win(); say('The Power Stone shines! Fire, water and wind join together!');
  every(()=>{stone.rotation.y=T*4});
  const sy=stone.position.y;
  tween(1.2,k=>{stone.position.y=sy+k*.42;stone.position.z=.02-k*.2});
  team.forEach((d,i)=>{const x=(i-1)*.42,s0=d.root.scale.x;d.play('Attack');
    tween(1.2,k=>{const s=s0+.2*k;d.root.scale.setScalar(s);d.root.position.set(x,GROUND+d.half*s,.24-(i===1?.0:.06)*k);d.root.rotation.y=Math.PI-(i-1)*-.5*k})});
  let t=0, a=0, shot=0;
  every(dt=>{ // three-colour tornado
    t+=dt; shot-=dt; a+=dt*9;
    if(t>1&&t<5.5){
      for(const [i,[k,c]] of [['fire',0xff7a1a],['water',0x3fa8ff],['wind',0x9affc8]].entries()){
        for(let j=0;j<2;j++){const h=((t*.55+j*.5+i*.17)%1), ang=a+i*TAU/3+h*8, r=.07+h*.33;
          fx.add(k,c,V(Math.cos(ang)*r,GROUND+h*.85,Math.sin(ang)*r-.05),V(-Math.sin(ang)*.35,.2,Math.cos(ang)*.35),.45)}
      }
      if(shot<=0){shot=1.1;sfx.power('wind');team.forEach((d,i)=>fx.stream(['fire','water','wind'][i],d.mouth(),stone.position,35))}
    }
  });
  later(5.6,()=>{team.forEach((d,i)=>{d.play('Flying_loop');const y=d.root.position.y;tween(1.5,k=>d.root.position.y=y+k*(.25+(i===1?.12:0)))});sfx.win()});
  later(8.5,end);
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
  const land=world.children.find(o=>o.userData.grass);
  if(land)land.userData.grass.forEach((g,i)=>g.rotation.z=-gust*(.5+.08*Math.sin(T*14+i)));
  if(gust>.2&&Math.random()<.35)fx.add('spark',0xe9fffb,V(-.8,rand(GROUND+.05,.25),rand(-.2,.45)),V(rand(1.4,2),0,0),.8);
  Object.values(dragons).forEach(d=>{if(d.root.parent)d.update(dt)});
  fx.update(dt); renderer.render(scene,camera);
}

/* ---------- start ---------- */
function begin(resume){
  initAudio(); show('start',false); show('hud'); show('dock'); renderer.setAnimationLoop(frame);
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
$('again').onclick=()=>{clearSave();show('end',false);show('credits',false);show('dock',false);show('hud',false);setPhase('start');clearWorld();history.replaceState(null,'',location.pathname);show('resume',false);show('start')};
$('credbtn').onclick=()=>$('credits').classList.toggle('hidden');
$('mute').onclick=()=>{muted=!muted;$('mute').textContent=muted?'Sound off':'Sound on'};

window.__game={get phase(){return phase},get step(){return S.step},get need(){return CARDS[S.step]},get target(){return debugTarget},
  eggAt:()=>screenOf(debugEgg),targetAt:()=>screenOf(debugTarget)};

(async()=>{
  try{
    await preload();
    for(const k of ['fire','water','wind','storm'])dragons[k]=await makeDragon(k);
    $('go').disabled=false; $('go').textContent='Start the quest';
    const s=saved(); if(s&&(s.step>0||s.battle)){show('resume')}
  }catch(e){console.error(e);$('go').textContent='Loading failed. Please refresh.'}
})();
