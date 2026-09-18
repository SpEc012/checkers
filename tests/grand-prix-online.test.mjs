// The room API, driven end to end against a real SQLite database using the
// same migration D1 runs. Two players, three tokens, and every rule the server
// is responsible for: seats, passwords, turn order, stale revisions, secrets,
// agreed changes and closing the room.

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { api } from '../server/api.mjs';
import { moves } from '../public/engine.mjs';
import {GP_TRACKS} from '../public/grand-prix.mjs';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync('drizzle/0000_famous_selene.sql', 'utf8'));

/** The slice of the D1 client the Worker actually uses. */
const DB = {
  prepare(sql) {
    return {
      bind(...args) {
        const statement = sqlite.prepare(sql);
        return {
          async first() {
            return statement.get(...args) || null;
          },
          async all() {
            return { results: statement.all(...args) };
          },
          async run() {
            return { meta: statement.run(...args) };
          },
        };
      },
    };
  },
};

// Three players: A hosts, B is the guest, C is a stranger.
const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);

async function call(path, body, token = A) {
  const response = await api(new Request(`https://game.test${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Player-Token': token,
      Origin: 'https://game.test',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), { DB });
  return { status: response.status, data: await response.json() };
}

const realNow=Date.now;let clock=realNow();Date.now=()=>clock;
try{
let r=await call('/api/rooms',{game:'grandprix',side:'cream',name:'Grand Prix test',playerName:'Dylan'});assert.equal(r.status,201);const id=r.data.id,route=a=>`/api/rooms/${id}/${a}`;
r=await call(route('play'),{action:'config',track:0,bots:0});assert.equal(r.status,200);assert.equal(r.data.state.config.bots,0);
r=await call(route('join'),{playerName:'Audrey'},B);assert.equal(r.data.side,'rose');
assert.equal((await call(route('play'),{action:'config',track:1,bots:3},B)).status,403,'host-only rule rejected');
r=await call(route('play'),{action:'config',track:1,bots:0},B);assert.equal(r.data.state.config.track,0);assert.equal(r.data.state.request.side,'rose');
r=await call(route('play'),{action:'config',accept:true});assert.equal(r.data.state.config.track,1);
r=await call(route('play'),{action:'profile',color:'#cc6699',body:'roadster',side:'rose'});assert.equal(r.data.state.profiles.cream.color,'#cc6699');assert.notEqual(r.data.state.profiles.rose.color,'#cc6699');
assert.equal((await call(route('play'),{action:'ready'},C)).status,403);
r=await call(route('play'),{action:'ready'});assert.equal(r.data.state.phase,'garage');r=await call(route('play'),{action:'ready'},B);assert.equal(r.data.state.cars.length,2);assert.equal(r.data.state.phase,'countdown');
clock=r.data.state.startAt+10;
for(let i=1;i<=12;i++){
 clock+=150;
 const a=await call(route('play'),{action:'input',seq:i,input:{throttle:true,right:i<4},distance:999999,side:'rose'});assert.equal(a.status,200);
 const b=await call(route('play'),{action:'input',seq:i,input:{throttle:true}},B);assert.equal(b.status,200);
 assert.deepEqual(a.data.state.inputs.cream,{left:false,right:i<4,throttle:true,brake:false,boost:false});
 r=b;
}
assert.ok(r.data.state.cars.every(c=>c.distance>0&&c.distance<100));
const before=r.data.state.cars.map(c=>c.distance);clock+=5000;r=await call(route('play'),{action:'input',seq:13,input:{throttle:true}});assert.deepEqual(r.data.state.cars.map(c=>c.distance),before);assert.match(r.data.state.waiting,/reconnect/);
r=await call(route('play'),{action:'input',seq:13,input:{throttle:true}},B);clock+=150;r=await call(route('play'),{action:'input',seq:14,input:{throttle:true}});assert.ok(r.data.state.cars[0].distance>before[0]);
// Concurrent writers merge on the server; neither phone sees a room-change error.
clock+=150;const pair=await Promise.all([call(route('play'),{action:'input',seq:15,input:{throttle:true}}),call(route('play'),{action:'input',seq:15,input:{brake:true}},B)]);assert.deepEqual(pair.map(x=>x.status),[200,200]);
for(let seq=16;seq<=40;seq++){
 clock+=125;
 const burst=await Promise.all([
  call(route('play'),{action:'input',seq,input:{throttle:true,left:seq%2===0}}),
  call(route('play'),{action:'input',seq,input:{throttle:true,right:seq%2===1}},B),
 ]);
 assert.deepEqual(burst.map(x=>x.status),[200,200],`simultaneous control packet ${seq}`);
}
r=await call(route('sync'),{});assert.equal(r.data.state.inputs.rose.throttle,true);assert.equal(r.data.state.inputs.cream.throttle,true);assert.equal(r.data.state.seq.rose,40);assert.equal(r.data.state.seq.cream,40);
r=await call(route('play'),{action:'pause'},B);const elapsed=r.data.state.elapsed;clock+=200;r=await call(route('play'),{action:'input',seq:41,input:{throttle:true}});assert.equal(r.data.state.elapsed,elapsed);r=await call(route('play'),{action:'pause'});
// Fixture at finish line verifies authoritative awards and no duplicate score.
const final=structuredClone(r.data.state);final.pausedBy=null;final.heartbeats={rose:clock,cream:clock};final.inputs={rose:{throttle:true},cream:{throttle:true}};final.cars.forEach((c,i)=>Object.assign(c,{distance:GP_TRACKS[1].length*3-.05-i*.02,speed:20,heading:0,lane:i?2:-2}));sqlite.prepare('UPDATE rooms SET state=? WHERE id=?').run(JSON.stringify(final),id);clock+=100;r=await call(route('play'),{action:'input',seq:42,input:{throttle:true}});assert.equal(r.data.state.phase,'finished');assert.equal(r.data.score.rose+r.data.score.cream,1);r=await call(route('play'),{action:'input',seq:43,input:{}});assert.equal(r.data.score.rose+r.data.score.cream,1);
r=await call(route('play'),{action:'garage'});assert.equal(r.data.state.phase,'finished');r=await call(route('play'),{action:'garage',accept:true},B);assert.equal(r.data.state.phase,'garage');
r=await call(route('play'),{action:'config',track:2,bots:3});r=await call(route('play'),{action:'config',accept:true},B);assert.equal(r.data.state.config.bots,3);
await call(route('play'),{action:'ready'});r=await call(route('play'),{action:'ready'},B);assert.equal(r.data.state.cars.length,5);
r=await call(route('switch'),{game:'checkers'});assert.equal(r.data.state.game,'grandprix');r=await call(route('switch'),{accept:true},B);assert.equal(r.data.state.game,'checkers');
console.log('Two-client room API: 1v1, host/guest bots, vehicle ownership, consent, start synchronization, input validation, concurrent writes, disconnect/rejoin, pause, finish scoring, rematch and game switching passed.');
}finally{Date.now=realNow;sqlite.close()}
