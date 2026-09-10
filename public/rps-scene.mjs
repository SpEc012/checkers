// The two hands behind Rock Paper Scissors.
//
// Each hand is built the way a hand is built: a forearm, a palm made of five
// metacarpal bones with a thumb mound beside them, four fingers of three
// tapering phalanges, and a thumb with its own three joints. Every joint is a
// nested group rotating on one axis, so a single "openness" number per finger
// carries a fist into paper or scissors — and because the fingers open in
// sequence rather than together, the reveal reads as a hand rather than a
// switch being flipped.
//
// Loaded on demand: Three.js is far too big to ship with the rest of the
// arcade.

import * as THREE from 'three';
import { throwFrame, fingerOpen } from './match-effects.mjs';

const SKIN = { rose: 0xf0899f, cream: 0xf2d7b4 };
const NAIL = { rose: 0xffd3dc, cream: 0xfff0d9 };

/**
 * Finger layout on the palm, in hand-local units. `x` runs across the palm and
 * is mirrored per hand; `y` is the height of the knuckle, which arcs so the
 * middle finger sits highest.
 */
const FINGERS = [
  { key: 'index', x: -0.40, y: 0.60, z: 0.02, radius: 0.115, bones: [0.34, 0.24, 0.17], fan: -0.13 },
  { key: 'middle', x: -0.135, y: 0.66, z: 0.005, radius: 0.122, bones: [0.38, 0.27, 0.19], fan: -0.04 },
  { key: 'ring', x: 0.135, y: 0.63, z: -0.015, radius: 0.113, bones: [0.35, 0.25, 0.18], fan: 0.06 },
  { key: 'pinky', x: 0.395, y: 0.54, z: -0.04, radius: 0.096, bones: [0.27, 0.19, 0.15], fan: 0.16 },
];

// Joint angles, in radians, for a closed fist and for an open hand. A relaxed
// open finger keeps a little curve — dead straight looks like a glove.
const CURLED = [1.48, 1.78, 1.12];
const OPEN = [0.06, 0.11, 0.09];

// Which fingers are extended for each throw.
const EXTENDED = {
  rock: [false, false, false, false],
  paper: [true, true, true, true],
  scissors: [true, true, false, false],
};

/**
 * The thumb per throw. `root` orients the whole thumb (pitch, swing across the
 * palm, spread away from it) and `curl` bends its two upper joints. The swing
 * and spread are mirrored per hand; the pitch is not.
 */
const THUMB = {
  rock: { root: [-0.34, 0.58, 1.02], curl: [1.02, 0.72] },
  paper: { root: [-0.12, -0.10, 1.16], curl: [0.10, 0.08] },
  scissors: { root: [-0.28, 0.46, 1.08], curl: [0.88, 0.62] },
};

const UP = new THREE.Vector3(0, 1, 0);
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * @param {HTMLElement} container the arena element
 * @param {HTMLElement} label the caption under the hands
 * @returns {{update: (snapshot: object) => void, dispose: () => void}}
 */
