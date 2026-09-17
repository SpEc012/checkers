import {GP_TRACKS} from './grand-prix-tracks.mjs';
export {GP_TRACKS};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
export const GP_ITEMS={nectar:{name:'Nectar rush',icon:'⚡'},bubble:{name:'Love bubble',icon:'♡'},acorn:{name:'Acorn shot',icon:'●'},pollen:{name:'Pollen slick',icon:'✿'}};
export const GP_LAPS=3;
export const GP_BOXES=[.09,.24,.39,.56,.72,.89];
export function gpCurvature(track,distance){const t=GP_TRACKS[track],u=((distance/t.length%1)+1)%1*1024,n=Math.floor(u);return lerp(t.curvature[n],t.curvature[(n+1)%1024],u-n)}
export function gpNew(options={}){return {game:'grandprix',board:[],turn:'rose',forced:null,ply:0,history:[],winner:null,phase:'garage',config:{track:clamp(Math.floor(Number(options.config?.track)||0),0,2),bots:clamp(Math.floor(Number(options.config?.bots??2)),0,3)},profiles:options.profiles||{rose:{color:'#ee547c',body:'bug'},cream:{color:'#e9b84b',body:'bug'}},ready:{rose:false,cream:false},cars:[],lastAt:0,startAt:0,elapsed:0,round:0,inputs:{},heartbeats:{},boxes:{},hazards:[],events:[],eventId:0,rng:19,seq:{rose:0,cream:0}}}
function event(s,text,target=null){s.events.push({id:++s.eventId,text,target});s.events=s.events.slice(-8)}
function car(id,i,profile){return{id,bot:id.startsWith('bot'),color:profile.color,body:profile.body,distance:-i*3.2,lane:i%2?1.7:-1.7,speed:0,steer:0,heading:0,lateralSpeed:0,roll:0,pitch:0,energy:1,boost:0,padLock:0,finish:null,lap:0,item:null,shield:0,stun:0,recovery:0,invulnerable:0,pickupLock:0,bump:0,knock:0,used:false}}
export function gpDrive(r,input,curvature,dt){
 const command=Number(input.right||0)-Number(input.left||0);r.steer=lerp(r.steer,command,1-Math.exp(-dt*(command?7:9)));
 const prev=r.speed,edge=Math.abs(r.lane)>3.8,powered=input.throttle&&!input.brake&&r.stun<=0,boosting=powered&&input.boost&&r.energy>.02;
 if(boosting){r.energy=Math.max(0,r.energy-dt*.32);r.boost=Math.max(r.boost,.1)}else r.energy=Math.min(1,r.energy+dt*.085);
 const boosted=powered&&(boosting||r.boost>0),drag=.6+r.speed*.018+r.speed*r.speed*.018,acceleration=input.brake?-22:powered?(boosted?14:9):0;
 r.speed=clamp(r.speed+(acceleration-drag-(edge?r.speed*.7:0))*dt,0,boosted?30:28);if(r.speed<.06&&!powered)r.speed=0;
 const angle=r.steer*(.46/(1+r.speed*.025)),progress=r.speed*Math.max(.25,Math.cos(r.heading))*dt;
 r.heading=clamp(r.heading+r.speed/2.5*Math.tan(angle)*dt-curvature*progress,-1.15,1.15);
 r.lateralSpeed=lerp(r.lateralSpeed,Math.sin(r.heading)*r.speed,1-Math.exp(-dt*(r.stun>0?2:9)));
 r.lane+=(r.lateralSpeed+r.knock)*dt;r.knock*=Math.exp(-dt*2.2);
 if(Math.abs(r.lane)>5.3){r.recovery=1.6;r.speed=0;r.distance=Math.max(0,r.distance-9);r.item=null;return}
 // The curbs are soft, but item impacts can push a kart all the way off.
 if(Math.abs(r.lane)>4.15&&Math.abs(r.knock)<1){r.lane=Math.sign(r.lane)*4.15;r.speed*=Math.exp(-dt*2);r.heading=lerp(r.heading,0,1-Math.exp(-dt*6))}
 r.distance+=progress;r.roll=lerp(r.roll,-r.steer*Math.min(.12,r.speed*.007),1-Math.exp(-dt*8));r.pitch=lerp(r.pitch,clamp((r.speed-prev)/dt*.005,-.09,.045),1-Math.exp(-dt*7));
}
function random(s){s.rng=(s.rng*1664525+1013904223)>>>0;return s.rng/4294967296}
function gap(a,b,length){return ((a-b+length*1.5)%length)-length*.5}
function hit(s,victim,owner,force=13){if(victim.finish||victim.recovery>0||victim.invulnerable>0)return;if(victim.shield>0){victim.shield=0;victim.invulnerable=.8;event(s,'Bubble blocked a hit!',victim.id);return}victim.stun=.7;victim.knock=(victim.lane>=0?1:-1)*force;victim.speed*=.5;victim.invulnerable=.8;event(s,'Bonk! Steer back toward the track.',victim.id)}
function use(s,r){const item=r.item;if(!item)return;r.item=null;if(item==='nectar'){r.boost=3.2;event(s,'NECTAR RUSH!',r.id)}if(item==='bubble'){r.shield=6;event(s,'Bubble up — protected for 6 seconds',r.id)}if(item==='acorn'||item==='pollen'){s.hazards.push({id:++s.eventId,owner:r.id,type:item,distance:r.distance+(item==='acorn'?3:-3),lane:r.lane,life:item==='acorn'?3:12});s.hazards=s.hazards.slice(-16);event(s,item==='acorn'?'Acorn away!':'Pollen slick dropped',r.id)}}
function step(s,dt){const length=GP_TRACKS[s.config.track].length;s.elapsed+=dt;
 for(const r of s.cars){if(r.finish!==null)continue;for(const key of ['boost','padLock','shield','stun','invulnerable','pickupLock','bump'])r[key]=Math.max(0,r[key]-dt);
  if(r.recovery>0){r.recovery=Math.max(0,r.recovery-dt);if(!r.recovery){r.lane=Math.sign(r.lane)*1.3;r.heading=0;r.knock=0;r.lateralSpeed=0;r.invulnerable=2;event(s,'Back on track — go get them!',r.id)}continue}
  let input=s.inputs[r.id]||{};
  if(r.bot){const target=Math.sin(r.distance*.012+Number(r.id.slice(3))*2)*1.9,k=gpCurvature(s.config.track,r.distance),limit=.46/(1+r.speed*.025),turn=clamp(Math.atan(k*2.5)/limit-r.heading*2.6-(r.lane-target)*.2,-1,1);input={left:Math.max(0,-turn),right:Math.max(0,turn),throttle:true,boost:r.energy>.85,brake:Math.abs(k)>.065&&r.speed>17};if(r.item&&random(s)<dt*.6)use(s,r)}
  if(!r.bot&&input.use&&!r.used)use(s,r);r.used=!!input.use;
  const wasOff=r.recovery;gpDrive(r,input,gpCurvature(s.config.track,r.distance),dt);if(!wasOff&&r.recovery)event(s,'Over the edge! A leaf is bringing you back.',r.id);
  const u=((r.distance/length%1)+1)%1;
  if(r.padLock<=0&&r.speed>2&&[.16,.49,.78].some(t=>Math.abs(u-t)<.006)){r.boost=1.1;r.padLock=1.6}
  if(!r.item&&r.pickupLock<=0&&r.speed>1){for(let i=0;i<GP_BOXES.length;i++)for(const lane of [-2,2]){const key=i+':'+lane;if(Math.abs(gap(r.distance,GP_BOXES[i]*length,length))<2.2&&Math.abs(r.lane-lane)<1.25&&(s.boxes[key]||0)<=s.elapsed){r.item=Object.keys(GP_ITEMS)[Math.floor(random(s)*4)];r.pickupLock=1;s.boxes[key]=s.elapsed+4;event(s,GP_ITEMS[r.item].name+' collected',r.id)}}}
  r.lap=Math.floor(Math.max(0,r.distance)/length);if(r.distance>=length*GP_LAPS){r.finish=s.elapsed-(r.distance-length*GP_LAPS)/Math.max(r.speed,.01);r.speed=0;event(s,'Crossed the finish line!',r.id)}
 }
 for(let i=0;i<s.cars.length;i++)for(let j=i+1;j<s.cars.length;j++){const a=s.cars[i],b=s.cars[j];if(a.finish!==null||b.finish!==null||a.recovery||b.recovery||a.bump||b.bump)continue;if(Math.abs(gap(a.distance,b.distance,length))<2.2&&Math.abs(a.lane-b.lane)<1.65){const side=a.lane>=b.lane?1:-1;a.knock+=side*(a.boost>0?2:4);b.knock-=side*(a.boost>0?11:4);if(b.boost>0)a.knock+=side*9;if(a.shield>0||a.invulnerable>0)a.knock=0;if(b.shield>0||b.invulnerable>0)b.knock=0;a.bump=b.bump=.55;a.speed*=.91;b.speed*=.91}}
 for(const h of s.hazards){h.life-=dt;if(h.type==='acorn')h.distance+=40*dt;for(const r of s.cars){if(r.id===h.owner||r.recovery||r.finish!==null)continue;if(Math.abs(gap(r.distance,h.distance,length))<2.2&&Math.abs(r.lane-h.lane)<1.5){hit(s,r,h.owner,h.type==='acorn'?14:11);h.life=0;break}}}s.hazards=s.hazards.filter(h=>h.life>0);
 const humans=s.cars.filter(r=>!r.bot);if(humans.every(r=>r.finish!==null)||s.elapsed>300){const order=[...s.cars].sort((a,b)=>(a.finish??Infinity)-(b.finish??Infinity)||b.distance-a.distance);s.phase='finished';s.winner=order[0].id;s.history.push('Grand Prix finished.');s.ply++;}
}
export function gpAdvance(state,now,{predict=false}={}){const s=structuredClone(state);if(!s.lastAt){s.lastAt=now;return s}const old=s.lastAt;s.lastAt=now;if(s.phase!=='racing'&&s.phase!=='countdown')return s;
 if(s.pausedBy){s.waiting='Race paused';return s}
 if(!s.solo){const missing=['rose','cream'].some(id=>now-(s.heartbeats[id]||0)>3000);if(missing||s.pausedBy){s.waiting=missing?'Waiting for your person to reconnect':'Race paused';return s}}
 s.waiting=null;if(now<s.startAt)return s;s.phase='racing';let time=Math.min(predict?.25:.75,Math.max(0,(now-Math.max(old,s.startAt))/1000));
 while(time>.00001&&s.phase==='racing'){const dt=Math.min(1/60,time);step(s,dt);time-=dt}return s;
}
export function gpAction(state,body,side,now,ctx={}){if(state.game!=='grandprix'||!['rose','cream'].includes(side))return null;let s=gpAdvance(state,now);const action=body.action;
 if(action==='input'){if(!Number.isSafeInteger(body.seq)||body.seq<1)return null;if(body.seq<=(s.seq[side]||0))return s;s.seq[side]=body.seq;s.heartbeats[side]=now;s.inputs[side]=Object.fromEntries(['left','right','throttle','brake','boost','use'].map(k=>[k,body.input?.[k]===true]));return s;}
 if(action==='profile'){if(s.phase!=='garage')return null;if(!/^#[a-f0-9]{6}$/i.test(body.color)||!['bug','roadster'].includes(body.body))return null;s.profiles[side]={color:body.color,body:body.body};s.ready[side]=false;return s}
 if(action==='config'){if(s.phase!=='garage')return null;if(body.accept===false){s.request=null;return s}if(body.accept===true){if(!s.request||s.request.side===side)return null;s.config=s.request.config;s.request=null;s.ready={rose:false,cream:false};return s}
  const track=Number(body.track),bots=Number(body.bots);if(!Number.isInteger(track)||track<0||track>2||!Number.isInteger(bots)||bots<0||bots>3)return null;if(!ctx.host&&bots!==s.config.bots)throw Object.assign(new Error('Only the lobby host chooses bots.'),{status:403});const config={track,bots};if(ctx.solo||!ctx.joined){s.config=config;s.ready={rose:false,cream:false}}else s.request={side,config};return s;
 }
 if(action==='ready'){if(s.phase!=='garage'||s.request)return null;if(!ctx.solo&&!ctx.joined)throw new Error('Wait for your person to join.');s.solo=!!ctx.solo;s.ready[side]=!s.ready[side];s.heartbeats[side]=now;if(s.ready[side]&&(ctx.solo||s.ready.rose&&s.ready.cream)){const ids=ctx.solo?[side]:['rose','cream'];for(let i=0;i<s.config.bots;i++)ids.push('bot'+i);s.cars=ids.map((id,i)=>car(id,i,s.profiles[id]||{color:['#90bda0','#a398d2','#e9ae58'][i%3],body:i%2?'bug':'roadster'}));s.phase='countdown';s.startAt=now+3400;s.lastAt=now;s.round++;s.rng=now>>>0;s.heartbeats.rose=s.heartbeats.cream=now;s.elapsed=0;}return s;}
 if(action==='pause'&&['racing','countdown'].includes(s.phase)){s.pausedBy=s.pausedBy?null:side;return s}
 if(action==='garage'){if(s.phase==='garage')return s;if(!ctx.solo&&body.accept!==true){s.returnRequest=side;return s}if(!ctx.solo&&(!s.returnRequest||s.returnRequest===side))return null;const n=gpNew({config:s.config,profiles:s.profiles});n.round=s.round;n.seq=s.seq;return n}
 return null;
}
