// Smooth articulated hands with overlapping joints rather than separated beads.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {throwFrame} from './match-effects.mjs';
export function createArena(container,label){
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;container.prepend(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(33,1,.1,40);camera.position.set(0,1.2,11.8);camera.lookAt(0,.25,0);
 scene.add(new THREE.HemisphereLight(0xfff5f0,0x796276,2.1));const light=new THREE.DirectionalLight(0xfff9ed,3);light.position.set(-3,5,6);scene.add(light);const fill=new THREE.DirectionalLight(0xffc4d6,1.2);fill.position.set(5,1,2);scene.add(fill);
 const hands=[],sphere=new THREE.SphereGeometry(1,20,16);
 function mesh(parent,geometry,material,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);parent.add(m);return m}
 function ball(parent,r,mat,x,y,z){const m=mesh(parent,sphere,mat,x,y,z);m.scale.setScalar(r);return m}
 function hand(x,color,mirror){const root=new THREE.Group();root.position.set(x,-.2,0);root.rotation.set(-.1,mirror*.2,mirror*-.12);scene.add(root);const skin=new THREE.MeshStandardMaterial({color,roughness:.64,metalness:0});
 mesh(root,new RoundedBoxGeometry(1.02,1.05,.4,5,.18),skin,0,0,0);
 mesh(root,new RoundedBoxGeometry(.55,.72,.36,4,.13),skin,0,-.68,0);
 const sleeve=new THREE.MeshStandardMaterial({color:mirror<0?0xb84067:0xd2ad91,roughness:.9});mesh(root,new RoundedBoxGeometry(.65,.65,.47,4,.12),sleeve,0,-1.12,-.01);
 const seam=new THREE.MeshStandardMaterial({color:0xfff5ec,roughness:.85});mesh(root,new RoundedBoxGeometry(.68,.1,.5,3,.04),seam,0,-.85,0);
 const fingers=[];
 for(let i=0;i<4;i++){const base=new THREE.Group();base.position.set((i-1.5)*.255,.41,0);root.add(base);const lengths=[.3,.34,.32,.25].map(v=>v);const segments=[lengths[i],lengths[i]*.78,lengths[i]*.66],joints=[];let parent=base;
 segments.forEach((length,j)=>{const joint=new THREE.Group();if(j)joint.position.y=segments[j-1];parent.add(joint);const radius=.127-j*.012;ball(joint,radius,skin,0,0,0);mesh(joint,new THREE.CylinderGeometry(radius*.92,radius,length,16),skin,0,length/2,0);ball(joint,radius*.94,skin,0,length,0);joints.push(joint);parent=joint});fingers.push({base,joints});}
 const thumb=new THREE.Group();thumb.position.set(-.48,-.2,.07);thumb.rotation.z=.85;root.add(thumb);ball(thumb,.19,skin,0,.03,0);mesh(thumb,new THREE.CapsuleGeometry(.155,.32,8,16),skin,0,.29,0);
 hands.push({root,fingers,thumb,x,mirror});}
 hand(-1.5,0xf0b7ac,-1);hand(1.5,0xf4d2b5,1);
 let snapshot={revealed:false,picks:null,startAt:0};const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const resize=new ResizeObserver(()=>{const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()});resize.observe(container);
 renderer.setAnimationLoop(time=>{if(document.hidden||!container.getClientRects().length)return;const f=throwFrame((performance.now()-snapshot.startAt)/1000,reduced.matches),blend=snapshot.revealed?f.blend:0;
 hands.forEach((h,index)=>{const choice=snapshot.picks?.[index?'cream':'rose']||'rock';h.fingers.forEach(({base,joints},i)=>{const open=choice==='paper'||choice==='scissors'&&i<2;const bends=open?[0,.08,.05]:[1.35,1.65,1.25];joints.forEach((joint,j)=>joint.rotation.x=[1.35,1.65,1.25][j]+(bends[j]-[1.35,1.65,1.25][j])*blend);base.rotation.z=blend*(choice==='scissors'&&i<2?(i===0?.18:-.18):choice==='paper'?(1.5-i)*.06:0)});h.thumb.rotation.x=1.1-blend*(choice==='paper'?1.25:0);h.thumb.rotation.z=.85+blend*(choice==='paper'?.25:0);h.root.position.y=-.45+(snapshot.revealed?f.bounce:reduced.matches?0:Math.sin(time*.0013)*.035);h.root.rotation.x=-.1-(snapshot.revealed?f.tilt:0);h.root.position.x=h.x+(snapshot.revealed?(index?-1:1)*f.impact*.1:0)});
 label.textContent=snapshot.revealed?f.word:'Choose your throw';container.dataset.phase=snapshot.revealed?(f.blend===1?'revealed':'throwing'):'waiting';renderer.render(scene,camera)});
 return {update(next){snapshot=next},destroy(){renderer.setAnimationLoop(null);resize.disconnect();scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose()}});renderer.dispose();renderer.domElement.remove()}};
}
