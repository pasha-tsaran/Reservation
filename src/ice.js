import * as THREE from 'three';

export function makeIce(texture){
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=4;
  const ice=new THREE.Mesh(new THREE.PlaneGeometry(60,30),new THREE.MeshBasicMaterial({map:texture,alphaTest:.35}));
  ice.rotation.x=-Math.PI/2;
  ice.position.y=.025;
  return ice;
}
export function signTexture(text,background='#182c38',ink='#95c2d1',size=44){
  const c=document.createElement('canvas');c.width=1024;c.height=128;const ctx=c.getContext('2d');
  ctx.fillStyle=background;ctx.fillRect(0,0,1024,128);ctx.fillStyle=ink;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='bold '+size+'px Arial';ctx.fillText(text,512,67);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}

