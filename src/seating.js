import * as T from 'three';

const matrix=new T.Object3D();
const color=new T.Color();
const rowTint=new T.Color('#74cfc8');
const graphite=['#26333d','#303d46','#2b3740','#29363e','#35424a'];
const seatKey=s=>s.slice(0,3).join('-');

function numberMaterial(){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
  const ctx=canvas.getContext('2d');
  for(let n=1;n<=32;n++){
    const x=(n-1)%8*128,y=Math.floor((n-1)/8)*64;
    ctx.fillStyle='#ced7d8';ctx.beginPath();ctx.roundRect(x+3,y+3,122,58,12);ctx.fill();
    ctx.fillStyle='#283b4c';ctx.font='bold 43px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(n,x+64,y+35);
  }
  const atlas=new T.CanvasTexture(canvas);atlas.colorSpace=T.SRGBColorSpace;atlas.anisotropy=4;
  const mat=new T.MeshBasicMaterial({map:atlas,transparent:true,alphaTest:.5,side:T.DoubleSide});
  mat.onBeforeCompile=shader=>{
    shader.vertexShader='attribute float placeNumber;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',
      '#include <uv_vertex>\n vMapUv=(vMapUv+vec2(mod(placeNumber,8.0),3.0-floor(placeNumber/8.0)))/vec2(8.0,4.0);');
  };
  return mat;
}

