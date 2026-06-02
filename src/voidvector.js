/**
 * VoidVector Mk I — Three.js / Cannon-es scene loader
 * DGC SYNTECK AI — Engineering Division
 *
 * Geometry is a REGULAR TETRAHEDRON (4 vertices, 6 edges, 4 faces).
 * The original file built an octahedron (6 verts, 12 edges) — now corrected.
 *
 * Coordinate conventions (body-fixed, circumradius = 1.0 normalised):
 *   T1 — Apex       ( 0,       +1,       0      )
 *   T2 — Base-Front ( 0,       −0.333,  +0.943  )
 *   T3 — Base-Left  (−0.816,  −0.333,  −0.471  )
 *   T4 — Base-Right (+0.816,  −0.333,  −0.471  )
 *
 * Physical scale: edge length 420 mm → circumradius 257.1 mm
 *   SCALE = 0.2571  (1 Three.js unit = 257.1 mm)
 */

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  frameMaterial,   // carbon-fibre edge tubes
  nodeMaterial,    // titanium DMLS vertex nodes
  channelMaterial, // transparent channel faces
  mountMaterial,   // EDF duct rings
  coreMaterial,    // avionics pod
  gimbalMaterial,  // gimbal bearing rings  (add to materials.js)
  cableMaterial,   // Dyneema tension cables (add to materials.js)
} from './materials.js';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

/** Physical edge length in metres (420 mm). */
const EDGE_LENGTH_M = 0.420;

/** Circumradius of a regular tetrahedron: R = edge × √(3/8). */
const CIRCUMRADIUS = EDGE_LENGTH_M * Math.sqrt(3 / 8); // ≈ 0.2571 m

/**
 * Uniform scale applied to the THREE.Group.
 * All geometry is authored at circumradius = 1.0;
 * multiplying by SCALE converts to physical metres.
 */
const SCALE = CIRCUMRADIUS; // 0.2571

// ─── TETRAHEDRAL VERTEX POSITIONS (circumradius = 1.0) ───────────────────────

const S23 = Math.sqrt(2 / 3);  // ≈ 0.8165
const S2  = Math.sqrt(2) / 3;  // ≈ 0.4714
const S22 = (2 * Math.sqrt(2)) / 3; // ≈ 0.9428

/**
 * The four thruster vertices, keyed by spec designation.
 *   T1 – Apex (primary lift)
 *   T2 – Base-Front
 *   T3 – Base-Left-Rear
 *   T4 – Base-Right-Rear
 */
const VERTS = Object.freeze({
  T1: new THREE.Vector3(    0,       1,      0   ),
  T2: new THREE.Vector3(    0,  -1 / 3,   S22  ),
  T3: new THREE.Vector3( -S23,  -1 / 3,  -S2  ),
  T4: new THREE.Vector3(  S23,  -1 / 3,  -S2  ),
});

/**
 * The six structural edges (pairs of vertex keys).
 * Apex edges: T1-T2, T1-T3, T1-T4
 * Base edges:  T2-T3, T3-T4, T2-T4
 */
const EDGES = Object.freeze([
  ['T1', 'T2'],
  ['T1', 'T3'],
  ['T1', 'T4'],
  ['T2', 'T3'],
  ['T3', 'T4'],
  ['T2', 'T4'],
]);

/**
 * The four negative-space channel faces.
 * Winding order is CCW when viewed from outside (outward normals).
 *   CH-1  Ventral          – primary downwash (faces down)
 *   CH-2  Dorsal-Front     – ram-air intake in forward flight
 *   CH-3  Dorsal-Left-Rear – lateral port
 *   CH-4  Dorsal-Right-Rear– lateral starboard
 */
const FACES = Object.freeze([
  { id: 'CH-1', label: 'Ventral',          verts: ['T2', 'T4', 'T3'] },
  { id: 'CH-2', label: 'Dorsal-Front',     verts: ['T1', 'T2', 'T3'] },
  { id: 'CH-3', label: 'Dorsal-Left-Rear', verts: ['T1', 'T3', 'T4'] },
  { id: 'CH-4', label: 'Dorsal-Right-Rear',verts: ['T1', 'T4', 'T2'] },
]);

// ─── GEOMETRY BUILDERS ───────────────────────────────────────────────────────

/**
 * Carbon-fibre structural edge tube.
 * Tube OD 14 mm → radius 0.054 normalised (14 / 257.1 ≈ 0.054).
 */
