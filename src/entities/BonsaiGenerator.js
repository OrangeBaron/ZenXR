/**
 * Genera proceduralmente un bonsai stilizzato tramite un sistema di
 * ramificazione ricorsivo (L-System semplificato), ed espone la sua
 * serializzazione/deserializzazione per la persistenza dello stato.
 * La generazione delle texture è delegata a ProceduralTextureFactory.
 */
import * as THREE from 'three';
import { createMatcapTexture } from '../utils/MatcapTextureFactory.js';
import { serializeGeometryPositions, geometryFromPositions } from '../utils/GeometrySerializer.js';
import { barkBaseTexture, leafBaseTexture } from '../utils/ProceduralTextureFactory.js';

const barkMaterial = new THREE.MeshMatcapMaterial({
  matcap: createMatcapTexture(0x5a3d2b),
  map: barkBaseTexture,
  bumpMap: barkBaseTexture,
  bumpScale: 0.015,
  flatShading: true,
});

const LEAF_MATCAP = createMatcapTexture(0xe4e4e0);

const UP_AXIS = new THREE.Vector3(0, 1, 0);
const TILT_AXIS = new THREE.Vector3(1, 0, 0);

const TRUNK_SEGMENTS = 3;
const BEND_STRENGTH = 0.34;

function createSegmentedLimb({ length, baseRadius, tipRadius, segments, bendStrength }) {
  const root = new THREE.Group();
  let current = root;
  const segmentLength = length / segments;

  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const r0 = THREE.MathUtils.lerp(baseRadius, tipRadius, t0) * (0.88 + Math.random() * 0.24);
    const r1 = THREE.MathUtils.lerp(baseRadius, tipRadius, t1) * (0.88 + Math.random() * 0.24);

    const geometry = new THREE.CylinderGeometry(r1, r0, segmentLength, 6, 1);
    geometry.translate(0, segmentLength / 2, 0);
    const mesh = new THREE.Mesh(geometry, barkMaterial);
    mesh.castShadow = true;
    mesh.userData.kind = 'branch';
    mesh.userData.physics = {
      type: 'kinematicPositionBased',
      shape: 'convexHull'
    };
    current.add(mesh);

    const nextJoint = new THREE.Group();
    nextJoint.position.set(0, segmentLength, 0);
    nextJoint.rotation.set(
      (Math.random() - 0.5) * bendStrength,
      (Math.random() - 0.5) * bendStrength * 0.6,
      (Math.random() - 0.5) * bendStrength
    );
    current.add(nextJoint);
    current = nextJoint;
  }

  return { root, tip: current };
}

function addFoliageCluster(tip, branchLength) {
  const leafCount = 4 + Math.floor(Math.random() * 3); 
  const spread = branchLength * 0.7;

  for (let i = 0; i < leafCount; i++) {
    const isDry = Math.random() < 0.12;
    const baseRadius = 0.014 + Math.random() * 0.006;
    const sizeFactor = isDry ? 0.55 + Math.random() * 0.4 : 0.9 + Math.random() * 0.25;

    const leafGeometry = new THREE.IcosahedronGeometry(baseRadius * sizeFactor, 0);
    leafGeometry.scale(0.55, 1.7, 0.22);

    const color = new THREE.Color();
    if (isDry) {
      color.setHSL(0.08 + Math.random() * 0.06, 0.55 + Math.random() * 0.15, 0.38 + Math.random() * 0.12);
    } else {
      color.setHSL(0.28 + Math.random() * 0.08, 0.45 + Math.random() * 0.2, 0.3 + Math.random() * 0.15);
    }

    const leafMaterial = new THREE.MeshMatcapMaterial({
      matcap: LEAF_MATCAP,
      map: leafBaseTexture, 
      bumpMap: leafBaseTexture,
      bumpScale: 0.006,
      flatShading: true,
      color,
    });

    const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
    leaf.position.set(
      (Math.random() - 0.5) * spread,
      Math.random() * spread * 0.9,
      (Math.random() - 0.5) * spread
    );
    leaf.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    leaf.castShadow = true;

    leaf.userData = {
      kind: 'leaf',
      isDry: isDry,
      interactable: isDry,
      interactionRadius: 0.035,
      attachToHand: true,
      physicalGrab: false
    };

    tip.add(leaf);
  }
}

