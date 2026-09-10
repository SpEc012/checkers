// The two 3D hands behind Rock Paper Scissors.
//
// Every finger is three stacked joints, so one `blend` value can unfold a fist
// into paper or scissors. The scene is loaded on demand — Three.js is far too
// big to ship with the rest of the arcade.

import * as THREE from 'three';
import { throwFrame } from './match-effects.mjs';

const SKIN = { rose: 0xf18ba4, cream: 0xf4dbb7 };
const FINGER_LENGTHS = [0.35, 0.41, 0.38, 0.29];

/**
 * @param {HTMLElement} container the arena element
 * @param {HTMLElement} label the caption under the hands
 * @returns {{update: (snapshot: object) => void}}
 */
export function createArena(container, label) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
  camera.position.set(0, 1, 12);
  camera.lookAt(0, 0.3, 0);

  scene.add(new THREE.HemisphereLight(0xffeff7, 0x564060, 3));
  const keyLight = new THREE.DirectionalLight(0xffffff, 4);
  keyLight.position.set(-3, 5, 7);
  scene.add(keyLight);

  const sphere = new THREE.SphereGeometry(1, 20, 14);
  const hands = [];

  /** Build one hand: palm, cuff, four jointed fingers and a thumb. */
  function buildHand(color, x, mirror) {
    const root = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.05 });
    root.position.set(x, -0.25, 0);
    root.rotation.z = mirror * -0.18;
    scene.add(root);

    const ellipsoid = (parent, sx, sy, sz, px, py, pz, material = skin) => {
      const mesh = new THREE.Mesh(sphere, material);
      mesh.scale.set(sx, sy, sz);
      mesh.position.set(px, py, pz);
      parent.add(mesh);
      return mesh;
    };

    ellipsoid(root, 0.68, 0.77, 0.3, 0, 0, 0); // palm
    ellipsoid(root, 0.4, 0.48, 0.28, 0, -0.85, 0); // wrist
    const cuff = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    ellipsoid(root, 0.45, 0.19, 0.32, 0, -1.05, 0, cuff);

    const fingers = [];
    for (let i = 0; i < 4; i++) {
      const base = new THREE.Group();
      base.position.set((i - 1.5) * 0.31, 0.56, 0);
      root.add(base);

      const joints = [];
      const length = FINGER_LENGTHS[i];
      let parent = base;
      for (let segment = 0; segment < 3; segment++) {
        const joint = new THREE.Group();
        if (segment) joint.position.y = length;
        parent.add(joint);
        ellipsoid(joint, 0.16, length * 0.62, 0.16, 0, length * 0.45, 0);
        joints.push(joint);
        parent = joint;
      }
      fingers.push({ base, joints });
    }

    const thumb = new THREE.Group();
    thumb.position.set(-0.57, -0.1, 0.1);
    thumb.rotation.z = 0.75;
    root.add(thumb);
    ellipsoid(thumb, 0.23, 0.43, 0.2, 0, 0.25, 0);

    hands.push({ root, fingers, thumb, x });
  }

  buildHand(SKIN.rose, -1.55, -1);
  buildHand(SKIN.cream, 1.55, 1);

  let key = '';
  let start = 0;
  let picks = null;
  let revealed = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const resize = new ResizeObserver(() => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });
  resize.observe(container);

  /** Curl or extend the fingers for a choice, `blend` 0 (fist) → 1 (shape). */
  function pose(hand, choice, blend) {
    hand.fingers.forEach(({ base, joints }, index) => {
      const extended = choice === 'paper' || (choice === 'scissors' && index < 2);
      const bend = extended ? 0 : 1.5;
      for (const joint of joints) joint.rotation.x = 1.5 + (bend - 1.5) * blend;
      base.rotation.z = choice === 'scissors' && index < 2
        ? (index === 0 ? 0.18 : -0.18) * blend
        : choice === 'paper' ? (1.5 - index) * 0.07 * blend : 0;
    });
    hand.thumb.rotation.z = 0.75;
    hand.thumb.rotation.x = choice === 'paper' ? -0.25 * blend : 1.1;
  }

  renderer.setAnimationLoop(time => {
    if (document.hidden || container.getClientRects().length === 0) return;
    const frame = throwFrame((performance.now() - start) / 1000, reduced.matches);

    hands.forEach((hand, index) => {
      const side = index === 0 ? 'rose' : 'cream';
      pose(hand, picks?.[side] || 'rock', revealed ? frame.blend : 0);
      hand.root.position.y = -0.45 + (revealed ? frame.bounce : reduced.matches ? 0 : Math.sin(time * 0.002) * 0.07);
      hand.root.rotation.x = revealed ? -frame.tilt : 0;
      hand.root.position.x = hand.x + (revealed ? (index === 0 ? 1 : -1) * frame.impact * 0.12 : 0);
    });

    label.textContent = revealed ? frame.word : 'Two hearts. One showdown.';
    container.dataset.phase = revealed ? (frame.blend === 1 ? 'revealed' : 'throwing') : 'waiting';
    renderer.render(scene, camera);
  });

  return {
    /** Hand the scene a new round; identical snapshots are ignored. */
    update(snapshot) {
      if (snapshot.key === key) return;
      key = snapshot.key;
      start = snapshot.startAt || 0;
      revealed = snapshot.revealed;
      picks = snapshot.picks;
    },
  };
}
