/**
 * VoidVector Mk I — Flight Viewer
 * DGC SYNTECK AI — Engineering Division
 *
 * Controls:
 *   W / S        — Forward / Reverse
 *   A / D        — Strafe Left / Right
 *   Q / E        — Yaw Left / Right
 *   SPACE        — Ascend
 *   SHIFT        — Descend
 *   C            — Toggle follow / free camera
 *   R            — Reset position
 */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadVoidVector } from './voidvector.js';
import { buildCage }      from './cage.js';

const DEG = Math.PI / 180;

// ─── RENDERER ────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement);

// ─── SCENE ───────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06090f);
scene.fog = new THREE.Fog(0x06090f, 30, 80);

// ─── CAMERA ──────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(
  60, window.innerWidth / window.innerHeight, 0.01, 200
);
camera.position.set(0, 1.2, 2.0);

// ─── ORBIT CONTROLS (free-cam mode) ──────────────────────────────────────────
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping  = true;
orbit.dampingFactor  = 0.08;
orbit.minDistance    = 0.3;
orbit.maxDistance    = 40;
orbit.enabled        = false;   // starts in follow-cam mode

// ─── CAMERA STATE ────────────────────────────────────────────────────────────
let followCam = true;
const camPos    = new THREE.Vector3(0, 1.2, 2.0);  // smoothed position
const camLook   = new THREE.Vector3(0, 0.3, 0);    // smoothed look target
const CAM_BACK  = 1.6;   // metres behind craft
const CAM_UP    = 0.55;  // metres above craft

// ─── LIGHTING ────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0x0d1a2e, 3.0));

const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(8, 12, 6);
sun.castShadow = true;
sun.shadow.mapSize.width  = 2048;
sun.shadow.mapSize.height = 2048;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far  = 60;
sun.shadow.camera.left = sun.shadow.camera.bottom = -15;
sun.shadow.camera.right = sun.shadow.camera.top   =  15;
scene.add(sun);

const fill  = new THREE.PointLight(0x00c8ff, 2.5, 8);
fill.position.set(-1, 1, 1.5);
scene.add(fill);

const under = new THREE.PointLight(0x00ffcc, 1.5, 4);
under.position.set(0, -0.3, 0);
scene.add(under);

const rear  = new THREE.PointLight(0x3366ff, 1.0, 6);
rear.position.set(0, 0.5, -2);
scene.add(rear);

// ─── GROUND ──────────────────────────────────────────────────────────────────
// Visual ground plane
const groundGeo = new THREE.PlaneGeometry(120, 120, 1, 1);
const groundMat = new THREE.MeshStandardMaterial({
  color: 0x070d18, roughness: 0.95, metalness: 0.05,
});
const groundMesh = new THREE.Mesh(groundGeo, groundMat);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

// Grid on ground
const grid = new THREE.GridHelper(80, 80, 0x0d2035, 0x091420);
scene.add(grid);

// Landing pad circle at origin
const padGeo = new THREE.RingGeometry(0.35, 0.42, 64);
const padMat = new THREE.MeshBasicMaterial({ color: 0x00c8ff, side: THREE.DoubleSide });
const pad    = new THREE.Mesh(padGeo, padMat);
pad.rotation.x = -Math.PI / 2;
pad.position.y = 0.002;
scene.add(pad);

const pad2Geo = new THREE.RingGeometry(0.55, 0.58, 64);
const pad2    = new THREE.Mesh(pad2Geo, new THREE.MeshBasicMaterial({ color: 0x004466, side: THREE.DoubleSide }));
pad2.rotation.x = -Math.PI / 2;
pad2.position.y = 0.002;
scene.add(pad2);

// ─── PHYSICS ─────────────────────────────────────────────────────────────────
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0) });
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 12;

// Ground physics plane
const groundBody = new CANNON.Body({ mass: 0 });
groundBody.addShape(new CANNON.Plane());
groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
world.addBody(groundBody);

// ─── FLIGHT CONSTANTS ────────────────────────────────────────────────────────
const DRONE_MASS    = 2.8;          // kg AUW
const HOVER_FORCE   = DRONE_MASS * 9.81;  // N — exactly cancels gravity
const MOVE_FORCE    = 22;           // N lateral / longitudinal thrust
const LIFT_FORCE    = 38;           // N extra vertical (above hover)
const SINK_FORCE    = 18;           // N descent (below hover)
const YAW_RATE      = 1.8;          // rad/s yaw speed
const MAX_TILT      = 0.28;         // rad max visual tilt during movement
const LIN_DAMPING   = 0.72;
const ANG_DAMPING   = 0.9995;
const START_HEIGHT  = 0.6;          // m above ground on spawn