function createBranch({ length, radius, depth, segments }) {
  const group = new THREE.Group();

  const tipRadius = radius * 0.55;
  const { root, tip } = createSegmentedLimb({
    length,
    baseRadius: radius,
    tipRadius,
    segments,
    bendStrength: BEND_STRENGTH,
  });
  group.add(root);

  if (depth <= 0) {
    addFoliageCluster(tip, length);
    return group;
  }

  const childCount = 2 + Math.floor(Math.random() * 2); 
  for (let i = 0; i < childCount; i++) {
    const childGroup = createBranch({
      length: length * (0.6 + Math.random() * 0.15),
      radius: tipRadius * (0.65 + Math.random() * 0.2),
      depth: depth - 1,
      segments: Math.max(2, segments - 1),
    });

    const azimuth = Math.random() * Math.PI * 2;
    const tilt = 0.35 + Math.random() * 0.5;
    const qAzimuth = new THREE.Quaternion().setFromAxisAngle(UP_AXIS, azimuth);
    const qTilt = new THREE.Quaternion().setFromAxisAngle(TILT_AXIS, tilt);
    childGroup.quaternion.copy(qAzimuth).multiply(qTilt);

    tip.add(childGroup);
  }

  return group;
}

export function createBonsai({
  trunkHeight = 0.36,
  trunkRadius = 0.035,
  branchDepth = 3,
} = {}) {
  return createBranch({
    length: trunkHeight,
    radius: trunkRadius,
    depth: branchDepth,
    segments: TRUNK_SEGMENTS,
  });
}

export function serializeBonsai(bonsai) {
  return serializeNode(bonsai);
}

function serializeNode(object) {
  const node = {
    position: object.position.toArray(),
    quaternion: object.quaternion.toArray(),
    children: object.children.map(serializeNode),
  };

  if (object.isMesh) {
    node.kind = object.userData.kind;
    
    const flat = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry;
    node.positions = serializeGeometryPositions(object.geometry);
    
    if (flat.attributes.uv) {
        node.uvs = Array.from(flat.attributes.uv.array);
    }
    
    if (node.kind === 'leaf') {
      node.color = object.material.color.getHex();
      node.isDry = !!object.userData.isDry;
    }
  }

  return node;
}

export function deserializeBonsai(data) {
  return deserializeNode(data);
}

function deserializeNode(data) {
  const object = data.kind ? createNodeMesh(data) : new THREE.Group();

  object.position.fromArray(data.position);
  object.quaternion.fromArray(data.quaternion);
  data.children.forEach((childData) => object.add(deserializeNode(childData)));

  return object;
}

function createNodeMesh(data) {
  const geometry = geometryFromPositions(data.positions);
  
  if (data.uvs) {
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
  } else {
    const uvs = [];
    for(let i=0; i<data.positions.length; i+=3) {
      uvs.push(data.positions[i] * 5, data.positions[i+1] * 5);
    }
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  }

  const isLeaf = data.kind === 'leaf';

  const material = isLeaf
    ? new THREE.MeshMatcapMaterial({ 
        matcap: LEAF_MATCAP, 
        map: leafBaseTexture,
        bumpMap: leafBaseTexture,
        bumpScale: 0.006,
        flatShading: true, 
        color: data.color 
      })
    : barkMaterial;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.userData.kind = data.kind;

  if (isLeaf) {
    mesh.userData = {
      kind: 'leaf',
      isDry: data.isDry,
      interactable: data.isDry,
      interactionRadius: 0.035,
      attachToHand: true,
      physicalGrab: false
    };
  } else if (data.kind === 'branch') {
    mesh.userData.physics = {
      type: 'kinematicPositionBased',
      shape: 'convexHull'
    };
  }

  return mesh;
}