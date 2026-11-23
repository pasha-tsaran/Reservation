import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { arenaPlan, tickets } from '../server/catalog.js';

test('Only the lower tier, whole rooms and public seats are offered', () => {
  const { sectors, rooms } = arenaPlan(new Set(['vip-04']));
  const layout=JSON.parse(readFileSync(new URL('../public/arena/layout.json',import.meta.url),'utf8'));
  assert.deepEqual(new Set(layout.seats.map(s=>s.slice(0,3).join('-'))),
    new Set([...tickets.values()].filter(s=>s.kind==='seat').map(s=>s.id)));
  assert.deepEqual(layout.sectors.filter(s=>s.id>=200).map(s=>s.id-200),rooms.map(room=>room.number));
  assert.equal(sectors.length, 12);
  assert.equal(rooms.length, 8);
  assert.equal(rooms.find(room => room.id === 'vip-04').state, 1);
  for (const sector of sectors) {
    assert.equal(sector.rows.length, 9);
    for (const [r, row] of sector.rows.entries()) {
      for (const [n, state] of Array.from(row.states).entries()) {
        const bench = [102, 108].includes(sector.id) && r < 2 && n >= 3 && n < 20;
        assert.equal(state === '-', bench);
        assert.equal(tickets.has([sector.id, r + 1, n + 1].join('-')), !bench);
      }
    }
    assert.equal(tickets.has(sector.id + '-10-1'), false);
  }
});

test('Two sessions competing for a seat, atomic groups, cancellation, and expiry', async t=>{
  // Keep the test independent of the running arena and its reservations.
  process.env.ARENA_DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'polaris-booking-test-'));
  const {bookingApi}=await import('../server/booking.js');
  const server=http.createServer((req,res)=>bookingApi(req,res,()=>res.writeHead(404).end()));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const database=new DatabaseSync(path.join(process.env.ARENA_DATA_DIR,'reservations.sqlite'));
  t.after(()=>database.close());
  const root='http://127.0.0.1:'+server.address().port;
  const sessions=await Promise.all([fetch(root+'/api/match'),fetch(root+'/api/match')]);
  const cookies=sessions.map(response=>response.headers.get('set-cookie').split(';')[0]);
  const {inventory}=await sessions[0].json();
  const [first,second]=Object.keys(inventory).filter(seat=>inventory[seat][1]===0);
  const reserve=(cookie,seats)=>fetch(root+'/api/holds',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({seats})});
  const cancel=(cookie,id)=>fetch(root+'/api/holds/'+id,{method:'DELETE',headers:{cookie}});
  const competing=await Promise.all(cookies.map(cookie=>reserve(cookie,[first])));
  assert.deepEqual(competing.map(r=>r.status).sort(),[201,409]);
  const winner=competing.findIndex(r=>r.status===201),other=1-winner;
  const {hold}=await competing[winner].json();
  assert.equal(hold.total,inventory[first][0]);
  assert.equal((await cancel(cookies[other],hold.id)).status,404);
  assert.equal((await reserve(cookies[other],[second,first])).status,409);
  assert.equal((await (await fetch(root+'/api/match')).json()).inventory[second][1],0);
  assert.equal((await cancel(cookies[winner],hold.id)).status,200);
  const group=await reserve(cookies[other],[first,second]);
  assert.equal(group.status,201);
  const groupId=(await group.json()).hold.id;
  database.prepare('UPDATE holds SET expires=? WHERE id=?').run(Date.now()-1,groupId);
  const afterExpiry=await (await fetch(root+'/api/match',{headers:{cookie:cookies[other]}})).json();
  assert.equal(afterExpiry.holds.length,0);
  assert.equal(afterExpiry.inventory[first][1],0);
  assert.equal(afterExpiry.inventory[second][1],0);
  assert.equal((await reserve(cookies[winner],[first,second])).status,201);
  for (const removed of ['101-10-1', '102-1-10', '108-2-8', '201-1-1']) {
    assert.equal((await reserve(cookies[other],[removed])).status,400);
  }
  const roomHold = await reserve(cookies[winner],['vip-01']);
  assert.equal(roomHold.status,201);
  const room = (await roomHold.json()).hold;
  assert.equal(room.seats[0].kind,'room');
  assert.equal(room.total,6500);
  assert.equal((await reserve(cookies[other],['vip-01'])).status,409);
  assert.equal((await cancel(cookies[winner],room.id)).status,200);

  // Unexpired reservations created before the plan changed can still be viewed and released.
  const legacy = 'abcdaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  database.prepare('INSERT INTO holds VALUES(?,?,?)').run(legacy,cookies[other].split('=')[1],Date.now()+60000);
  const insert = database.prepare('INSERT INTO held_seats VALUES(?,?)');
  for (const seat of ['101-16-1','201-1-1']) insert.run(seat,legacy);
  const current = await (await fetch(root+'/api/arena',{headers:{cookie:cookies[other]}})).json();
  assert.equal(current.holds.find(hold=>hold.id===legacy).total,8900);
  assert.equal(current.rooms[0].state,0);
  assert.equal((await cancel(cookies[other],legacy)).status,200);
});

