import {icon} from './icons.js';

const rubles = new Intl.NumberFormat('ru-RU');
export const money = value => rubles.format(value) + ' ₽';
export const pad = value => String(value).padStart(2, '0');
export const roomName = number => 'VIP-комната ' + pad(number);
export const itemName = item => item.kind === 'room' ? roomName(item.number) : (item.sector >= 200 ? 'Ложа ' + (item.sector - 200) : 'Сектор ' + item.sector);
export const itemDetail = item => item.kind === 'room' ? 'Комната целиком' : `Ряд ${item.row} · Место ${item.number}`;

export function indexPlan(data) {
  const items = new Map();
  for (const sector of data.sectors) {
    let free = 0;
    let min = Infinity;
    sector.rows.forEach(({ price, states }, r) => {
      for (let n = 0; n < states.length; n++) {
        if (states[n] === '-') continue;
        const id = [sector.id, r + 1, n + 1].join('-');
        const state = Number(states[n]);
        if (!state) { free++; min = Math.min(price, min); }
        items.set(id, { id, kind: 'seat', sector: sector.id, row: r + 1, number: n + 1, price, state });
      }
    });
    sector.free = free;
    sector.min = min;
  }
  for (const room of data.rooms) items.set(room.id, { ...room, kind: 'room' });
  return items;
}

export function zoneList(data) {
  const stands = data.sectors.map(s => `<button data-sector="${s.id}" class="zone-row">
    <span class="zone-code">${s.id}</span><span><strong>${s.title}</strong><small>${s.free ? 'Свободно мест: ' + s.free : 'Все места заняты'}</small></span>
    <b>${s.free ? 'от ' + money(s.min) : '—'}</b>${icon('right',14)}</button>`).join('');
  const suites = data.rooms.map(room => `<button data-room="${room.id}" class="zone-row"><span class="zone-code yellow">VIP</span>
    <span><strong>${roomName(room.number)}</strong><small>${room.state ? 'Занята' : 'Комната целиком'}</small></span><b>${money(room.price)}</b>${icon('right',14)}</button>`).join('');
  return `<div class="zone-list"><h3>Трибуны</h3>${stands}<h3>VIP-комнаты</h3>${suites}</div>`;
}

export function sectionPanel(sector, row, cart) {
  const { states, price } = sector.rows[row - 1];
  const buttons = Array.from(states, (state, index) => {
    const n = index + 1;
    if (state === '-') return index === states.indexOf('-') ? '<span class="bench-gap">Скамейка команды и тренеров</span>' : '';
    const key = [sector.id, row, n].join('-');
    const selected = cart.includes(key);
    return `<button class="seat" data-item="${key}" ${state !== '0' ? 'disabled' : ''} aria-pressed="${selected}" aria-label="Место ${n}, ряд ${row}, ${state !== '0' ? 'занято' : money(price)}">${n}</button>`;
  }).join('');
  const rows = sector.rows.map((_, i) => `<option value="${i + 1}" ${row === i + 1 ? 'selected' : ''}>Ряд ${i + 1}</option>`).join('');
  return `<div class="seat-panel"><div class="sector-controls"><label>Выберите ряд <select id="row">${rows}</select></label><span>За место <strong>${money(price)}</strong></span></div>
    <div class="ice-edge">${icon('ice',16)} Лёд</div><div class="seat-grid ${states.includes('-') ? 'with-bench' : ''}">${buttons}</div></div>
    <div class="legend"><span><i class="key stand-key"></i>Свободно</span><span><i class="key picked-key"></i>Выбрано</span><span><i class="key taken-key"></i>Занято</span></div>`;
}

export function roomPanel(room, cart) {
  const selected = cart.includes(room.id);
  return `<div class="room-panel">
    <div class="room-graphic" aria-hidden="true"><div class="suite-floor">VIP <b>${pad(room.number)}</b><i></i></div></div>
    <div class="room-summary"><div><h3>Комната целиком</h3><p>${room.number <= 4 ? 'Северная' : 'Южная'} сторона · По центру трибуны</p></div><strong>${money(room.price)}</strong></div>
    <button class="primary" data-item="${room.id}" aria-pressed="${selected}" ${room.state ? 'disabled' : ''}>${room.state ? 'Комната занята' : selected ? 'Убрать из заказа' : 'Добавить комнату'} ${icon(selected ? 'minus' : 'plus',16)}</button>
    </div>`;
}

export function basketLines(items) {
  if (!items.length) return '';
  return `<ul class="cart-items">${items.map(item => `<li><div><strong>${itemName(item)}</strong><small>${itemDetail(item)}</small></div><b>${money(item.price)}</b><button data-remove="${item.id}" aria-label="Убрать: ${itemName(item)}, ${itemDetail(item)}">${icon('close',14)}</button></li>`).join('')}</ul>`;
}

export function timeLeft(expires) {
  const seconds = Math.max(0, Math.ceil((expires - Date.now()) / 1000));
  return Math.floor(seconds / 60) + ':' + pad(seconds % 60);
}

export function holdCards(holds) {
  if (!holds.length) return '<p>Активных броней пока нет.</p><button class="primary" data-action="close">К выбору мест</button>';
  return holds.map(hold => `<article class="hold-card"><header><h3>Полярис × Шторм</h3><span data-timer="${hold.expires}">${timeLeft(hold.expires)}</span></header>
    ${hold.seats.map(s => `<div class="hold-line"><span>${itemName(s)}<small>${itemDetail(s)}</small></span><b>${money(s.price)}</b></div>`).join('')}
    <footer><button data-cancel="${hold.id}">Отменить бронь</button><strong>${money(hold.total)}</strong></footer></article>`).join('');
}
