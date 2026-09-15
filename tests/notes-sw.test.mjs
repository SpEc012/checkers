import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('public/notes-sw.js','utf8');
async function simulate(fetcher) {
 const listeners={},notifications=[];
 const context={AbortController,URL,clearTimeout,setTimeout:(fn)=>setTimeout(fn,1),fetch:fetcher,self:{addEventListener:(name,fn)=>listeners[name]=fn,registration:{showNotification:async(title,options)=>notifications.push({title,...options})},navigator:{setAppBadge:async()=>{throw new Error('badge unavailable');}},location:{origin:'https://notes.test'}}};
 vm.runInNewContext(source,context);
 let work;listeners.push({data:{json:()=>({account:'recipient',body:'Private sender preview',id:'test',unread:1})},waitUntil:p=>work=p});await work;
 return notifications;
}
const offline=await simulate((url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('offline')))));
assert.equal(offline.length,1);assert.equal(offline[0].body,'A love note is waiting for you ♡','network stalls cannot suppress a notification or expose a preview');
const online=await simulate(async()=>new Response(JSON.stringify({user:{id:'recipient'},unread:1})));
assert.equal(online[0].body,'Private sender preview');
const changed=await simulate(async()=>new Response(JSON.stringify({user:{id:'someone-else'},unread:1})));
assert.equal(changed.length,1);assert.ok(!changed[0].body.includes('Private'));
console.log('Notification worker passed: bounded network wait, visible offline fallback, account privacy and optional badge failures.');
