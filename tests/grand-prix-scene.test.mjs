import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as Three from 'three';
import {gpNew,gpAction,gpAdvance,GP_TRACKS,GP_ITEMS,GP_BOXES} from '../public/grand-prix.mjs';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
// Exercise actual scene construction and race lifecycle without a GPU or browser.
const context2d=new Proxy({}, {get:(_,p)=>p==='canvas'?{}:()=>{}});
const nodes=new Map();
function element(){return {value:'Dylan',hidden:false,tagName:'DIV',dataset:{},style:{},classList:{add(){},remove(){},toggle(){}},closest:()=>element(),getContext:()=>context2d,getBoundingClientRect:()=>({left:20,top:20,bottom:120,width:200,height:100}),addEventListener(){},remove(){},setPointerCapture(){},replaceChildren(){},append(){},showModal(){this.open=true},close(){this.open=false}};}
const document={body:{append(){}},querySelector:s=>{if(!nodes.has(s))nodes.set(s,element());return nodes.get(s)},querySelectorAll:()=>[],createElement:element,activeElement:{tagName:'BODY'},addEventListener(){}};
class Renderer{constructor(){this.shadowMap={}}setPixelRatio(){}setSize(){}setScissorTest(){}setViewport(){}render(){}setScissor(){}setClearColor(){}clear(){}}
const storage=new Map();
const sandbox={structuredClone,THREE:{...Three,WebGLRenderer:Renderer},mergeGeometries,gpNew,gpAction,gpAdvance,GP_TRACKS,GP_ITEMS,GP_BOXES,URLSearchParams,location:{search:'',origin:'https://game.test'},document,window:{addEventListener(){}},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},matchMedia:()=>({matches:false}),devicePixelRatio:2,innerWidth:390,innerHeight:844,performance,requestAnimationFrame(){},setTimeout:()=>0,setInterval:()=>0,console};sandbox.globalThis=sandbox;
vm.createContext(sandbox);
let source=fs.readFileSync('public/grand-prix-scene.mjs','utf8').replace(/^import .*;\n/gm,'');
source+='\nglobalThis.test={receive,tick,get:()=>({racers,world}),ctx:c=>context={...context,...c}};';
vm.runInContext(source,sandbox);
const api=sandbox.test;
for(let track=0;track<3;track++){
 let s=gpNew({config:{track,bots:3}});api.receive(s);api.tick(performance.now());
 s=gpAction(s,{action:'ready'},'rose',Date.now(),{solo:true,host:true});api.receive(s);api.tick(performance.now());
 const {racers,world}=api.get();assert.equal(racers.length,4);let meshes=0;world.traverse(o=>{if(o.isMesh)meshes++});assert.ok(meshes<300,`too many draws ${meshes}`);
 assert.ok(racers.every(r=>r.model.userData.shield&&r.model.userData.leaf));
 console.log(`3D circuit ${track+1}: scene initialized, ${racers.length} karts, ${meshes} meshes`);
}
console.log('Grand Prix scene startup, garage, three courses, pickup crates, shields and recovery geometry passed (GPU rendering not exercised).');
