import '@fontsource-variable/manrope';
import '@fontsource-variable/roboto-condensed';
import './style.css';
import {icon as I} from './icons.js';
import {neighboringSectors} from './camera-space.js';

const q=s=>document.querySelector(s);
const money=n=>new Intl.NumberFormat('ru-RU').format(n)+' ₽';
const label=id=>id>=200?'Ложа '+(id-200):'Сектор '+id;
const name=id=>id.split('-').map(Number);
const btn=(action,icon,title)=>`<button type="button" data-act="${action}" class="square" aria-label="${title}" title="${title}">${I(icon)}</button>`;
q('#app').innerHTML=`<header class="mast"><div class="brand"><img src="./polaris.svg" alt=""><span>POLARIS <b>ARENA</b></span></div><div class="header-actions"><button data-act="help" class="help">${I('help')}<span>Помощь</span></button><button data-act="holds" class="my-holds">${I('ticket')}<span>Мои брони</span><em id="hold-count" hidden></em></button></div></header>
<main class="workspace">
<section class="viewer" id="viewer" aria-label="Интерактивная хоккейная арена">
  <div class="worldhead"><h1 id="world-title">Обзор арены</h1><p id="world-desc">Выберите сектор, чтобы увидеть места</p></div>
  <div class="stage-content"><div id="scene" role="group" aria-label="Трёхмерная модель ледовой арены"></div><div id="labels"></div><div class="loading" id="loading"><span></span> Загружаем арену</div></div>
  <div class="stage-bottom">
  <button type="button" class="skip-flight" id="skip-flight" data-act="land" hidden>${I('arrow',15)} Пропустить подлёт</button>
  <div id="seat-shortcuts" class="seat-shortcuts" hidden></div>
  <div class="stage-dock" role="group" aria-label="Ракурс и заказ билетов">
  <div class="view-switch" id="view-switch" aria-label="Ракурс арены"><i></i><button data-act="perspective" aria-pressed="true">${I('cube',16)} 3D</button><button data-act="top" aria-pressed="false">${I('map',16)} Сверху</button></div>
  <button id="return" data-act="back" hidden class="return">${I('left',15)} К арене</button>
  <div class="match-controls" id="match-controls" hidden>
    <div class="scene-mode" role="group" aria-label="Режим просмотра"><i></i><button data-act="empty-ice" aria-pressed="true">Арена</button><button data-act="match" aria-pressed="false">${I('play',12)} Матч</button></div>
    <button class="playback" data-act="playback" aria-label="Приостановить матч" hidden></button>
  </div>
  <div id="stage-order" hidden></div></div></div>
  <div class="worldfoot"><div class="legend" id="legend"></div><div class="world-tools"><div class="zoom-group">${btn('plus','plus','Приблизить')}${btn('minus','minus','Отдалить')}</div>${btn('reset','focus','Восстановить ракурс')}${btn('fullscreen','expand','Развернуть арену')}</div></div>
</section>
<aside class="sidebar" aria-label="Матч и выбор билетов"><div class="match-poster"><div class="match-type"><i></i> Демо-матч</div><div class="match-name">Полярис <span>×</span> Шторм</div><div class="match-date">${I('calendar',15)} 5 декабря, сб <i></i> 19:00 МСК</div></div><section class="details" id="details"></section><div id="basket"></div></aside>
</main>
<dialog id="dialog"><div id="dialog-body"></div></dialog><div id="notice" class="notice" role="status"></div>`;
const dialog=q('#dialog');
q('[data-act=help]').setAttribute('aria-label','Помощь');
dialog.addEventListener('click',e=>{if(e.target===dialog && !q('#dialog-body').contains(e.target))dialog.close()});
let layout,arena,match,inventory={},holds=[],sector=null,seatId=null,row=1,mode='overview',filter='all',top=false,cart=[],fallback=false,busy=false,noticeTimer,latestRequest=0,bookingVersion=0;
const bySector=new Map();
const byId=new Map();
let matchOn=false,playing=false,matchOrigin=null;
function flightStatus(active,destination){
  const skip=q('#skip-flight'),hadFocus=document.activeElement===skip;
  if(active)skip.innerHTML=I('arrow',15)+(destination==='section'?' Пропустить отлёт':' Пропустить подлёт');
  skip.hidden=!active;
  q('#viewer').classList.toggle('approaching',active);
  if(!active&&hadFocus)q('#return').focus({preventScroll:true});
}
const cartKey='polaris-match-2026-12-05-selection';
try{const saved=JSON.parse(sessionStorage.getItem(cartKey)||'[]');if(Array.isArray(saved))cart=[...new Set(saved.filter(id=>typeof id==='string'))].slice(0,8);}catch{}
function saveCart(){try{sessionStorage.setItem(cartKey,JSON.stringify(cart));}catch{}}
function markHovered(hit){
  document.querySelectorAll('#details .pointed').forEach(el=>el.classList.remove('pointed'));
  const target=hit?.seat?q('#details [data-seat="'+hit.seat+'"]'):hit?.sector?q('#details [data-sector="'+hit.sector+'"]'):null;
  target?.classList.add('pointed');
}
function linkHover(value=null){
  if(!fallback){arena?.hover(value);return;}
  markHovered(value);
  q('#scene').querySelectorAll('[data-map-sector],.flat-pin').forEach(el=>el.classList.toggle('pointed',+(el.dataset.mapSector||el.dataset.sector)===value?.sector));
}
function mirrorHover(event){
  if(event.pointerType==='touch')return;
  const b=event.target.closest('#details [data-sector],#details [data-seat],.flat-pin,[data-map-sector]');
  if(!b)return;
  if(event.type==='focusout'||event.type==='pointerout'){if(!b.contains(event.relatedTarget))linkHover();return;}
  linkHover(b.dataset.seat?{seat:b.dataset.seat}:{sector:+(b.dataset.sector||b.dataset.mapSector)});
}
for(const event of ['focusin','focusout','pointerover','pointerout'])document.addEventListener(event,mirrorHover);

