/**
 * VoidVector Mk I — Exterior Cage Module
 * DGC SYNTECK AI — Engineering Division
 *
 * Four structural cage systems added onto the existing tetrahedron group:
 *
 *   1. DUCT GUARDS     — outer protective ring + 4-spoke cross guard per EDF
 *   2. EDGE COLLARS    — mid-span collar rings on all 6 carbon-fibre edge tubes
 *   3. CHANNEL LATTICE — inner triangular sub-member on each open channel face
 *   4. LANDING SKIDS   — 3 angled legs + foot pads from base vertices T2/T3/T4
 *
 * All geometry is authored at circumradius = 1.0 (normalised).
 * The parent group already has scale.setScalar(SCALE ≈ 0.2571),
 * so physical dimensions are automatically correct.
 *
 * Usage:
 *   import { buildCage } from './cage.js';
 *   loadVoidVector(scene, world).then(({ group }) => buildCage(group, materials));
 */

import * as THREE from 'three';

// ─── SHARED GEOMETRY CONSTANTS (mirror voidvector.js — normalised) ────────────

const S23  = Math.sqrt(2 / 3);
const S2   = Math.sqrt(2) / 3;
const S22  = (2 * Math.sqrt(2)) / 3;

const VERTS = Object.freeze({
  T1: new THREE.Vector3(    0,   1,    0  ),
  T2: new THREE.Vector3(    0,  -1/3,  S22),
  T3: new THREE.Vector3( -S23,  -1/3, -S2 ),
  T4: new THREE.Vector3(  S23,  -1/3, -S2 ),
});

const EDGES = Object.freeze([
  ['T1','T2'], ['T1','T3'], ['T1','T4'],
  ['T2','T3'], ['T3','T4'], ['T2','T4'],
]);

const FACES = Object.freeze([
  { id: 'CH-1', verts: ['T2','T4','T3'] },   // Ventral
  { id: 'CH-2', verts: ['T1','T2','T3'] },   // Dorsal-Front
  { id: 'CH-3', verts: ['T1','T3','T4'] },   // Dorsal-Left-Rear
  { id: 'CH-4', verts: ['T1','T4','T2'] },   // Dorsal-Right-Rear
]);

// ─── MATERIAL DEFAULTS ────────────────────────────────────────────────────────

const DEFAULT_CAGE_MAT = new THREE.MeshStandardMaterial({
  color:     0x1c2c3c,
  metalness: 0.75,
  roughness: 0.35,
});

const DEFAULT_SKID_MAT = new THREE.MeshStandardMaterial({
  color:     0x8899aa,
  metalness: 0.90,
  roughness: 0.20,
});

const DEFAULT_LATTICE_MAT = new THREE.MeshStandardMaterial({
  color:     0x0d1d2d,
  metalness: 0.55,
  roughness: 0.55,
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Returns two orthonormal vectors that span the plane perpendicular to `axis`.
 */
function perpendicularBasis(axis) {
  const a = axis.clone().normalize();
  const perp1 = new THREE.Vector3();
  if (Math.abs(a.y) < 0.85) {
    perp1.crossVectors(a, new THREE.Vector3(0, 1, 0)).normalize();
  } else {
    perp1.crossVectors(a, new THREE.Vector3(1, 0, 0)).normalize();
  }
  const perp2 = new THREE.Vector3().crossVectors(a, perp1).normalize();
  return [perp1, perp2];
}

/**
 * Creates a thin cylinder (bar) from point `a` to point `b`.
 */
function bar(a, b, radius, mat, segs = 6) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len < 1e-6) return null;
  const geom = new THREE.CylinderGeometry(radius, radius, len, segs, 1);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.copy(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

// ─── 1. DUCT GUARDS ──────────────────────────────────────────────────────────
/**
 * Protective guard cage around each vertex-mounted EDF.
 *
 * Geometry per thruster pod:
 *   • Outer guard ring  (R = 0.210, tube r = 0.007)  — main protective hoop
 *   • Secondary ring    (R = 0.172, tube r = 0.005)  — inner hoop at duct lip
 *   • 4 radial spokes   connecting secondary ring to outer ring
 *   • 4 cross-bars      across the duct face (short, in-plane)
 *
 * All rings share the duct-face orientation (perpendicular to radial outward).
 */
function buildDuctGuard(vertexPos, mat) {
  const group = new THREE.Group();
  group.name  = 'duct_guard';

  const outward = vertexPos.clone().normalize();
  const alignQ  = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1), outward
  );

  // Outer protective ring
  const outerRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.210, 0.007, 8, 40),
    mat
  );
  outerRing.quaternion.copy(alignQ);
  outerRing.name = 'guard_outer_ring';
  group.add(outerRing);

  // Inner ring (matches duct lip)
  const innerRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.172, 0.005, 8, 36),
    mat
  );
  innerRing.quaternion.copy(alignQ);
  innerRing.name = 'guard_inner_ring';
  group.add(innerRing);

  // Build spokes + cross-bars using in-plane basis vectors
  const [p1, p2] = perpendicularBasis(outward);
  const OUTER_R  = 0.210;
  const INNER_R  = 0.172;
  const CROSS_R  = 0.090;

  // 4 spokes: inner ring → outer ring at 0°, 90°, 180°, 270°
  [0, 1, 2, 3].forEach(i => {
    const angle  = i * (Math.PI / 2);
    const dir    = p1.clone().multiplyScalar(Math.cos(angle))
                     .addScaledVector(p2, Math.sin(angle));
    const fromPt = dir.clone().multiplyScalar(INNER_R);
    const toPt   = dir.clone().multiplyScalar(OUTER_R);
    const spoke  = bar(fromPt, toPt, 0.005, mat);
    if (spoke) { spoke.name = `spoke_${i}`; group.add(spoke); }
  });

  // 4 short cross-bars across the duct face (45°, 135°, 225°, 315°)
  [0, 1].forEach(i => {
    const angle   = i * (Math.PI / 2) + Math.PI / 4;
    const dir     = p1.clone().multiplyScalar(Math.cos(angle))
                      .addScaledVector(p2, Math.sin(angle));
    const fromPt  = dir.clone().multiplyScalar(-CROSS_R);
    const toPt    = dir.clone().multiplyScalar( CROSS_R);
    const crossBar = bar(fromPt, toPt, 0.004, mat);
    if (crossBar) { crossBar.name = `crossbar_${i}`; group.add(crossBar); }
  });

  group.position.copy(vertexPos);
  return group;
}

