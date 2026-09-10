import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {victoryCopy} from '../public/match-effects.mjs';
const source=readFileSync(new URL('../public/app.mjs',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('function checkCelebration(){'),source.indexOf("$('#dismissVictory').onclick"));
const elements=new Map();const el=()=>({hidden:true,textContent:'',children:[],style:{setProperty(){}},replaceChildren(){this.children=[]},append(c){this.children.push(c)}});
const context={state:{},sessionGeneration:1,celebrated:null,celebrationTimer:null,names:{rose:'Dylan',cream:'Audrey'},sound:false,victoryCopy,clearTimeout,matchMedia:()=>({matches:false}),performance,document:{createElement:el},$:id=>{if(!elements.has(id))elements.set(id,el());return elements.get(id)},kind:()=>context.state.game,rpsThrowing:()=>context.throwing,closeCelebration:()=>{context.$('#victory').hidden=true},throwing:false};
vm.createContext(context);vm.runInContext(fn,context);
for(const game of ['checkers','connect4','memory','puzzle','draw','rps']){
 context.state={game,ply:0,winner:null};context.checkCelebration();
 context.state={game,ply:10,winner:['puzzle','draw'].includes(game)?'together':'cream'};context.checkCelebration();
 assert.equal(context.$('#victory').hidden,false,game+' must show overlay');assert.ok(context.$('#victoryName').textContent.includes('Audrey'));
 assert.equal(context.$('#victoryConfetti').children.length,36);context.closeCelebration();context.checkCelebration();assert.equal(context.$('#victory').hidden,true,'Polling must not reopen dismissed result');
}
context.state={game:'rps',ply:0,winner:null};context.checkCelebration();context.state={game:'rps',ply:2,round:1,winner:null,roundResult:'cream'};context.throwing=true;context.checkCelebration();assert.equal(context.$('#victory').hidden,true);
context.throwing=false;context.checkCelebration();assert.equal(context.$('#victory').hidden,false);assert.equal(context.$('#victoryResult').textContent,'WINS THIS THROW!');
console.log('Actual celebration handler passed for all six games, RPS rounds, countdown delay, confetti and polling deduplication.');
