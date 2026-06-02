/**
 * VoidVector Mk I — Main entry point
 * DGC SYNTECK AI — Engineering Division
 */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadVoidVector } from './voidvector.js';

// ── Renderer ──────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

// ── Scene ─────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080c14);
scene.fog = new THREE.FogExp2(0x080c14, 0.18);

// ── Camera ────────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(
  55, window.innerWidth / window.innerHeight, 0.01, 100
);
camera.position.set(0.6, 0.3, 0.9);

// ── Controls ──────────────────────────────────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping  = true;
controls.dampingFactor  = 0.07;
controls.minDistance    = 0.25;
controls.maxDistance    = 3.5;
controls.target.set(0, 0, 0);   // always orbit around the craft

// ── Lighting ──────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0x111827, 1.5));

const key = new THREE.DirectionalLight(0xffffff, 2.5);
key.position.set(0.5, 1.2, 0.8);
key.castShadow = true;
scene.add(key);

// Cyan channel-glow fill
const fill = new THREE.PointLight(0x00c8ff, 1.8, 4.0);
fill.position.set(-0.4, 0.1, 0.5);
scene.add(fill);

// Ventral under-light (CH-1 thrust wash)
const under = new THREE.PointLight(0x00ffcc, 1.2, 2.0);
under.position.set(0, -0.5, 0);
scene.add(under);

// Rear accent
const rear = new THREE.PointLight(0x4488ff, 0.8, 3.0);
rear.position.set(0, 0.3, -0.8);
scene.add(rear);

// ── Grid (reference plane below craft) ───────────────────────────────────────
const grid = new THREE.GridHelper(4, 40, 0x112233, 0x0a1520);
grid.position.y = -0.55;
scene.add(grid);

// ── Physics (kept for future use, body is kinematic — no gravity effect) ─────
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, 0, 0) });

// ── Load VoidVector ───────────────────────────────────────────────────────────
let drone = null;
loadVoidVector(scene, world).then(result => {
  drone = result;
  // Park the physics body at origin — we drive position from animation, not physics
  drone.body.type = CANNON.Body.KINEMATIC;
  drone.body.position.set(0, 0, 0);
  drone.group.position.set(0, 0, 0);
  console.log('[VoidVector] Loaded — thrusters:', Object.keys(result.thrusters).join(', '));
});

// ── Hover animation constants ─────────────────────────────────────────────────
const HOVER_INWARD_RAD = 19.47 * (Math.PI / 180);  // base thruster gimbal offset
const FLOAT_AMP        = 0.018;   // ± metres of vertical bob
const FLOAT_FREQ       = 0.55;    // Hz  (gentle slow float)
const DRIFT_AMP        = 0.008;   // subtle lateral micro-drift
const AUTO_ROTATE_RATE = 0.12;    // rad/s slow display spin

const clock = new THREE.Clock();

function animateDrone(t) {
  if (!drone) return;

  // ── Hover float — vertical bob ─────────────────────────────────────────────
  const floatY  = Math.sin(t * FLOAT_FREQ  * Math.PI * 2) * FLOAT_AMP;
  const driftX  = Math.sin(t * 0.31 * Math.PI * 2) * DRIFT_AMP;
  const driftZ  = Math.cos(t * 0.27 * Math.PI * 2) * DRIFT_AMP;
  drone.group.position.set(driftX, floatY, driftZ);

  // ── Slow showcase rotation ─────────────────────────────────────────────────
  drone.group.rotation.y = t * AUTO_ROTATE_RATE;

  // ── Gimbal animation ───────────────────────────────────────────────────────
  const idle = Math.sin(t * 1.1) * 0.012; // tiny idle wobble

  // T1 apex — slight nod in sync with float
  drone.thrusters.T1.rotation.z = Math.sin(t * 0.38) * 0.010;
  drone.thrusters.T1.rotation.x = Math.sin(t * 0.26) * 0.008;

  // Base thrusters — held at hover inward angle + idle oscillation
  drone.thrusters.T2.rotation.x = HOVER_INWARD_RAD + idle;
  drone.thrusters.T3.rotation.x = HOVER_INWARD_RAD + idle * 0.7;
  drone.thrusters.T4.rotation.x = HOVER_INWARD_RAD - idle * 0.7;

  // Sync physics body so it stays in place
  drone.body.position.copy(drone.group.position);
}

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Render loop ───────────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  animateDrone(t);
  controls.update();
  renderer.render(scene, camera);
}
animate();
