// 3D models, scenery and particle effects.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRAGONS} from './content.js';

export const FLOOR=-0.4;
export const rand=(a,b)=>a+Math.random()*(b-a);
export const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
export const mat=(c,extra={})=>new THREE.MeshStandardMaterial({color:c,flatShading:true,roughness:.9,...extra});
const glow=(c,o=1)=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o,depthWrite:false});
export const mesh=(g,m,x=0,y=0,z=0)=>{const o=new THREE.Mesh(g,m);o.position.set(x,y,z);return o};

const loader=new GLTFLoader();
const cache={};
const load=n=>loader.loadAsync(`./assets/${n}.glb`);
export async function preload(){
  for(const n of ['grass_large']) cache[n]=(await load(n)).scene;
}

export function prop(name,h,color){
  const o=cache[name].clone(true), box=new THREE.Box3().setFromObject(o), s=h/(box.max.y-box.min.y);
  o.traverse(c=>{if(c.isMesh)c.material=mat(color)});
  o.scale.setScalar(s); o.position.y=-box.min.y*s;
  const w=new THREE.Group(); w.add(o); return w;
}
export function shadow(r){
  const m=mesh(new THREE.CircleGeometry(r,20),new THREE.MeshBasicMaterial({color:0,transparent:true,opacity:.28,depthWrite:false}));
  m.rotation.x=-Math.PI/2; return m;
}

/* Egg and decoy rocks share one generator so they look alike. */
export function rockGeo(){
  const g=new THREE.IcosahedronGeometry(.105,1), p=g.attributes.position, seen=new Map(), v=V(), sy=rand(1.12,1.3);
  for(let i=0;i<p.count;i++){
    v.fromBufferAttribute(p,i); const k=v.toArray().map(n=>n.toFixed(3)).join();
    if(!seen.has(k)) seen.set(k,rand(.9,1.1));
    v.multiplyScalar(seen.get(k)); v.y*=sy; p.setXYZ(i,v.x,v.y,v.z);
  }
  g.computeVertexNormals(); g.computeBoundingBox(); return g;
}
export function cracks(geo,color){
  const p=geo.attributes.position, v=V(), g=new THREE.Group(), m=glow(color,0), front=[];
  for(let i=0;i<p.count;i+=3){let z=0;for(let k=0;k<3;k++)z+=p.getZ(i+k)/3;if(z>.035)front.push(i)}
  front.sort(()=>Math.random()-.5).slice(0,7).forEach(i=>{
    for(const [a,b] of [[0,1],[1,2]]){
      const A=V().fromBufferAttribute(p,i+a).multiplyScalar(1.015), B=V().fromBufferAttribute(p,i+b).multiplyScalar(1.015);
      const c=mesh(new THREE.CylinderGeometry(.004,.004,A.distanceTo(B),4),m);
      c.position.copy(A).add(B).multiplyScalar(.5); c.quaternion.setFromUnitVectors(V(0,1,0),v.copy(B).sub(A).normalize()); g.add(c);
    }
  });
  g.userData.mat=m; return g;
}

export const STORM={body:'#5b3f8c',wing:'#c06bff',edge:'#2c1b4d',eye:'#ff3b5c'};
export async function makeDragon(kind){
  const c=DRAGONS[kind]||STORM, gltf=await load('dragon');
  const cv=document.createElement('canvas'); cv.width=cv.height=4; const x=cv.getContext('2d');
  x.fillStyle=c.body; x.fillRect(0,0,4,4);
  [[0,0,c.edge],[1,0,'#ffffff'],[0,1,c.wing],[0,3,c.eye]].forEach(([a,b,col])=>{x.fillStyle=col;x.fillRect(a,b,1,1)});
  const tex=new THREE.CanvasTexture(cv); tex.flipY=false; tex.colorSpace=THREE.SRGBColorSpace;
  tex.magFilter=tex.minFilter=THREE.NearestFilter; tex.generateMipmaps=false;
  const model=gltf.scene; let head;
  model.traverse(o=>{if(o.isMesh){o.material=new THREE.MeshStandardMaterial({map:tex,roughness:.55,metalness:.1,emissive:0x1a2026});o.frustumCulled=false}
    if(o.isBone&&o.name==='Head')head=o});
  const mixer=new THREE.AnimationMixer(model), actions={};
  gltf.animations.forEach(a=>actions[a.name]=mixer.clipAction(a));
  actions.Idle_loop.play(); mixer.update(.01); model.updateMatrixWorld(true);
  const box=new THREE.Box3(), v=V();
  model.traverse(o=>{if(o.isSkinnedMesh){const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++){o.getVertexPosition(i,v);box.expandByPoint(v.applyMatrix4(o.matrixWorld))}}});
  const size=box.getSize(V()), s=.6/Math.max(size.x,size.y,size.z), ctr=box.getCenter(V());
  model.scale.multiplyScalar(s); model.position.set(-ctr.x*s,-ctr.y*s,-ctr.z*s);
  const spin=new THREE.Group(); spin.add(model);
  const root=new THREE.Group(); root.add(spin);
  let current='Idle_loop';
  return {root,spin,half:size.y*s/2,
    play(name){ if(name===current)return; actions[current].fadeOut(.2); actions[name].reset().fadeIn(.2).play(); current=name },
    update(dt){ mixer.update(dt); if(head)head.scale.setScalar(kind==='storm'?1:1.4) },
    mouth(){ root.updateMatrixWorld(true); return head?head.getWorldPosition(V()):root.getWorldPosition(V()) }
  };
}