function buildEdgeTube(a, b, material) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();

  const geom = new THREE.CylinderGeometry(0.027, 0.027, len, 12, 1);
  const mesh = new THREE.Mesh(geom, material);
  mesh.position.copy(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.name = `edge_${a.toArray().join('_')}`;
  return mesh;
}

/**
 * Titanium DMLS vertex node sphere.
 * Node radius ~22 mm → 0.086 normalised.
 */
function buildVertexNode(position, label, material) {
  const geom = new THREE.SphereGeometry(0.050, 20, 20);
  const mesh = new THREE.Mesh(geom, material);
  mesh.position.copy(position);
  mesh.name = `node_${label}`;
  return mesh;
}

/**
 * Triangular negative-space channel face (transparent, double-sided).
 * Uses a dedicated clone of channelMaterial so side can be overridden
 * without affecting other faces.
 */
function buildChannelFace(a, b, c, id, material) {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(
    new Float32Array([
      a.x, a.y, a.z,
      b.x, b.y, b.z,
      c.x, c.y, c.z,
    ]), 3
  ));
  geom.computeVertexNormals();

  const mat = material.clone();
  mat.side = THREE.DoubleSide;

  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = id;
  return mesh;
}

/**
 * Vertex-mounted ducted EDF thruster pod.
 *
 * Each pod is a small THREE.Group containing:
 *   • duct      – main torus ring (EDF housing), oriented so its axis
 *                 points radially outward from the tetrahedron centroid
 *   • gimbal_p  – pitch-axis gimbal ring (slightly larger)
 *   • gimbal_y  – yaw-axis gimbal ring  (rotated 90° about outward axis)
 *
 * The ±22° gimbal range can be animated by applying Euler rotations to
 * the group's rotation about the pitch/yaw world axes.
 */
function buildThrusterPod(vertex, label, ductMat, gimbalMat) {
  const outward = vertex.clone().normalize();
  const podGroup = new THREE.Group();
  podGroup.position.copy(vertex);
  podGroup.name = `thruster_${label}`;

  // Alignment quaternion: default torus axis (0,0,1) → outward direction
  const alignQ = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1), outward
  );

  // EDF duct ring  — 76 mm fan diameter → 0.148 normalised; tube 0.022
  const ductGeom = new THREE.TorusGeometry(0.148, 0.022, 14, 40);
  const duct = new THREE.Mesh(ductGeom, ductMat);
  duct.quaternion.copy(alignQ);
  duct.name = 'duct';
  podGroup.add(duct);

  // Inner fan disk (visual placeholder for 7-blade impeller)
  const diskGeom = new THREE.CircleGeometry(0.120, 7);
  const disk = new THREE.Mesh(diskGeom, ductMat);
  disk.quaternion.copy(alignQ);
  disk.name = 'impeller_disk';
  podGroup.add(disk);

  // Pitch gimbal ring
  const g1Geom = new THREE.TorusGeometry(0.170, 0.010, 10, 40);
  const gimbalPitch = new THREE.Mesh(g1Geom, gimbalMat);
  gimbalPitch.quaternion.copy(alignQ);
  gimbalPitch.name = 'gimbal_pitch';
  podGroup.add(gimbalPitch);

  // Yaw gimbal ring — 90° about outward axis relative to pitch ring
  const g2Geom = new THREE.TorusGeometry(0.170, 0.010, 10, 40);
  const gimbalYaw = new THREE.Mesh(g2Geom, gimbalMat);
  const yawQ = new THREE.Quaternion().setFromAxisAngle(outward, Math.PI / 2);
  gimbalYaw.quaternion.multiplyQuaternions(yawQ, alignQ);
  gimbalYaw.name = 'gimbal_yaw';
  podGroup.add(gimbalYaw);

  return podGroup;
}

/**
 * Dyneema tension cable from centroid origin to a vertex.
 * Physical diameter ~1.5 mm → 0.006 normalised.
 */