function notify(msg){q('#notice').textContent=msg;q('#notice').classList.add('show');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>q('#notice').classList.remove('show'),3700);}
async function api(path,options){const r=await fetch(path,options);const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}
function currentRows(){return [...new Set((bySector.get(sector)||[]).map(s=>s[1]))];}
function stat(id){
  let count=0,min=Infinity;
  for(const s of bySector.get(id)||[]){const v=inventory[s.slice(0,3).join('-')];if(v&&v[1]===0){count++;min=Math.min(min,v[0]);}}
  return {count,min};
}
function legend(){
  const items=mode==='overview'?[['regular','Трибуны'],['vip','VIP-ложи']]:[['free','Свободно'],['picked','Выбрано'],['sold','Занято']];
  q('#legend').innerHTML=items.map(([color,title])=>`<span><i class="${color}"></i>${title}</span>`).join('');
}
function world(){
  const eye=mode==='eye',s=name(seatId||'0-0-0');
  q('#viewer').classList.toggle('immersive',eye);
  q('.sidebar').classList.toggle('selecting',mode!=='overview');
  q('#viewer').classList.toggle('in-section',mode==='section');
  const poster=q('.match-poster');poster.classList.toggle('seat-portrait',mode!=='overview');poster.classList.toggle('club',sector>=200);
  q('.match-name').innerHTML=mode==='overview'?'Полярис <span>×</span> Шторм':sector>=200?'VIP-ложа':'Места на трибуне';
  q('.match-type').innerHTML='<i></i> '+(mode==='overview'?'Демо-матч':label(sector));
  q('.match-date').innerHTML=mode==='overview'?I('calendar',15)+' 5 декабря, сб <i></i> 19:00 МСК':'Полярис × Шторм <i></i> 5 декабря';
  q('#world-title').textContent=mode==='overview'?'Обзор арены':eye?'Вид с места':label(sector);
  if(eye&&matchOn)q('#world-title').textContent='Матч с места';
  q('#world-desc').textContent=mode==='overview'?'Выберите сектор, чтобы увидеть места':eye?`${label(sector)} · Ряд ${s[1]} · Место ${s[2]}`:'Нажмите на кресло, чтобы добавить его в заказ';
  q('#view-switch').hidden=mode!=='overview'||fallback;
  q('#view-switch').classList.toggle('second',top);
  q('[data-act=top]').setAttribute('aria-pressed',String(top));q('[data-act=perspective]').setAttribute('aria-pressed',String(!top));
  q('#return').hidden=mode==='overview';
  q('#return').innerHTML=I('left',15)+(eye?'К сектору':'К арене');
  q('#match-controls').hidden=!arena||fallback;
  q('.scene-mode').classList.toggle('on',matchOn);
  q('[data-act=empty-ice]').setAttribute('aria-pressed',String(!matchOn));
  q('[data-act=match]').setAttribute('aria-pressed',String(matchOn));
  const playback=q('[data-act=playback]');
  playback.hidden=!matchOn;playback.innerHTML=I(playing?'pause':'play',15);
  playback.title=playing?'Приостановить матч':'Продолжить матч';playback.setAttribute('aria-label',playback.title);
  const shortcuts=q('#seat-shortcuts');
  arena?.pin(mode==='section'?seatId:null);
  shortcuts.hidden=!eye||!seatId||fallback;
  shortcuts.innerHTML=!shortcuts.hidden?`<div class="quick-seat">${I('seat',15)} Ряд ${s[1]} · Место ${s[2]} · ${money(inventory[seatId][0])}</div>
    ${cart.includes(seatId)?'':`<button class="quick-view" data-act="add">Выбрать место ${I('right',14)}</button>`}
    ${eye&&cart.length>1?`<button class="compare" data-act="compare">Следующее место ${I('arrow',15)}</button>`:''}`:'';
  legend();
}
function overview(topMode=false){sector=null;seatId=null;mode='overview';top=topMode;arena?.overview(top);render();}
function openSector(id){
  const data=bySector.get(id);if(!data)return;
  const fromNav=document.activeElement?.closest('.adjacent');
  mode='section';sector=id;seatId=null;
  row=(data.find(s=>inventory[s.slice(0,3).join('-')]?.[1]===0)||data[0])[1];
  arena?.section(id);render();
  if(fromNav)q('.details-heading h2')?.focus({preventScroll:true});
}
function pick(id){
  if(busy)return;
  if(inventory[id]?.[1]!==0){notify('Это кресло уже занято. Выберите свободное место.');return;}
  const s=byId.get(id);if(!s)return;
  if(!cart.includes(id)&&cart.length>=8){notify('В одной брони может быть до восьми мест.');return;}
  if(mode==='eye'||sector!==s[0])arena?.section(s[0]);
  mode='section';sector=s[0];row=s[1];seatId=id;
  toggleSeat(id);
}
function fromSeat(){if(!seatId||fallback)return;mode='eye';arena?.eye(seatId);render();if(matchMedia('(max-width:720px)').matches)q('#viewer').scrollIntoView({block:'start'});}
function returnToSector(){
  mode='section';arena?.section(sector);render();
}
function dismissSeat(){if(mode==='section'&&seatId){seatId=null;render();}}
function watchMatch(id=null){
  if(!arena)return;
  if(id&&(!byId.has(id)||inventory[id]?.[1]!==0)){notify('Это место больше недоступно.');return;}
  if(!matchOn){
    matchOrigin={mode,sector,seatId};
    matchOn=true;playing=!matchMedia('(prefers-reduced-motion: reduce)').matches;
    arena.match(true,playing);
  }
  if(mode==='eye'&&!id){world();return;}
  const chosen=id||(!seatId&&(cart.find(key=>byId.get(key)?.[0]===sector)||cart[0]));
  if(chosen){const s=byId.get(chosen);sector=s[0];row=s[1];seatId=chosen;}
  if(!seatId){
    const preferred=sector??108;
    const preferredRow=sector==null?8:row;
    const available=(bySector.get(preferred)||[]).filter(s=>inventory[s.slice(0,3).join('-')]?.[1]===0);
    const score=s=>Math.abs(s[1]-preferredRow)*32+Math.abs(s[2]-(preferred>=200?6:12));
    const view=available.reduce((best,s)=>!best||score(s)<score(best)?s:best,null);
    if(view){sector=view[0];row=view[1];seatId=view.slice(0,3).join('-');}
  }
  if(seatId)fromSeat();else world();
}
function exitMatch(){
  if(!matchOn)return;
  matchOn=false;playing=false;arena?.match(false,false);
  const origin=matchOrigin;matchOrigin=null;
  if(mode==='eye'&&origin?.mode==='overview'&&!cart.includes(seatId)){overview(top);return;}
  if(mode==='eye'&&origin?.mode!=='eye'){
    if(!cart.includes(seatId)&&origin?.seatId!==seatId)seatId=null;
    returnToSector();
  }else world();
}
function renderDetails(){
  if(!layout)return;
  const content=q('#details'),old=content.querySelector('.sector-list')?.scrollTop||0;
  if(mode==='overview'){
    const shown=layout.sectors.filter(s=>filter==='all'||(filter==='vip'?s.id>200:s.id<200));
    content.innerHTML=`<div class="details-heading"><h2>Секторы</h2><span class="count">${shown.length}</span></div>
    <div class="filters" aria-label="Тип сектора">${[['all','Все'],['tiers','Трибуны'],['vip','VIP-ложи']].map(([id,title])=>`<button data-filter="${id}" aria-pressed="${id===filter}">${title}</button>`).join('')}</div>
    <div class="sector-list">${shown.map(s=>{const info=stat(s.id);return `<button class="sector-row" data-sector="${s.id}"><span class="sector-no ${s.id>200?'vip':''}">${s.id>200?'V'+(s.id-200):s.id}</span><span class="sector-info"><strong>${s.title}</strong><small>${info.count} своб. мест</small></span><span class="price">${info.count?'от '+money(info.min):'Мест нет'}</span>${I('right',13)}</button>`}).join('')}</div>`;
    content.querySelector('.sector-list').scrollTop=old;
  }else{
    const s=layout.sectors.find(s=>s.id===sector), rows=currentRows();
    const seats=bySector.get(sector).filter(s=>s[1]===row);
    const z=seatId&&byId.get(seatId);
    const adjacent=neighboringSectors(layout.sectors,sector);
    content.innerHTML=`<div class="details-heading"><h2 tabindex="-1">${label(sector)}</h2><button class="text-button" data-act="all">Все секторы</button></div><p class="detail-sub">${s.title}</p>
    <nav class="adjacent" aria-label="Соседние секторы"><span>Рядом</span>${adjacent.map((other,i)=>`<button data-sector="${other.id}" aria-label="Перейти в ${label(other.id).replace('Ложа','ложу').toLowerCase()}">${i===0?I('left',12):''}${other.id>=200?'VIP '+(other.id-200):other.id}${i===adjacent.length-1?I('right',12):''}</button>`).join('')}</nav>
    <div class="rowline"><label for="row">Ряд</label><select id="row">${rows.map(n=>'<option '+(n===row?'selected':'')+' value="'+n+'">'+n+'</option>').join('')}</select><span>${seats.length} мест в ряду</span></div>
    <div class="seat-grid" aria-label="Кресла ряда ${row}">${seats.map(s=>{const id=s.slice(0,3).join('-');const val=inventory[id];return `<button class="seat ${id===seatId?'chosen':''} ${cart.includes(id)?'in-cart':''}" ${val?.[1]!==0?'disabled':''} data-seat="${id}" aria-label="Место ${s[2]}${val?.[1]!==0?', занято':', '+money(val[0])}" aria-pressed="${cart.includes(id)}">${s[2]}</button>`}).join('')}</div>
    ${z?`<div class="seat-detail"><div class="choice"><span>${I('seat')} Место ${z[2]}</span><strong>${money(inventory[seatId][0])}</strong></div><div class="seat-actions">${!fallback?`<button class="secondary" data-act="eye">${I('eye',16)}${mode==='eye'?'К сектору':'Посмотреть с места'}</button>`:''}<button class="${cart.includes(seatId)?'secondary':'primary'}" data-act="add">${I(cart.includes(seatId)?'minus':'plus',16)}${cart.includes(seatId)?'Убрать':'Выбрать'}</button></div></div>`:'<p class="choose-note">'+I('seat',17)+' Нажмите на свободное кресло</p>'}`;
  }
}
function renderCart(){
 const el=q('#basket');el.className=cart.length?'has-cart':'';
 const total=cart.reduce((n,id)=>n+(inventory[id]?.[0]||0),0);
 const orderText=busy?'Оформляем…':cart.length>1?'Заказать билеты':'Заказать билет';
 el.innerHTML=cart.length?`<div class="cart-summary"><button class="text-button" data-act="cart">Выбрано мест: ${cart.length} ${I('right',14)}</button><strong>${money(total)}</strong></div><button class="secondary book" data-act="book" ${busy?'disabled':''}>${orderText} ${I('arrow',17)}</button>`:
 `<div class="empty-cart">${I('ticket',20)} <span>Места пока не выбраны</span></div>`;
 const order=q('#stage-order');order.hidden=!cart.length;
 order.innerHTML=cart.length?`<button class="order-count" data-act="cart" aria-label="Выбранные места: ${cart.length}">${I('ticket',16)} ${cart.length} · ${money(total)}</button><button class="order-book" data-act="book" ${busy?'disabled':''}>${orderText} ${I('arrow',14)}</button>`:'';
 q('#hold-count').hidden=!holds.length;q('#hold-count').textContent=holds.length;
}
function render(){
 const focusId=document.activeElement?.dataset?.seat;
 world();renderDetails();renderCart();if(fallback)fallbackView();
 if(focusId)q('[data-seat="'+focusId+'"]')?.focus({preventScroll:true});
}
function show(title,inside){q('#dialog-body').innerHTML=`<div class="dialog-head"><h2>${title}</h2>${btn('close','close','Закрыть')}</div>${inside}`;if(!dialog.open)dialog.showModal();}
function timeLeft(expires){const secs=Math.max(0,Math.ceil((expires-Date.now())/1000));return Math.floor(secs/60)+':'+String(secs%60).padStart(2,'0');}
function holdsDialog(fresh=false){
 const list=holds.filter(h=>h.expires>Date.now());
 show(fresh?'Места забронированы':'Мои брони',list.length?`<div class="dialog-list">${list.map(h=>`<article class="hold-card"><div class="hold-head"><strong>${match.title}</strong><span class="timer" data-timer="${h.expires}">${timeLeft(h.expires)}</span></div><p>Тестовая бронь · 5 декабря, 19:00</p>${h.seats.map(s=>`<div class="hold-line"><span>${label(s.sector)} · Ряд ${s.row} · Место ${s.number}</span><b>${money(s.price)}</b></div>`).join('')}<div class="hold-bottom"><button class="text-button" data-cancel="${h.id}">Отменить бронь</button><strong>${money(h.total)}</strong></div></article>`).join('')}</div><p class="dialog-note">Места удерживаются 10 минут. После окончания таймера они снова доступны для выбора.</p>`:'<div class="dialog-empty">'+I('ticket',32)+'<p>Активных броней пока нет</p><button class="primary" data-act="close">К выбору мест</button></div>');
}
function cartDialog(){
 const items=cart.map(id=>{const [s,r,n]=name(id);return `<div class="hold-line"><span>${label(s)} · Ряд ${r} · Место ${n}</span><b>${money(inventory[id][0])}</b>${arena?`<button class="square" data-preview="${id}" title="Посмотреть с места" aria-label="Посмотреть с места ${n}, ряд ${r}, ${label(s)}">${I('eye',16)}</button>`:''}<button class="square" data-remove="${id}" aria-label="Убрать место ${n}">${I('trash',15)}</button></div>`}).join('');
 const compare=cart.length>1&&!fallback?'<button class="secondary compare-launch" data-act="compare">'+I('eye',16)+' Сравнить виды с мест</button>':'';
 show('Выбранные места',items?items+compare:'<p>Вы ещё не выбрали места.</p>');
}
function toggleSeat(id){
 if(busy)return;
 if(cart.includes(id)){cart=cart.filter(s=>s!==id);if(seatId===id){seatId=null;if(mode==='eye'){mode='section';arena?.section(sector);}}}else if(cart.length>=8){notify('В одной брони может быть до восьми мест.');return;}else if(inventory[id]?.[1]===0){cart.push(id);}
 saveCart();arena?.update(inventory,cart);render();
}
async function refresh(initial=false){
 const n=++latestRequest,version=bookingVersion;
 const data=await api('./api/match');
 if(n!==latestRequest||version!==bookingVersion)return;
 const changed=JSON.stringify(inventory)!==JSON.stringify(data.inventory);
 match=data.match;inventory=data.inventory;holds=data.holds;
 const previous=cart.length;cart=cart.filter(id=>inventory[id]?.[1]===0);saveCart();
 if(previous!==cart.length)notify('Одно из выбранных мест стало недоступно.');
 if(seatId&&inventory[seatId]?.[1]!==0){
   seatId=null;
   if(mode==='eye'){mode='section';arena?.section(sector);}

 }
 if(changed||initial){arena?.update(inventory,cart);render();}else renderCart();
}
async function book(){
 if(busy||!cart.length)return;busy=true;bookingVersion++;renderCart();
 try{const {hold}=await api('./api/holds',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({seats:cart})});
 cart=[];saveCart();seatId=null;holds=[hold,...holds];overview();holdsDialog(true);await refresh().catch(()=>{});}
 catch(err){notify(err.message);await refresh().catch(()=>{});}
 finally{busy=false;renderCart();}
}
async function clickAction(action){
 switch(action){
  case 'match':watchMatch();break;
  case 'empty-ice':exitMatch();break;
  case 'playback':if(matchOn){playing=!playing;arena?.match(true,playing);world();}break;
  case 'land':arena?.land();break;
  case 'help':show('Как выбрать место',`<div class="help-steps"><p><b>Выберите места.</b> Нажимайте на кресла или их номера, чтобы собрать заказ. Повторное нажатие убирает место.</p><p><b>Посмотрите матч.</b> Нажмите «Посмотреть с места» над креслом. Можно также открыть заказ и выбрать значок глаза у нужного билета. «Следующее место» переключает между выбранными креслами.</p><p><b>Вернитесь к выбору.</b> «К сектору» плавно поднимет камеру над рядом и вернёт обзор трибуны.</p><p><b>Забронируйте места.</b> Проверьте заказ и нажмите «Заказать билет». Тестовая бронь действует 10 минут.</p></div>`);break;
  case 'holds':await refresh();if(match)holdsDialog();break;
  case 'close':dialog.close();break;
  case 'perspective':overview(false);break;
  case 'top':overview(true);break;
  case 'all':overview();break;
  case 'back':if(mode==='eye')returnToSector();else overview();break;
  case 'reset':if(mode==='eye')arena?.eye(seatId);else if(mode==='section')arena?.section(sector);else overview(top);break;
  case 'plus':arena?.zoom(.83);break;
  case 'minus':arena?.zoom(1.20);break;
  case 'eye':if(mode==='eye')returnToSector();else if(seatId)watchMatch(seatId);break;
  case 'fullscreen':if(document.fullscreenElement)await document.exitFullscreen();else if(q('.workspace').requestFullscreen)await q('.workspace').requestFullscreen();else notify('Разворот экрана недоступен в этом браузере.');break;
  case 'add':if(seatId)toggleSeat(seatId);break;
  case 'cart':cartDialog();break;
  case 'compare':{
    if(!arena||cart.length<2)break;
    const next=cart[(cart.indexOf(mode==='eye'?seatId:null)+1)%cart.length];
    if(dialog.open)dialog.close();
    watchMatch(next);break;
  }
  case 'book':await book();break;
  case 'retry':location.reload();break;
 }
}
document.addEventListener('click',async e=>{
 const region=e.target.closest('[data-map-sector]');if(region){openSector(+region.dataset.mapSector);return;}
 const b=e.target.closest('button');if(!b||b.disabled)return;
 try{
 if(b.dataset.act)await clickAction(b.dataset.act);
 else if(b.dataset.preview){if(dialog.open)dialog.close();watchMatch(b.dataset.preview);}
 else if(b.dataset.sector)openSector(+b.dataset.sector);
 else if(b.dataset.seat)pick(b.dataset.seat);
 else if(b.dataset.filter){filter=b.dataset.filter;renderDetails();}
 else if(b.dataset.cancel){b.disabled=true;bookingVersion++;await api('./api/holds/'+b.dataset.cancel,{method:'DELETE'});await refresh();holdsDialog();}
 else if(b.dataset.remove){toggleSeat(b.dataset.remove);cartDialog();}
 }catch(err){notify(err.message);}
});
document.addEventListener('change',e=>{
  if(e.target.id==='row'){row=+e.target.value;seatId=null;if(mode==='eye'){mode='section';arena?.section(sector);}render();}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dialog.open)dismissSeat();});
