import { icon } from './icons.js';

const centerY = 215;
const left = 215;
const right = 545;
const outer = 148;
const inner = 98;
const format = n => Number(n.toFixed(2));
const point = (x, radius, degrees) => {
  const a = degrees * Math.PI / 180;
  return [format(x + radius * Math.cos(a)), format(centerY + radius * Math.sin(a))].join(' ');
};

function straight(id, start, end, top) {
  const y = r => centerY + (top ? -r : r);
  return {
    id, x: (start + end) / 2, y: y(124),
    path: `M${start} ${y(outer)} H${end} V${y(inner)} H${start}Z`,
    row: r => `M${start + 4} ${y(r)} H${end - 4}`
  };
}

function curved(id, cx, start, end) {
  const mid = point(cx, 124, (start + end) / 2).split(' ');
  return {
    id, x: mid[0], y: mid[1],
    path: `M${point(cx, outer, start)} A${outer} ${outer} 0 0 1 ${point(cx, outer, end)} L${point(cx, inner, end)} A${inner} ${inner} 0 0 0 ${point(cx, inner, start)}Z`,
    row: r => `M${point(cx, r, start + 2)} A${r} ${r} 0 0 1 ${point(cx, r, end - 2)}`
  };
}

const stands = [
  straight(101, left, 325, true), straight(102, 325, 435, true), straight(103, 435, right, true),
  curved(104, right, -90, -32), curved(105, right, -32, 32), curved(106, right, 32, 90),
  straight(107, 435, right, false), straight(108, 325, 435, false), straight(109, left, 325, false),
  curved(110, left, 90, 148), curved(111, left, 148, 212), curved(112, left, 212, 270)
];

function sectorShape(stand) {
  const marks = [104, 110, 116, 122, 128, 134, 140, 146].map(r => stand.row(r)).join(' ');
  return `<g class="zone stand" role="button" tabindex="0" data-sector="${stand.id}" aria-label="Выбрать сектор ${stand.id}">
    <path class="stand-shape" d="${stand.path}"/><path class="row-marks" d="${marks}"/>
    <rect class="number-plate" x="${stand.x - 19}" y="${stand.y - 10}" width="38" height="20" rx="8"/>
    <text x="${stand.x}" y="${stand.y}" class="sector-no">${stand.id}</text></g>`;
}

function roomShape(room) {
  const index = room.number - 1;
  const x = 174 + (index % 4) * 104;
  const y = index < 4 ? 30 : 370;
  const number = String(room.number).padStart(2, '0');
  return `<g class="zone suite ${room.state ? 'occupied' : ''}" role="button" tabindex="0" data-room="${room.id}" aria-label="VIP-комната ${number}${room.state ? ', занята' : ''}">
    <rect x="${x}" y="${y}" width="100" height="30" rx="4"/>
    <text x="${x + 50}" y="${y + 15}">VIP ${number}</text></g>`;
}

function bench(y, name) {
  return `<g class="bench" role="img" aria-label="Места команды «${name}» и тренеров">
    <rect x="312" y="${y}" width="136" height="18" rx="3"/><text x="380" y="${y + 9}">${name.toUpperCase()}</text></g>`;
}

function faceOff(x, y) {
  return `<g transform="translate(${x} ${y})" class="faceoff"><circle r="18"/><path d="M-7 -4h4v-4m6 0v4h4m0 8H3v4m-6 0V4h-4"/><circle r="1.6" fill="currentColor"/></g>`;
}

function ice() {
  return `<defs><clipPath id="ice-clip"><rect x="144" y="131" width="472" height="168" rx="56"/></clipPath></defs>
    <rect class="boards" x="140" y="127" width="480" height="176" rx="60"/>
    <g clip-path="url(#ice-clip)"><rect class="ice" x="144" y="131" width="472" height="168"/>
    <path class="blue-line" d="M305 131v168m150-168v168"/><path class="red-line" d="M380 131v168"/>
    <path class="goal-line" d="M179 131v168m402-168v168"/>
    <circle class="center-circle" cx="380" cy="215" r="25"/>
    ${[215,545].flatMap(x => [176,254].map(y => faceOff(x, y))).join('')}
    <path class="crease" d="M179 202a13 13 0 0 1 0 26ZM581 202a13 13 0 0 0 0 26Z"/>
    <path class="goal" d="M179 208h-5q-2 7 0 14h5zm402 0h5q2 7 0 14h-5z"/>
    <path class="ice-star" d="m380 197 3.5 13.5L396 207l-10 9 3.5 8-9-5-5 14-.5-14-11 3 10-9-3-8 8 5Z"/>
    </g><rect class="rink-rim" x="144" y="131" width="472" height="168" rx="56"/>`;
}

export function arenaMap(rooms) {
  return `<svg class="arena-plan" viewBox="40 12 680 406" role="group" aria-labelledby="plan-title">
    <title id="plan-title">Первый ярус. Выберите трибуну или VIP-комнату</title>
    <rect class="perimeter" x="53" y="18" width="654" height="394" rx="162"/>
    <rect class="concourse" x="61" y="61" width="638" height="308" rx="154"/>
    ${ice()}${stands.map(sectorShape).join('')}${rooms.map(roomShape).join('')}
    ${bench(108,'Полярис')}${bench(304,'Шторм')}</svg>`;
}

export function mapPanel(rooms) {
  return `<div class="map-stage">
    <div class="map-orientation">${icon('layers', 14)} Первый ярус</div>
    <div class="map-scroll" tabindex="-1" aria-label="План арены"><div class="map-paper">${arenaMap(rooms)}</div></div>
    <div class="map-zoom" role="group" aria-label="Масштаб схемы"><button data-action="zoom-out" aria-label="Уменьшить" disabled>${icon('minus',15)}</button><output id="zoom-level">100%</output><button data-action="zoom-in" aria-label="Увеличить">${icon('plus',15)}</button></div>
  </div><div class="legend"><span><i class="key stand-key"></i>Основные места</span><span><i class="key room-key"></i>VIP-комнаты</span><span><i class="key team-key"></i>Команды и тренеры</span></div>`;
}