// Follow the curved tread and leave the gaps between blocks of chairs unlit.
function rowLight(seats){
  const vertices=[],rgba=[],indices=[];
  const strip=[[-.40,0],[-.27,1],[.19,.70],[.34,0]];
  function slice(seat,x,z,join){
    const at=vertices.length/3,yaw=seat[6];
    for(const [depth,alpha] of strip){
      vertices.push(x+depth*Math.sin(yaw),seat[4]+.018,z+depth*Math.cos(yaw));
      rgba.push(1,1,1,alpha);
    }
    if(join)for(let j=0;j<3;j++){const i=at+j;indices.push(i-4,i,i+1,i-4,i+1,i-3);}
  }
  const apart=(a,b)=>Math.hypot(a[3]-b[3],a[5]-b[5])>.87;
  for(let i=0;i<seats.length;i++){
    const s=seats[i],prev=seats[i-1],next=seats[i+1];
    const dx=(next??s)[3]-(prev??s)[3],dz=(next??s)[5]-(prev??s)[5];
    const halfWidth=s[0]>=200 ? .32 : .22;
    const edge=halfWidth/Math.hypot(dx,dz);
    if(!prev||apart(prev,s))slice(s,s[3]-dx*edge,s[5]-dz*edge,false);
    slice(s,s[3],s[5],true);
    if(!next||apart(s,next))slice(s,s[3]+dx*edge,s[5]+dz*edge,true);
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('color',new T.Float32BufferAttribute(rgba,4));
  geometry.setIndex(indices);
  const material=new T.MeshBasicMaterial({color:rowTint,vertexColors:true,transparent:true,depthWrite:false,side:T.DoubleSide,toneMapped:false});
  const mesh=new T.Mesh(geometry,material);mesh.name='row-light-'+seats[0].slice(0,2).join('-');
  return mesh;
}

export function makeSeating(scene,layout,models,compact){
  const groups=new Map(), indexed=new Map(), proxies=new Map(), plaque=numberMaterial();
  const animatingRows=new Set();
  let pointedRow=null;
  const templates=[];
  models.traverse(mesh=>{if(mesh.isMesh)templates.push(mesh)});
  for(const sector of layout.sectors){
    if(sector.id>=200)continue;
    const seats=layout.seats.filter(s=>s[0]===sector.id);
    const ids=seats.map(seatKey);
    const bank={sector:sector.id,ids,seats,parts:[],finish:[],lod:null};
    const rows=new Map();
    groups.set(sector.id,bank);
    const proxy=new T.InstancedMesh(new T.BoxGeometry(1,1,1),new T.MeshBasicMaterial(),seats.length);
    proxy.userData.ids=ids;proxies.set(sector.id,proxy);
    const numbers=new T.PlaneGeometry(.103,.046);
    numbers.setAttribute('placeNumber',new T.InstancedBufferAttribute(Float32Array.from(seats,s=>s[2]-1),1));
    bank.numbers=new T.InstancedMesh(numbers,plaque,seats.length);bank.numbers.visible=false;scene.add(bank.numbers);
    for(const mesh of templates){
      const [type,level,part]=mesh.name.split('_');if(type!=='Stand')continue;
      const finish=part==='Resin';
      const mat=mesh.material;
      if(finish){mat.color.set(0xffffff);mat.envMapIntensity=.95;mat.roughness=.34;}
      const piece=new T.InstancedMesh(mesh.geometry,mat,seats.length);
      piece.userData.near=level==='Near';piece.visible=!piece.userData.near;piece.receiveShadow=true;piece.castShadow=finish;
      bank.parts.push(piece);if(finish)bank.finish.push(piece);scene.add(piece);
    }
    for(let i=0;i<seats.length;i++){
      const s=seats[i],base=new T.Vector3(s[3],s[4],s[5]);
      matrix.position.copy(base);matrix.rotation.set(0,s[6],0);matrix.scale.set(1,1,1);matrix.updateMatrix();
      for(const piece of bank.parts)piece.setMatrixAt(i,matrix.matrix);
      matrix.position.y+=.61;matrix.scale.set(.49,.83,.53);
      matrix.updateMatrix();proxy.setMatrixAt(i,matrix.matrix);
      matrix.scale.set(1,1,1);
      const location=new T.Vector3(0,.825,.199).applyAxisAngle(new T.Vector3(0,1,0),s[6]);
      matrix.position.copy(base).add(location);matrix.rotation.set(0,s[6]+Math.PI,0);
      matrix.rotateX(-.15);matrix.updateMatrix();bank.numbers.setMatrixAt(i,matrix.matrix);
      if(!rows.has(s[1]))rows.set(s[1],{ids:[],seats:[],light:null,alpha:0});
      const row=rows.get(s[1]);
      row.ids.push(ids[i]);
      row.seats.push(s);
      indexed.set(ids[i],{bank,i,s,row});
    }
    proxy.computeBoundingSphere();proxy.updateMatrixWorld();
  }
  let current=null,view='overview',inventory={},basket=new Set(),hover=null;
  function paintSeat(id){
    const record=indexed.get(id);if(!record)return;
    const {bank,i,s,row}=record;
    const palette=graphite;
    let shade=palette[(s[1]*3+i)%palette.length];
    if(view==='section'&&bank.sector!==current)shade='#23313c';
    if(view==='section'&&bank.sector===current&&inventory[id]?.[1]!==0)shade='#414950';
    if(basket.has(id))shade='#ffc45b';
    if(id===hover&&inventory[id]?.[1]===0)shade=basket.has(id)?'#ffe9ab':'#88f0e0';
    color.set(shade);
    if(row.alpha&&id!==hover&&!basket.has(id)){
      const strength=inventory[id]?.[1]===0 ? .28 : .055;
      color.lerp(rowTint,row.alpha*strength);
    }
    for(const piece of bank.finish){
      const slot=bank.lod?(piece.userData.near?bank.lod.near[i]:bank.lod.far[i]):i;
      if(slot<0)continue;
      piece.setColorAt(slot,color);piece.instanceColor.needsUpdate=true;
    }
  }
  function recolor(){for(const id of indexed.keys())paintSeat(id)}
  function seatDetail(bank,eye){
    let nearCount=0,farCount=0;
    bank.lod=eye?{near:[],far:[]}:null;
    for(let i=0;i<bank.seats.length;i++){
      const s=bank.seats[i];
      const close=eye&&Math.hypot(s[3]-eye[3],s[4]-eye[4],s[5]-eye[5])<4.8;
      if(eye){bank.lod.near[i]=close?nearCount++:-1;bank.lod.far[i]=close?-1:farCount++;}
      matrix.position.set(s[3],s[4],s[5]);matrix.rotation.set(0,s[6],0);matrix.scale.set(1,1,1);matrix.updateMatrix();
      for(const piece of bank.parts){
        const slot=eye?(piece.userData.near?bank.lod.near[i]:bank.lod.far[i]):i;
        if(slot>=0)piece.setMatrixAt(slot,matrix.matrix);
      }
    }
    for(const piece of bank.parts){
      piece.count=eye?(piece.userData.near?nearCount:farCount):bank.seats.length;
      piece.instanceMatrix.needsUpdate=true;piece.boundingSphere=null;
    }
  }
  function state(mode,sector,eye=null){
    current=sector;view=mode;hover=null;
    if(pointedRow)animatingRows.add(pointedRow);
    for(const row of animatingRows){row.alpha=0;if(row.light)row.light.visible=false;}
    animatingRows.clear();pointedRow=null;
    for(const [key,bank] of groups){
      const near=mode!=='overview'&&key===sector;
      const focus=compact && near && !eye ? bank.seats[Math.floor(bank.seats.length/2)] : eye;
      const localEye=near?focus:null;
      if(localEye||bank.lod)seatDetail(bank,localEye);
      for(const piece of bank.parts)piece.visible=localEye?piece.count>0:piece.userData.near===near;
      bank.numbers.visible=near;
    }
    recolor();
  }
  return {
    state,
    update(inv,cart){
      const old=basket;
      basket=new Set(cart);
      if(inventory!==inv){inventory=inv;recolor();return;}
      for(const id of old)if(!basket.has(id))paintSeat(id);
      for(const id of basket)if(!old.has(id))paintSeat(id);
    },
    hover(id){
      const prev=hover;hover=id;
      const next=view==='section'&&id?indexed.get(id)?.row:null;
      if(next!==pointedRow){
        if(pointedRow)animatingRows.add(pointedRow);
        if(next)animatingRows.add(next);
        pointedRow=next;
      }
      if(prev)paintSeat(prev);if(id)paintSeat(id);
    },
    animateRows(step){
      if(!animatingRows.size)return false;
      for(const row of animatingRows){
        const target=row===pointedRow?1:0;
        row.alpha+=Math.sign(target-row.alpha)*Math.min(Math.abs(target-row.alpha),step);
        if(!row.light&&row.seats.length>1){row.light=rowLight(row.seats);scene.add(row.light);}
        if(row.light){
          row.light.visible=row.alpha>0;
          row.light.material.opacity=.21*row.alpha;
        }
        for(const id of row.ids)paintSeat(id);
        if(row.alpha===target)animatingRows.delete(row);
      }
      return true;
    },
    pick(ray,sector){const proxy=proxies.get(sector);if(!proxy)return null;const hit=ray.intersectObject(proxy,false)[0];return hit?{seat:proxy.userData.ids[hit.instanceId],distance:hit.distance}:null;},
    point(id){const s=indexed.get(id)?.s;return s?new T.Vector3(s[3],s[4]+(s[0]>=200?1.12:.96),s[5]):null;},
    stat(id){let count=0,min=Infinity;for(const key of groups.get(id).ids){const v=inventory[key];if(v?.[1]===0){count++;min=Math.min(min,v[0]);}}return{count,min};}
  };
}

export function sectorSurfaces(scene,sectors){
  const targets=[],layers=[];
  for(const sector of sectors){
    const grid=sector.surface,columns=grid[0].length,coords=grid.flat().flat(),indices=[];
    for(let r=0;r<grid.length-1;r++)for(let c=0;c<columns-1;c++){
      const a=r*columns+c,b=a+1,d=a+columns;indices.push(a,d,b,b,d,d+1);
    }
    if(sector.id>=200){
      // The roof is visible from above; the railing and front of the lounge are visible when orbiting lower.
      const rim=[...grid[0],...grid.at(-1).slice().reverse()];
      for(let i=0;i<rim.length;i++){
        const a=rim[i],b=rim[(i+1)%rim.length],k=coords.length/3;
        coords.push(...a,...b,b[0],sector.anchor[1],b[2],a[0],sector.anchor[1],a[2]);indices.push(k,k+1,k+2,k,k+2,k+3);
      }
    }
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(coords,3));geo.setIndex(indices);
    const mat=new T.MeshBasicMaterial({color:sector.id>=200?0xffbc78:0x54e9cf,transparent:true,opacity:0,toneMapped:false,side:T.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
    const fill=new T.Mesh(geo,mat);fill.userData.sector=sector.id;fill.renderOrder=5;scene.add(fill);targets.push(fill);
    const contour=[...grid[0],...grid.slice(1).map(row=>row.at(-1)),...grid.at(-1).slice(0,-1).reverse(),...grid.slice(1,-1).reverse().map(row=>row[0]),grid[0][0]];
    const border=new T.Line(new T.BufferGeometry().setFromPoints(contour.map(p=>new T.Vector3(...p))),new T.LineBasicMaterial({color:sector.id>=200?0xffcf9a:0xbcfff5,transparent:true,opacity:0,depthWrite:false}));
    border.renderOrder=6;scene.add(border);fill.visible=false;border.visible=false;
    layers.push({fill,border,id:sector.id,alpha:0});
  }
  let active=null;
  return{
    hover(id){active=id},
    pick(ray){const h=ray.intersectObjects(targets,false)[0];return h?{sector:h.object.userData.sector,distance:h.distance}:null},
    animate(step){
      let changed=false;
      for(const l of layers){
        const dest=l.id===active?1:0;if(l.alpha===dest)continue;
        l.alpha+=Math.sign(dest-l.alpha)*Math.min(Math.abs(dest-l.alpha),step);
        l.fill.visible=l.border.visible=l.alpha>0;l.fill.material.opacity=.45*l.alpha;l.border.material.opacity=.99*l.alpha;changed=true;
      }
      return changed;
    }
  };
}

