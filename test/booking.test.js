import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

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
});

