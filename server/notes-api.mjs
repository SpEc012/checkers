import { createNotesAuth, notesConfigured } from './notes-auth.mjs';
import { validateDocument, hasContent } from '../public/note-document.mjs';
import { dispatchNotes, publishDueNotes, pushConfigured, validateSubscription } from './notes-push.mjs';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const id=()=>crypto.randomUUID();
const text=(s,max)=>typeof s==='string'?s.trim().slice(0,max):'';
const first=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const run=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
async function throttle(db,key,max,window=60000) {
  const now=Date.now();
  const r=await first(db,`INSERT INTO ln_throttle(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END,reset_at=CASE WHEN reset_at<=? THEN ? ELSE reset_at END RETURNING count`,key,now+window,now,now,now+window);
  if(r.count>max) fail('A moment between requests, please.',429);
}
async function bodyOf(req) {
  if(!req.headers.get('content-type')?.startsWith('application/json')) fail('Use JSON.',415);
  const reader=req.body?.getReader();let size=0,chunks=[];
  if(!reader)return {};
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>400000){await reader.cancel();fail('This note is too large.',413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{fail('Invalid request.');}
}
async function membership(db,uid) {return first(db,`SELECT p.id AS pair_id,u.id AS partner_id,u.name AS partner_name,COALESCE(pr.timezone,'UTC') AS partner_timezone FROM ln_member me JOIN ln_pair p ON p.id=me.pair_id AND p.active=1 JOIN ln_member partner ON partner.pair_id=me.pair_id AND partner.user_id!=me.user_id JOIN ln_user u ON u.id=partner.user_id LEFT JOIN ln_profile pr ON pr.user_id=u.id WHERE me.user_id=?`,uid);}
export async function notesApi(req,env,ctx={waitUntil:p=>p.catch(()=>{})}) {
 try {
  const url=new URL(req.url),path=url.pathname,db=env.DB;
  if(req.method!=='GET' && req.method!=='POST') return json({error:'Method not allowed.'},405);
  if(req.method==='POST' && req.headers.get('origin')!==url.origin) fail('Open this request from Two Lovebugs.',403);
  if(path==='/api/notes/config') return json({ready:notesConfigured(env),pushReady:pushConfigured(env),publicKey:pushConfigured(env)?env.VAPID_PUBLIC_KEY:null});
  if(env.NOTES_ORIGIN && url.origin!==env.NOTES_ORIGIN) fail('Please use the configured Love Notes address.',403);
  const auth=createNotesAuth(env);
  if(path.startsWith('/api/auth/')) {
    const allowed=['/api/auth/email-otp/send-verification-otp','/api/auth/sign-in/email-otp','/api/auth/get-session','/api/auth/sign-out'];
    if(!allowed.includes(path)) fail('Not found.',404);
    if(req.method==='POST') {
      const b=await bodyOf(req);
      if(path.endsWith('/send-verification-otp') && b.type!=='sign-in') fail('Use a sign-in code.');
      if(path.endsWith('/sign-in/email-otp')) {b.name=text(b.name,40)||'Lovebug';delete b.image;}
      if(path.endsWith('/sign-out')) {const s=await auth.api.getSession({headers:req.headers});if(s)await run(db,'DELETE FROM ln_push WHERE session_id=?',s.session.id);}
      req=new Request(req.url,{method:req.method,headers:req.headers,body:JSON.stringify(b)});
    }
    return await auth.handler(req);
  }
  const logged=await auth.api.getSession({headers:req.headers});if(!logged)fail('Sign in to open your notes.',401);
  const uid=logged.user.id, now=Date.now();
  if(req.method==='POST') await throttle(db,uid,90);
  const b=req.method==='POST'?await bodyOf(req):{};
  const pair=await membership(db,uid);
  if(path==='/api/notes/me') {
    if(req.method==='POST') {
      const name=text(b.name,40);if(!name)fail('Add your name.');
      try{new Intl.DateTimeFormat('en',{timeZone:b.timezone}).format();}catch{fail('Choose a valid time zone.');}
      if(!['generic','sender','text'].includes(b.previews))fail('Invalid notification preference.');
      await db.batch([db.prepare('UPDATE ln_user SET name=?,updated_at=? WHERE id=?').bind(name,now,uid),db.prepare(`INSERT INTO ln_profile(user_id,timezone,receipts,previews) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET timezone=excluded.timezone,receipts=excluded.receipts,previews=excluded.previews`).bind(uid,b.timezone,b.receipts?1:0,b.previews)]);
    }
    const profile=await first(db,'SELECT * FROM ln_profile WHERE user_id=?',uid);
    const current=await first(db,'SELECT id,name,email FROM ln_user WHERE id=?',uid);
    const unread=await first(db,`SELECT count(*) AS count FROM ln_note n WHERE recipient_id=? AND status='sent' AND read_at IS NULL AND NOT EXISTS(SELECT 1 FROM ln_note_pref p WHERE p.note_id=n.id AND p.user_id=? AND hidden=1)`,uid,uid);
    return json({user:current,profile:profile||{timezone:'UTC',receipts:0,previews:'sender'},pair,unread:unread.count});
  }
  if(path==='/api/notes/invites' && req.method==='POST') {
    if(pair)fail('You are already connected.');await throttle(db,uid+':invite',5,3600000);
    if(b.revoke){await run(db,'UPDATE ln_invite SET revoked=1 WHERE owner_id=? AND used_by IS NULL',uid);return json({ok:true});}
    const token=id()+id(),key=id();
    await db.batch([db.prepare('UPDATE ln_invite SET revoked=1 WHERE owner_id=? AND used_by IS NULL').bind(uid),db.prepare('INSERT INTO ln_invite(id,token_hash,owner_id,expires_at) VALUES(?,?,?,?)').bind(key,await digest(token),uid,now+86400000)]);
    return json({url:`${url.origin}/notes#invite=${token}`,expiresAt:now+86400000});
  }
  if(path==='/api/notes/invite' && req.method==='POST') {
    await throttle(db,uid+':accept',20);
    const invite=await first(db,`SELECT i.*,u.name FROM ln_invite i JOIN ln_user u ON u.id=i.owner_id WHERE token_hash=? AND revoked=0 AND used_by IS NULL AND expires_at>?`,await digest(text(b.token,100)),now);
    if(!invite || invite.owner_id===uid)fail('This invitation is unavailable. Ask your person for a new one.',404);
    if(!b.accept)return json({name:invite.name});
    if(pair)fail('Disconnect your current partnership first.');
    // Uniqueness on each member and conditional invitation claim make acceptance atomic.
    const pairId=id();
    try{await db.batch([
      db.prepare('INSERT INTO ln_pair(id,created_at) SELECT ?,? FROM ln_invite WHERE id=? AND used_by IS NULL AND revoked=0 AND expires_at>?').bind(pairId,now,invite.id,now),
      db.prepare('INSERT INTO ln_member(user_id,pair_id) VALUES(?,?),(?,?)').bind(invite.owner_id,pairId,uid,pairId),
      db.prepare(`UPDATE ln_invite SET used_by=? WHERE id=? AND used_by IS NULL AND revoked=0 AND expires_at>?`).bind(uid,invite.id,now),
    ]);}catch{fail('This invitation was already accepted, or one of you is already connected.',409);}
    return json({pair:await membership(db,uid)});
  }
  if(path==='/api/notes/disconnect' && req.method==='POST') {
    if(!pair)return json({ok:true});
    await db.batch([
      db.prepare('UPDATE ln_pair SET active=0 WHERE id=?').bind(pair.pair_id),
      db.prepare("UPDATE ln_note SET status='cancelled',revision=revision+1 WHERE pair_id=? AND status='scheduled'").bind(pair.pair_id),
      db.prepare("UPDATE ln_outbox SET status='cancelled' WHERE note_id IN(SELECT id FROM ln_note WHERE pair_id=?) AND status!='accepted'").bind(pair.pair_id),
      db.prepare('DELETE FROM ln_member WHERE pair_id=?').bind(pair.pair_id),
      db.prepare('UPDATE ln_invite SET revoked=1 WHERE owner_id IN (?,?)').bind(uid,pair.partner_id),
    ]);return json({ok:true});
  }
  if(path==='/api/notes/sessions') {
    if(req.method==='POST') {
      if(b.id===logged.session.id)fail('Use Sign out for this device.');
      await db.batch([db.prepare('DELETE FROM ln_push WHERE user_id=? AND session_id=?').bind(uid,b.id),db.prepare('DELETE FROM ln_session WHERE user_id=? AND id=?').bind(uid,b.id)]);
    }
    return json({sessions:(await db.prepare('SELECT id,user_agent AS label,expires_at FROM ln_session WHERE user_id=? AND expires_at>?').bind(uid,now).all()).results.map(s=>({...s,current:s.id===logged.session.id}))});
  }
  if(path==='/api/notes/push' && req.method==='POST') {
    if(b.remove){await run(db,'DELETE FROM ln_push WHERE user_id=? AND session_id=?',uid,logged.session.id);return json({ok:true});}
    if(!pushConfigured(env))fail('Phone notifications are waiting for server setup.',503);
    const subscription=validateSubscription(b.subscription);
    const existing=await first(db,'SELECT user_id FROM ln_push WHERE endpoint=?',subscription.endpoint);
    if(existing && existing.user_id!==uid)fail('Reset notifications on this device before connecting this account.',409);
    await run(db,`INSERT INTO ln_push(id,user_id,session_id,endpoint,p256dh,auth,label,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET session_id=excluded.session_id,p256dh=excluded.p256dh,auth=excluded.auth`,id(),uid,logged.session.id,subscription.endpoint,subscription.keys.p256dh,subscription.keys.auth,text(b.label,80)||'This device',now);
    return json({ok:true});
  }
  if(path==='/api/notes/push-test' && req.method==='POST') {
    if(!pushConfigured(env))fail('Phone notifications need server setup.',503);await throttle(db,uid+':test',3,60000);
    const sub=await first(db,'SELECT id FROM ln_push WHERE user_id=? AND session_id=?',uid,logged.session.id);if(!sub)fail('Enable notifications first.');
    await run(db,'INSERT INTO ln_outbox(id,user_id,subscription_id,next_at) VALUES(?,?,?,?)',id(),uid,sub.id,now);ctx.waitUntil(dispatchNotes(env));return json({ok:true});
  }
  if(path==='/api/notes' && req.method==='GET') {
    const view=url.searchParams.get('view')||'inbox';const q='%'+text(url.searchParams.get('q'),100)+'%';const offset=Math.max(0,Math.min(100000,Number.parseInt(url.searchParams.get('offset')||'0',10)||0));
    const access=`((n.sender_id=? AND n.status IN('draft','scheduled','cancelled','sent')) OR (n.recipient_id=? AND n.status='sent'))`;
    const filter={inbox:"n.recipient_id=? AND n.status='sent'",sent:"n.sender_id=? AND n.status='sent'",scheduled:"n.sender_id=? AND n.status IN('scheduled','cancelled')",drafts:"n.sender_id=? AND n.status='draft'",saved:'p.user_id=? AND p.saved=1'}[view];if(!filter)fail('Unknown view.');
    const rows=await db.prepare(`SELECT n.id,n.sender_id,n.recipient_id,n.title,n.body,n.status,n.due_at,n.sent_at,n.created_at,n.updated_at,CASE WHEN n.recipient_id=? OR COALESCE(rp.receipts,0)=1 THEN n.read_at ELSE NULL END AS read_at,n.revision,n.timezone,json_extract(n.document,'$.paper') AS paper,json_extract(n.document,'$.mode') AS mode,u.name AS sender_name,COALESCE(p.saved,0) AS saved FROM ln_note n JOIN ln_user u ON u.id=n.sender_id LEFT JOIN ln_note_pref p ON p.note_id=n.id AND p.user_id=? LEFT JOIN ln_profile rp ON rp.user_id=n.recipient_id WHERE ${access} AND (${filter}) AND COALESCE(p.hidden,0)=0 AND (n.title LIKE ? OR n.body LIKE ?) ORDER BY n.updated_at DESC,n.id DESC LIMIT 101 OFFSET ?`).bind(uid,uid,uid,uid,uid,q,q,offset).all();
    return json({notes:rows.results.slice(0,100),nextOffset:rows.results.length>100?offset+100:null});
  }
  const match=path.match(/^\/api\/notes\/([a-f0-9-]{36})$/);
  if(!match)fail('Not found.',404);const noteId=match[1];
  const existing=await first(db,'SELECT * FROM ln_note WHERE id=?',noteId);
  if(req.method==='GET' || ['read','save','react','hide','delete','cancel','send-now'].includes(b.action)) {
    if(!existing || !(existing.sender_id===uid || (existing.recipient_id===uid && existing.status==='sent')))fail('This note is unavailable.',404);
    if(req.method==='GET') {
      const prefs=await first(db,'SELECT * FROM ln_note_pref WHERE note_id=? AND user_id=?',noteId,uid);
      const sender=await first(db,'SELECT name FROM ln_user WHERE id=?',existing.sender_id);
      const receipt=await first(db,'SELECT receipts FROM ln_profile WHERE user_id=?',existing.recipient_id);
      return json({note:{...existing,document:JSON.parse(existing.document),sender_name:sender.name,read_at:uid===existing.recipient_id||receipt?.receipts?existing.read_at:null},preferences:prefs||{},reactions:(await db.prepare('SELECT p.reaction,u.name FROM ln_note_pref p JOIN ln_user u ON u.id=p.user_id WHERE note_id=? AND reaction IS NOT NULL').bind(noteId).all()).results});
    }
    if(b.action==='read'){if(existing.recipient_id===uid)await run(db,'UPDATE ln_note SET read_at=COALESCE(read_at,?) WHERE id=?',now,noteId);return json({ok:true});}
    if(['save','react','hide'].includes(b.action)) {
      const field={save:'saved',react:'reaction',hide:'hidden'}[b.action];
      const value=b.action==='react'?(['♥','🌷','🫂','💋'].includes(b.value)?b.value:null):b.value?1:0;
      await run(db,`INSERT INTO ln_note_pref(note_id,user_id,${field}) VALUES(?,?,?) ON CONFLICT(note_id,user_id) DO UPDATE SET ${field}=excluded.${field}`,noteId,uid,value);return json({ok:true});
    }
    if(existing.sender_id!==uid)fail('Only the sender can change an unsent note.',403);
    if(existing.status==='sent')fail('Sent notes cannot be changed. You can remove them from your own view.');
    if(b.revision!==existing.revision)fail('This note changed on another device. Reload it first.',409);
    if(b.action==='delete') {const changed=await first(db,"DELETE FROM ln_note WHERE id=? AND revision=? AND status!='sent' RETURNING id",noteId,b.revision);if(!changed)fail('This note has already changed.',409);return json({ok:true});}
    if(b.action==='cancel') {const changed=await first(db,"UPDATE ln_note SET status='cancelled',revision=revision+1 WHERE id=? AND revision=? AND status='scheduled' RETURNING id",noteId,b.revision);if(!changed)fail('This note has already changed.',409);return json({ok:true});}
    if(b.action==='send-now') {
      if(!hasContent(validateDocument(JSON.parse(existing.document))))fail('Write or draw something first.');
      if(!pair || pair.pair_id!==existing.pair_id)fail('Connect with your person first.');
      const changed=await first(db,"UPDATE ln_note SET status='scheduled',due_at=?,revision=revision+1 WHERE id=? AND revision=? AND status!='sent' AND EXISTS(SELECT 1 FROM ln_pair WHERE id=? AND active=1) RETURNING id",now,noteId,b.revision,pair.pair_id);if(!changed)fail('This note has already changed.',409);
      await publishDueNotes(env);ctx.waitUntil(dispatchNotes(env));return json({ok:true});
    }
  }
  if(req.method!=='POST')fail('Not found.',404);
  if(existing && existing.sender_id!==uid)fail('This note is unavailable.',404);
  if(existing?.status==='sent')fail('Sent notes cannot be edited.');
  const doc=validateDocument(b.document),status=b.action==='draft'?'draft':'scheduled';
  if(!['draft','send','schedule'].includes(b.action))fail('Choose how to send this note.');
  if(status!=='draft' && !hasContent(doc))fail('Write or draw something first.');
  if(status!=='draft' && !pair)fail('Connect with your person before sending.');
  let due=b.action==='schedule'?b.dueAt:now;
  if(b.action==='schedule' && (!Number.isFinite(due) || due<now+10000 || due>now+366*86400000))fail('Choose a time between now and one year away.');
  const zone=text(b.timezone,80)||'UTC';try{new Intl.DateTimeFormat('en',{timeZone:zone}).format();}catch{fail('Choose a valid time zone.');}
  const reply=b.replyId||existing?.reply_id||null;
  if(reply){const original=await first(db,"SELECT id FROM ln_note WHERE id=? AND status='sent' AND (sender_id=? OR recipient_id=?) AND pair_id=?",reply,uid,uid,pair?.pair_id||null);if(!original)fail('Original note unavailable.');}
  if(!existing)await throttle(db,uid+':new-note',100,86400000);
  const document=JSON.stringify(doc);
  if(existing) {
    const updated=await first(db,`UPDATE ln_note SET document=?,title=?,body=?,status=?,due_at=?,timezone=?,updated_at=?,recipient_id=?,pair_id=?,revision=revision+1 WHERE id=? AND sender_id=? AND status!='sent' AND revision=? AND (?='draft' OR EXISTS(SELECT 1 FROM ln_pair WHERE id=? AND active=1)) RETURNING id`,document,doc.title,doc.text,status,status==='draft'?null:due,zone,now,pair?.partner_id||null,pair?.pair_id||null,noteId,uid,b.revision,status,pair?.pair_id||null);if(!updated)fail('This note changed on another device. Reload it first.',409);
  } else {
    await run(db,`INSERT INTO ln_note(id,sender_id,recipient_id,pair_id,reply_id,document,title,body,status,due_at,timezone,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ?='draft' OR EXISTS(SELECT 1 FROM ln_pair WHERE id=? AND active=1)`,noteId,uid,pair?.partner_id||null,pair?.pair_id||null,reply,document,doc.title,doc.text,status,status==='draft'?null:due,zone,now,now,status,pair?.pair_id||null);
  }
  if(b.action==='send') {await publishDueNotes(env);ctx.waitUntil(dispatchNotes(env));}
  const result=await first(db,'SELECT id,status,revision,due_at FROM ln_note WHERE id=?',noteId);if(!result)fail('Your partnership changed. Try again.',409);
  return json({note:result});
 } catch(error) {return json({error:error.status?error.message:error.message?.startsWith('Invalid')||error.message?.startsWith('This drawing')?error.message:'We could not complete that request. Please try again.'},error.status||400);}
}