// ─── 2. EDGE COLLARS ─────────────────────────────────────────────────────────
/**
 * Mid-span structural collar rings on all 6 carbon-fibre edge tubes.
 *
 * 3 collars per edge at t = 0.25, 0.50, 0.75 along the tube.
 * Centre collar is slightly larger (structural reinforcement band).
 * Collar plane is perpendicular to the edge direction.
 */
function buildEdgeCollars(mat) {
  const group = new THREE.Group();
  group.name  = 'edge_collars';

  const T_POSITIONS = [0.25, 0.50, 0.75];
  const RADII       = [0.034, 0.040, 0.034]; // centre collar wider

  EDGES.forEach(([ka, kb]) => {
    const a   = VERTS[ka];
    const b   = VERTS[kb];
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    const alignQ = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1), dir
    );

    T_POSITIONS.forEach((t, i) => {
      const pos    = new THREE.Vector3().lerpVectors(a, b, t);
      const collar = new THREE.Mesh(
        new THREE.TorusGeometry(RADII[i], 0.005, 8, 24),
        mat
      );
      collar.quaternion.copy(alignQ);
      collar.position.copy(pos);
      collar.name = `collar_${ka}${kb}_${i}`;
      group.add(collar);
    });
  });

  return group;
}

// ─── 3. CHANNEL LATTICE ──────────────────────────────────────────────────────
/**
 * Inner triangular sub-member lattice on each open channel face.
 *
 * For each triangular face A-B-C:
 *   • Midpoints M_AB, M_BC, M_CA computed on each edge
 *   • Inner triangle M_AB → M_BC → M_CA (3 members)
 *   • 3 centroid spokes: face-centroid → each midpoint
 *
 * This creates a 6-member asterisk-in-triangle pattern on each channel face,
 * providing ingestion protection while preserving airflow.
 */
function buildChannelLattice(mat) {
  const group = new THREE.Group();
  group.name  = 'channel_lattice';

  const BAR_R = 0.008;

  FACES.forEach(face => {
    const [va, vb, vc] = face.verts.map(k => VERTS[k]);

    const mAB = new THREE.Vector3().addVectors(va, vb).multiplyScalar(0.5);
    const mBC = new THREE.Vector3().addVectors(vb, vc).multiplyScalar(0.5);
    const mCA = new THREE.Vector3().addVectors(vc, va).multiplyScalar(0.5);
    const cen = new THREE.Vector3()
                  .add(va).add(vb).add(vc).multiplyScalar(1 / 3);

    // Inner triangle
    [[mAB, mBC], [mBC, mCA], [mCA, mAB]].forEach(([p, q], i) => {
      const b = bar(p, q, BAR_R, mat);
      if (b) { b.name = `${face.id}_inner_${i}`; group.add(b); }
    });

    // Centroid spokes
    [mAB, mBC, mCA].forEach((m, i) => {
      const b = bar(cen, m, BAR_R * 0.8, mat);
      if (b) { b.name = `${face.id}_spoke_${i}`; group.add(b); }
    });
  });

  return group;
}

