import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const layout = JSON.parse(readFileSync(path.join(root, 'public/arena/layout.json'), 'utf8'));
const directory = process.env.ARENA_DATA_DIR || path.join(root, 'data');
mkdirSync(directory, { recursive: true });
const db = new DatabaseSync(path.join(directory, 'reservations.sqlite'));
db.exec(`PRAGMA journal_mode=WAL;
  PRAGMA busy_timeout=3000;
  CREATE TABLE IF NOT EXISTS holds (id TEXT PRIMARY KEY, owner TEXT NOT NULL, expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS held_seats (seat TEXT PRIMARY KEY, hold TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS hold_owner ON holds(owner);`);
const match = { title: 'Полярис — Шторм', arena: 'Ледовый дворец «Полярис»', startsAt: '2026-12-05T19:00:00+03:00' };
const sectorById = new Map(layout.sectors.map(sector => [sector.id, sector]));
const tickets = new Map(layout.seats.map(([sector, row, number]) => {
  const id = [sector,row,number].join('-');
  const hash = Math.imul(sector*4099 + row*199 + number, 2654435761) >>> 0;
  const price = sectorById.get(sector).base + (sector > 200 ? 0 : row <= 3 ? 850 : row <= 8 ? 400 : 0);
  return [id, { id, sector, row, number, price, sold: (hash ^ (hash >>> 11)) >>> 0 < 1360000000 }];
}));
const listMine = db.prepare('SELECT h.id, h.expires, s.seat FROM holds h JOIN held_seats s ON s.hold=h.id WHERE h.owner=? AND h.expires>? ORDER BY h.expires DESC, s.seat');
const insertHold = db.prepare('INSERT INTO holds VALUES(?,?,?)');
const insertSeat = db.prepare('INSERT INTO held_seats VALUES(?,?)');
const taken = db.prepare('SELECT 1 FROM held_seats WHERE seat=?');
const holdDuration = 10 * 60 * 1000;
function myHolds(owner) {
  const result = new Map();
  for (const record of listMine.all(owner,Date.now())) {
    if (!result.has(record.id)) result.set(record.id, { id: record.id, expires: record.expires, seats: [], total: 0 });
    const hold = result.get(record.id);
    const { id, sector, row, number, price } = tickets.get(record.seat);
    hold.seats.push({ id, sector, row, number, price });
    hold.total += price;
  }
  return [...result.values()];
}
function expire(now) {
  db.prepare('DELETE FROM held_seats WHERE hold IN (SELECT id FROM holds WHERE expires<=?)').run(now);
  db.prepare('DELETE FROM holds WHERE expires<=?').run(now);
}
const busySeats = db.prepare('SELECT s.seat FROM held_seats s JOIN holds h ON h.id=s.hold WHERE h.expires>?');
function snapshot(owner) {
  const held = new Set(busySeats.all(Date.now()).map(x=>x.seat));
  const inventory = {};
  for (const seat of tickets.values()) inventory[seat.id] = [seat.price, seat.sold ? 2 : held.has(seat.id) ? 1 : 0];
  return { match, inventory, holds: myHolds(owner) };
}
function fail(status,message) { return Object.assign(new Error(message), {status}); }
async function readBody(req) {
  let data='';
  for await (const chunk of req) {
    data+=chunk;
    if (data.length>3000) throw fail(413,'Слишком большой запрос.');
  }
  try { return JSON.parse(data); } catch { throw fail(400,'Проверьте выбранные места.'); }
}
export async function bookingApi(req,res,next) {
  let url;
  try { url=new URL(req.url,'http://localhost'); } catch { res.writeHead(400).end(); return; }
  if (!url.pathname.startsWith('/api/')) return next();
  const cookie = (req.headers.cookie || '').match(/(?:^|;\s*)polaris_session=([\da-f-]{36})(?:;|$)/);
  const owner = cookie?.[1] || randomUUID();
  if (!cookie) {
    const scope=process.env.SESSION_PATH||'/';
    const secure=process.env.SESSION_SECURE==='1'?'; Secure':'';
    res.setHeader('Set-Cookie', 'polaris_session='+owner+'; HttpOnly; SameSite=Strict; Path='+scope+'; Max-Age=2592000'+secure);
  }
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  const send = (status,data)=>{ res.statusCode=status; res.end(JSON.stringify(data)); };
  try {
    if (req.method==='GET' && url.pathname==='/api/match') return send(200,snapshot(owner));
    if (req.method==='GET' && url.pathname==='/api/holds') return send(200,{holds:myHolds(owner)});
    if (req.headers.origin && new URL(req.headers.origin).host!==req.headers.host) throw fail(403,'Недоступный источник запроса.');
    if (req.method==='POST' && url.pathname==='/api/holds') {
      if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')throw fail(415,'Требуется JSON.');
      const payload = await readBody(req);
      const ids = payload?.seats;
      if (!Array.isArray(ids) || ids.length<1 || ids.length>8 || new Set(ids).size!==ids.length || ids.some(id=>!tickets.has(id))) throw fail(400,'Можно выбрать от одного до восьми мест.');
      db.exec('BEGIN IMMEDIATE');
      try {
        const now=Date.now();
        expire(now);
        if (ids.some(id=>tickets.get(id).sold || taken.get(id))) throw fail(409,'Одно из мест уже занято. Выберите другое кресло.');
        const id=randomUUID();
        insertHold.run(id,owner,now+holdDuration);
        for (const seat of ids) insertSeat.run(seat,id);
        db.exec('COMMIT');
        return send(201,{hold:myHolds(owner).find(h=>h.id===id)});
      } catch (error) {db.exec('ROLLBACK'); throw error;}
    }
    if (req.method==='DELETE' && /^\/api\/holds\/[\da-f-]{36}$/.test(url.pathname)) {
      const id=url.pathname.split('/').pop();
      db.exec('BEGIN IMMEDIATE');
      try {
        const row=db.prepare('SELECT id FROM holds WHERE id=? AND owner=?').get(id,owner);
        if (!row) throw fail(404,'Бронь не найдена.');
        db.prepare('DELETE FROM held_seats WHERE hold=?').run(id);
        db.prepare('DELETE FROM holds WHERE id=?').run(id);
        db.exec('COMMIT');
      } catch(error) { db.exec('ROLLBACK'); throw error; }
      return send(200,{holds:myHolds(owner)});
    }
    throw fail(404,'Страница не найдена.');
  } catch(error) { return send(error.status || 500,{error:error.status ? error.message : 'Не удалось обработать запрос. Попробуйте ещё раз.'}); }
}

