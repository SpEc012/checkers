import assert from 'node:assert/strict';
import {initial,moves,apply} from '../public/engine.mjs';
let s=initial();assert.equal(s.board.filter(Boolean).length,24);assert.equal(moves(s).length,7);assert.equal(apply(s,40,24),null);let m=moves(s)[0];let n=apply(s,m.from,m.to);assert.equal(n.turn,'cream');assert.equal(s.ply,0);
function empty(){let s=initial();s.board.fill(null);return s}
s=empty();s.board[42]={side:'rose',king:false};s.board[35]={side:'cream',king:false};s.board[21]={side:'cream',king:false};s.board[1]={side:'cream',king:false};assert.deepEqual(moves(s),[{from:42,to:28,capture:35}]);n=apply(s,42,28);assert.equal(n.forced,28);assert.equal(n.turn,'rose');n=apply(n,28,14);assert.equal(n.forced,null);assert.equal(n.turn,'cream');
s=empty();s.board[17]={side:'rose',king:false};s.board[10]={side:'cream',king:false};s.board[12]={side:'cream',king:false};n=apply(s,17,3);assert.equal(n.board[3].king,true);assert.equal(n.turn,'cream');assert.equal(n.forced,null);
s=empty();s.board[26]={side:'rose',king:true};s.board[63]={side:'cream',king:true};assert.equal(moves(s).length,4);
s=empty();s.board[42]={side:'rose',king:false};s.board[35]={side:'cream',king:false};n=apply(s,42,28);assert.equal(n.winner,'rose');
for(let g=0;g<50;g++){s=initial();for(let i=0;i<1000&&!s.winner;i++){let ms=moves(s);assert.ok(ms.length);let m=ms[Math.floor(Math.random()*ms.length)],before=s.board.filter(Boolean).length;n=apply(s,m.from,m.to);assert.ok(n);assert.equal(n.board.filter(Boolean).length,before-(m.capture!==undefined?1:0));s=n;}}
console.log('Rules tests and 50 simulated games passed.');