export function createArena(container, label) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
  camera.position.set(0, 0.95, 9.5);
  camera.lookAt(0, 0.42, 0);

  // Soft room light, a warm key from the upper left, a cool fill, and a rim
  // from behind that lifts the silhouettes off the background.
  scene.add(new THREE.HemisphereLight(0xfff0f6, 0x50333f, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.9);
  key.position.set(-3.4, 4.6, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffd9e6, 0.8);
  fill.position.set(4.2, 0.6, 3.4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xfff2f6, 2.1);
  rim.position.set(0.4, 2.6, -5);
  scene.add(rim);

  const disposables = [];
  const geometry = {
    /** A capsule of exactly this length, cached by shape. */
    bone(radius, length) {
      const cacheKey = `${radius.toFixed(3)}:${length.toFixed(3)}`;
      geometry.cache ??= new Map();
      if (!geometry.cache.has(cacheKey)) {
        const capsule = new THREE.CapsuleGeometry(radius, Math.max(0.001, length), 5, 14);
        disposables.push(capsule);
        geometry.cache.set(cacheKey, capsule);
      }
      return geometry.cache.get(cacheKey);
    },
    blob: new THREE.SphereGeometry(1, 18, 14),
  };
  disposables.push(geometry.blob);

  /** A bone laid between two points, the way a metacarpal runs. */
  function boneBetween(parent, from, to, radius, material) {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const span = end.clone().sub(start);
    const mesh = new THREE.Mesh(geometry.bone(radius, span.length()), material);
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(UP, span.clone().normalize());
    parent.add(mesh);
    return mesh;
  }

  function blob(parent, scale, position, material, rotation = [0, 0, 0]) {
    const mesh = new THREE.Mesh(geometry.blob, material);
    mesh.scale.set(...scale);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    parent.add(mesh);
    return mesh;
  }

  const hands = [];

  /**
   * Build one hand. `side` is -1 or 1 and mirrors it across the palm, so both
   * hands are real geometry rather than a negatively scaled copy.
   */
  function buildHand(tone, x, side) {
    const skin = new THREE.MeshPhysicalMaterial({
      color: SKIN[tone],
      roughness: 0.62,
      metalness: 0,
      sheen: 0.55,
      sheenRoughness: 0.75,
      sheenColor: new THREE.Color(0xffc6d2),
    });
    const nailMaterial = new THREE.MeshPhysicalMaterial({
      color: NAIL[tone],
      roughness: 0.32,
      clearcoat: 0.5,
      clearcoatRoughness: 0.4,
    });
    const cuffMaterial = new THREE.MeshStandardMaterial({ color: 0xfff7f3, roughness: 0.86 });
    disposables.push(skin, nailMaterial, cuffMaterial);

    const root = new THREE.Group();
    root.position.set(x, -0.28, 0);
    scene.add(root);

    // A hand is not a flat card: angle it slightly towards the viewer.
    const rest = { x: -0.06, y: side * 0.2, z: side * -0.05 };
    root.rotation.set(rest.x, rest.y, rest.z);

    // Forearm and sleeve, running out of the bottom of the frame.
    boneBetween(root, [0, -0.55, 0], [side * 0.12, -3.2, -0.25], 0.31, skin);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.42, 22, 1, true), cuffMaterial);
    disposables.push(cuff.geometry);
    cuff.material.side = THREE.DoubleSide;
    cuff.position.set(side * 0.03, -1.0, -0.06);
    cuff.rotation.z = side * 0.03;
    root.add(cuff);

    // Palm: one metacarpal per finger, a thumb mound, and a little padding at
    // the pinky edge.
    const palm = new THREE.Group();
    root.add(palm);
    for (const finger of FINGERS) {
      boneBetween(
        palm,
        [finger.x * side * 0.42, -0.22, finger.z * 0.5],
        [finger.x * side, finger.y - 0.06, finger.z],
        0.145,
        skin,
      );
    }
    blob(palm, [0.56, 0.44, 0.21], [side * 0.01, 0.22, 0], skin); // the flat of the palm
    blob(palm, [0.44, 0.26, 0.2], [0, -0.16, 0], skin); // heel, blending into the wrist
    blob(palm, [0.19, 0.3, 0.18], [side * 0.45, 0.14, -0.03], skin); // pinky edge
    blob(palm, [0.24, 0.31, 0.2], [side * -0.33, 0.02, 0.07], skin); // thumb mound

    // Four fingers, each three joints deep.
    const fingers = FINGERS.map(finger => {
      const base = new THREE.Group();
      base.position.set(finger.x * side, finger.y, finger.z);
      palm.add(base);

      const joints = [];
      let parent = base;
      finger.bones.forEach((length, index) => {
        const joint = new THREE.Group();
        if (index) joint.position.y = finger.bones[index - 1];
        parent.add(joint);

        const radius = finger.radius * (1 - index * 0.12);
        const bone = new THREE.Mesh(geometry.bone(radius, length), skin);
        bone.position.y = length / 2;
        joint.add(bone);

        if (index === finger.bones.length - 1) {
          const nail = blob(joint, [radius * 0.62, radius * 0.85, radius * 0.3], [0, length * 0.66, radius * 0.78], nailMaterial);
          nail.rotation.x = -0.25;
        }
        joints.push(joint);
        parent = joint;
      });
      return { base, joints, fan: finger.fan * side };
    });

    // The thumb: metacarpal, then two joints, swung out from the palm.
    const thumbRoot = new THREE.Group();
    thumbRoot.position.set(side * -0.4, 0.04, 0.13);
    palm.add(thumbRoot);

    const thumbJoints = [];
    const thumbBones = [0.32, 0.24, 0.17];
    let thumbParent = thumbRoot;
    thumbBones.forEach((length, index) => {
      const joint = new THREE.Group();
      if (index) joint.position.y = thumbBones[index - 1];
      thumbParent.add(joint);
      const radius = 0.155 - index * 0.02;
      const bone = new THREE.Mesh(geometry.bone(radius, length), skin);
      bone.position.y = length / 2;
      joint.add(bone);
      if (index === thumbBones.length - 1) {
        const nail = blob(joint, [radius * 0.62, radius * 0.85, radius * 0.3], [0, length * 0.62, radius * 0.78], nailMaterial);
        nail.rotation.x = -0.25;
      }
      thumbJoints.push(joint);
      thumbParent = joint;
    });

    hands.push({ root, palm, fingers, thumb: { root: thumbRoot, joints: thumbJoints }, x, side, rest });
  }

  buildHand('rose', -1.62, -1);
  buildHand('cream', 1.62, 1);

  let key3 = '';
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

  /**
   * Set one finger between a fist (0) and its shape (1). `open` may go a little
   * past 1 during the snap, which is the overshoot that sells the reveal.
   */
  function poseFinger(finger, index, choice, open) {
    const extended = EXTENDED[choice][index];
    finger.joints.forEach((joint, depth) => {
      const target = extended ? OPEN[depth] : CURLED[depth];
      joint.rotation.x = lerp(CURLED[depth], target, open);
    });
    // Paper fans the hand out; scissors splits the two raised fingers apart.
    const spread = choice === 'paper' ? finger.fan
      : choice === 'scissors' && index < 2 ? (index === 0 ? -0.26 : 0.2) * finger.fan / Math.abs(finger.fan || 1)
        : 0;
    finger.base.rotation.z = spread * Math.min(1, open);
  }

  function poseThumb(thumb, choice, open, side) {
    const from = THUMB.rock;
    const to = THUMB[choice];
    thumb.root.rotation.set(
      lerp(from.root[0], to.root[0], open),
      side * lerp(from.root[1], to.root[1], open),
      side * lerp(from.root[2], to.root[2], open),
    );
    thumb.joints[1].rotation.x = lerp(from.curl[0], to.curl[0], open);
    thumb.joints[2].rotation.x = lerp(from.curl[1], to.curl[1], open);
  }

  renderer.setAnimationLoop(time => {
    if (document.hidden || container.getClientRects().length === 0) return;
    const frame = throwFrame((performance.now() - start) / 1000, reduced.matches);
    const calm = reduced.matches;
    const breathe = calm ? 0 : Math.sin(time * 0.0016) * 0.055;

    hands.forEach((hand, index) => {
      const tone = index === 0 ? 'rose' : 'cream';
      const choice = picks?.[tone] || 'rock';
      const towards = index === 0 ? 1 : -1;

      hand.fingers.forEach((finger, position) => {
        const base = revealed ? fingerOpen(frame.sinceShoot, position) : 0;
        // The overshoot only applies to fingers that are actually opening.
        poseFinger(finger, position, choice, base * (1 + frame.snap * 0.12));
      });
      poseThumb(hand.thumb, choice, revealed ? frame.blend : 0, hand.side);

      hand.root.position.y = -0.28 + (revealed ? frame.bounce : breathe);
      hand.root.position.x = hand.x + (revealed ? towards * frame.impact * 0.16 : 0);
      hand.root.rotation.x = hand.rest.x - (revealed ? frame.tilt : breathe * 0.25);
      hand.root.rotation.z = hand.rest.z
        + (revealed ? hand.side * (frame.wrist + frame.settle * 0.12) : Math.sin(time * 0.0011 + index) * 0.03);
      hand.root.rotation.y = hand.rest.y + (revealed ? towards * frame.snap * 0.1 : 0);
    });

    // A gentle drift, and a small push in on the reveal.
    camera.position.x = calm ? 0 : Math.sin(time * 0.00016) * 0.32;
    camera.position.z = 9.5 - (revealed ? frame.impact * 0.65 : 0);
    camera.lookAt(0, 0.42, 0);

    label.textContent = revealed ? frame.word : 'Two hearts. One showdown.';
    container.dataset.phase = revealed ? (frame.blend === 1 ? 'revealed' : 'throwing') : 'waiting';
    renderer.render(scene, camera);
  });

  return {
    /** Hand the scene a new round; identical snapshots are ignored. */
    update(snapshot) {
      if (snapshot.key === key3) return;
      key3 = snapshot.key;
      start = snapshot.startAt || 0;
      revealed = snapshot.revealed;
      picks = snapshot.picks;
    },

    /** Release the GPU resources — the arena outlives most rounds, not tabs. */
    dispose() {
      renderer.setAnimationLoop(null);
      resize.disconnect();
      for (const item of disposables) item.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