// ─── 4. LANDING SKIDS ────────────────────────────────────────────────────────
/**
 * Angled landing legs from the three base vertices (T2, T3, T4).
 *
 * Each skid:
 *   • Main strut: from vertex, angled 15° outward + downward, length 0.20
 *   • Foot pad  : small disk at strut terminus (horizontal)
 *   • Toe brace : short horizontal member from foot to give a wider stance
 *
 * Skids extend below the base vertex level so the drone rests on them
 * rather than directly on the vertex nodes.
 */
function buildLandingSkids(mat) {
  const group = new THREE.Group();
  group.name  = 'landing_skids';

  const BASE_VERTS = ['T2', 'T3', 'T4'];
  const STRUT_LEN  = 0.20;
  const STRUT_R    = 0.009;
  const PAD_R      = 0.055;
  const PAD_H      = 0.004;

  BASE_VERTS.forEach(key => {
    const vPos    = VERTS[key].clone();
    const skidGrp = new THREE.Group();
    skidGrp.name  = `skid_${key}`;

    // Outward direction: vertex projected onto XZ plane, normalised
    const outXZ = new THREE.Vector3(vPos.x, 0, vPos.z).normalize();

    // Strut direction: 15° outward from vertical (angled out + down)
    const strutDir = outXZ.clone().multiplyScalar(Math.sin(15 * Math.PI / 180))
                       .add(new THREE.Vector3(0, -Math.cos(15 * Math.PI / 180), 0));
    strutDir.normalize();

    const strutEnd = vPos.clone().addScaledVector(strutDir, STRUT_LEN);

    // Main strut
    const strut = bar(vPos, strutEnd, STRUT_R, mat);
    if (strut) { strut.name = 'strut'; skidGrp.add(strut); }

    // Foot pad (horizontal disk at strut terminus)
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(PAD_R, PAD_R, PAD_H, 20),
      mat
    );
    pad.position.copy(strutEnd);
    pad.name = 'foot_pad';
    skidGrp.add(pad);

    // Toe brace: short outward member from foot pad for wider stance
    const braceEnd = strutEnd.clone().addScaledVector(outXZ, 0.06);
    const brace    = bar(strutEnd, braceEnd, STRUT_R * 0.7, mat);
    if (brace) { brace.name = 'toe_brace'; skidGrp.add(brace); }

    group.add(skidGrp);
  });

  return group;
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Builds all exterior cage components and attaches them to the VoidVector group.
 *
 * @param {THREE.Group} droneGroup  - The group returned by loadVoidVector().
 * @param {object}      [mats]      - Optional material overrides.
 *   mats.cage    — duct guards + edge collars
 *   mats.lattice — channel lattice members
 *   mats.skid    — landing skids
 *
 * @returns {object}  Named references to each sub-group:
 *   { ductGuards, edgeCollars, channelLattice, landingSkids, cageGroup }
 */
export function buildCage(droneGroup, mats = {}) {
  const cageMat    = mats.cage    ?? DEFAULT_CAGE_MAT;
  const latticeMat = mats.lattice ?? DEFAULT_LATTICE_MAT;
  const skidMat    = mats.skid    ?? DEFAULT_SKID_MAT;

  // ── Duct guards (one per vertex T1–T4) ──────────────────────────────────
  const ductGuards = new THREE.Group();
  ductGuards.name  = 'duct_guards';
  Object.entries(VERTS).forEach(([label, pos]) => {
    ductGuards.add(buildDuctGuard(pos, cageMat));
  });

  // ── Edge collars (all 6 edges) ───────────────────────────────────────────
  const edgeCollars = buildEdgeCollars(cageMat);

  // ── Channel lattice (all 4 faces) ────────────────────────────────────────
  const channelLattice = buildChannelLattice(latticeMat);

  // ── Landing skids (T2, T3, T4) ───────────────────────────────────────────
  const landingSkids = buildLandingSkids(skidMat);

  // Wrap in a single cage group for scene-graph clarity
  const cageGroup = new THREE.Group();
  cageGroup.name  = 'exterior_cage';
  cageGroup.add(ductGuards, edgeCollars, channelLattice, landingSkids);

  droneGroup.add(cageGroup);

  return { ductGuards, edgeCollars, channelLattice, landingSkids, cageGroup };
}
