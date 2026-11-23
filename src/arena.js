import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {makeSeating,sectorSurfaces} from './seating.js';
import {makeIce,signTexture} from './ice.js';
import {clearanceHeight,clearPath,configureOrbit,sectionPose} from './camera-space.js';
import {seatFlight,sectionFlight,beneathRoof,roomView} from './seat-flight.js';

const up=new T.Vector3(0,1,0);
const asVec=a=>new T.Vector3(...a);
const V=(x,y,z)=>new T.Vector3(x,y,z);
const mix=(a,b,t)=>a+(b-a)*t;
function material(color,metalness=.1){return new T.MeshStandardMaterial({color,roughness:.63,metalness});}
function box(w,h,d,x,y,z,mat){
  const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);return mesh;
}
function beam(a,b,radius,mat){
  const axis=b.clone().sub(a);
  const part=new T.Mesh(new T.CylinderGeometry(radius,radius,axis.length(),6),mat);
  part.position.copy(a).lerp(b,.5);part.quaternion.setFromUnitVectors(up,axis.normalize());return part;
}
function furnish(scene){
  const roof=new T.Group(),metal=material(0x415767,.45),wall=material(0x172633);
  const lights=new T.MeshBasicMaterial({color:0xe3f7ff});
  const scoreboard=new T.Group(),black=material(0x182431);
  scoreboard.add(box(5.7,3.2,4.05,0,0,0,black),box(6,.22,4.3,0,1.66,0,metal),box(5.8,.18,4.12,0,-1.65,0,metal));
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=330;
  const c=canvas.getContext('2d');c.fillStyle='#102d41';c.fillRect(0,0,640,330);
  c.fillStyle='#82e6e3';c.font='bold 42px Arial';c.textAlign='center';c.fillText('POLARIS   ARENA',320,70);
  c.fillStyle='#effaff';c.font='bold 120px Arial';c.fillText('0  :  0',320,211);
  const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;
  c.fillStyle='#a3d7de';c.font='32px Arial';c.fillText('POLARIS  ICE  CLUB',320,280);
  const screen=new T.MeshBasicMaterial({map:tex});
  for(let side=0;side<4;side++){
    const broad=side%2===0;
    const p=new T.Mesh(new T.PlaneGeometry(broad?5.3:3.7,2.85),screen);
    p.rotation.y=side*Math.PI/2;p.position.set(Math.sin(p.rotation.y)*(broad?2.04:2.86),0,Math.cos(p.rotation.y)*(broad?2.04:2.86));scoreboard.add(p);
  }
  scoreboard.position.y=15;roof.add(scoreboard);
  roof.add(box(111,.45,88,0,22.5,0,wall));
  for(const z of [-43.8,43.8]) roof.add(box(108,12,.32,0,16,z,wall));
  for(const x of [-54,54]) roof.add(box(.32,12,88,x,16,0,wall));
  for(let x=-46;x<=46;x+=9.2){
    roof.add(beam(V(x,19.9,-43),V(x,19.9,43),.19,metal),beam(V(x,22,-43),V(x,22,43),.16,metal));
    for(let z=-42;z<42;z+=6) roof.add(beam(V(x,19.9,z),V(x,22,z+3),.09,metal),beam(V(x,22,z+3),V(x,19.9,z+6),.09,metal));
    for(const z of [-20,-8,8,20]) roof.add(box(2,.16,.7,x,19.65,z,lights));
  }
  for(const x of [-2,2])for(const z of [-1.3,1.3]) roof.add(beam(V(x,16.7,z),V(x,22,z),.045,metal));
  for(const z of [-30,30]) for(let x=-43;x<44;x+=8.6){
    roof.add(beam(V(x,13,z),V(x,20,z),.15,metal),beam(V(x,13,z),V(x+4,18,z),.10,metal));
  }
  // Trusses and fixtures are static. Draw each finish once on every match frame.
  roof.updateMatrixWorld(true);
  const finishes=new Map();
  roof.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const parts=finishes.get(mesh.material)||[];
    parts.push(mesh.geometry.applyMatrix4(mesh.matrixWorld));finishes.set(mesh.material,parts);
  });
  roof.clear();
  for(const [finish,parts] of finishes){
    const batch=new T.Mesh(mergeGeometries(parts),finish);
    if(finish===screen)batch.layers.set(1);
    roof.add(batch);
    for(const geometry of parts)geometry.dispose();
  }
  roof.visible=false;scene.add(roof);
  const ads=['POLARIS   ✦   ARENA','ХОККЕЙ  СЕВЕРА','POLARIS    /    ICE CLUB'];
  const signs=ads.map((text,i)=>new T.MeshBasicMaterial({map:signTexture(text,'#e3ebed',i===1?'#426b80':'#385b72',49)}));
  const fascia=new T.MeshBasicMaterial({map:signTexture('✦    P O L A R I S      A R E N A    ✦','#243847','#a9d9db',43)});
  for(const sign of [-1,1]){
    for(let i=-2;i<=2;i++){
      const p=new T.Mesh(new T.PlaneGeometry(7,.85),signs[(i+2)%3]);p.position.set(i*8,.65,sign*14.98);p.rotation.y=sign<0?0:Math.PI;scene.add(p);
    }
    for(let i=-1;i<=1;i++){
      const p=new T.Mesh(new T.PlaneGeometry(12.5,.9),fascia);p.position.set(i*14,4.23,sign*26.10);p.rotation.y=sign<0?0:Math.PI;scene.add(p);
    }
  }
  return roof;
}
function surfaceTexture(mesh,textures){
  const wood=['Timber','Suite'].includes(mesh.material.name);
  let tex=textures.get(wood);
  if(!tex){
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
  const ctx=canvas.getContext('2d'),data=ctx.createImageData(128,128);let seed=773;
  const timber=wood;
  for(let i=0;i<data.data.length;i+=4){seed=(1664525*seed+1013904223)>>>0;const v=224+(seed>>>27);
    const x=(i/4)%128,y=Math.floor(i/512),grain=timber?10*Math.sin(x*.49+Math.sin(y*Math.PI/64)*1.9)+7*Math.sin(x*.147+Math.cos(y*Math.PI/64)):0;
    data.data[i]=v-grain;data.data[i+1]=v-grain*1.3;data.data[i+2]=v-grain*1.45;data.data[i+3]=255;}
  ctx.putImageData(data,0,0);tex=new T.CanvasTexture(canvas);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.colorSpace=T.SRGBColorSpace;
    textures.set(wood,tex);
  }
  const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal,uv=[];
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    if(Math.abs(n.getY(i))>.5)uv.push(x*.7,z*.7);
    else uv.push((Math.abs(n.getX(i))>.6?z:x)*.7,y*.7);
  }
  mesh.geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));mesh.material.map=tex;
}
function contactShadow(scene){
  const c=document.createElement('canvas');c.width=128;c.height=128;
  const ctx=c.getContext('2d'),g=ctx.createRadialGradient(64,64,24,64,64,63);
  g.addColorStop(0,'rgba(0,0,0,.68)');g.addColorStop(.68,'rgba(0,0,0,.48)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);
  const plane=new T.Mesh(new T.PlaneGeometry(143,105),new T.MeshBasicMaterial({map:new T.CanvasTexture(c),transparent:true,depthWrite:false}));
  plane.rotation.x=-Math.PI/2;plane.position.y=-1.65;scene.add(plane);
}
export async function createArena(mount,labels,layout,callbacks){
  const compact=matchMedia('(pointer: coarse)').matches || mount.clientWidth<550 || navigator.hardwareConcurrency<=4;
  const renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'default'});
  const pixelRatio=Math.min(window.devicePixelRatio,1.5);
  renderer.setPixelRatio(pixelRatio);renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.setClearColor(0x0d161d,0);mount.replaceChildren(renderer.domElement);
  const canvas=renderer.domElement;
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(38,1,.085,500);
  camera.layers.enable(1);
  const controls=new OrbitControls(camera,canvas);controls.enablePan=false;controls.enableDamping=true;controls.dampingFactor=.1;
  configureOrbit(controls);
  controls.rotateSpeed=.67;controls.zoomSpeed=.9;
  renderer.shadowMap.enabled=!compact;renderer.shadowMap.type=T.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
  scene.add(new T.HemisphereLight(0xddefff,0x475967,compact?1.5:1.15));
  if(compact)scene.add(new T.AmbientLight(0xe6eef1,.46));
  const key=new T.DirectionalLight(0xffeed9,2.35);key.position.set(-47,66,-21);scene.add(key);
  key.castShadow=true;key.shadow.mapSize.set(1024,1024);
  Object.assign(key.shadow.camera,{left:-64,right:64,bottom:-55,top:55,near:1,far:165});key.shadow.camera.updateProjectionMatrix();
  key.shadow.normalBias=.045;key.shadow.bias=-.00023;
  const rim=new T.DirectionalLight(0xb3e6ff,1.14);rim.position.set(23,32,50);scene.add(rim);
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.94;
  const loader=new GLTFLoader();
  let assets;
  try {
    assets=await Promise.all([loader.loadAsync('./arena/bowl.glb'),loader.loadAsync('./arena/seating.glb'),
      new T.TextureLoader().loadAsync('./arena/ice.webp')]);
  } catch(error) { renderer.dispose();renderer.forceContextLoss();throw error; }
  const [building,furniture,iceTexture]=assets;
  if(!compact){
    const studio=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer);
    scene.environment=pmrem.fromScene(studio,.035).texture;
    scene.environmentIntensity=.33;pmrem.dispose();studio.dispose();
  }
  const textures=new Map();
  const bowl=building.scene;
  bowl.traverse(o=>{if(o.isMesh){
    o.material.side=T.DoubleSide;
    if(o.material.name==='Glass'){o.material.transparent=true;o.material.opacity=.15;o.material.depthWrite=false;o.layers.set(1);}
    else{o.castShadow=['Frame','Rail','Timber','Support','Door'].includes(o.material.name);o.receiveShadow=true;}
    if(['Slab','Riser','Aisle','Facade','Suite','Timber','Foundation'].includes(o.material.name))surfaceTexture(o,textures);
  }});scene.add(bowl,makeIce(iceTexture));contactShadow(scene);
  const suites=layout.sectors.filter(s=>s.id>=200);
  const roof=furnish(scene);
  scene.traverse(o=>{if(o.isLight)o.layers.enable(1);});
  const seating=makeSeating(scene,layout,furniture.scene,compact);
  const surfaces=sectorSurfaces(scene,layout.sectors);
  const blockers=[];
  bowl.traverse(o=>{if(o.isMesh&&['Slab','Riser','Facade','Suite','Foundation'].includes(o.material.name))blockers.push(o)});
  const seatsById=new Map(layout.seats.map(s=>[s.slice(0,3).join('-'),s]));
  renderer.shadowMap.needsUpdate=true;
  let mode='overview',currentSector=null,inventory={},cart=[],topView=false,move=null,look=null,dirty=true,valid=true,fitWidth=0,fitHeight=0;
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  const direction=V(.31,1.19,1.04).normalize();
  const center=V(0,4.9,0),ray=new T.Raycaster(),mouse=new T.Vector2(),proj=V(0,0,0);
  let hovered=null,hoverAnchor=null,queuedPointer=null,previousFrame=0;
  let frameId=0,inFrame=false,inViewport=true,enabled=true;
  function schedule(){
    if(valid&&enabled&&inViewport&&!document.hidden&&!inFrame&&!frameId)frameId=requestAnimationFrame(frame);
  }
  function invalidate(){dirty=true;schedule();}
  function visibility(){
    if(!enabled||document.hidden||!inViewport){
      cancelAnimationFrame(frameId);frameId=0;previousFrame=0;
      if(move?.route)move.lastFrame=null;
    }else invalidate();
  }
  document.addEventListener('visibilitychange',visibility);
  const intersection=new IntersectionObserver(([entry])=>{inViewport=entry.isIntersecting;visibility();});
  intersection.observe(mount);

  const tooltip=document.createElement('div');tooltip.className='arena-tip';tooltip.setAttribute('aria-hidden','true');labels.append(tooltip);
  const callout=document.createElement('span');
  callout.className='seat-callout';callout.hidden=true;labels.append(callout);
  let pinned=null,pinnedPoint=null,returnPose=null;
  function pin(id){
    if(id===pinned)return;
    pinned=id;pinnedPoint=id?seating.point(id):null;
    if(id){
      const s=seatsById.get(id);
      callout.textContent='Ряд '+s[1]+' · Место '+s[2];
    }
    tooltip.classList.toggle('open',!!hovered&&hovered.seat!==pinned);
    positionCallout();invalidate();
  }
  function positionCallout(){
    if(!pinnedPoint||move||mode!=='section'){callout.hidden=true;return;}
    proj.copy(pinnedPoint).project(camera);
    if(Math.abs(proj.x)>1||Math.abs(proj.y)>1||Math.abs(proj.z)>1){callout.hidden=true;return;}
    const w=labels.clientWidth,h=labels.clientHeight,x=(proj.x+1)*w/2,y=(1-proj.y)*h/2;
    callout.hidden=false;
    const half=callout.offsetWidth/2,cx=T.MathUtils.clamp(x,half+5,w-half-5);
    const below=y<callout.offsetHeight+14;
    callout.classList.toggle('below',below);
    callout.style.left=cx+'px';callout.style.top=(y+(below?10:-6))+'px';
    callout.style.setProperty('--seat-x',T.MathUtils.clamp(x-cx+half,8,2*half-8)+'px');
  }
  const price=n=>new Intl.NumberFormat('ru-RU').format(n)+' ₽';
  function hover(value=null,anchor=null){
    if(move||mode==='eye')value=null;
    if(value?.seat&&mode!=='section'||value?.sector===currentSector?.id&&value?.sector!=null)value=null;
    hoverAnchor=anchor;
    const changed=hovered?.sector!==value?.sector||hovered?.seat!==value?.seat;
    hovered=value;
    if(changed){
      surfaces.hover(value?.sector||null);seating.hover(value?.seat||null);
      for(const tag of tags)tag.b.classList.toggle('pointed',tag.id===value?.sector);
      callbacks.hover?.(value);
      canvas.style.cursor=value?.seat&&inventory[value.seat]?.[1]!==0?'not-allowed':value?'pointer':'grab';
      if(value){
        let title,detail;
        if(value.sector>=201){const key='vip-'+String(value.sector-200).padStart(2,'0');const room=inventory[key];
          title='VIP-комната '+(value.sector-200);detail=room?.[1]===0?'Комната целиком · '+price(room[0]):'Занята';}
        else if(value.sector){const s=seating.stat(value.sector);title='Сектор '+value.sector;detail=s.count?s.count+' своб. мест · от '+price(s.min):'Свободных мест нет';}
        else{const s=seatsById.get(value.seat);title='Ряд '+s[1]+' · Место '+s[2];detail=inventory[value.seat]?.[1]!==0?'Занято':(cart.includes(value.seat)?'В заказе · ':'Свободно · ')+price(inventory[value.seat][0]);}
        const head=document.createElement('strong'),sub=document.createElement('span');head.textContent=title;sub.textContent=detail;tooltip.replaceChildren(head,sub);
      }
      tooltip.classList.toggle('open',!!value&&(!pinned||value.seat!==pinned));invalidate();
    }
    if(value)positionTip();
  }
  function positionTip(){
    if(!hovered)return;
    const rect=canvas.getBoundingClientRect();let x,y;
    if(hoverAnchor){x=hoverAnchor.x-rect.left;y=hoverAnchor.y-rect.top;}
    else{
      const p=hovered.seat?seating.point(hovered.seat):tags.find(t=>t.id===hovered.sector)?.p;
      if(!p)return;proj.copy(p).project(camera);x=(proj.x*.5+.5)*rect.width;y=(-proj.y*.5+.5)*rect.height;
    }
    const half=tooltip.offsetWidth/2;x=T.MathUtils.clamp(x,half+6,rect.width-half-6);
    const low=y<tooltip.offsetHeight+18;tooltip.classList.toggle('below',low);
    tooltip.style.left=x+'px';tooltip.style.top=T.MathUtils.clamp(low?y+16:y-14,4,rect.height-4)+'px';
  }
  const tags=layout.sectors.map(s=>{
    const b=document.createElement('button');b.className='sector-pin'+(s.id>200?' vip-pin':'');b.type='button';
    b.textContent=s.id>200?'VIP '+(s.id-200):s.id;b.setAttribute('aria-label',s.id>200?'Выбрать VIP-комнату '+(s.id-200):'Выбрать сектор '+s.id);
    b.onclick=()=>callbacks.sector(s.id);
    const activate=()=>hover({sector:s.id});b.onpointerenter=e=>{if(e.pointerType!=='touch')activate()};b.onpointerleave=()=>hover();b.onfocus=activate;b.onblur=()=>hover();labels.append(b);
    const p=asVec(s.anchor);p.y+=s.id<200?1.3:3.4;
    return {b,p,id:s.id};
  });
  const sortedTags=[...tags].sort((a,b)=>(a.id>=200)-(b.id>=200));
  function labelsUpdate(){
    const {width:w,height:h}=canvas.getBoundingClientRect();
    const placed=[];
    for(const item of sortedTags){
      let show=mode==='overview'&&!move;
      if(show){
        proj.copy(item.p).project(camera);
        const x=(proj.x*.5+.5)*w, anchorY=(-proj.y*.5+.5)*h, room=item.id>=200;
        const width=room?34:30;
        const outward=anchorY<h/2?-1:1;
        const offsets=room?[6,16,26,0]:[0,8,-8];
        const y=offsets.map(d=>anchorY+d*outward).find(y=>y>14 && y<h-20 &&
          !placed.some(p=>Math.abs(p.x-x)<(p.width+width)*.5+2 && Math.abs(p.y-y)<18));
        show=proj.z>0&&proj.z<1&&x>width/2&&x<w-width/2&&y!==undefined;
        if(show){item.b.style.left=x+'px';item.b.style.top=y+'px';placed.push({x,y,width});}

      }
      item.b.hidden=!show;
    }
  }
  const outline=[];
  // The sector contours include the outermost VIP roofs and stand edges.
  for(const sector of layout.sectors)for(const edge of sector.surface)
    for(const point of edge)outline.push(asVec(point));
  // Include the low outside wall as well as the elevated room roofs when fitting the view.
  for(const x of [-21.5,21.5])for(const z of [-6.5,6.5])for(let i=0;i<=8;i++){
    const angle=i*Math.PI/16;
    const px=x+Math.sign(x)*23*Math.cos(angle),pz=z+Math.sign(z)*23*Math.sin(angle);
    outline.push(V(px,-1.5,pz),V(px,5.52,pz));
  }
  function overviewPose(){
    const fov=38,lens=Math.tan(T.MathUtils.degToRad(fov/2)),probe=new T.PerspectiveCamera(fov,camera.aspect,.085,500);
    const target=center.clone(),dir=topView?V(0,1,.001).normalize():direction;
    let distance=145;
    const p=V(0,0,0),right=V(0,0,0),vertical=V(0,0,0);
    for(let pass=0;pass<5;pass++){
      probe.position.copy(target).addScaledVector(dir,distance);probe.lookAt(target);probe.updateMatrixWorld();
      let l=1,r=-1,b=1,t=-1;
      for(const v of outline){p.copy(v).project(probe);l=Math.min(l,p.x);r=Math.max(r,p.x);b=Math.min(b,p.y);t=Math.max(t,p.y);}
      right.setFromMatrixColumn(probe.matrixWorld,0);vertical.setFromMatrixColumn(probe.matrixWorld,1);
      target.addScaledVector(right,(l+r)*.5*distance*lens*camera.aspect);
      target.addScaledVector(vertical,((b+t)*.5-.015)*distance*lens);
      distance*=T.MathUtils.clamp(Math.max((r-l)/1.81,(t-b)/1.68),.75,1.7);
    }
    return {pos:target.clone().addScaledVector(dir,distance),target,fov};
  }
  function fly(pos,target,fov=38,instant=false){
    if(move?.route)callbacks.flight?.(false);
    const cut=roof.visible||mode==='eye'||!clearPath(camera.position,pos,suites);
    hover();queuedPointer=null;look=null;controls.enabled=false;
    move={start:performance.now(),ms:instant||reduce.matches?0:(cut?360:740),cut,oldRoof:roof.visible,
      from:camera.position.clone(),to:pos,focus:controls.target.clone(),target,fov0:camera.fov,fov};
    invalidate();
  }
  function overview(top=false,instant=false){mode='overview';currentSector=null;returnPose=null;seating.state(mode,null);topView=top;configureOrbit(controls);const p=overviewPose();fly(p.pos,p.target,p.fov,instant);}
  function section(number){
    const sec=layout.sectors.find(s=>s.id===number);if(!sec)return;
    const leaving=mode==='eye';
    const saved=returnPose?.sector===number&&Math.abs(returnPose.aspect-camera.aspect)<.01;
    const p=leaving&&saved?returnPose:sectionPose(sec,camera.aspect);
    currentSector=sec;mode='section';seating.state(mode,number);configureOrbit(controls,sec);returnPose=null;
    if(leaving){
      const route=sectionFlight(camera.position.clone(),camera.getWorldDirection(new T.Vector3()),p,suites);
      startFlight(route,p.fov,p.target);
    }else fly(p.pos,p.target,p.fov);
  }
  function eye(id){
    const suite=typeof id==='number'&&suites.find(s=>s.id===id);
    const s=suite?roomView(suite):seatsById.get(id);if(!s)return;
    const start=camera.position.clone(),gaze=camera.getWorldDirection(new T.Vector3());
    if(mode==='section'&&!move&&currentSector?.id===s[0]){
      returnPose={sector:s[0],aspect:camera.aspect,pos:start.clone(),target:controls.target.clone(),fov:camera.fov};
    }
    const route=seatFlight(start,gaze,s,suites);
    mode='eye';currentSector=layout.sectors.find(section=>section.id===s[0]);seating.state(mode,s[0],s);
    startFlight(route,65,null);
  }
  function startFlight(route,fov,endTarget){
    hover();queuedPointer=null;look=null;controls.enabled=false;
    move={route,lastFrame:null,elapsed:0,ms:route.duration,fov0:camera.fov,fov,endTarget,oldRoof:roof.visible};
    canvas.style.opacity='1';invalidate();
    if(reduce.matches){land();return;}
    callbacks.flight?.(true,mode);
  }
  const flightDirection=new T.Vector3();
  function advanceFlight(t){
    move.route.sample(t,camera.position,flightDirection);
    controls.target.copy(camera.position).addScaledVector(flightDirection,4);
    if(t===1&&move.endTarget)controls.target.copy(move.endTarget);
    camera.fov=mix(move.fov0,move.fov,T.MathUtils.smootherstep(t,0,1));
    camera.updateProjectionMatrix();camera.lookAt(controls.target);
    roof.visible=mode==='eye'?(t===1||((move.oldRoof||t>.56)&&beneathRoof(camera.position))):
      (move.oldRoof&&t<.7&&beneathRoof(camera.position));dirty=true;
    if(t===1){move=null;controls.enabled=mode==='section';callbacks.flight?.(false);}
  }
  function land(){
    if(move?.route){advanceFlight(1);invalidate();}
  }
  function update(inven,ids){inventory=inven;cart=ids;seating.update(inven,ids);if(hovered){const value=hovered,anchor=hoverAnchor;hover();hover(value,anchor);}invalidate();}
  function zoom(amount){
    if(move)return;
    if(mode==='eye'){camera.fov=T.MathUtils.clamp(camera.fov*amount,40,85);camera.updateProjectionMatrix();}
    else{const offset=camera.position.clone().sub(controls.target);camera.position.copy(controls.target).add(offset.setLength(T.MathUtils.clamp(offset.length()*amount,controls.minDistance,controls.maxDistance)));}
    invalidate();
  }
  function hitAt(x,y){
    const r=canvas.getBoundingClientRect();mouse.set((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1);ray.setFromCamera(mouse,camera);
    const area=surfaces.pick(ray);
    let hit=area;
    if(mode==='section'){
      const seat=seating.pick(ray,currentSector.id);
      hit=area?.sector!==currentSector.id&&area&&(!seat||area.distance<seat.distance)?area:seat;
    }
    if(!hit)return null;
    const occluder=ray.intersectObjects(blockers,false)[0];
    if(occluder&&occluder.distance<hit.distance-.18)return null;
    return hit.sector?{sector:hit.sector}:{seat:hit.seat};
  }
  let down=null,points=new Set(),dragged=false;

  canvas.addEventListener('pointerdown',e=>{
    points.add(e.pointerId);if(points.size===1)dragged=false;else dragged=true;
    down={x:e.clientX,y:e.clientY,id:e.pointerId};queuedPointer=null;hover();
    if(mode==='eye'&&!move){canvas.setPointerCapture(e.pointerId);look={x:e.clientX,y:e.clientY};}
  });
  canvas.addEventListener('pointermove',e=>{
    if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)dragged=true;
    if(!down&&!move&&mode!=='eye'&&e.pointerType!=='touch'){queuedPointer={x:e.clientX,y:e.clientY};schedule();}
    if(mode==='eye'&&look&&!move){
      const d=controls.target.clone().sub(camera.position),sp=new T.Spherical().setFromVector3(d);
      sp.theta-=(e.clientX-look.x)*.004;sp.phi=T.MathUtils.clamp(sp.phi+(e.clientY-look.y)*.004,.23,2.75);
      look={x:e.clientX,y:e.clientY};controls.target.copy(camera.position).add(new T.Vector3().setFromSpherical(sp));
      camera.lookAt(controls.target);invalidate();
    }
  });
  canvas.addEventListener('pointerleave',()=>{queuedPointer=null;hover()});
  canvas.addEventListener('pointercancel',e=>{points.delete(e.pointerId);down=null;look=null;dragged=true;queuedPointer=null;hover()});
  canvas.addEventListener('pointerup',e=>{
    points.delete(e.pointerId);look=null;if(!down||down.id!==e.pointerId)return;
    const click=!dragged&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<6;down=null;
    if(!click||move||mode==='eye')return;
    const hit=hitAt(e.clientX,e.clientY);if(hit?.sector)callbacks.sector(hit.sector);else if(hit?.seat)callbacks.seat(hit.seat);else if(pinned)callbacks.dismiss();
  });
  canvas.addEventListener('wheel',e=>{if(mode==='eye'){e.preventDefault();zoom(e.deltaY>0?1.055:.95)}},{passive:false});
  controls.addEventListener('change',()=>{invalidate();if(hovered&&hoverAnchor&&!queuedPointer){queuedPointer=hoverAnchor;}});
  const observer=new ResizeObserver(()=>{
    const {width:w,height:h}=mount.getBoundingClientRect();if(!w||!h)return;
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
    if(mode==='overview'&&(Math.abs(w-fitWidth)>1||Math.abs(h-fitHeight)>1)){overview(topView,true);}
    fitWidth=w;fitHeight=h;
    invalidate();
  });observer.observe(mount);
  const bounds=mount.getBoundingClientRect();camera.aspect=bounds.height?bounds.width/bounds.height:1;camera.updateProjectionMatrix();renderer.setSize(bounds.width,bounds.height,false);
  const pose=overviewPose();camera.position.copy(pose.pos);controls.target.copy(pose.target);controls.update();seating.update(inventory,cart);
  let slowFrames=0;
  function frame(now){
    frameId=0;
    if(!valid||!enabled||!inViewport||document.hidden)return;
    inFrame=true;
    if(move?.route){
      // A shader warm-up or a suspended tab must not consume the entire approach.
      if(move.lastFrame!==null)move.elapsed+=Math.min(now-move.lastFrame,140);
      move.lastFrame=now;
      advanceFlight(reduce.matches?1:Math.min(move.elapsed/move.ms,1));
    }else if(move){
      const t=move.ms?T.MathUtils.clamp((now-move.start)/move.ms,0,1):1;
      const blend=move.cut?Number(t>=.5):t*t*(3-2*t);
      canvas.style.opacity=move.cut?String(Math.max(0,(Math.abs(2*t-1)-.1)/.9)):'1';
      roof.visible=move.cut&&t<.5?move.oldRoof:mode==='eye';
      camera.position.lerpVectors(move.from,move.to,blend);controls.target.lerpVectors(move.focus,move.target,blend);
      camera.fov=mix(move.fov0,move.fov,blend);camera.updateProjectionMatrix();camera.lookAt(controls.target);dirty=true;
      if(t>=1){move=null;controls.enabled=mode!=='eye';}
    }else if(controls.enabled){
      controls.update();
      const floor=mode==='overview'?18.5:clearanceHeight(camera.position,suites);
      if(camera.position.y<floor){camera.position.y=floor;camera.lookAt(controls.target);dirty=true;}
    }
    if(queuedPointer&&!move&&!down){
      const p=queuedPointer;queuedPointer=null;hover(hitAt(p.x,p.y),p);
    }
    const delta=previousFrame?Math.min(100,Math.max(0,now-previousFrame)):16;
    previousFrame=now;
    const zonesChanging=surfaces.animate(reduce.matches?1:delta/115);
    const rowsChanging=seating.animateRows(reduce.matches?1:delta/180);
    const redraw=dirty||zonesChanging||rowsChanging;
    // Lower only the moving image after sustained slow frames. A resting view stays sharp.
    if(move && delta>42)slowFrames++;
    else slowFrames=0;
    let ratio=pixelRatio;
    if(move && compact)ratio=Math.min(ratio,1.1);
    if(move && (slowFrames>=3 || renderer.getPixelRatio()<=.85))ratio=Math.min(ratio,.85);
    if(ratio!==renderer.getPixelRatio()){renderer.setPixelRatio(ratio);dirty=true;}
    if(redraw || dirty){
      renderer.render(scene,camera);
      if(dirty){labelsUpdate();positionTip();positionCallout();}
      dirty=false;
    }
    inFrame=false;
    if(move||redraw)schedule();
    else previousFrame=0;
  }
  canvas.addEventListener('webglcontextlost',e=>{
    e.preventDefault();valid=false;cancelAnimationFrame(frameId);
    observer.disconnect();intersection.disconnect();controls.dispose();renderer.dispose();
    document.removeEventListener('visibilitychange',visibility);callbacks.fallback();
  });
  schedule();
  return {overview,section,hover,pin,eye,land,zoom,update,
    visible(active){if(enabled!==active){enabled=active;visibility();}},
    get mode(){return mode}};
}