export function gem(color,r=.09){
  const g=new THREE.Group();
  const core=mesh(new THREE.OctahedronGeometry(r),mat(color,{emissive:color,emissiveIntensity:.55,roughness:.25,metalness:.2})); core.scale.y=1.35;
  const halo=mesh(new THREE.TorusGeometry(r*1.55,.006,6,40),glow(color,.8)); halo.rotation.x=Math.PI/2;
  g.add(core,halo); g.userData={core,halo}; return g;
}
export function flame(size=1){
  const g=new THREE.Group();
  [[0xff4a1a,.05,.15],[0xff9a22,.036,.12],[0xffe56a,.022,.08]].forEach(([c,r,h],i)=>g.add(mesh(new THREE.ConeGeometry(r*size,h*size,7),glow(c,.9),0,h*size/2,i*.004)));
  return g;
}
export function cloud(){
  const g=new THREE.Group(), m=new THREE.MeshStandardMaterial({color:0x3d3a4e,flatShading:true,transparent:true,opacity:.96});
  [[0,0,.17],[-.17,-.02,.12],[.17,-.01,.13],[-.07,.08,.11],[.09,.07,.12]].forEach(([x,y,r])=>g.add(mesh(new THREE.IcosahedronGeometry(r,1),m,x,y,0)));
  g.userData.mat=m; return g;
}

/* Particle effects: a stream of fire, water or wind flying from one point to another. */
export class Effects{
  constructor(parent){this.parent=parent;this.items=[];this.geo={fire:new THREE.TetrahedronGeometry(.026),water:new THREE.SphereGeometry(.018,6,5),wind:new THREE.TorusGeometry(.04,.004,4,16,4.5),smoke:new THREE.IcosahedronGeometry(.035,0),bubble:new THREE.SphereGeometry(.022,8,6),spark:new THREE.TetrahedronGeometry(.018),shell:new THREE.TetrahedronGeometry(.04)}}
  add(type,color,pos,vel,life,gravity=0,delay=0){
    const m=mesh(this.geo[type],glow(color,type==='bubble'?.65:.92)); m.position.copy(pos); m.visible=false;
    m.userData={v:vel,life,age:-delay,gravity,spin:rand(2,9)}; this.parent.add(m); this.items.push(m);
  }
  stream(kind,from,to,n=70){
    const colors={fire:[0xff4a1a,0xff9a22,0xffe56a],water:[0x2f8cff,0x7fd0ff,0xe8fbff],wind:[0xd8fff0,0x8cf1c4,0xffffff]}[kind];
    for(let i=0;i<n;i++){
      const life=rand(.45,.7), target=to.clone().add(V(rand(-.07,.07),rand(-.07,.07),rand(-.05,.05)));
      this.add(kind,colors[i%3],from,target.sub(from).divideScalar(life),life,0,i*.012);
    }
  }
  puff(type,color,pos,n=14,speed=.25,up=.2){for(let i=0;i<n;i++)this.add(type,color,pos,V(rand(-speed,speed),rand(0,up*2),rand(-speed,speed)),rand(.8,1.6),0,i*.025)}
  burst(color,pos,n=24){for(let i=0;i<n;i++)this.add('shell',color,pos,V(rand(-.6,.6),rand(.3,1.1),rand(-.3,.6)),rand(.8,1.4),-2.4)}
  update(dt){
    this.items=this.items.filter(m=>{
      const u=m.userData; u.age+=dt; if(u.age<0)return true;
      if(u.age>u.life){this.parent.remove(m);m.material.dispose();return false}
      m.visible=true; u.v.y+=u.gravity*dt; m.position.addScaledVector(u.v,dt); m.rotation.x+=u.spin*dt; m.rotation.z+=u.spin*dt*.6;
      m.material.opacity=Math.min(1,(1-u.age/u.life)*2.2); return true;
    });
  }
  clear(){this.items.forEach(m=>this.parent.remove(m));this.items=[]}
}
