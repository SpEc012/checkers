export const DAY=86400000;
export const PLANTS={
 rose:{name:'Cozy rose',color:'#e886a6',minutes:20,food:2,coins:8,level:1},
 tulip:{name:'Pink tulip',color:'#ee9db9',minutes:30,food:3,coins:10,level:1},
 berry:{name:'Blush berries',color:'#de6888',minutes:15,food:4,coins:6,level:1},
 cactus:{name:'Tiny cactus',color:'#80b399',minutes:45,food:3,coins:12,level:2},
 star:{name:'Star flower',color:'#e5bd5f',minutes:60,food:5,coins:16,level:3},
 moon:{name:'Moon blossom',color:'#b1a0d1',minutes:90,food:7,coins:22,level:5},
};
export const ITEMS=[
 {id:'none-hat',slot:'hat',name:'Just me',level:1,cost:0},
 {id:'bow',slot:'hat',name:'Blush bow',level:1,cost:0},
 {id:'daisy',slot:'hat',name:'Daisy day',level:1,cost:15},
 {id:'sunhat',slot:'hat',name:'Sunday sunhat',level:2,cost:25},
 {id:'sprout',slot:'hat',name:'Sprout scout',level:2,cost:20},
 {id:'beret',slot:'hat',name:'Berry beret',level:3,cost:35},
 {id:'mushroom',slot:'hat',name:'Mushroom cap',level:3,cost:40},
 {id:'crown',slot:'hat',name:'Garden royalty',level:4,cost:55},
 {id:'party',slot:'hat',name:'Party bug',level:4,cost:45},
 {id:'nightcap',slot:'hat',name:'Sleepy star',level:5,cost:60},
 {id:'flowercrown',slot:'hat',name:'Bloom crown',level:6,cost:70,days:3},
 {id:'none-glasses',slot:'glasses',name:'Bright eyes',level:1,cost:0},
 {id:'round',slot:'glasses',name:'Bookworm',level:1,cost:15},
 {id:'heart',slot:'glasses',name:'Heart eyes',level:2,cost:25},
 {id:'sun',slot:'glasses',name:'Sun seeker',level:3,cost:35},
 {id:'star',slot:'glasses',name:'Stargazer',level:4,cost:45},
 {id:'none-aura',slot:'aura',name:'Soft & simple',level:1,cost:0},
 {id:'petals',slot:'aura',name:'Petal breeze',level:3,cost:40},
 {id:'hearts',slot:'aura',name:'Loved to bits',level:4,cost:55,days:3},
 {id:'fireflies',slot:'aura',name:'Firefly friends',level:5,cost:65,days:5},
 {id:'rainbow',slot:'aura',name:'After the rain',level:7,cost:90,days:7},
];
export const levelOf=s=>Math.min(10,1+Math.floor(s.xp/80));
export const stageOf=s=>levelOf(s)>=7?'Garden guardian':levelOf(s)>=4?'Bloom buddy':levelOf(s)>=2?'Curious explorer':'Dewdrop baby';
const day=now=>Math.floor(now/DAY);
const clamp=n=>Math.max(0,Math.min(100,n));
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
export function newGarden(now){return {version:1,name:'Clover',createdAt:now,updatedAt:now,xp:0,coins:25,food:3,hunger:80,affection:75,energy:85,sleeping:false,plots:Array(6).fill(null),owned:['none-hat','bow','none-glasses','none-aura'],outfit:{hat:'bow',glasses:'none-glasses',aura:'none-aura',color:'#d96d8c'},log:[],receipts:[],cooldowns:{},daily:{day:day(now),water:0,feed:0,pet:0,harvest:0,visitors:[],claimed:[]},bondDays:0,streak:0,lastBondDay:null};}
export function growGarden(saved,now){const s=structuredClone(saved),hours=Math.max(0,now-s.updatedAt)/3600000;
 s.hunger=clamp(s.hunger-hours*2);s.affection=clamp(s.affection-hours*1.2);s.energy=clamp(s.energy+hours*(s.sleeping?22:-1.5));
 for(const p of s.plots)if(p){const wetUntil=p.wateredAt+DAY;const delta=Math.max(0,Math.min(now,wetUntil)-Math.max(s.updatedAt,p.plantedAt));p.growth=Math.min(100,p.growth+delta/(PLANTS[p.type].minutes*60000)*100);p.withered=now>wetUntil;}
 s.updatedAt=Math.max(now,s.updatedAt);if(s.daily.day!==day(now))s.daily={day:day(now),water:0,feed:0,pet:0,harvest:0,visitors:[],claimed:[]};
 return s;
}
export function quests(s){return [{id:'water',name:'A sip for the garden',detail:'Water or revive 3 plants',count:s.daily.water,target:3,coins:8,xp:12},{id:'feed',name:'A full tummy',detail:'Feed your ladybug',count:s.daily.feed,target:1,coins:5,xp:8},{id:'pet',name:'Love, from both of us',detail:'Both partners care for the garden or pet',count:s.daily.visitors.length,target:2,coins:12,xp:20},{id:'harvest',name:'From garden to table',detail:'Harvest a blooming plant',count:s.daily.harvest,target:1,coins:8,xp:12}];}
export function gardenAction(saved,body,actor,now){
 if(saved.receipts.includes(body.requestId))return {state:saved,message:'Already saved.'};
 const s=growGarden(saved,now);let message='',care=false;const level=levelOf(s);
 const cooldown=(key,ms)=>{if(now-(s.cooldowns[key]||0)<ms)fail('Give that a moment to settle.');s.cooldowns[key]=now;};
 const plot=()=>{if(!Number.isInteger(body.plot)||body.plot<0||body.plot>5)fail('Choose a garden plot.');return s.plots[body.plot];};
 if(body.action==='plant'){if(plot())fail('Harvest this plot before planting again.');const p=PLANTS[body.seed];if(!p||p.level>level)fail('That seed has not unlocked yet.');s.plots[body.plot]={type:body.seed,growth:0,plantedAt:now,wateredAt:now,withered:false};message=`planted a ${p.name.toLowerCase()}.`;s.xp+=2;care=true;}
 else if(body.action==='water'||body.action==='revive'){const p=plot();if(!p)fail('Plant a seed here first.');cooldown('plot:'+body.plot,60000);p.wateredAt=now;p.withered=false;p.growth=Math.min(100,p.growth+12);s.daily.water++;s.xp+=3;care=true;message=`${body.action==='revive'?'revived':'watered'} the ${PLANTS[p.type].name.toLowerCase()}.`;}
 else if(body.action==='harvest'){const p=plot();if(!p||p.growth<100||p.withered)fail('This plant needs to be blooming and watered first.');const crop=PLANTS[p.type];s.food+=crop.food;s.coins+=crop.coins;s.xp+=10;s.plots[body.plot]=null;s.daily.harvest++;care=true;message=`harvested ${crop.name.toLowerCase()} · +${crop.food} garden treats!`;}
 else if(body.action==='feed'){if(s.sleeping)fail('Wake your ladybug before snack time.');cooldown('feed',30000);if(s.hunger>95)fail('That tummy is full! Save a snack for later.');if(body.snack==='garden'){if(s.food<1)fail('Harvest a plant for more garden treats.');s.food--;s.hunger=clamp(s.hunger+30);}else s.hunger=clamp(s.hunger+15);s.affection=clamp(s.affection+4);s.xp+=4;s.daily.feed++;care=true;message=body.snack==='garden'?'served a fresh garden treat. Happy wing flutters!':`gave ${s.name} an aphid snack. Crunch, crunch!`;}
 else if(body.action==='pet'){if(s.sleeping)fail('Shh… your ladybug is asleep.');cooldown('pet',30000);s.affection=clamp(s.affection+18);s.xp+=3;s.daily.pet++;care=true;message='gave the softest head pats. Antennae wiggles!';}
 else if(body.action==='sleep'){if(s.sleeping)fail('Already tucked in.');s.sleeping=true;care=true;message='tucked our ladybug into a leaf bed. Sweet dreams.';}
 else if(body.action==='wake'){if(!s.sleeping)fail('Already awake.');s.sleeping=false;message='lifted the leaf blanket. Good morning, sunshine!';}
 else if(body.action==='rename'){if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>24)fail('Choose a name from 1–24 characters.');s.name=body.name.trim();message=`named our ladybug ${s.name}.`;}
 else if(body.action==='color'){if(!/^#[0-9a-f]{6}$/i.test(body.color))fail('Choose a shell color.');s.outfit.color=body.color;message='picked a new shell color.';}
 else if(body.action==='outfit'){const item=ITEMS.find(i=>i.id===body.item);if(!item||item.level>level||(item.days||0)>s.bondDays)fail('Keep growing together to unlock this outfit.');if(!s.owned.includes(item.id)){if(s.coins<item.cost)fail('Earn more dewdrops by harvesting and completing quests.');s.coins-=item.cost;s.owned.push(item.id);}s.outfit[item.slot]=item.id;message=`styled our ladybug with ${item.name.toLowerCase()}.`;}
 else if(body.action==='claim'){const q=quests(s).find(q=>q.id===body.quest);if(!q||q.count<q.target||s.daily.claimed.includes(q.id))fail('This quest is not ready to collect.');s.daily.claimed.push(q.id);s.coins+=q.coins;s.xp+=q.xp;message=`completed “${q.name}”. +${q.coins} dewdrops!`;}
 else fail('Choose a garden action.');
 if(care&&!s.daily.visitors.includes(actor.id))s.daily.visitors.push(actor.id);
 if(s.daily.visitors.length>=2&&s.lastBondDay!==day(now)){s.bondDays++;s.streak=s.lastBondDay===day(now)-1?s.streak+1:1;s.lastBondDay=day(now);s.coins+=10;s.xp+=10;message+=' A day cared for together ♡';}
 // A gentle daily XP ceiling prevents repetitive tapping from skipping every stage.
 const earned=Math.max(0,s.xp-saved.xp),key='xp:'+day(now);const prior=s.cooldowns[key]||0;s.xp=saved.xp+Math.min(earned,Math.max(0,120-prior));s.cooldowns[key]=prior+Math.min(earned,Math.max(0,120-prior));
 s.cooldowns=Object.fromEntries(Object.entries(s.cooldowns).filter(([k,v])=>k.startsWith('xp:')?k===key:v>now-DAY));
 s.log.unshift({id:body.requestId,name:actor.name,text:message,at:now});s.log=s.log.slice(0,40);s.receipts=[...s.receipts,body.requestId].slice(-100);
 return {state:s,message};
}
