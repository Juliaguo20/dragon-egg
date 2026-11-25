// Look-around AR: the phone's motion sensor turns the virtual camera, so objects stay put around the player.
// Without a sensor (laptop, or permission denied) the player drags to look around.
import * as THREE from 'three';

const q=new THREE.Quaternion(), euler=new THREE.Euler(), zAxis=new THREE.Vector3(0,0,1);
const back=new THREE.Quaternion(-Math.SQRT1_2,0,0,Math.SQRT1_2); // camera looks out of the back of the phone
let data=null, yaw=0, pitch=0, listening=false;

export const sensorActive=()=>!!data;

/* Must be called directly from a tap (iPhone requirement). */
export function startSensor(){
  const listen=()=>{
    if(listening)return; listening=true;
    addEventListener('deviceorientation',e=>{if(e.alpha!==null&&e.beta!==null)data={a:e.alpha,b:e.beta,g:e.gamma||0}});
  };
  const D=window.DeviceOrientationEvent;
  if(D&&typeof D.requestPermission==='function') D.requestPermission().catch(()=>{});
  listen(); // no events arrive until the permission is granted
}
export function drag(dx,dy){
  if(data)return;
  yaw+=dx*.006; pitch=THREE.MathUtils.clamp(pitch+dy*.004,-1,1);
}
export function updateCamera(camera){
  if(!data){camera.quaternion.setFromEuler(euler.set(pitch,yaw,0,'YXZ'));}
  else{
    const rad=THREE.MathUtils.degToRad, screenAngle=rad((screen.orientation&&screen.orientation.angle)||window.orientation||0);
    camera.quaternion.setFromEuler(euler.set(rad(data.b),rad(data.a),-rad(data.g),'YXZ'));
    camera.quaternion.multiply(back).multiply(q.setFromAxisAngle(zAxis,-screenAngle));
  }
  camera.updateMatrixWorld();
}
