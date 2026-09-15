import webpush from 'web-push';
export const pushConfigured = env => !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
// Never let user-supplied subscription URLs turn this Worker into an open proxy.
export function validateSubscription(s) {
  let u;try{u=new URL(s?.endpoint);}catch{throw new Error('Invalid push subscription.');}
  if(u.protocol!=='https:' || u.port || u.username || u.password || !(['fcm.googleapis.com','updates.push.services.mozilla.com'].includes(u.hostname) || u.hostname.endsWith('.push.apple.com')) || u.href.length>2048) throw new Error('Unsupported push provider.');
  if(!/^[A-Za-z0-9_-]{87}$/.test(s.keys?.p256dh || '') || !/^[A-Za-z0-9_-]{22}$/.test(s.keys?.auth || '')) throw new Error('Invalid push keys.');
  return s;
}
export async function sendPush(env, subscription, payload) {
  const request=webpush.generateRequestDetails(subscription,JSON.stringify(payload),{TTL:3600,urgency:'high',vapidDetails:{subject:env.VAPID_SUBJECT,publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY}});
  // web-push targets Node and supplies Content-Length itself. Workerd derives it
  // from the fixed byte body; forwarding the Node header can make fetch throw
  // before Apple/Google receives the request.
  const headers=new Headers(request.headers);headers.delete('content-length');
  const body=request.body instanceof Uint8Array?new Uint8Array(request.body):request.body;
  const response=await fetch(request.endpoint,{method:request.method,headers,body,redirect:'error',signal:AbortSignal.timeout(10000)});
  let reason=null;
  if(!response.ok){try{const value=await response.json();if(typeof value.reason==='string'&&/^[A-Za-z0-9_]{1,80}$/.test(value.reason))reason=value.reason;}catch{}}
  return {status:response.status,reason};
}
export async function publishDueNotes(env, now=Date.now()) {
  const db=env.DB;
  // The trigger publishes a durable outbox row in the same SQLite transaction.
  await db.prepare(`UPDATE ln_note SET status='sent',sent_at=?,updated_at=?,revision=revision+1 WHERE status='scheduled' AND due_at<=? AND pair_id IN (SELECT id FROM ln_pair WHERE active=1)`).bind(now,now,now).run();
}
export async function dispatchNotes(env, now=Date.now(), targetId=null) {
  const db=env.DB;
  await publishDueNotes(env,now);
  if(!pushConfigured(env)) return;
  let outcome=null;
  const {results:jobs}=await db.prepare(`SELECT id FROM ln_outbox WHERE status IN ('pending','retry','sending') AND next_at<=? AND (? IS NULL OR id=?) ORDER BY next_at LIMIT 30`).bind(now,targetId,targetId).all();
  for(const job of jobs) {
    const lease=crypto.randomUUID();
    const claimed=await db.prepare(`UPDATE ln_outbox SET status='sending',lease=?,next_at=?,attempts=attempts+1 WHERE id=? AND status IN ('pending','retry','sending') AND next_at<=? RETURNING *`).bind(lease,now+120000,job.id,now).first();
    if(!claimed) continue;
    const current=await db.prepare(`SELECT o.*,p.endpoint,p.p256dh,p.auth,n.title,n.body,n.status AS note_status,n.pair_id,u.name,COALESCE(pr.previews,'sender') AS previews FROM ln_outbox o JOIN ln_push p ON p.id=o.subscription_id JOIN ln_session s ON s.id=p.session_id AND s.expires_at>? LEFT JOIN ln_note n ON n.id=o.note_id LEFT JOIN ln_user u ON u.id=n.sender_id LEFT JOIN ln_profile pr ON pr.user_id=o.user_id WHERE o.id=? AND o.lease=? AND o.status='sending'`).bind(now,job.id,lease).first();
    if(!current || (current.note_id && (current.note_status!=='sent' || !(await db.prepare('SELECT id FROM ln_pair WHERE id=? AND active=1').bind(current.pair_id).first())))) {
      await db.prepare("UPDATE ln_outbox SET status='cancelled' WHERE id=? AND lease=?").bind(job.id,lease).run();continue;
    }
    const count=await db.prepare(`SELECT count(*) AS n FROM ln_note n WHERE recipient_id=? AND status='sent' AND read_at IS NULL AND NOT EXISTS(SELECT 1 FROM ln_note_pref p WHERE p.note_id=n.id AND p.user_id=? AND hidden=1)`).bind(current.user_id,current.user_id).first();
    const body=!current.note_id?'This is your test notification. Your notes have a way home ♡':current.previews==='generic'?'A love note is waiting for you ♡':current.previews==='text'?`${current.name}: ${(current.body || current.title || 'A drawing for you').slice(0,100)}`:`A note from ${current.name} is waiting for you ♡`;
    let status,reason;
    try {({status,reason}=await sendPush(env,{endpoint:current.endpoint,keys:{p256dh:current.p256dh,auth:current.auth}},{account:current.user_id,id:current.id,title:'Two Lovebugs ♡',body,url:current.note_id?`/notes?note=${current.note_id}`:'/notes',unread:count.n}));} catch(error){status=0;reason=error?.name==='TimeoutError'?'PushServiceTimeout':error?.name==='TypeError'?'WorkerTransportError':'TransportOrConfigurationError';}
    if(status===404 || status===410) {outcome={status:'expired',providerStatus:status,reason};await db.prepare('DELETE FROM ln_push WHERE id=?').bind(current.subscription_id).run();continue;}
    const succeeded=status>=200 && status<300;
    const nextStatus=succeeded?'accepted':claimed.attempts>=8 || (status>=400 && status<500 && status!==429)?'failed':'retry';
    outcome={status:nextStatus,providerStatus:status,reason};
    await db.prepare('UPDATE ln_outbox SET status=?,next_at=?,last_http_status=?,last_error=? WHERE id=? AND lease=?').bind(nextStatus,now+Math.min(3600000,30000*2**claimed.attempts),status,reason,job.id,lease).run();
  }
  await db.prepare('DELETE FROM ln_push WHERE session_id NOT IN (SELECT id FROM ln_session WHERE expires_at>?)').bind(now).run();
  await db.prepare('DELETE FROM ln_throttle WHERE reset_at<?').bind(now-86400000).run();
  return outcome;
}