// Gimbal constants
const HOVER_INWARD  = 19.47 * DEG;  // base inward gimbal in hover
const MAX_EXTRA_G   = 0.22;         // extra gimbal deflection at full throttle

// ─── INPUT ───────────────────────────────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();

  if (e.code === 'KeyC') toggleCamera();
  if (e.code === 'KeyR') resetDrone();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function toggleCamera() {
  followCam = !followCam;
  orbit.enabled = !followCam;
  if (!followCam && drone) {
    orbit.target.copy(drone.group.position);
    orbit.update();
  }
  document.getElementById('cam-mode').textContent = followCam ? 'FOLLOW' : 'FREE';
}

function resetDrone() {
  if (!drone) return;
  drone.body.position.set(0, START_HEIGHT, 0);
  drone.body.velocity.set(0, 0, 0);
  drone.body.angularVelocity.set(0, 0, 0);
  droneYaw = 0;
}

// ─── DRONE STATE ─────────────────────────────────────────────────────────────
let drone    = null;
let droneYaw = 0;   // managed manually — physics only moves position

// Smooth visual tilt (lerped)
let visualTiltX = 0;
let visualTiltZ = 0;

loadVoidVector(scene, world).then(result => {
  drone = result;

  // Override physics settings for flight
  drone.cage = buildCage(drone.group);
  drone.body.linearDamping  = LIN_DAMPING;
  drone.body.angularDamping = ANG_DAMPING;
  drone.body.position.set(0, START_HEIGHT, 0);

  console.log('[VoidVector] Ready — WASD + Space/Shift to fly, C to toggle cam, R to reset');
});

// ─── FLIGHT LOGIC ────────────────────────────────────────────────────────────
const _fwd   = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up    = new THREE.Vector3(0, 1, 0);

function applyFlightForces(dt) {
  if (!drone) return;

  const fwdKey  = keys['KeyW']      ? 1 : keys['KeyS']         ? -1 : 0;
  const strKey  = keys['KeyD']      ? 1 : keys['KeyA']         ? -1 : 0;
  const upKey   = keys['Space']     ? 1 : keys['ShiftLeft'] || keys['ShiftRight'] ? -1 : 0;
  const yawKey  = keys['KeyQ']      ? 1 : keys['KeyE']         ? -1 : 0;

  // Yaw — rotate droneYaw manually each frame
  droneYaw += yawKey * YAW_RATE * dt;

  // Forward & right vectors in world XZ (rotated by current yaw)
  _fwd.set(-Math.sin(droneYaw), 0, -Math.cos(droneYaw));
  _right.set(Math.cos(droneYaw), 0, -Math.sin(droneYaw));

  // Compose total force
  const fx = (_fwd.x * fwdKey + _right.x * strKey) * MOVE_FORCE;
  const fz = (_fwd.z * fwdKey + _right.z * strKey) * MOVE_FORCE;

  let fy = HOVER_FORCE; // always maintain hover baseline
  if (upKey ===  1) fy += LIFT_FORCE;
  if (upKey === -1) fy -= SINK_FORCE;

  drone.body.applyForce(new CANNON.Vec3(fx, fy, fz));
}

// ─── GIMBAL ANIMATION ────────────────────────────────────────────────────────
function updateGimbals(t) {
  if (!drone) return;

  const fwdKey = keys['KeyW'] ? 1 : keys['KeyS'] ? -1 : 0;
  const strKey = keys['KeyD'] ? 1 : keys['KeyA'] ? -1 : 0;
  const upKey  = keys['Space'] ? 1 : (keys['ShiftLeft'] || keys['ShiftRight']) ? -1 : 0;

  const idle = Math.sin(t * 1.1) * 0.008;

  // T1 Apex — tilts in direction of travel
  drone.thrusters.T1.rotation.x = THREE.MathUtils.lerp(
    drone.thrusters.T1.rotation.x, fwdKey * 0.14, 0.12
  );
  drone.thrusters.T1.rotation.z = THREE.MathUtils.lerp(
    drone.thrusters.T1.rotation.z, -strKey * 0.14, 0.12
  );

  // T2 Base-Front — gimbals outward for forward thrust, inward for reverse
  drone.thrusters.T2.rotation.x = THREE.MathUtils.lerp(
    drone.thrusters.T2.rotation.x,
    HOVER_INWARD + fwdKey * MAX_EXTRA_G + upKey * 0.08 + idle,
    0.12
  );

  // T3 Base-Left-Rear
  drone.thrusters.T3.rotation.x = THREE.MathUtils.lerp(
    drone.thrusters.T3.rotation.x,
    HOVER_INWARD + (strKey > 0 ? MAX_EXTRA_G * 0.6 : 0) + (fwdKey < 0 ? MAX_EXTRA_G * 0.5 : 0) + upKey * 0.08 - idle,
    0.12
  );

  // T4 Base-Right-Rear
  drone.thrusters.T4.rotation.x = THREE.MathUtils.lerp(
    drone.thrusters.T4.rotation.x,
    HOVER_INWARD + (strKey < 0 ? MAX_EXTRA_G * 0.6 : 0) + (fwdKey < 0 ? MAX_EXTRA_G * 0.5 : 0) + upKey * 0.08 + idle,
    0.12
  );
}

