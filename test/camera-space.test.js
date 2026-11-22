import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PerspectiveCamera,Vector3} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {boardOffset,clearanceHeight,clearPath,configureOrbit,neighboringSectors,sectionPose} from '../src/camera-space.js';

const {sectors,seats}=JSON.parse(readFileSync(new URL('../public/arena/layout.json',import.meta.url),'utf8'));
const suites=sectors.filter(s=>s.id>=200);

test('A full drag and extreme dolly stay on the rink side of every bank',()=>{
  for(const sector of sectors){
    for(const aspect of [.48,1,2.7]){
      const {pos,target}=sectionPose(sector,aspect);
      assert.ok(pos.y>=clearanceHeight(pos,suites));
      for(const sign of [-1,1]){
        for(const radius of [7,255]){
          const camera=new PerspectiveCamera(),controls=new OrbitControls(camera);
          configureOrbit(controls,sector);controls.target.copy(target);
          camera.position.copy(pos).sub(target).setLength(radius).add(target);
          controls.update();controls.rotateLeft(sign*Math.PI);controls.rotateUp(-Math.PI/2);controls.update();
          assert.ok(boardOffset(camera.position)<boardOffset(target)-2,'Camera crossed sector '+sector.id);
          assert.ok(camera.position.y>=clearanceHeight(camera.position,suites),'Camera below terrace '+sector.id);
        }
      }
    }
  }
});

test('Flights through the bowl or a suite roof require a change of shot',()=>{
  const sec=sectors.find(s=>s.id===104),{pos,target}=sectionPose(sec,1.6);
  const underneath=target.clone().add(new Vector3(13.85,2.95,-19.58));
  assert.equal(clearPath(pos,underneath,suites),false);
  assert.equal(clearPath(new Vector3(0,18,-37.6),new Vector3(0,13,-37.6),suites),false);
  assert.equal(clearPath(pos,new Vector3(0,30,0),suites),true);
});

test('Sector navigation wraps around the rink and connects each box to the seats below',()=>{
  assert.deepEqual(neighboringSectors(sectors,104).map(s=>s.id),[103,105]);
  assert.deepEqual(neighboringSectors(sectors,101).map(s=>s.id),[112,102]);
  for(const [box,stand] of [[201,102],[202,108]]){
    assert.ok(neighboringSectors(sectors,box).some(s=>s.id===stand));
    assert.ok(neighboringSectors(sectors,stand).some(s=>s.id===box));
  }
});

test('The same metre-scale player subtends a smaller angle from the back row',()=>{
  function apparentHeight(row){
    const s=seats.find(s=>s[0]===108&&s[1]===row&&s[2]===12);
    const cam=new PerspectiveCamera(65,1.6,.085,500);
    cam.position.set(s[3],s[4]+1.20,s[5]);cam.lookAt(0,.63,0);cam.updateMatrixWorld();
    return new Vector3(0,1.72,0).project(cam).y-new Vector3(0,.025,0).project(cam).y;
  }
  assert.ok(apparentHeight(1)>apparentHeight(16)*1.7);
});
