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
renderer.setPixelRatio(window.devicePixelRatio);
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
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0.6, 0.4, 0.9);

// ── Controls ──────────────────────────────────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping  = true;
controls.dampingFactor  = 0.08;
controls.minDistance    = 0.3;
controls.maxDistance    = 4.0;

// ── Lighting ──────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0x111827, 1.5));

const key = new THREE.DirectionalLight(0xffffff, 2.5);
key.position.set(0.5, 1.2, 0.8);
key.castShadow = true;
scene.add(key);

const fill = new THREE.PointLight(0x00c8ff, 1.8, 4.0);
fill.position.set(-0.4, 0.1, 0.5);
scene.add(fill);

const under = new THREE.PointLight(0x00ffcc, 1.2, 2.0);
under.position.set(0, -0.5, 0);
scene.add(under);

const rear = new THREE.PointLight(0x4488ff, 0.8, 3.0);
rear.position.set(0, 0.3, -0.8);
scene.add(rear);

// ── Grid ──────────────────────────────────────────────────────────────────────
const grid = new THREE.GridHelper(4, 40, 0x112233, 0x0a1520);
grid.position.y = -0.5;
scene.add(grid);

// ── Physics ───────────────────────────────────────────────────────────────────
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0) });
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 10;

// ── Load VoidVector ───────────────────────────────────────────────────────────
let drone = null;
loadVoidVector(scene, world).then(result => {
  drone = result;
  console.log('[VoidVector] Loaded — thrusters:', Object.keys(result.thrusters).join(', '));
});

// ── Gimbal animation ──────────────────────────────────────────────────────────
const HOVER_INWARD_RAD = 19.47 * (Math.PI / 180);
const clock = new THREE.Clock();

function animateGimbals(t) {
  if (!drone) return;
  const idle = Math.sin(t * 0.6) * 0.015;
  drone.thrusters.T1.rotation.z = Math.sin(t * 0.4) * 0.012;
  drone.thrusters.T2.rotation.x = HOVER_INWARD_RAD + idle;
  drone.thrusters.T3.rotation.x = HOVER_INWARD_RAD + idle;
  drone.thrusters.T4.rotation.x = HOVER_INWARD_RAD + idle;
}

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Render loop ───────────────────────────────────────────────────────────────
const FIXED_STEP = 1 / 60;
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  world.step(FIXED_STEP);
  if (drone) {
    drone.group.position.copy(drone.body.position);
    drone.group.quaternion.copy(drone.body.quaternion);
    animateGimbals(t);
  }
  controls.update();
  renderer.render(scene, camera);
}
animate();