// ─── SYNC PHYSICS → THREE.JS ─────────────────────────────────────────────────
const _tiltEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _velDir    = new THREE.Vector3();

function syncDroneVisual() {
  if (!drone) return;

  // Position from physics
  drone.group.position.copy(drone.body.position);

  // Visual tilt — proportional to world-space velocity
  const vel = drone.body.velocity;

  // Decompose velocity into drone-local fwd/right
  const localFwd   = -vel.z * Math.cos(-droneYaw) + vel.x * Math.sin(-droneYaw);
  const localRight =  vel.x * Math.cos(-droneYaw) + vel.z * Math.sin(-droneYaw);

  const targetTiltX = THREE.MathUtils.clamp(-localFwd  * 0.065, -MAX_TILT, MAX_TILT);
  const targetTiltZ = THREE.MathUtils.clamp( localRight * 0.065, -MAX_TILT, MAX_TILT);

  visualTiltX = THREE.MathUtils.lerp(visualTiltX, targetTiltX, 0.08);
  visualTiltZ = THREE.MathUtils.lerp(visualTiltZ, targetTiltZ, 0.08);

  // Build quaternion: yaw + tilt
  _tiltEuler.set(visualTiltX, droneYaw, visualTiltZ, 'YXZ');
  drone.group.quaternion.setFromEuler(_tiltEuler);

  // Move fill/under lights with drone
  fill.position.set(
    drone.group.position.x - 0.6,
    drone.group.position.y + 0.4,
    drone.group.position.z + 0.8
  );
  under.position.set(
    drone.group.position.x,
    drone.group.position.y - 0.3,
    drone.group.position.z
  );
}

// ─── FOLLOW CAMERA ───────────────────────────────────────────────────────────
const _camTarget = new THREE.Vector3();
const _camOffset = new THREE.Vector3();

function updateFollowCamera(dt) {
  if (!drone || !followCam) return;

  // Desired camera position: behind + above craft (rotated by yaw)
  _camOffset.set(
    Math.sin(droneYaw) * CAM_BACK,
    CAM_UP,
    Math.cos(droneYaw) * CAM_BACK
  );
  _camTarget.copy(drone.group.position).add(_camOffset);

  // Lerp camera smoothly
  const speed = 4.0; // higher = tighter follow
  camPos.lerp(_camTarget, Math.min(speed * dt, 1));
  camera.position.copy(camPos);

  // Look slightly above craft centre
  camLook.lerp(
    new THREE.Vector3(drone.group.position.x, drone.group.position.y + 0.1, drone.group.position.z),
    Math.min(6.0 * dt, 1)
  );
  camera.lookAt(camLook);
}

// ─── HUD ─────────────────────────────────────────────────────────────────────
const altEl   = document.getElementById('hud-alt');
const spdEl   = document.getElementById('hud-spd');
const hdgEl   = document.getElementById('hud-hdg');

function updateHUD() {
  if (!drone) return;
  const alt = Math.max(0, drone.body.position.y).toFixed(1);
  const vel = drone.body.velocity;
  const spd = Math.sqrt(vel.x ** 2 + vel.z ** 2).toFixed(1);
  const hdg = ((((-droneYaw * 180 / Math.PI) % 360) + 360) % 360).toFixed(0).padStart(3, '0');
  if (altEl) altEl.textContent = alt + ' m';
  if (spdEl) spdEl.textContent = spd + ' m/s';
  if (hdgEl) hdgEl.textContent = hdg + '°';
}

// ─── RESIZE ──────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── RENDER LOOP ─────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
const FIXED  = 1 / 60;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  applyFlightForces(dt);
  world.step(FIXED, dt, 3);

  syncDroneVisual();
  updateGimbals(clock.getElapsedTime());
  updateFollowCamera(dt);
  updateHUD();

  if (!followCam) orbit.update();
  renderer.render(scene, camera);
}
animate();