function buildTensionCable(target, material) {
  const origin = new THREE.Vector3(0, 0, 0);
  const dir = target.clone();      // from origin, so dir = target position
  const len = dir.length();

  const geom = new THREE.CylinderGeometry(0.006, 0.006, len, 6, 1);
  const mesh = new THREE.Mesh(geom, material);
  mesh.position.copy(dir.clone().multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.name = 'cable';
  return mesh;
}

/**
 * Avionics pod at geometric centroid (origin).
 * Physical radius ~40 mm → 0.156 normalised.
 */
function buildAvionicsPod(material) {
  const geom = new THREE.SphereGeometry(0.156, 24, 24);
  const mesh = new THREE.Mesh(geom, material);
  mesh.name = 'avionics_pod';
  return mesh;
}

// ─── PHYSICS BODY ────────────────────────────────────────────────────────────

/**
 * Creates a CANNON.ConvexPolyhedron that exactly matches the tetrahedral
 * airframe. All vertices are scaled to physical metres.
 *
 * Face winding matches THREE.js outward-normal convention (CCW from outside).
 */
function buildPhysicsBody(world) {
  const physVerts = Object.values(VERTS).map(v =>
    new CANNON.Vec3(v.x * SCALE, v.y * SCALE, v.z * SCALE)
  );

  // Face index arrays — CCW outward winding
  // Vertex index order: 0=T1, 1=T2, 2=T3, 3=T4
  const faces = [
    [1, 3, 2],   // CH-1  Ventral
    [0, 1, 2],   // CH-2  Dorsal-Front
    [0, 2, 3],   // CH-3  Dorsal-Left-Rear
    [0, 3, 1],   // CH-4  Dorsal-Right-Rear
  ];

  const shape = new CANNON.ConvexPolyhedron({ vertices: physVerts, faces });

  const body = new CANNON.Body({
    mass: 2.8,                                   // kg AUW per spec
    shape,
    linearDamping:  0.05,
    angularDamping: 0.10,
    position: new CANNON.Vec3(0, 0, 0),
  });

  world.addBody(body);
  return body;
}

// ─── PUBLIC LOADER ───────────────────────────────────────────────────────────

/**
 * Builds and adds the full VoidVector Mk I assembly to the scene.
 *
 * @param {THREE.Scene}  scene  - Target Three.js scene.
 * @param {CANNON.World} world  - Target Cannon-es physics world.
 * @param {object}       [overrides] - Optional material overrides.
 *
 * @returns {{ group: THREE.Group, body: CANNON.Body, thrusters: object }}
 *
 * Returned `thrusters` map (key = 'T1'…'T4') gives direct access to
 * each THREE.Group so gimbal animations can be driven externally:
 *   thrusters.T2.rotation.x = pitchAngleRad; // ±0.384 rad = ±22°
 */
export async function loadVoidVector(scene, world, overrides = {}) {
  const mat = {
    frame:   overrides.frame   ?? frameMaterial,
    node:    overrides.node    ?? nodeMaterial,
    channel: overrides.channel ?? channelMaterial,
    mount:   overrides.mount   ?? mountMaterial,
    core:    overrides.core    ?? coreMaterial,
    gimbal:  overrides.gimbal  ?? gimbalMaterial  ?? mountMaterial,
    cable:   overrides.cable   ?? cableMaterial   ?? nodeMaterial,
  };

  const group = new THREE.Group();
  group.name  = 'VoidVector_Mk_I';
  group.scale.setScalar(SCALE);   // normalised units → physical metres

  // ── 1. Structural edge tubes (6) ──────────────────────────────────────────
  for (const [keyA, keyB] of EDGES) {
    group.add(buildEdgeTube(VERTS[keyA], VERTS[keyB], mat.frame));
  }

  // ── 2. Vertex nodes / titanium DMLS joints (4) ───────────────────────────
  for (const [label, pos] of Object.entries(VERTS)) {
    group.add(buildVertexNode(pos, label, mat.node));
  }

  // ── 3. Negative-space channel faces (4) ──────────────────────────────────
  for (const face of FACES) {
    const [a, b, c] = face.verts.map(k => VERTS[k]);
    group.add(buildChannelFace(a, b, c, face.id, mat.channel));
  }

  // ── 4. Vertex-mounted thruster pods (4) ──────────────────────────────────
  const thrusters = {};
  for (const [label, pos] of Object.entries(VERTS)) {
    const pod = buildThrusterPod(pos, label, mat.mount, mat.gimbal);
    thrusters[label] = pod;
    group.add(pod);
  }

  // ── 5. Dyneema tension cables — centroid → each vertex (4) ───────────────
  for (const pos of Object.values(VERTS)) {
    group.add(buildTensionCable(pos, mat.cable));
  }

  // ── 6. Avionics pod at geometric centroid ─────────────────────────────────
  group.add(buildAvionicsPod(mat.core));

  scene.add(group);

  // ── 7. Physics body (ConvexPolyhedron tetrahedron, 2.8 kg) ───────────────
  const body = buildPhysicsBody(world);

  return { group, body, thrusters };
}
