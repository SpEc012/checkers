import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {api} from '../server/api.mjs';
import {moves} from '../public/engine.mjs';
import {newGame,dropHeart,placeTile} from '../public/arcade.mjs';
const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync('drizzle/0000_famous_selene.sql','utf8'));
const DB = {
 prepare(sql) {
  return {
   bind(...args) {
    const st = sqlite.prepare(sql);
    return {
     async first() { return st.get(...args) || null; },
     async all() { return {results:st.all(...args)}; },
     async run() { return {meta:st.run(...args)}; }
    };
   }
  };
 }
};
const A='a'.repeat(64),B='b'.repeat(64),C='c'.repeat(64);
async function call(path,body,token=A){const response=await api(new Request('https://game.test'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Player-Token':token,'Origin':'https://game.test'},body:body===undefined?undefined:JSON.stringify(body)}),{DB});return {status:response.status,data:await response.json()}}
let r=await call('/api/rooms',{name:'A date',playerName:'Dylan',pin:'tulips',side:'rose'});assert.equal(r.status,201);let id=r.data.id;const route=a=>`/api/rooms/${id}/${a}`;
assert.equal(r.data.side,'rose');assert.equal((await call('/api/rooms')).data.rooms[0].locked,true);
assert.equal((await call(route('move'),{from:40,to:33,revision:0})).status,409);
assert.equal((await call(route('join'),{playerName:'Audrey',pin:'wrong'},B)).status,403);
r=await call(route('join'),{playerName:'Audrey',pin:'tulips'},B);assert.equal(r.status,200);assert.equal(r.data.side,'cream');assert.equal(r.data.names.cream,'Audrey');
assert.equal((await call(route('join'),{pin:'tulips'},C)).status,409);
assert.equal((await call(route('sync'),{},C)).status,403);
assert.equal((await call(route('move'),{from:17,to:24,revision:r.data.revision},B)).status,403);
r=await call(route('sync'),{});let m=moves(r.data.state)[0];const stale=r.data.revision;r=await call(route('move'),{...m,revision:stale});assert.equal(r.status,200);assert.equal(r.data.state.turn,'cream');
let creamMove=moves(r.data.state)[0];assert.equal((await call(route('move'),{...creamMove,revision:r.data.revision})).status,403);
assert.equal((await call(route('move'),{...creamMove,revision:stale},B)).status,409);
r=await call(route('move'),{...creamMove,revision:r.data.revision},B);assert.equal(r.status,200);assert.equal(r.data.state.ply,2);
r=await call(route('chat'),{text:'Love you <script>not HTML</script>'});assert.equal(r.status,200);assert.equal((await call(route('sync'),{},B)).data.messages[0].text,'Love you <script>not HTML</script>');
r=await call(route('rematch'),{});assert.equal(r.data.rematch,'rose');assert.equal((await call(route('rematch'),{accept:true})).status,400);r=await call(route('rematch'),{accept:true},B);assert.equal(r.data.state.ply,0);
assert.equal((await call(route('sync'),{})).data.side,'rose');
sqlite.prepare('UPDATE rooms SET guest_seen=? WHERE id=?').run(Date.now()-60000,id);r=await call(route('sync'),{});m=moves(r.data.state)[0];assert.equal((await call(route('move'),{...m,revision:r.data.revision})).status,409);
await call(route('leave'),{},B);assert.equal((await call('/api/rooms')).data.rooms.length,0);assert.equal((await call(route('sync'),{})).status,410);
r=await call('/api/rooms',{playerName:'Audrey',side:'cream'});id=r.data.id;assert.equal(r.data.side,'cream');r=await call(route('join'),{playerName:'Dylan'},B);assert.equal(r.data.side,'rose');m=moves(r.data.state)[0];r=await call(route('move'),{...m,revision:r.data.revision},B);assert.equal(r.status,200);
// Switch games within the same two-player room, keeping chat and seats.
r=await call(route('switch'),{game:'connect4'});assert.equal(r.data.state.switchRequest.game,'connect4');
assert.equal((await call(route('switch'),{accept:true})).status,400);
r=await call(route('switch'),{accept:true},B);assert.equal(r.data.state.game,'connect4');
assert.equal((await call(route('play'),{column:0,revision:r.data.revision})).status,400);
r=await call(route('play'),{column:0,revision:r.data.revision},B);assert.equal(r.status,200);assert.equal(r.data.state.board[35],'rose');
await call(route('switch'),{game:'draw'});r=await call(route('switch'),{accept:true},B);assert.equal(r.data.state.game,'draw');
// B owns rose and is artist, A owns cream and must never receive the secret.
const secret=r.data.state.word;assert.ok(secret);let hidden=await call(route('sync'),{});assert.equal(hidden.data.state.word,null);assert.ok(hidden.data.state.letters);
assert.equal((await call(route('play'),{action:'stroke',points:[[0,0]],color:'#000000',width:7,revision:hidden.data.revision})).status,400);
r=await call(route('play'),{action:'stroke',points:[[0,0],[1,1]],color:'#000000',width:7,revision:hidden.data.revision},B);assert.equal(r.status,200);
r=await call(route('play'),{action:'guess',text:secret,revision:r.data.revision});assert.equal(r.data.state.winner,'together');
r=await call(route('play'),{action:'next',revision:r.data.revision});assert.equal(r.data.state.turn,'cream');assert.ok(r.data.state.word);assert.equal((await call(route('sync'),{},B)).data.state.word,null);
await call(route('switch'),{game:'puzzle'});r=await call(route('switch'),{accept:true},B);
r=await call(route('play'),{piece:0,target:0,revision:r.data.revision});assert.equal(r.data.state.board[0],0);
r=await call(route('play'),{piece:1,target:1,revision:r.data.revision},B);assert.equal(r.data.state.board[1],1);
assert.equal((await call(route('photo-read'),{},C)).status,403);
let c4=newGame('connect4');for(const col of [0,1,0,1,0,1,0])c4=dropHeart(c4,col,c4.turn);assert.equal(c4.winner,'rose');assert.equal(dropHeart(c4,2,c4.turn),null);
let puzzle=newGame('puzzle');assert.equal(placeTile(puzzle,1,0),null);for(let i=0;i<16;i++)puzzle=placeTile(puzzle,i,i);assert.equal(puzzle.winner,'together');
console.log('Arcade checks passed: agreed switches, Connect Four win, secret prompt privacy, drawing ownership, guesses, alternating rounds and cooperative puzzle completion.');
await call(route('puzzle-config'),{config:{size:8,cut:'triangles',rotate:true,peek:false}});
assert.equal((await call(route('puzzle-config'),{accept:true})).status,400);
r=await call(route('puzzle-config'),{accept:true},B);assert.equal(r.data.state.board.length,128);assert.equal(r.data.state.config.peek,false);
for(const game of ['memory','rps']){await call(route('switch'),{game});r=await call(route('switch'),{accept:true},B);assert.equal(r.data.state.game,game);if(game==='memory'){assert.ok(r.data.state.deck.every(v=>v===null));assert.equal((await call(route('play'),{index:0,revision:r.data.revision})).status,400);r=await call(route('play'),{index:0,revision:r.data.revision},B);assert.equal(r.status,200);}if(game==='rps'){r=await call(route('play'),{choice:'paper',revision:r.data.revision},B);let opponent=await call(route('sync'),{});assert.equal(opponent.data.state.picks.rose,null);assert.equal(opponent.data.state.opponentPicked,true);r=await call(route('play'),{choice:'rock',revision:r.data.revision});assert.equal(r.data.state.roundResult,'rose');}}
console.log('Room API checks passed for new games and agreed puzzle configuration.');
sqlite.close();console.log('Two-player server checks passed: lobby, passwords, seat ownership, illegal turns, stale moves, chat, rematches, offline pause and room closure.');
