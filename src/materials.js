/**
 * VoidVector Mk I — Material definitions
 * DGC SYNTECK AI — Engineering Division
 */
import * as THREE from 'three';

// Carbon-fibre edge tubes — dark woven composite
export const frameMaterial = new THREE.MeshStandardMaterial({
  color:     0x1a1a1a,
  metalness: 0.2,
  roughness: 0.6,
  envMapIntensity: 1.0,
});

// Titanium DMLS vertex nodes
export const nodeMaterial = new THREE.MeshStandardMaterial({
  color:     0x8899aa,
  metalness: 0.9,
  roughness: 0.2,
  envMapIntensity: 1.2,
});

// Negative-space channel faces — transparent tinted
export const channelMaterial = new THREE.MeshStandardMaterial({
  color:       0x00c8ff,
  transparent: true,
  opacity:     0.08,
  side:        THREE.DoubleSide,
  depthWrite:  false,
});

// EDF duct mounts
export const mountMaterial = new THREE.MeshStandardMaterial({
  color:     0x223344,
  metalness: 0.7,
  roughness: 0.3,
});

// Avionics pod
export const coreMaterial = new THREE.MeshStandardMaterial({
  color:     0x0a0f1a,
  metalness: 0.5,
  roughness: 0.4,
  emissive:  0x001133,
  emissiveIntensity: 0.3,
});

// Gimbal bearing rings
export const gimbalMaterial = new THREE.MeshStandardMaterial({
  color:     0xaabbcc,
  metalness: 0.95,
  roughness: 0.1,
});

// Dyneema tension cables
export const cableMaterial = new THREE.MeshStandardMaterial({
  color:     0xddddcc,
  metalness: 0.0,
  roughness: 0.8,
});
