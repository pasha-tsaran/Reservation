import './style.css';
import { icon } from './icons.js';
import { mapPanel } from './plan.js';
import { basketLines, holdCards, indexPlan, money, roomName, roomPanel, sectionPanel, timeLeft, zoneList } from './booking-views.js';

const q = selector => document.querySelector(selector);
for (const placeholder of document.querySelectorAll('[data-icon]')) placeholder.innerHTML = icon(placeholder.dataset.icon, 16);

const cartKey = 'polaris-match-2026-12-05-selection';
const limit = 8;
const dialog = q('dialog');
let data, items = new Map(), cart = [], section = null, row = 1, view = 'three', scale = 1;
let busy = false, dialogKind = '', previousSnapshot = '', requestSequence = 0, noticeTimer, tickTimer;
let arena, loadingArena=false, sceneFailed=false, pinned=null, fromSeat=false, overhead=false;
let inventory={};
const stage=q('#arena-stage');
const sectionActions=q('.section-actions');
const roomSector = id => 200 + Number(id.slice(4));
const sceneNumber = () => typeof section === 'string' ? roomSector(section) : section;

function syncSceneControls() {
  stage.hidden = view !== 'three';
  arena?.visible(!stage.hidden);
  q('[data-action=top]').hidden = !!section || !arena;
  q('[data-action=top]').setAttribute('aria-pressed', overhead);
  q('[data-action=top]').textContent = overhead ? 'Объёмный вид' : 'Вид сверху';
  q('[data-action=sector-camera]').hidden = !fromSeat;
  q('[data-action=preview]').hidden = stage.hidden || !arena || !section || fromSeat || (!pinned && typeof section !== 'string');
  q('[data-action=preview]').textContent = typeof section === 'string' ? 'Вид из комнаты' : 'Посмотреть с места';
}
function syncCamera(instant=false) {
  fromSeat=false;
  if(arena && view==='three'){
    arena.pin(null);
    if(section)arena.section(sceneNumber());
    else arena.overview(overhead,instant);
  }
  syncSceneControls();
}
function previewSeat(id) {
  if(!arena || view!=='three' || !id)return;
  fromSeat=true;
  arena.eye(id);
  syncSceneControls();
}
function fallback3D() {
  sceneFailed=true;
  arena=null;
  if(view==='three')view='map';
  if(document.fullscreenElement===stage)document.exitFullscreen().catch(()=>{});
  stage.classList.remove('expanded');
  syncFullscreenActions();
  fromSeat=false;pinned=null;
  q('[data-action=three]').disabled=true;
  q('[data-action=three]').title='3D недоступно в этом браузере';
  drawArea();
  notify('Не удалось открыть 3D. Места и VIP-комнаты доступны на схеме.');
}
async function loadArena() {
  if(arena || loadingArena || sceneFailed || view!=='three')return;
  loadingArena=true;
  try {
    const [{createArena},response]=await Promise.all([import('./arena.js'),fetch('./arena/layout.json')]);
    if(!response.ok)throw new Error('layout');
    const layout=await response.json();
    arena=await createArena(q('#scene'),q('#pins'),layout,{
      sector(number){openSection(number<200 ? number : 'vip-'+String(number-200).padStart(2,'0'));},
      seat(id){
        const item=items.get(id);
        if(!item || item.state!==0){notify('Это место занято. Выберите свободное.');return;}
        if(row!==item.row){row=item.row;drawArea();}
        toggleItem(id);
      },
      dismiss(){pinned=null;arena.pin(null);syncSceneControls();},
      flight(active){q('[data-action=land]').hidden=!active;},
      fallback:fallback3D
    });
    q('.scene-status').hidden=true;
    arena.update(inventory,cart);
    syncCamera(true);
  }catch(error){console.warn('3D arena:',error);fallback3D();}
  finally{loadingArena=false;}
}
try {
  const saved = JSON.parse(sessionStorage.getItem(cartKey));
  if (Array.isArray(saved)) cart = [...new Set(saved.filter(id => typeof id === 'string'))].slice(0, limit);
} catch {}

function save() {
  try { sessionStorage.setItem(cartKey, JSON.stringify(cart)); } catch {}
}

function notify(message) {
  if (dialog.open) {
    q('#dialog-notice').textContent = message;
    return;
  }
  q('#notice').textContent = message;
  q('#notice').classList.add('visible');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => q('#notice').classList.remove('visible'), 4000);
}

