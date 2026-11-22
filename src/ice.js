import * as THREE from 'three';

export function compass(ctx,cx,cy,r) {
  ctx.save();ctx.translate(cx,cy);
  for(let i=0;i<4;i++){
    ctx.beginPath();ctx.moveTo(0,-r);ctx.lineTo(r*.2,-r*.2);ctx.lineTo(0,0);ctx.fillStyle='#588b9d';ctx.fill();
    ctx.beginPath();ctx.moveTo(0,-r);ctx.lineTo(-r*.2,-r*.2);ctx.lineTo(0,0);ctx.fillStyle='#254c64';ctx.fill();
    ctx.rotate(Math.PI/2);
  }
  ctx.restore();
}
export function makeIce(){
  const canvas=document.createElement('canvas');
  canvas.width=2048;canvas.height=1024;
  const ctx=canvas.getContext('2d'),unit=canvas.width/60;
  ctx.scale(unit,unit);ctx.translate(30,15);
  ctx.beginPath();ctx.roundRect(-30,-15,60,30,8.5);ctx.clip();
  const ground=ctx.createLinearGradient(-30,-15,24,21);
  ground.addColorStop(0,'#c5dce5');ground.addColorStop(.43,'#eef4f3');ground.addColorStop(.68,'#d5e5ea');ground.addColorStop(1,'#bdd5e3');
  ctx.fillStyle=ground;ctx.fillRect(-30,-15,60,30);
  let seed=5319;
  const noise=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296};
  ctx.lineWidth=.012;
  for(let i=0;i<7400;i++){
    const x=noise()*65-32,y=noise()*32-16;
    ctx.strokeStyle=noise()>.55?'rgba(255,255,255,.28)':'rgba(81,112,133,.10)';
    ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+noise()*2,y+noise()-.5,x+noise()*5,y+noise()*2-1);ctx.stroke();
  }
  const red='#ba5c69',blue='#447da8';
  function line(x,y,tx,ty,col,w){ctx.strokeStyle=col;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(tx,ty);ctx.stroke()}
  function circle(x,y,r,col,w){ctx.strokeStyle=col;ctx.lineWidth=w;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke()}
  function dot(x,y,r,col){ctx.fillStyle=col;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()}
  for(const s of [-1,1]){
    line(s*8.83,-15,s*8.83,15,blue,.29);line(s*26,-15,s*26,15,red,.07);
    ctx.fillStyle='#99c7da';ctx.strokeStyle=red;ctx.lineWidth=.09;ctx.beginPath();
    ctx.arc(s*26,0,1.85,s===1?Math.PI/2:-Math.PI/2,s===1?Math.PI*1.5:Math.PI/2);ctx.closePath();ctx.fill();ctx.stroke();
    for(const end of [-1,1]){
      const x=s*20,y=end*6.7;
      circle(x,y,4.5,red,.08);dot(x,y,.27,red);dot(s*6.1,y,.29,red);
      for(const k of [-1,1]) for(const j of [-1,1]){
        line(x+k*.55,y+j*.25,x+k*1.04,y+j*.25,red,.07);
        line(x+k*.55,y+j*.25,x+k*.55,y+j*.81,red,.07);
        line(x+k*.70,y+j*4.42,x+k*.70,y+j*4.74,red,.07);
      }
    }
  }
  line(0,-15,0,15,red,.23);
  ctx.setLineDash([.18,.24]);line(0,-15,0,15,'#d9e6e7',.063);ctx.setLineDash([]);
  circle(0,0,4.5,blue,.11);dot(0,0,3.42,'#dce8ea');compass(ctx,0,0,2.95);
  ctx.textAlign='center';ctx.fillStyle='rgba(73,108,131,.65)';ctx.font='bold .56px sans-serif';
  for(const s of [-1,1]){ctx.save();ctx.translate(s*13.35,0);ctx.rotate(s*Math.PI/2);ctx.fillText('POLARIS  ARENA',0,.16);ctx.restore();}
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
  const ice=new THREE.Mesh(new THREE.PlaneGeometry(60,30),new THREE.MeshBasicMaterial({map:tex,transparent:true,alphaTest:.35}));
  ice.rotation.x=-Math.PI/2;ice.position.y=.025;return ice;
}
export function signTexture(text,background='#182c38',ink='#95c2d1',size=44){
  const c=document.createElement('canvas');c.width=1024;c.height=128;const ctx=c.getContext('2d');
  ctx.fillStyle=background;ctx.fillRect(0,0,1024,128);ctx.fillStyle=ink;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='bold '+size+'px Arial';ctx.fillText(text,512,67);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}

