export const THROW_DURATION=2700;
export function throwFrame(elapsed,reduced=false){
 if(reduced)return {bounce:0,tilt:0,blend:1,word:'Shoot!',impact:0};
 const beat=.72,shoot=beat*3,t=Math.max(0,elapsed),shaking=t<shoot;
 // A firm downward beat followed by a full lift, three times in sync.
 const lift=shaking?Math.sin((t%beat)/beat*Math.PI)**2:0;
 return {bounce:lift*.9,tilt:lift*.24,blend:Math.min(1,Math.max(0,(t-shoot)/.32)),word:shaking?['Rock!','Paper!','Scissors!'][Math.floor(t/beat)]:'Shoot!',impact:!shaking?Math.max(0,1-(t-shoot)/.28):0};
}
export function victoryCopy(winner,names,game){
 if(winner==='together')return {headline:`${names.rose} + ${names.cream}`,result:'Win together!',note:game==='puzzle'?'Every little piece found its way home.':'Two minds. One very good team.',bang:'TOGETHER!'};
 if(winner==='draw')return {headline:'A perfect little tie.',result:'Too in sync.',note:'Call it even. Steal a kiss.',bang:'JINX!'};
 return {headline:names[winner]||'Your person',result:'WINS!',note:'Bragging rights earned. A kiss is still owed.',bang:'BANG!'};
}