async function api(path, options) {
  let response;
  try { response = await fetch('./api/' + path, options); }
  catch { throw new Error('Проверьте подключение и повторите попытку.'); }
  const result = await response.json().catch(() => { throw new Error('Сервис временно недоступен. Попробуйте ещё раз.'); });
  if (!response.ok) throw new Error(result.error || 'Попробуйте ещё раз.');
  return result;
}

function drawOrder() {
  const selected = cart.map(id => items.get(id)).filter(Boolean);
  q('#quantity').textContent = selected.length;
  q('.empty-cart').hidden = selected.length !== 0;
  q('#basket').innerHTML = basketLines(selected);
  q('#total').textContent = money(selected.reduce((sum, item) => sum + item.price, 0));
  q('.book').disabled = !selected.length || busy;
  q('.book').innerHTML = busy ? 'Подождите…' : 'Забронировать ' + icon('arrow', 17);
  q('#mobile-quantity').textContent = selected.length;
}

function setZoom(value) {
  const scroller = q('.map-scroll');
  if (!scroller) return;
  const previousWidth = scroller.scrollWidth;
  const center = (scroller.scrollLeft + scroller.clientWidth / 2) / previousWidth;
  scale = Math.min(2, Math.max(1, value));
  const oldHeight = scroller.scrollHeight;
  const midY = (scroller.scrollTop + scroller.clientHeight / 2) / oldHeight;
  scroller.style.setProperty('--zoom', scale);
  scroller.scrollLeft = center * scroller.scrollWidth - scroller.clientWidth / 2;
  scroller.scrollTop = midY * scroller.scrollHeight - scroller.clientHeight / 2;
  q('#zoom-level').textContent = Math.round(scale * 100) + '%';
  q('[data-action=zoom-out]').disabled = scale === 1;
  q('[data-action=zoom-in]').disabled = scale === 2;
}

function drawArea() {
  q('.switch').hidden = section !== null;
  sectionActions.hidden = section === null;
  q('.switch').style.setProperty('--tab', ['three','map','list'].indexOf(view));
  for (const button of q('.switch').querySelectorAll('button')) button.setAttribute('aria-pressed', button.dataset.action === view);
  const sector = data.sectors.find(s => s.id === section);
  const room = data.rooms.find(r => r.id === section);
  let title, description, content;
  if (sector) {
    title = 'Сектор ' + sector.id;
    description = sector.title + ' · Первый ярус';
    content = sectionPanel(sector, row, cart);
  } else if (room) {
    title = roomName(room.number);
    description = 'Отдельная комната с видом на лёд';
    content = roomPanel(room, cart);
  } else {
    title = view === 'three' ? 'Обзор арены' : view === 'map' ? 'Схема арены' : 'Список зон';
    description = 'Выберите сектор или отдельную VIP-комнату.';
    if (view === 'three') content = '<div class="legend"><span><i class="key stand-key"></i>Основные места</span><span><i class="key room-key"></i>VIP-комнаты</span><span><i class="key team-key"></i>Команды и тренеры</span></div>';
    else content = view === 'map' ? mapPanel(data.rooms) : zoneList(data);
  }
  q('#area-title').textContent = title;
  q('#area-description').textContent = description;
  if(section && view!=='three' && !sceneFailed)content+='<button class="scene-link" data-action="section-three">Открыть в 3D</button>';
  q('#area').innerHTML = content;
  syncSceneControls();
  if (!section && view === 'map' && scale !== 1) setZoom(scale);
}

function renderKeepingFocus() {
  const active = document.activeElement;
  const attr = ['data-item', 'data-remove', 'data-sector', 'data-room', 'data-action'].find(key => active.hasAttribute(key));
  const rowFocused = active.id === 'row';
  const oldScroll = q('.map-scroll');
  const position = oldScroll && [oldScroll.scrollLeft, oldScroll.scrollTop];
  drawArea();
  drawOrder();
  if (position) q('.map-scroll')?.scrollTo(...position);
  if (rowFocused) q('#row')?.focus({ preventScroll: true });
  if (attr && !active.isConnected) q(`[${attr}="${active.getAttribute(attr)}"]`)?.focus({ preventScroll: true });
}

function updateCount() {
  const count = data?.holds.filter(h => h.expires > Date.now()).length || 0;
  q('#hold-count').hidden = !count;
  q('#hold-count').textContent = count;
}

