import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Scene,Raycaster,Vector3} from 'three';
import {sectorSurfaces} from '../src/seating.js';

test('Each bank can be picked across its footprint, including the first tier and all eight room roofs',()=>{
  const {sectors}=JSON.parse(readFileSync(new URL('../public/arena/layout.json',import.meta.url),'utf8'));
  const scene=new Scene(),zones=sectorSurfaces(scene,sectors),down=new Vector3(0,-1,0);
  for(const sector of sectors){
    const grid=sector.surface;
    for(const column of [2,8,14]){
      for(let row=0;row<grid.length-1;row++){
        const position=new Vector3(...grid[row][column]).lerp(new Vector3(...grid[row+1][column]),.5);
        position.y=35;
        const hit=zones.pick(new Raycaster(position,down));
        assert.equal(hit?.sector,sector.id);
      }
    }
    zones.hover(sector.id);zones.animate(1);
    const lit=scene.children.filter(obj=>obj.isMesh&&obj.visible);
    assert.equal(lit.length,1);
    assert.equal(lit[0].userData.sector,sector.id);
  }
  assert.equal(zones.pick(new Raycaster(new Vector3(0,35,0),down)),null);
  zones.hover(null);zones.animate(1);
  assert.ok(scene.children.every(obj=>!obj.visible));
});

