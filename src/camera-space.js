import {Vector3} from 'three';

// Distances are measured from the same rounded 60 × 30 m boards as the Blender model.
export function boardOffset({x,z}){
  const dx=Math.abs(x)-21.5,dz=Math.abs(z)-6.5;
  return Math.hypot(Math.max(dx,0),Math.max(dz,0))+Math.min(Math.max(dx,dz),0)-8.5;
}

// A conservative envelope around the steps, people-height railings and suite roofs.
// A seated spectator has a separate, fixed eye point inside that envelope.
export function clearanceHeight(p,suites){
  const d=boardOffset(p);
  if(d<-.55)return 1.9;
  if(d<2.35)return 3.16;
  if (d >= 11.4 && suites.some(s => Math.abs(p.x - s.anchor[0]) <= 5.4 && Math.abs(p.z - s.anchor[2]) <= 2.66)) return 8.55;
  if (d >= 11) return 6.65;
  const row=Math.max(0,Math.floor((d+.35-2.5)/.96));
  return .45+row*.52+1.85;
}

export function clearPath(a,b,suites){
  const steps=Math.ceil(a.distanceTo(b)/.24),sample=new Vector3();
  for(let i=0;i<=steps;i++){
    sample.lerpVectors(a,b,steps?i/steps:1);
    if(sample.y<clearanceHeight(sample,suites))return false;
  }
  return true;
}

export function configureOrbit(controls,section=null){
  if(!section){
    Object.assign(controls,{minAzimuthAngle:-Infinity,maxAzimuthAngle:Infinity,
      minPolarAngle:.001,maxPolarAngle:1.22,minDistance:54,maxDistance:420});
    return;
  }
  const vip=section.id>=200,angle=Math.atan2(-section.normal[0],-section.normal[1]);
  const side=vip?.57:.76;
  Object.assign(controls,{minAzimuthAngle:angle-side,maxAzimuthAngle:angle+side,
    minPolarAngle:vip?.94:.67,maxPolarAngle:1.43,minDistance:vip?7.6:8.4,maxDistance:vip?20:25});
}

export function sectionPose(section,aspect){
  const vip=section.id>=200,[nx,nz]=section.normal;
  const target=new Vector3(...section.anchor);
  target.y=section.anchor[1]+(vip?1.25:.2);
  const widthFactor=Math.max(1,Math.min(1.36,1.22/aspect));
  const distance=(vip?12:17.5)*widthFactor;
  const side=distance*(vip?.19:.13);
  const pos=new Vector3(target.x-nx*distance+nz*side,target.y+(vip?2.85:8.6)*widthFactor,
    target.z-nz*distance-nx*side);
  return {pos,target,fov:aspect<.8?57:48};
}

export function neighboringSectors(sectors,id){
  const stands=sectors.filter(s=>s.id<200);
  const suite=sectors.find(s=>s.id===id&&s.id>=200);
  const distance=(a,b)=>Math.hypot(a.anchor[0]-b.anchor[0],a.anchor[2]-b.anchor[2]);
  const below=suite?stands.reduce((a,b)=>distance(a,suite)<distance(b,suite)?a:b):null;
  const i=stands.findIndex(s=>s.id===(below?.id??id));
  if(i<0)return [];
  const next=stands[(i+1)%stands.length],previous=stands[(i+stands.length-1)%stands.length];
  if(suite)return [previous,below,next];
  return [previous,next,...sectors.filter(s=>s.id>=200&&distance(s,stands[i])<12)];
}
