import { initial, apply } from '../public/engine.mjs';
import {newGame,dropHeart,placeTile,drawingAction,publicGame,gameNames,puzzleOptions,puzzleAction,memoryAction,dotsAction,rpsAction} from '../public/arcade.mjs';
const LIVE=45000, EXPIRE=86400000;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),v=>v.toString(16).padStart(2,'0')).join('');
const opposite=s=>s==='rose'?'cream':'rose';
function clean(s,max){return typeof s==='string'?s.trim().slice(0,max):''}
function database(env){if(!env.DB)fail('Online rooms are temporarily unavailable. Please try again.',503);return env.DB}
function summary(r,token,now){let host=r.host===token,side=host?r.host_side:opposite(r.host_side);return {id:r.id,name:r.name,side,host,revision:r.revision,state:publicGame(JSON.parse(r.state),side),score:JSON.parse(r.score),messages:JSON.parse(r.messages),rematch:r.rematch,names:{[r.host_side]:r.host_name,[opposite(r.host_side)]:r.guest_name||'Your person'},opponentJoined:!!r.guest,opponentOnline:!!r.guest&&(host?r.guest_seen:r.host_seen)>now-LIVE,closed:!!r.closed}}
export async function api(request,env){try{
 const db=database(env),url=new URL(request.url),now=Date.now();
 if(request.method==='GET'&&url.pathname==='/api/rooms'){
  const {results}=await db.prepare('SELECT id,name,host_name,guest_name,guest,pin,host_seen,guest_seen,state FROM rooms WHERE closed=0 AND updated>? ORDER BY updated DESC LIMIT 50').bind(now-LIVE).all();
  return json({rooms:results.filter(r=>Math.max(r.host_seen,r.guest_seen)>now-LIVE).map(r=>({id:r.id,name:r.name,game:JSON.parse(r.state).game||'checkers',hostName:r.host_name,players:r.guest?2:1,locked:!!r.pin,joinable:!r.guest&&r.host_seen>now-LIVE}))});
 }
 if(request.method!=='POST')return json({error:'Not found'},404);
 const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)fail('This request is not allowed.',403);
 const raw=request.headers.get('X-Player-Token')||'';if(!/^[a-f0-9]{64}$/.test(raw))fail('Refresh to start a player session.',401);const token=await hash(raw);
 const photoUpload=url.pathname.endsWith('/photo')&&request.headers.get('Content-Type')==='image/jpeg';
 const text=photoUpload?'{}':await request.text();if(text.length>12000)fail('That message is too long.',413);let body;try{body=JSON.parse(text||'{}')}catch{fail('Invalid request.')}if(!body||Array.isArray(body)||typeof body!=='object')fail('Invalid request.');
 if(url.pathname==='/api/rooms'){
  const name=clean(body.name,48)||'A little checkers date',hostName=clean(body.playerName,24)||'Dylan',pin=clean(body.pin,40);if(pin&&pin.length<4)fail('Use a room password with at least 4 characters.');
  const count=await db.prepare('SELECT count(*) as total FROM rooms WHERE host=? AND closed=0 AND updated>?').bind(token,now-LIVE).first();if(count.total>=3)fail('You already have three active rooms. Leave one before creating another.',429);
  const id=crypto.randomUUID(),side=body.side==='cream'?'cream':'rose';
  await db.prepare('INSERT INTO rooms (id,name,host,guest,host_name,guest_name,host_side,pin,state,score,messages,revision,host_seen,guest_seen,updated,closed) VALUES (?,?,?,NULL,?,NULL,?,?,?,?,?,0,?,0,?,0)').bind(id,name,token,hostName,side,pin?await hash(id+pin):null,JSON.stringify(newGame(Object.hasOwn(gameNames,body.game)?body.game:'checkers')),JSON.stringify({rose:0,cream:0}),'[]',now,now).run();
  const r=await db.prepare('SELECT * FROM rooms WHERE id=?').bind(id).first();return json(summary(r,token,now),201);
 }
 const match=url.pathname.match(/^\/api\/rooms\/([a-f0-9-]{36})\/(join|sync|move|chat|rematch|leave|play|switch|photo|photo-read|puzzle-config)$/);if(!match)fail('Room not found.',404);const [,id,action]=match;
 let r=await db.prepare('SELECT * FROM rooms WHERE id=?').bind(id).first();if(!r||r.updated<now-EXPIRE)fail('This room expired. Create a new date.',404);if(r.closed)fail('This room has ended. Join or create another.',410);
 let isHost=r.host===token,isGuest=r.guest===token;
 if(action==='join'&&!isHost&&!isGuest){if(r.guest)fail('This room already has two players.',409);if(r.host_seen<now-LIVE)fail('The host is offline. Try another room.',409);if(r.pin&&await hash(id+clean(body.pin,40))!==r.pin)fail('That room password is incorrect.',403);
  const res=await db.prepare('UPDATE rooms SET guest=?,guest_name=?,guest_seen=?,updated=?,revision=revision+1 WHERE id=? AND guest IS NULL AND closed=0').bind(token,clean(body.playerName,24)||'Audrey',now,now,id).run();if(!res.meta.changes)fail('Someone just took that seat.',409);r=await db.prepare('SELECT * FROM rooms WHERE id=?').bind(id).first();isGuest=true;
 }
 if(!isHost&&!isGuest)fail('You do not have a seat in this room.',403);
 const side=isHost?r.host_side:opposite(r.host_side);
 if(action==='photo-read'){
  const st=JSON.parse(r.state);if(!st.photoKey||!env.BUCKET)fail('Photo not found.',404);const object=await env.BUCKET.get(st.photoKey);if(!object)fail('Photo not found.',404);return new Response(object.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(action==='photo'){
  const st=JSON.parse(r.state);if(st.game!=='puzzle')fail('Open Photo Puzzle first.');if(!env.BUCKET)fail('Photo uploads are temporarily unavailable.',503);if(!photoUpload)fail('Please upload a JPEG photo.');
  const data=await request.arrayBuffer();const bytes=new Uint8Array(data);if(bytes.length>400000||bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)fail('Choose a photo under 400 KB after resizing.');
  const key='puzzles/'+id+'/'+crypto.randomUUID()+'.jpg';await env.BUCKET.put(key,data,{httpMetadata:{contentType:'image/jpeg'}});
  const fresh=newGame('puzzle',{config:st.config,photoKey:key});const saved=await db.prepare('UPDATE rooms SET state=?,revision=revision+1,updated=? WHERE id=? AND revision=? AND closed=0').bind(JSON.stringify(fresh),now,id,r.revision).run();if(!saved.meta.changes){await env.BUCKET.delete(key);fail('Your room changed. Upload again.',409)}if(st.photoKey)await env.BUCKET.delete(st.photoKey);r=await db.prepare('SELECT * FROM rooms WHERE id=?').bind(id).first();return json(summary(r,token,now));
 }

 if(action==='sync'||action==='join'){
  await db.prepare(isHost?'UPDATE rooms SET host_seen=?,updated=? WHERE id=? AND closed=0':'UPDATE rooms SET guest_seen=?,updated=? WHERE id=? AND closed=0').bind(now,now,id).run();r[isHost?'host_seen':'guest_seen']=now;return json(summary(r,token,now));
 }
 if(action==='leave'){await db.prepare('UPDATE rooms SET closed=1,revision=revision+1 WHERE id=?').bind(id).run();const old=JSON.parse(r.state).photoKey;if(old&&env.BUCKET)await env.BUCKET.delete(old);return json({left:true})}
 let state=JSON.parse(r.state),score=JSON.parse(r.score),messages=JSON.parse(r.messages),rematch=r.rematch;
 const oldPhoto=state.photoKey;
 if(action==='move'){
  if(state.game&&state.game!=='checkers')fail('This room is playing another game.',409);
  if(!r.guest||(isHost?r.guest_seen:r.host_seen)<now-LIVE)fail('Wait for your person to reconnect.',409);
  if(body.revision!==r.revision)fail('The board changed. Try your move again.',409);
  if(state.turn!==side||state.board[body.from]?.side!==side)fail('You can only move your own pieces on your turn.',403);
  if(!Number.isInteger(body.from)||!Number.isInteger(body.to))fail('Invalid square.');
  const n=apply(state,body.from,body.to);if(!n)fail('That move is not allowed.');state=n;if(n.winner&&n.winner!=='draw')score[n.winner]++;rematch=null;
 }else if(action==='switch'){
  if(body.accept===false)delete state.switchRequest;
  else if(body.accept===true){if(!state.switchRequest||state.switchRequest.side===side)fail('No game invitation from your person.');state=newGame(state.switchRequest.game);rematch=null;}
  else {if(!Object.hasOwn(gameNames,body.game))fail('Choose an available game.');if(!r.guest){state=newGame(body.game);rematch=null;}else state.switchRequest={side,game:body.game};}
 }else if(action==='puzzle-config'){
  if(state.game!=='puzzle')fail('Open Photo Puzzle first.');
  if(body.accept===false)delete state.puzzleRequest;
  else if(body.accept===true){if(!state.puzzleRequest||state.puzzleRequest.side===side)fail('No puzzle request from your person.');state=newGame('puzzle',{config:state.puzzleRequest.config,photoKey:state.photoKey});}
  else {const config=puzzleOptions(body.config);if(!r.guest)state=newGame('puzzle',{config,photoKey:state.photoKey});else state.puzzleRequest={side,config};}
 }else if(action==='play'){
  if(!r.guest||(isHost?r.guest_seen:r.host_seen)<now-LIVE)fail('Wait for your person to reconnect.',409);
  if(body.revision!==r.revision)fail('Your game changed. Try again.',409);
  let next=null;try{if(state.game==='connect4')next=dropHeart(state,body.column,side);else if(state.game==='puzzle')next=puzzleAction(state,body);else if(state.game==='memory')next=memoryAction(state,body.index,side,now);else if(state.game==='dots')next=dotsAction(state,body.edge,side);else if(state.game==='rps')next=rpsAction(state,body,side);else if(state.game==='draw')next=drawingAction(state,body.action,body,side);}catch(e){fail(e.message)}
  if(!next)fail('That move is not allowed.');if(!state.winner&&next.winner){if(['rose','cream'].includes(next.winner))score[next.winner]++;else if(next.winner==='together'){score.rose++;score.cream++;}}state=next;
 }else if(action==='chat'){
  const value=clean(body.text,400);if(!value)fail('Write a message first.');if(messages.some(m=>m.side===side&&m.at>now-400))fail('One little moment between messages ♡',429);
  messages.push({id:crypto.randomUUID(),side,text:value,emoji:!!body.emoji&&['💗','😘','🫂','🌷','😏','🥺'].includes(value),at:now});messages=messages.slice(-100);
 }else if(action==='rematch'){
  if(!r.guest)fail('Wait for the other player to join.');
  if(body.accept===false)rematch=null;
  else if(body.accept===true){if(!rematch||rematch===side)fail('There is no request from your opponent.');state=newGame(state.game||'checkers',{config:state.config,photoKey:state.photoKey});rematch=null;}
  else rematch=side;
 }
 const result=await db.prepare('UPDATE rooms SET state=?,score=?,messages=?,rematch=?,revision=revision+1,updated=? WHERE id=? AND revision=? AND closed=0').bind(JSON.stringify(state),JSON.stringify(score),JSON.stringify(messages),rematch,now,id,r.revision).run();if(!result.meta.changes)fail('Your room just changed. Try again.',409);
 if(oldPhoto&&oldPhoto!==state.photoKey&&env.BUCKET)await env.BUCKET.delete(oldPhoto);
 r=await db.prepare('SELECT * FROM rooms WHERE id=?').bind(id).first();return json(summary(r,token,now));
 }catch(e){if(!e.status)console.error('Room API failure',e.message);return json({error:e.status?e.message:'Online rooms are temporarily unavailable. Please try again.'},e.status||503)}}
