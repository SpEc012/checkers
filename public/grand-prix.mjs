import {GP_TRACKS} from './grand-prix-tracks.mjs';
export {GP_TRACKS};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
export const GP_LAPS=3;
export function gpCurvature(track,distance){const t=GP_TRACKS[track],u=((distance/t.length%1)+1)%1*1024,n=Math.floor(u);return lerp(t.curvature[n],t.curvature[(n+1)%1024],u-n)}
export function gpNew(options={}){return {game:'grandprix',board:[],turn:'rose',forced:null,ply:0,history:[],winner:null,phase:'garage',config:{track:clamp(Math.floor(Number(options.config?.track)||0),0,2),bots:clamp(Math.floor(Number(options.config?.bots??2)),0,3)},profiles:options.profiles||{rose:{color:'#ee547c',body:'bug'},cream:{color:'#e9b84b',body:'bug'}},ready:{rose:false,cream:false},cars:[],lastAt:0,startAt:0,elapsed:0,round:0,inputs:{},heartbeats:{},boxes:{},hazards:[],events:[],eventId:0,rng:19,seq:{rose:0,cream:0}}}
function event(s,text,target=null){s.events.push({id:++s.eventId,text,target});s.events=s.events.slice(-8)}
function car(id,i,profile){return{id,bot:id.startsWith('bot'),color:profile.color,body:profile.body,distance:-i*3.2,lane:i%2?1.7:-1.7,speed:0,steer:0,heading:0,lateralSpeed:0,roll:0,pitch:0,energy:1,boost:0,padLock:0,finish:null,lap:0,item:null,shield:0,stun:0,recovery:0,invulnerable:0,pickupLock:0,bump:0,knock:0,used:false}}
export function gpDrive(r,input,curvature,dt){
 const command=Number(input.right||0)-Number(input.left||0);
 r.steer=lerp(r.steer,command,1-Math.exp(-dt*(command?7:9)));
 const previousSpeed=r.speed,edge=Math.abs(r.lane)>3.75;
 const powered=input.throttle&&!input.brake;
 const boosting=powered&&input.boost&&r.energy>.02;
 if(boosting){r.energy=Math.max(0,r.energy-dt*.32);r.boost=Math.max(r.boost,.1)}
 else r.energy=Math.min(1,r.energy+dt*.085);
 const boosted=powered&&(boosting||r.boost>0);
 const drag=.6+r.speed*.018+r.speed*r.speed*.018;
 const acceleration=input.brake?-22:powered?(boosted?14:9):0;
 r.speed=clamp(r.speed+(acceleration-drag-(edge?r.speed*.7:0))*dt,0,28);
 if(r.speed<.06&&!powered)r.speed=0;
 const steeringAngle=r.steer*(.46/(1+r.speed*.025));
 const yawRate=r.speed/2.5*Math.tan(steeringAngle);
 const progress=r.speed*Math.max(.25,Math.cos(r.heading))*dt;
 r.heading=clamp(r.heading+yawRate*dt-curvature*progress,-1.15,1.15);
 // Tire grip brings the car into the turn progressively, instead of lane snapping.
 r.lateralSpeed=lerp(r.lateralSpeed,Math.sin(r.heading)*r.speed,1-Math.exp(-dt*9));
 r.lane+=r.lateralSpeed*dt;
 if(Math.abs(r.lane)>4.05){const side=Math.sign(r.lane);r.lane=side*4.05;if(r.lateralSpeed*side>0){r.lateralSpeed*=.2;r.speed*=Math.exp(-dt*2.5);r.heading=lerp(r.heading,0,1-Math.exp(-dt*7));}}
 r.distance+=progress;
 r.roll=lerp(r.roll,-r.steer*Math.min(.12,r.speed*.007),1-Math.exp(-dt*8));
 r.pitch=lerp(r.pitch,clamp((r.speed-previousSpeed)/dt*.005,-.09,.045),1-Math.exp(-dt*7));
}
function step(s,dt){const length=GP_TRACKS[s.config.track].length;s.elapsed+=dt;
 // Clear combat state from rooms that were already open during the update.
 s.boxes={};s.hazards=[];
 for(const r of s.cars){
  r.item=null;r.shield=r.stun=r.recovery=r.invulnerable=r.knock=r.bump=0;
  if(r.finish!==null)continue;
  r.boost=Math.max(0,r.boost-dt);r.padLock=Math.max(0,r.padLock-dt);
  const u=((r.distance/length%1)+1)%1;
  if(r.speed>2&&r.padLock<=0&&[.16,.49,.78].some(t=>Math.abs(u-t)<.009)){r.boost=1.1;r.padLock=1.6}
  if(r.bot){
   const i=Number(r.id.slice(3))+1,desired=Math.sin(r.distance*.025+i*2)*2.3;
   r.lane=lerp(r.lane,desired,1-Math.exp(-dt*1.3));
   const target=14.2+i*.45+s.config.track*.3+Math.sin(s.elapsed*.5+i)*.8+(r.boost>0?4:0);
   r.speed=lerp(r.speed,target,1-Math.exp(-dt*1.8));r.distance+=r.speed*dt;
  }else gpDrive(r,s.inputs[r.id]||{},gpCurvature(s.config.track,r.distance),dt);
  r.lap=Math.floor(Math.max(0,r.distance)/length);if(r.distance>=length*GP_LAPS){r.finish=s.elapsed-(r.distance-length*GP_LAPS)/Math.max(r.speed,.01);r.speed=0;event(s,'Crossed the finish line!',r.id)}
 }
 const humans=s.cars.filter(r=>!r.bot);if(humans.every(r=>r.finish!==null)||s.elapsed>300){const order=[...s.cars].sort((a,b)=>(a.finish??Infinity)-(b.finish??Infinity)||b.distance-a.distance);s.phase='finished';s.winner=order[0].id;s.history.push('Grand Prix finished.');s.ply++;}
}
export function gpAdvance(state,now,{predict=false}={}){const s=structuredClone(state);if(!s.lastAt){s.lastAt=now;return s}const old=s.lastAt;s.lastAt=now;if(s.phase!=='racing'&&s.phase!=='countdown')return s;
 if(s.pausedBy){s.waiting='Race paused';return s}
 if(!s.solo){const missing=['rose','cream'].some(id=>now-(s.heartbeats[id]||0)>3000);if(missing||s.pausedBy){s.waiting=missing?'Waiting for your person to reconnect':'Race paused';return s}}
 s.waiting=null;if(now<s.startAt)return s;s.phase='racing';let time=Math.min(predict?.25:.75,Math.max(0,(now-Math.max(old,s.startAt))/1000));
 while(time>.00001&&s.phase==='racing'){const dt=Math.min(1/60,time);step(s,dt);time-=dt}return s;
}
export function gpAction(state,body,side,now,ctx={}){if(state.game!=='grandprix'||!['rose','cream'].includes(side))return null;let s=gpAdvance(state,now);const action=body.action;
 if(action==='input'){if(!Number.isSafeInteger(body.seq)||body.seq<1)return null;if(body.seq<=(s.seq[side]||0))return s;s.seq[side]=body.seq;s.heartbeats[side]=now;s.inputs[side]=Object.fromEntries(['left','right','throttle','brake','boost'].map(k=>[k,body.input?.[k]===true]));return s;}
 if(action==='profile'){if(s.phase!=='garage')return null;if(!/^#[a-f0-9]{6}$/i.test(body.color)||!['bug','roadster'].includes(body.body))return null;s.profiles[side]={color:body.color,body:body.body};s.ready[side]=false;return s}
 if(action==='config'){if(s.phase!=='garage')return null;if(body.accept===false){s.request=null;return s}if(body.accept===true){if(!s.request||s.request.side===side)return null;s.config=s.request.config;s.request=null;s.ready={rose:false,cream:false};return s}
  const track=Number(body.track),bots=Number(body.bots);if(!Number.isInteger(track)||track<0||track>2||!Number.isInteger(bots)||bots<0||bots>3)return null;if(!ctx.host&&bots!==s.config.bots)throw Object.assign(new Error('Only the lobby host chooses bots.'),{status:403});const config={track,bots};if(ctx.solo||!ctx.joined){s.config=config;s.ready={rose:false,cream:false}}else s.request={side,config};return s;
 }
 if(action==='ready'){if(s.phase!=='garage'||s.request)return null;if(!ctx.solo&&!ctx.joined)throw new Error('Wait for your person to join.');s.solo=!!ctx.solo;s.ready[side]=!s.ready[side];s.heartbeats[side]=now;if(s.ready[side]&&(ctx.solo||s.ready.rose&&s.ready.cream)){const ids=ctx.solo?[side]:['rose','cream'];for(let i=0;i<s.config.bots;i++)ids.push('bot'+i);s.cars=ids.map((id,i)=>car(id,i,s.profiles[id]||{color:['#90bda0','#a398d2','#e9ae58'][i%3],body:i%2?'bug':'roadster'}));s.phase='countdown';s.startAt=now+3400;s.lastAt=now;s.round++;s.rng=now>>>0;s.heartbeats.rose=s.heartbeats.cream=now;s.elapsed=0;}return s;}
 if(action==='pause'&&['racing','countdown'].includes(s.phase)){s.pausedBy=s.pausedBy?null:side;return s}
 if(action==='garage'){if(s.phase==='garage')return s;if(!ctx.solo&&body.accept!==true){s.returnRequest=side;return s}if(!ctx.solo&&(!s.returnRequest||s.returnRequest===side))return null;const n=gpNew({config:s.config,profiles:s.profiles});n.round=s.round;n.seq=s.seq;return n}
 return null;
}