async function refresh() {
  const sequence = ++requestSequence;
  const next = await api('arena');
  if (sequence !== requestSequence) return;
  const snapshot = JSON.stringify(next);
  if (previousSnapshot === snapshot) return;
  previousSnapshot = snapshot;
  data = next;
  items = indexPlan(data);
  inventory=Object.fromEntries([...items].map(([id,item])=>[id,[item.price,item.state]]));
  const available = cart.filter(id => items.get(id)?.state === 0);
  if (cart.length !== available.length) {
    cart = available;
    save();
    notify('Заказ обновлён. В нём остались только доступные места и комнаты.');
  }
  q('#stand-price').textContent = 'от ' + money(Math.min(...data.sectors.flatMap(s => s.rows.map(r => r.price))));
  q('#room-price').textContent = money(data.rooms[0].price);
  if(pinned && !cart.includes(pinned)){pinned=null;arena?.pin(null);}
  arena?.update(inventory,cart);
  renderKeepingFocus();
  if(view==='three')loadArena();
  updateCount();
  if (dialog.open && (dialogKind === 'holds' || dialogKind === 'confirmed')) showHolds(dialogKind === 'confirmed');
}

async function load() {
  try { await refresh(); }
  catch {
    if (data) throw new Error('Не удалось обновить доступность мест.');
    stage.hidden=true;
    q('#area').innerHTML = '<div class="loading" role="alert"><strong>Не удалось загрузить схему</strong><button class="back" data-action="retry">Попробовать снова</button></div>';
  }
}

function showDialog(title, body, kind) {
  const active = dialog.open && document.activeElement.closest('button');
  dialogKind = kind;
  q('#dialog-body').innerHTML = `<div class="dialog-heading"><h2 id="dialog-title">${title}</h2><button data-action="close" aria-label="Закрыть">${icon('close', 20)}</button></div>${body}<p id="dialog-notice" role="status"></p>`;
  if (!dialog.open) dialog.showModal();
  else if (active) {
    const cancel = active.dataset.cancel;
    const replacement = cancel && dialog.querySelector(`[data-cancel="${cancel}"]`);
    (replacement || dialog.querySelector('[data-action=close]')).focus({preventScroll: true});
  }
  clearInterval(tickTimer);
}

function showHolds(fresh = false) {
  const holds = data.holds.filter(h => h.expires > Date.now());
  showDialog(fresh ? 'Бронь оформлена' : 'Мои брони', holdCards(holds), fresh ? 'confirmed' : 'holds');
  if (!holds.length) return;
  tickTimer = setInterval(() => {
    if (document.hidden) return;
    for (const timer of dialog.querySelectorAll('[data-timer]')) {
      const expires = Number(timer.dataset.timer);
      timer.textContent = timeLeft(expires);
      if (expires <= Date.now()) { updateCount(); showHolds(); refresh().catch(() => {}); break; }
    }
  }, 1000);
}

function toggleItem(id) {
  if (busy) return;
  if (cart.includes(id)) cart = cart.filter(key => key !== id);
  else {
    if (items.get(id)?.state !== 0) return;
    if (cart.length >= limit) { notify('Можно выбрать до восьми мест или комнат.'); return; }
    cart.push(id);
  }
  save();
  const active = document.activeElement;
  const itemButton = q(`[data-item="${id}"]`);
  const selected = cart.includes(id);
  if (itemButton) {
    itemButton.setAttribute('aria-pressed', selected);
    if (items.get(id).kind === 'room') itemButton.innerHTML = selected ? 'Убрать из заказа ' + icon('minus',16) : 'Добавить комнату ' + icon('plus',16);
  }
  if(arena){
    if(view==='three' && section===items.get(id)?.sector){
      pinned=selected?id:null;
      arena.pin(pinned);
    }
    arena.update(inventory,cart);
    syncSceneControls();
  }
  drawOrder();
  if (active.hasAttribute('data-remove')) (q('[data-remove]') || itemButton || q('[data-action=holds]')).focus({preventScroll: true});
}

