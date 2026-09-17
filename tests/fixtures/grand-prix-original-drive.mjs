// Driving from the approved 0b6bd84 prototype.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
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