function fallbackView(){
 if(!layout)return;
 q('#labels').replaceChildren();q('.world-tools').hidden=true;
 const footprints=layout.sectors.map(s=>{
   const edge=[...s.surface[0],...s.surface[s.surface.length-1].slice().reverse()];
   const d=edge.map(([x,,z],i)=>(i?'L':'M')+x+' '+z).join(' ')+' Z';
   return `<path d="${d}" data-map-sector="${s.id}" class="${s.id===sector?'pointed':''}"/>`;
 }).join('');
 q('#scene').innerHTML=`<div class="fallback-map"><div class="fallback-rink">${I('ice',44)}</div><svg class="fallback-regions" viewBox="-55 -45 110 90" preserveAspectRatio="none" aria-hidden="true">${footprints}</svg>${layout.sectors.map(s=>`<button data-sector="${s.id}" class="flat-pin" style="left:${50+s.anchor[0]*100/110}%;top:${50+s.anchor[2]*100/90}%" aria-label="${label(s.id)}">${s.id>200?'V'+(s.id-200):s.id}</button>`).join('')}</div>`;
}
function fallbackStart(){fallback=true;arena=null;flightStatus(false);if(mode==='eye')mode='section';q('#loading').hidden=true;render();notify('Открыта схема мест. Для 3D включите аппаратное ускорение в браузере.');}
async function start(){
 try{
 const [data]=await Promise.all([fetch('./arena/layout.json').then(r=>r.json()),refresh(true)]);layout=data;
 for(const s of layout.seats){const list=bySector.get(s[0])||[];list.push(s);bySector.set(s[0],list);byId.set(s.slice(0,3).join('-'),s);}
 render();
 try{const {createArena}=await import('./arena.js');arena=await createArena(q('#scene'),q('#labels'),layout,{sector:openSector,seat:pick,preview:watchMatch,dismiss:dismissSeat,hover:markHovered,flight:flightStatus,fallback:fallbackStart});arena.update(inventory,cart);if(mode==='eye'&&seatId)arena.eye(seatId);else if(sector)arena.section(sector);else if(top)arena.overview(true);q('#loading').hidden=true;world();}
 catch(err){console.warn('3D arena:',err);fallbackStart();}
 setInterval(()=>{if(!document.hidden&&!busy)refresh().catch(()=>{});},15000);
 setInterval(()=>{for(const el of document.querySelectorAll('[data-timer]')){el.textContent=timeLeft(+el.dataset.timer);if(+el.dataset.timer<=Date.now()){holds=holds.filter(h=>h.expires>Date.now());holdsDialog();refresh().catch(()=>{});break;}}},1000);
 }catch{q('#loading').innerHTML='Не удалось загрузить арену. <button class="text-button" data-act="retry">Повторить</button>';}
}
start();

