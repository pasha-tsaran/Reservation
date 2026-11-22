import * as T from 'three';

const iceY=.026;
const lanes=[-10.1,-4.6,1.2,6.1,10.9,-7.5,-1.9,3.7,8.6,.1];
const attack=[13,16,17,14,12,13,15,17,14,11];
const stagger=[5,1,0,-6,-9,-1,4,0,8,11];
const phaseOffsets=[.1,.85,.42,.2,-.2,1.18,.45,.95,1.44,.42];
const handedness=[1,1,-1,1,-1,-1,1,-1,-1,1];
const numbers=[17,9,71,24,8,14,91,27,6,44,30,35];
const scales=[1.02,.99,1.045,1.01,1.035,.98,1.04,1,1.025,1.05,1.065,1.05];
const passes=[0,1,2,3,8,7,6,5,1,4,3,2,9,6,5,0];
const strideHip=new T.Matrix4().makeTranslation(0,.85,-.045);
const fromHip=new T.Matrix4().copy(strideHip).invert();
const stride=new T.Matrix4(),turn=new T.Matrix4(),matrix=new T.Matrix4();
const dummy=new T.Object3D(),puckTip=new T.Vector3(),otherTip=new T.Vector3();

function numberTexture(){
  const canvas=document.createElement('canvas');
  canvas.width=1024;canvas.height=128;
  const ctx=canvas.getContext('2d');
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 84px Arial';
  numbers.forEach((number,i)=>{
    ctx.save();ctx.translate((i+.5)*canvas.width/16,64);ctx.scale(.60,1);
    ctx.fillStyle=i<5||i===10?'#eafaff':'#9d312b';ctx.fillText(number,0,0);ctx.restore();
  });
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;return texture;
}

function shadowTexture(){
  const c=document.createElement('canvas');c.width=c.height=64;
  const ctx=c.getContext('2d'),g=ctx.createRadialGradient(32,32,1,32,32,31);
  g.addColorStop(0,'rgba(42,65,77,.47)');g.addColorStop(.5,'rgba(52,71,87,.23)');g.addColorStop(1,'rgba(70,85,96,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,64,64);return new T.CanvasTexture(c);
}

export function createMatch(scene,source){
  const group=new T.Group();group.name='Демонстрация матча';group.visible=false;scene.add(group);
  const shirt=new T.MeshBasicMaterial({map:numberTexture(),alphaTest:.27,polygonOffset:true,polygonOffsetFactor:-1});
  const shadow=new T.InstancedMesh(new T.PlaneGeometry(1.25,1.7),
    new T.MeshBasicMaterial({map:shadowTexture(),transparent:true,depthWrite:false}),12);
  shadow.renderOrder=2;shadow.frustumCulled=false;group.add(shadow);
  const banks=new Map();
  source.traverse(o=>{
    if(!o.isMesh)return;
    const count=o.name.includes('Goalie')?1:5;
    const batch=new T.InstancedMesh(o.geometry,o.material,count);
    batch.frustumCulled=false;batch.instanceMatrix.setUsage(T.DynamicDrawUsage);
    group.add(batch);banks.set(o.name,batch);
  });
  const athletes=numbers.map((number,i)=>{
    const keeper=i>=10,home=i<5||i===10;
    const kit=(home?'Home':'Away')+(keeper?'_Goalie':'_Skater');
    const geom=new T.PlaneGeometry(.23,.135);
    const uv=geom.attributes.uv;
    for(let v=0;v<uv.count;v++)uv.setX(v,(i+uv.getX(v))/16);
    const numeral=new T.Mesh(geom,shirt);group.add(numeral);
    return {keeper,body:banks.get(kit+'_Body'),legs:[banks.get(kit+'_Left'),banks.get(kit+'_Right')],
      numeral,instance:keeper?0:i%5,position:new T.Vector3(),heading:0};
  });
  const puck=new T.Mesh(new T.CylinderGeometry(.0381,.0381,.0254,14),new T.MeshStandardMaterial({color:0x111920,roughness:.86}));
  group.add(puck);
  group.traverse(o=>o.layers.set(1));
  const jerseyOffset=new T.Vector3(),axis=new T.Vector3(0,1,0);
  function animate(t){
    const phase=t*.275;
    for(let i=0;i<athletes.length;i++){
      const p=athletes[i];
      if(p.keeper){
        const end=i===10?-1:1;
        p.position.set(end*(25.18-.29*Math.cos(phase)),iceY,.69*Math.sin(phase*.91+end));
        p.heading=-end*Math.PI/2+.29*Math.sin(phase*.75);
      }else{
        const f=phase+phaseOffsets[i]-.85,side=handedness[i];
        const x=stagger[i]+attack[i]*Math.sin(f),z=lanes[i]+side*1.24*Math.cos(f);
        p.position.set(x,iceY,z);p.heading=Math.atan2(attack[i]*Math.cos(f),-side*1.24*Math.sin(f));
        if(i%5>=3)p.heading+=Math.PI;
      }
      dummy.position.copy(p.position);dummy.rotation.set(0,p.heading,0);dummy.scale.setScalar(scales[i]);dummy.updateMatrix();
      p.body.setMatrixAt(p.instance,dummy.matrix);
      p.legs.forEach((leg,side)=>{
        const push=p.keeper?0:(1+Math.sin(t*6.4+i+side*Math.PI))*.5;
        stride.makeRotationX(push*.24);turn.makeRotationZ(push*(side===0?-.19:.19));
        matrix.copy(dummy.matrix).multiply(strideHip).multiply(turn).multiply(stride).multiply(fromHip);
        leg.setMatrixAt(p.instance,matrix);
      });
      jerseyOffset.set(0,p.keeper?1.11:1.26,-.091).multiplyScalar(scales[i]).applyAxisAngle(axis,p.heading);
      p.numeral.position.copy(p.position).add(jerseyOffset);p.numeral.rotation.set(0,p.heading+Math.PI,0);
      p.numeral.rotateX(.24);p.numeral.scale.setScalar(scales[i]);
      dummy.position.y=iceY+.006;dummy.rotation.set(-Math.PI/2,0,p.heading,'XYZ');dummy.scale.setScalar(scales[i]);dummy.updateMatrix();shadow.setMatrixAt(i,dummy.matrix);
    }
    for(const bank of banks.values())bank.instanceMatrix.needsUpdate=true;
    shadow.instanceMatrix.needsUpdate=true;
    const tick=t/2.55,index=Math.floor(tick)%passes.length;
    const blade=(out,i)=>out.set(.42,0,1.06).multiplyScalar(scales[i]).applyAxisAngle(axis,athletes[i].heading).add(athletes[i].position);
    blade(puckTip,passes[index]);blade(otherTip,passes[(index+1)%passes.length]);
    puck.position.lerpVectors(puckTip,otherTip,T.MathUtils.clamp((tick%1-.71)/.29,0,1));
    puck.position.y=iceY+.014;
  }
  let elapsed=0,lastDraw=0,playing=false;
  return {
    set(active,running){group.visible=active;playing=active&&running;if(active)animate(elapsed);},
    get visible(){return group.visible;},
    step(dt){
      if(!playing||dt<=0)return false;
      elapsed+=dt;
      if(elapsed-lastDraw<1/30)return false;
      lastDraw=elapsed;animate(elapsed);return true;
    },
    get seconds(){return group.visible?elapsed:0;}
  };
}
