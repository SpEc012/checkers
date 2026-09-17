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
// Existing rooms lose stale combat state and overlapping cars cannot knock each other off.
let simple=structuredClone(s);simple.solo=true;simple.lastAt=now;simple.inputs={};
for(const r of simple.cars)Object.assign(r,{distance:50,lane:3.5,speed:0,lateralSpeed:0,heading:0,item:'acorn',shield:5,stun:2,recovery:1,knock:14});
simple.hazards=[{id:9,type:'acorn',owner:'rose',distance:50,lane:3.5,life:3}];
simple=gpAdvance(simple,now+100);
assert.deepEqual(simple.hazards,[]);
for(const r of simple.cars){assert.equal(r.item,null);assert.equal(r.knock,0);assert.equal(r.recovery,0);assert.equal(r.lane,3.5)}
// Match the exact approved prototype mechanics across turns, braking, boost and curbs.
const {gpDrive:originalDrive}=await import('./fixtures/grand-prix-original-drive.mjs');
let actual=structuredClone(s.cars[0]),expected=structuredClone(actual);
for(let i=0;i<1800;i++){
 const input={throttle:i%400<300,left:i%240<80,right:i%240>160,brake:i%400>360,boost:i%500<100};
 const curvature=Math.sin(i*.007)*.04;
 gpDrive(actual,input,curvature,1/60);originalDrive(expected,input,curvature,1/60);
 assert.deepEqual(actual,expected);assert.ok(Math.abs(actual.lane)<=4.05);
}
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
console.log('Grand Prix rules: consent, host-only bots, seat ownership, ready countdown, stale inputs, reconnect pause, combat removal, original prototype handling and full races passed.');
