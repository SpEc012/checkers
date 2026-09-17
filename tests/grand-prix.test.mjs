import assert from 'node:assert/strict';
import {gpNew,gpAction,gpAdvance,gpDrive,gpCurvature,GP_TRACKS} from '../public/grand-prix.mjs';
let now=10000;
const ctx={host:true,joined:true};
let s=gpNew();
s=gpAction(s,{action:'config',track:1,bots:0},'rose',now,ctx);
assert.equal(s.config.track,0,'track needs partner approval');
assert.equal(gpAction(s,{action:'config',accept:true},'rose',now,ctx),null);
s=gpAction(s,{action:'config',accept:true},'cream',now,{joined:true});assert.equal(s.config.track,1);assert.equal(s.config.bots,0);
assert.throws(()=>gpAction(s,{action:'config',track:2,bots:2},'cream',now,{joined:true}),/host/);
s=gpAction(s,{action:'profile',color:'#cc77ee',body:'roadster',side:'cream'},'rose',now,ctx);assert.equal(s.profiles.rose.color,'#cc77ee');assert.notEqual(s.profiles.cream.color,'#cc77ee');
s=gpAction(s,{action:'ready'},'rose',now,ctx);assert.equal(s.phase,'garage');s=gpAction(s,{action:'ready'},'cream',now,{joined:true});assert.equal(s.cars.length,2);assert.equal(s.phase,'countdown');
const start=s.startAt;now=start+10;s.heartbeats={rose:now,cream:now};s=gpAdvance(s,now);const d=s.cars[0].distance;assert.equal(s.cars[0].speed,0);
s=gpAction(s,{action:'input',seq:1,input:{throttle:true},distance:99999},'rose',now,ctx);assert.equal(s.cars[0].distance,d,'client position is ignored');assert.equal(s.inputs.cream,undefined);
now+=200;s=gpAction(s,{action:'input',seq:1,input:{throttle:true}},'cream',now,{joined:true});assert.ok(s.cars[0].speed>0);assert.equal(s.cars[1].speed,0,'fresh input does not move backwards in time');
s=gpAction(s,{action:'input',seq:1,input:{throttle:false}},'rose',now,ctx);assert.equal(s.inputs.rose.throttle,true,'stale sequence cannot overwrite controls');
const paused=gpAdvance(s,now+5000);assert.ok(paused.waiting);assert.equal(paused.cars[0].distance,s.cars[0].distance,'disconnection pauses shared time');
// A shield blocks a projectile; without a shield, a hit can knock a kart off.
let battle=structuredClone(s);battle.phase='racing';battle.solo=true;battle.lastAt=now;battle.startAt=0;battle.inputs={};battle.cars[1].distance=50;battle.cars[1].lane=3.5;battle.cars[1].shield=5;battle.hazards=[{id:9,type:'acorn',owner:'rose',distance:48.8,lane:3.5,life:3}];battle=gpAdvance(battle,now+30);assert.equal(battle.cars[1].shield,0);assert.equal(battle.cars[1].stun,0);
battle.cars[1].invulnerable=0;battle.hazards=[{id:10,type:'acorn',owner:'rose',distance:battle.cars[1].distance-1,lane:3.5,life:3}];battle=gpAdvance(battle,now+60);assert.ok(battle.cars[1].stun>0);battle=gpAdvance(battle,now+600);assert.ok(battle.cars[1].recovery>0,'strong impact knocks kart off');battle=gpAdvance(battle,now+1300);battle=gpAdvance(battle,now+2000);battle=gpAdvance(battle,now+2600);assert.equal(battle.cars[1].recovery,0);assert.ok(Math.abs(battle.cars[1].lane)<4);
// Inputs remain smooth, screen-right positive, and gas is required.
const c=structuredClone(s.cars[0]);Object.assign(c,{speed:0,heading:0,lane:0,lateralSpeed:0,knock:0});gpDrive(c,{},0,1/60);assert.equal(c.speed,0);for(let i=0;i<100;i++)gpDrive(c,{throttle:true},0,1/60);gpDrive(c,{throttle:true,right:true},0,1/60);assert.ok(c.steer>0&&c.steer<.2);for(let i=0;i<100;i++)gpDrive(c,{brake:true},0,1/60);assert.equal(c.speed,0);
// Drive every longer course, against bots, with the actual shared simulation.
for(let t=0;t<3;t++){
 let race=gpNew({config:{track:t,bots:2}});let clock=10000;race=gpAction(race,{action:'ready'},'rose',clock,{solo:true,host:true});clock=race.startAt;race.lastAt=clock;race.phase='racing';assert.ok(GP_TRACKS[t].length>540);
 for(let i=0;i<36000&&race.phase!=='finished';i++){
  const r=race.cars[0],k=gpCurvature(t,r.distance),limit=.46/(1+r.speed*.025),turn=Math.max(-1,Math.min(1,Math.atan(k*2.5)/limit-r.heading*2.6-r.lane*.2));race.inputs.rose={left:Math.max(0,-turn),right:Math.max(0,turn),throttle:true,boost:r.energy>.5,use:!!r.item};clock+=1000/60;race=gpAdvance(race,clock);assert.ok(race.cars.every(c=>Number.isFinite(c.distance)&&Number.isFinite(c.speed)));
 }
 assert.equal(race.phase,'finished');assert.ok(race.cars[0].finish,'player completed the course');console.log(`Long course ${t+1}: ${Math.round(GP_TRACKS[t].length)}m per lap, finished at ${race.cars[0].finish.toFixed(1)}s`);
}
console.log('Grand Prix rules: consent, host-only bots, seat ownership, ready countdown, stale inputs, reconnect pause, items, knock-off/rescue, handling and full races passed.');