async function book() {
  if (!cart.length || busy) return;
  busy = true;
  requestSequence++;
  drawOrder();
  try {
    const { hold } = await api('holds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seats: cart }) });
    for (const id of cart) {
      const item = items.get(id);
      if (item.kind === 'room') data.rooms.find(room => room.id === id).state = 1;
      else {
        const sector = data.sectors.find(s => s.id === item.sector);
        const r = sector.rows[item.row - 1];
        r.states = r.states.slice(0, item.number - 1) + '1' + r.states.slice(item.number);
      }
    }
    items = indexPlan(data);
    cart = []; save();pinned=null;arena?.pin(null);
    data.holds.unshift(hold);
    updateCount();
    showHolds(true);
  } catch (error) { notify(error.message); }
  finally {
    busy = false;
    renderKeepingFocus();
    await refresh().catch(() => {});
  }
}

function openSection(value) {
  section = value;
  row = 1;pinned=null;
  syncCamera();
  drawArea();
  q('#area-title').focus({ preventScroll: true });
  if (q('.plan-panel').getBoundingClientRect().top < 0) q('.plan-panel').scrollIntoView({ block: 'start' });
}

async function click(event) {
  const target = event.target.closest('button,[role=button]');
  if (!target || target.disabled) return;
  const d = target.dataset;
  if (d.pane) {
    q('.workspace').dataset.pane=d.pane;
    for(const button of q('.mobile-panels').querySelectorAll('button'))button.setAttribute('aria-pressed',button===target);
    return;
  }
  if (d.action === 'help') {
    showDialog('Как забронировать', '<ol class="help-steps"><li>Выберите чёрный сектор на схеме. Откройте ряд и добавьте свободные места в заказ.</li><li>Жёлтые VIP-комнаты бронируются целиком. Зелёные зоны у льда предназначены для команд и тренеров.</li><li>Выберите до восьми позиций и нажмите «Забронировать». Демо-бронь хранится в этом браузере 10 минут. Отменить её можно в разделе «Мои брони».</li></ol>', 'help');
    return;
  }
  if (d.action === 'close') { dialog.close(); return; }
  if (d.action === 'retry') { await load(); return; }
  if (d.action === 'holds') { await refresh(); showHolds(); return; }
  if (!data) return;
  if (d.sector || d.room) { openSection(d.room || Number(d.sector)); return; }
  if (d.item || d.remove) { toggleItem(d.item || d.remove); return; }
  if (d.cancel) {
    target.disabled = true;
    try {
      ++requestSequence;
      const result = await api('holds/' + d.cancel, { method: 'DELETE' });
      data.holds = result.holds;
      updateCount(); showHolds();
      await refresh();
    } finally { target.disabled = false; }
    return;
  }
  switch (d.action) {
    case 'three': case 'map': case 'list':
      view=d.action; drawArea();
      if(view==='three'){if(arena)syncCamera();else loadArena();}
      break;
    case 'section-three':
      view='three';drawArea();
      if(arena)syncCamera();else loadArena();
      stage.scrollIntoView({block:'nearest'});
      break;
    case 'scene-in': arena?.zoom(.85); break;
    case 'scene-out': arena?.zoom(1.18); break;
    case 'expand':
      if(document.fullscreenElement)await document.exitFullscreen();
      else if(stage.requestFullscreen)await stage.requestFullscreen();
      else {stage.classList.toggle('expanded');syncFullscreenActions();}
      break;
    case 'top': overhead=!overhead;arena?.overview(overhead);syncSceneControls();break;
    case 'land': arena?.land(); break;
    case 'sector-camera': syncCamera(); break;
    case 'preview': previewSeat(typeof section==='string'?sceneNumber():pinned);break;
    case 'back': {
      const old = section;
      openSection(null);
      q(`[data-sector="${old}"],[data-room="${old}"]`)?.focus({ preventScroll: true });
      break;
    }
    case 'zoom-out': setZoom(scale - 0.25); break;
    case 'zoom-in': setZoom(scale + 0.25); break;
    case 'book': await book(); break;
  }
}

document.addEventListener('click', e => click(e).catch(error => notify(error.message)));
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.zone[role=button]')) {
    e.preventDefault();
    click(e).catch(error => notify(error.message));
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'row') { pinned=null;arena?.pin(null);row = Number(e.target.value); drawArea(); q('#row').focus({ preventScroll: true }); }
});
dialog.addEventListener('close', () => { clearInterval(tickTimer); dialogKind = ''; });
dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
function syncVisible() {
  if (!document.hidden && data && !busy) refresh().catch(() => {});
}
function hoverSeat(event) {
  if(!arena||view!=='three'||fromSeat||event.pointerType==='touch')return;
  const button=event.target.closest('.seat[data-item]');
  if(button)arena.hover(event.type==='pointerout'||event.type==='focusout'?null:{seat:button.dataset.item});
}
for(const type of ['pointerover','pointerout','focusin','focusout'])q('#area').addEventListener(type,hoverSeat);
function syncFullscreenActions() {
  const expanded=document.fullscreenElement===stage || stage.classList.contains('expanded');
  const parent=expanded?stage:q('.panel-heading');
  if(sectionActions.parentElement!==parent)parent.append(sectionActions);
  q('[data-action=expand]').setAttribute('aria-label',expanded?'Свернуть арену':'Развернуть арену');
}
document.addEventListener('fullscreenchange',syncFullscreenActions);
document.addEventListener('visibilitychange', syncVisible);
setInterval(syncVisible, 30000);
drawOrder();
load();
