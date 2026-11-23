import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Box3,DoubleSide,Raycaster,Triangle,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {sectionPose} from '../src/camera-space.js';
import {seatFlight,sectionFlight,roomView} from '../src/seat-flight.js';

const asset=name=>new URL('../public/arena/'+name,import.meta.url);
const {seats,sectors}=JSON.parse(readFileSync(asset('layout.json'),'utf8'));
const suites=sectors.filter(s=>s.id>=200);
const direction=new Vector3(0,-.3,-1).normalize();
const eye=s=>new Vector3(s[3],s[4]+1.2,s[5]);

test('Each seat has a continuous approach, a final descent and a level rink-facing view',()=>{
  const p=new Vector3(),d=new Vector3();
  for(const sector of sectors){
    const start=sectionPose(sector,1.4).pos;
    for(const seat of seats.filter(s=>s[0]===sector.id)){
      const flight=seatFlight(start,direction,seat,suites),end=eye(seat);
      flight.sample(0,p,d);assert.ok(p.distanceTo(start)<1e-6&&d.distanceTo(direction)<1e-6);
      flight.sample(.45,p,d);assert.ok(p.distanceTo(start)>.3&&p.distanceTo(end)>.5);
      flight.sample(.75,p,d);assert.ok(p.y>end.y+.32);
      flight.sample(1,p,d);assert.ok(p.distanceTo(end)<1e-6);
      const target=new Vector3(0,.63,0).sub(end).normalize();
      assert.ok(d.distanceTo(target)<1e-6);
    }
  }
});

test('Every return lifts vertically above the seat and finishes looking at its sector',()=>{
  const p=new Vector3(),d=new Vector3();
  for(const sector of sectors){
    const pose=sectionPose(sector,1.45),facing=pose.target.clone().sub(pose.pos).normalize();
    for(const s of seats.filter(s=>s[0]===sector.id)){
      const start=eye(s),flight=sectionFlight(start,direction,pose,suites);
      flight.sample(0,p,d);assert.ok(p.distanceTo(start)<1e-6&&d.distanceTo(direction)<1e-6);
      flight.sample(.15,p,d);assert.ok(p.y>start.y+.10);
      assert.ok(Math.hypot(p.x-start.x,p.z-start.z)<.01);
      flight.sample(.6,p,d);assert.ok(p.distanceTo(pose.pos)>.1&&p.distanceTo(start)>.5);
      flight.sample(1,p,d);assert.ok(p.distanceTo(pose.pos)<1e-6&&d.distanceTo(facing)<1e-6);
    }
  }
});

test('Approach, VIP entry, exit and mid-flight retarget avoid the exported arena geometry',async()=>{
  const bytes=readFileSync(asset('bowl.glb'));
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  scene.traverse(o=>{if(o.isMesh)o.material.side=DoubleSide;});scene.updateMatrixWorld(true);
  const furniture=readFileSync(asset('seating.glb'));
  const models=await new GLTFLoader().parseAsync(furniture.buffer.slice(furniture.byteOffset,furniture.byteOffset+furniture.byteLength),'');
  const bounds={Stand:new Box3(),Club:new Box3()};
  const triangles={Stand:[],Club:[]};
  models.scene.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.name.includes('_Near_'))return;
    const kind=mesh.name.split('_')[0],g=mesh.geometry,vertices=g.getAttribute('position');
    bounds[kind].union(g.boundingBox);
    const vertex=i=>new Vector3().fromBufferAttribute(vertices,g.index?g.index.getX(i):i);
    for(let i=0;i<(g.index?.count??vertices.count);i+=3)triangles[kind].push(new Triangle(vertex(i),vertex(i+1),vertex(i+2)));
  });
  for(const box of Object.values(bounds))box.expandByScalar(.12);
  const local=new Vector3(),surface=new Vector3();
  const ray=new Raycaster(),p=new Vector3(),d=new Vector3(),last=new Vector3();
  function check(start,seat,flight=seatFlight(start,direction,seat,suites)){
    last.copy(start);
    for(let frame=1;frame<=75;frame++){
      flight.sample(frame/75,p,d);
      for(const s of seats){
        const dx=p.x-s[3],dz=p.z-s[5];
        if(Math.abs(dx)>1||Math.abs(dz)>1)continue;
        local.set(dx*Math.cos(s[6])-dz*Math.sin(s[6]),p.y-s[4],dx*Math.sin(s[6])+dz*Math.cos(s[6]));
        const kind=s[0]>=200?'Club':'Stand';
        if(bounds[kind].containsPoint(local)){
          assert.ok(triangles[kind].every(t=>t.closestPointToPoint(local,surface).distanceToSquared(local)>.12**2),
            `Camera approached chair ${s.slice(0,3)} at ${local.toArray()}`);
        }
      }
      ray.ray.direction.subVectors(p,last);ray.far=ray.ray.direction.length();
      if(ray.far>.00001){
        ray.ray.origin.copy(last);ray.ray.direction.normalize();
        const hit=ray.intersectObject(scene,true)[0];
        assert.ok(!hit,`Camera crossed ${hit?.object.name} en route to ${seat.slice(0,3)}`);
      }
      last.copy(p);
    }
    return flight;
  }
  const seat=(sector,row,number)=>seats.find(s=>s[0]===sector&&s[1]===row&&s[2]===number);
  const corner=seat(104,9,1),box=roomView(suites[0]),front=seat(107,1,7);
  check(sectionPose(sectors[3],.52).pos,corner);
  const entry=check(eye(corner),box);
  check(eye(box),roomView(suites[3]));check(eye(box),roomView(suites[7]));check(eye(box),front);
  check(new Vector3(0,75,-54),box);
  for(const t of [.45,.72,.89]){
    const interrupted=new Vector3();entry.sample(t,interrupted,d);
    check(interrupted,front);
  }
  for(const s of [corner,box,front,roomView(suites[3]),roomView(suites[7]),seat(102,9,12)]){
    const pose=sectionPose(sectors.find(sec=>sec.id===s[0]),.65);
    const inbound=seatFlight(pose.pos,direction,s,suites);
    for(const t of [.17,.55,.78,1]){
      const start=new Vector3(),gaze=new Vector3();inbound.sample(t,start,gaze);
      check(start,s,sectionFlight(start,gaze,pose,suites));
    }
  }
});
