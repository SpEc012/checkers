import {gpAdvance} from './grand-prix.mjs';

// Continue at display cadence; a slow HTTP response must not stop steering.
export class RacePrediction {
  constructor(){this.state=null;this.receivedAt=0;this.signature='';}
  accept(snapshot,now,side,input){
    const signature=JSON.stringify([snapshot.lastAt,snapshot.startAt,snapshot.phase,snapshot.seq,snapshot.config,snapshot.profiles,snapshot.ready,snapshot.pausedBy]);
    if(signature===this.signature)return false;
    if(this.state?.startAt===snapshot.startAt&&snapshot.lastAt<this.serverAt)return false;
    this.signature=signature;this.serverAt=snapshot.lastAt;this.receivedAt=now;
    this.state=structuredClone(snapshot);
    this.state.inputs[side]={...input};
    // Only extrapolate a bounded network transit interval, never a whole outage.
    const target=Math.max(snapshot.lastAt,Math.min(now,snapshot.lastAt+400));
    while(this.state.lastAt<target)this.state=gpAdvance(this.state,Math.min(target,this.state.lastAt+40),{predict:true});
    this.state.lastAt=now;
    return true;
  }
  advance(now,side,input){
    if(!this.state)return null;
    this.state.inputs[side]={...input};
    if(now-this.receivedAt>1200){this.state.lastAt=now;return this.state;}
    // Clamp suspended tabs, but integrate normal frames continuously.
    const target=Math.max(this.state.lastAt,now);
    this.state.lastAt=Math.max(this.state.lastAt,target-80);
    this.state=gpAdvance(this.state,target,{predict:true});
    return this.state;
  }
}
