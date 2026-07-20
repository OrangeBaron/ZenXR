/**
 * Genera proceduralmente una singola roccia low-poly deformando i vertici
 * di un IcosahedronGeometry con rumore, basandosi su un SEED matematico.
 * In questo modo, per salvare lo stato della roccia, basta salvare il seed
 * e non migliaia di vertici.
 */
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { createMatcapTexture } from '../utils/MatcapTextureFactory.js';
import { rockBaseTexture } from '../utils/ProceduralTextureFactory.js';

// Un semplice PRNG (Mulberry32) per rendere deterministica la generazione
function createPRNG(seed) {
  let state = seed;
  return function() {
    let t = state += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

/**
 * Crea una roccia procedurale deformata.
 */
export function createRock({
  radius = 0.05,
  detail = 1,
  noiseStrength = 0.5,
  color = 0x8d8d86,
  seed = Math.floor(Math.random() * 0xFFFFFFFF) // Seme casuale di default
} = {}) {
  // Inizializziamo il nostro generatore casuale con il seme
  const prng = createPRNG(seed);

  const geometry = new THREE.IcosahedronGeometry(radius, detail);
  const position = geometry.attributes.position;
  const vertex = new THREE.Vector3();

  const displacementByKey = new Map();
  const keyOf = (x, y, z) => `${x.toFixed(4)}|${y.toFixed(4)}|${z.toFixed(4)}`;
  const maxOffset = radius * noiseStrength;

  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);
    const key = keyOf(vertex.x, vertex.y, vertex.z);

    let offset = displacementByKey.get(key);
    if (!offset) {
      // USIAMO PRNG() AL POSTO DI MATH.RANDOM()
      offset = new THREE.Vector3(
        (prng() - 0.5) * maxOffset,
        (prng() - 0.5) * maxOffset,
        (prng() - 0.5) * maxOffset
      );
      displacementByKey.set(key, offset);
    }

    vertex.add(offset);
    position.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  geometry.scale(
    0.8 + prng() * 0.5,
    0.6 + prng() * 0.4,
    0.8 + prng() * 0.5
  );

  geometry.computeVertexNormals();

  const material = new THREE.MeshMatcapMaterial({
    matcap: createMatcapTexture(color),
    map: rockBaseTexture,
    bumpMap: rockBaseTexture,
    bumpScale: 0.008, 
    flatShading: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true; // Aggiunto per sicurezza

  // Salviamo i parametri costruttivi e i tag di interazione
  mesh.userData = {
    kind: 'rock',
    seed,
    radius,
    detail,
    noiseStrength,
    color,
    interactable: true,
    interactionRadius: 0.08,
    attachToHand: false,
    physicalGrab: true,
    physics: {
      type: 'dynamic',
      shape: 'convexHull',
      density: 3000.0,
      friction: 0.8,
      restitution: 0.1,
      linearDamping: 0.3,
      angularDamping: 0.1
    }
  };

  const mossCount = Math.floor(radius * 800);

  if (mossCount > 0) {
    const mossGeometry = new THREE.IcosahedronGeometry(0.004, 0);
    const mossMaterial = new THREE.MeshMatcapMaterial({
      matcap: createMatcapTexture(0x4a5d23),
      flatShading: true,
    });

    const instancedMoss = new THREE.InstancedMesh(mossGeometry, mossMaterial, mossCount);
    instancedMoss.receiveShadow = true;
    instancedMoss.castShadow = true;

    const sampler = new MeshSurfaceSampler(mesh).build();
    // Forziamo il sampler di Three.js a usare il nostro PRNG deterministico!
    sampler.setRandomGenerator(prng);

    const position = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const dummy = new THREE.Object3D();

    for (let i = 0; i < mossCount; i++) {
      sampler.sample(position, normal);
      dummy.position.copy(position);
      dummy.lookAt(position.clone().add(normal));
      dummy.rotateZ(prng() * Math.PI);
      dummy.scale.setScalar(0.4 + prng() * 0.8);
      dummy.updateMatrix();
      instancedMoss.setMatrixAt(i, dummy.matrix);
    }
    mesh.add(instancedMoss);
  }

  return mesh;
}

/**
 * Salva lo stato della roccia in modo ultraleggero.
 */
export function serializeRock(rock) {
  return {
    seed: rock.userData.seed,
    radius: rock.userData.radius,
    detail: rock.userData.detail,
    noiseStrength: rock.userData.noiseStrength,
    color: rock.userData.color,
    position: rock.position.toArray(),
    rotation: rock.rotation.toArray().slice(0, 3),
  };
}

/**
 * Ripristina una roccia ricreandola esattamente uguale grazie al seed.
 */
export function deserializeRock(data) {
  const mesh = createRock({
    seed: data.seed,
    radius: data.radius,
    detail: data.detail,
    noiseStrength: data.noiseStrength,
    color: data.color
  });
  
  mesh.position.fromArray(data.position);
  mesh.rotation.set(data.rotation[0], data.rotation[1], data.rotation[2]);
  
  return mesh;
}