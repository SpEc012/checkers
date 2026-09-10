import * as THREE from 'three';
import {throwFrame} from './match-effects.mjs';
// Articulated toy hands: every finger has three independently bending joints.
export function createArena(container,label){
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));container.prepend(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,1,.1,50);camera.position.set(0,1,12);camera.lookAt(0,.3,0);
 scene.add(new THREE.HemisphereLight(0xffeff7,0x564060,3));const light=new THREE.DirectionalLight(0xffffff,4);light.position.set(-3,5,7);scene.add(light);
 const sphere=new THREE.SphereGeometry(1,20,14),hands=[];
 function hand(color,x,mirror){const root=new THREE.Group(),mat=new THREE.MeshStandardMaterial({color,roughness:.32,metalness:.05});root.position.set(x,-.25,0);root.rotation.z=mirror*-.18;scene.add(root);
 function ellipsoid(parent,sx,sy,sz,px,py,pz,material=mat){const mesh=new THREE.Mesh(sphere,material);mesh.scale.set(sx,sy,sz);mesh.position.set(px,py,pz);parent.add(mesh);return mesh}
 ellipsoid(root,.68,.77,.3,0,0,0);ellipsoid(root,.4,.48,.28,0,-.85,0);const cuff=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.6});ellipsoid(root,.45,.19,.32,0,-1.05,0,cuff);
 const fingers=[];for(let i=0;i<4;i++){const base=new THREE.Group();base.position.set((i-1.5)*.31,.56,0);root.add(base);const joints=[];let parent=base;const len=[.35,.41,.38,.29][i];for(let j=0;j<3;j++){const joint=new THREE.Group();if(j)joint.position.y=len;parent.add(joint);ellipsoid(joint,.16,len*.62,.16,0,len*.45,0);joints.push(joint);parent=joint}fingers.push({base,joints})}
 const thumb=new THREE.Group();thumb.position.set(-.57,-.1,.1);thumb.rotation.z=.75;root.add(thumb);ellipsoid(thumb,.23,.43,.2,0,.25,0);
 hands.push({root,fingers,thumb,x});}
 hand(0xf18ba4,-1.55,-1);hand(0xf4dbb7,1.55,1);
 let key='',start=0,picks=null,revealed=false;const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const resize=new ResizeObserver(()=>{const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()});resize.observe(container);
 function pose(h,choice,blend){h.fingers.forEach(({base,joints},i)=>{const extended=choice==='paper'||choice==='scissors'&&i<2;const bend=extended?0:1.5;for(const joint of joints)joint.rotation.x=1.5+(bend-1.5)*blend;base.rotation.z=choice==='scissors'&&i<2?(i===0?.18:-.18)*blend:choice==='paper'?(1.5-i)*.07*blend:0});h.thumb.rotation.z=.75;h.thumb.rotation.x=choice==='paper'?-.25*blend:1.1;}
 renderer.setAnimationLoop((time)=>{if(document.hidden||container.getClientRects().length===0)return;
 const f=throwFrame((performance.now()-start)/1000,reduced.matches);
 hands.forEach((h,i)=>{pose(h,picks?.[i===0?'rose':'cream']||'rock',revealed?f.blend:0);h.root.position.y=-.45+(revealed?f.bounce:reduced.matches?0:Math.sin(time*.002)*.07);h.root.rotation.x=revealed?-f.tilt:0;h.root.position.x=h.x+(revealed?(i===0?1:-1)*f.impact*.12:0)});
 label.textContent=revealed?f.word:'Two hearts. One showdown.';container.dataset.phase=revealed?(f.blend===1?'revealed':'throwing'):'waiting';renderer.render(scene,camera);
 });
 return {update(s){if(s.key===key)return;key=s.key;start=s.startAt||0;revealed=s.revealed;picks=s.picks;}};
}
