/**
 * Genera proceduralmente una singola roccia low-poly deformando i vertici
 * di un IcosahedronGeometry con rumore casuale, ed espone la sua
 * serializzazione/deserializzazione per la persistenza dello stato. Nessuna
 * geometria o materiale viene caricata da file esterni.
 *
 * Nota tecnica: `IcosahedronGeometry` (come tutte le PolyhedronGeometry di
 * Three.js) non condivide i vertici tra facce adiacenti: ogni faccia ha la
 * propria copia degli angoli, anche se coincidono nello spazio. Spostando
 * ogni vertice in modo indipendente si "strappano" questi angoli condivisi,
 * creando fessure visibili tra i triangoli. Per evitarlo si calcola un solo
 * spostamento casuale per ogni posizione spaziale unica e si applica a
 * tutte le copie coincidenti, mantenendo la mesh chiusa ("watertight").
 */
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { createMatcapTexture } from '../utils/MatcapTextureFactory.js';
import { serializeGeometryPositions, geometryFromPositions } from '../utils/GeometrySerializer.js';

/**
 * Crea una mesh di roccia low-poly deformata organicamente, con muschio
 * distribuito proceduralmente sulla sua superficie.
 * @param {Object} [options]
 * @param {number} [options.radius=0.05] Raggio di base in metri.
 * @param {number} [options.detail=1] Dettaglio della geometria (0 o 1, per restare low-poly).
 * @param {number} [options.noiseStrength=0.5] Intensità della deformazione organica (0-1 relativa al raggio).
 * @param {number} [options.color=0x8d8d86] Colore base della roccia.
 * @returns {THREE.Mesh}
 */
export function createRock({
  radius = 0.05,
  detail = 1,
  noiseStrength = 0.5,
  color = 0x8d8d86,
} = {}) {
  const geometry = new THREE.IcosahedronGeometry(radius, detail);
  const position = geometry.attributes.position;
  const vertex = new THREE.Vector3();

  // Uno spostamento condiviso per ogni posizione spaziale unica, così i
  // vertici coincidenti tra facce adiacenti si muovono insieme.
  const displacementByKey = new Map();
  const keyOf = (x, y, z) => `${x.toFixed(4)}|${y.toFixed(4)}|${z.toFixed(4)}`;
  const maxOffset = radius * noiseStrength;

  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);
    const key = keyOf(vertex.x, vertex.y, vertex.z);

    let offset = displacementByKey.get(key);
    if (!offset) {
      offset = new THREE.Vector3(
        (Math.random() - 0.5) * maxOffset,
        (Math.random() - 0.5) * maxOffset,
        (Math.random() - 0.5) * maxOffset
      );
      displacementByKey.set(key, offset);
    }

    vertex.add(offset);
    position.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  // Stiramento non uniforme casuale: rompe la silhouette troppo regolare e
  // simmetrica dell'icosaedro di base, così ogni roccia ha proporzioni uniche.
  geometry.scale(
    0.8 + Math.random() * 0.5,
    0.6 + Math.random() * 0.4,
    0.8 + Math.random() * 0.5
  );

  geometry.computeVertexNormals();

  const material = new THREE.MeshMatcapMaterial({
    matcap: createMatcapTexture(color),
    flatShading: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  // Il colore vero è "cotto" nella texture matcap, non in `material.color`
  // (che resta bianco di default): lo teniamo qui per poterlo serializzare.
  mesh.userData.color = color;

  // Densità del muschio proporzionale al raggio della roccia (raggio 0.05 -> ~40 ciuffi).
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

    // Il sampler estrae punti casuali sulla superficie della mesh pesati per
    // area dei triangoli, garantendo una distribuzione uniforme dei ciuffi.
    const sampler = new MeshSurfaceSampler(mesh).build();

    const position = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const dummy = new THREE.Object3D();

    for (let i = 0; i < mossCount; i++) {
      sampler.sample(position, normal);

      dummy.position.copy(position);
      // Orienta il ciuffo lungo la normale locale, così sporge
      // perpendicolarmente dalla superficie della roccia nel punto campionato.
      dummy.lookAt(position.clone().add(normal));
      dummy.rotateZ(Math.random() * Math.PI);
      dummy.scale.setScalar(0.4 + Math.random() * 0.8);

      dummy.updateMatrix();

      instancedMoss.setMatrixAt(i, dummy.matrix);
    }

    mesh.add(instancedMoss);
  }

  return mesh;
}

/**
 * Cattura forma (vertici deformati), colore, posizione, rotazione e 
 * la disposizione esatta del muschio di una roccia già generata.
 * @param {THREE.Mesh} rock Roccia creata da `createRock`.
 * @returns {Object} Stato serializzabile della roccia.
 */
export function serializeRock(rock) {
  const data = {
    positions: serializeGeometryPositions(rock.geometry),
    color: rock.userData.color,
    position: rock.position.toArray(),
    rotation: rock.rotation.toArray().slice(0, 3),
  };

  const moss = rock.children.find((child) => child.isInstancedMesh);
  if (moss) {
    data.mossCount = moss.count;
    // instanceMatrix.array è un Float32Array: non è serializzabile in JSON
    // direttamente, va convertito in un array standard.
    data.mossMatrix = Array.from(moss.instanceMatrix.array);
  }

  return data;
}

/**
 * Ricostruisce una roccia a partire dallo stato prodotto da `serializeRock`,
 * ripristinando in modo identico anche il muschio.
 * @param {Object} data
 * @returns {THREE.Mesh}
 */
export function deserializeRock(data) {
  const geometry = geometryFromPositions(data.positions);
  const material = new THREE.MeshMatcapMaterial({
    matcap: createMatcapTexture(data.color),
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.fromArray(data.position);
  mesh.rotation.set(data.rotation[0], data.rotation[1], data.rotation[2]);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.userData.color = data.color;

  if (data.mossCount && data.mossMatrix) {
    const mossGeometry = new THREE.IcosahedronGeometry(0.004, 0);
    const mossMaterial = new THREE.MeshMatcapMaterial({
      matcap: createMatcapTexture(0x4a5d23),
      flatShading: true,
    });

    const instancedMoss = new THREE.InstancedMesh(mossGeometry, mossMaterial, data.mossCount);

    // Scrive direttamente l'array di matrici salvato nel Float32Array
    // sottostante dell'InstancedMesh, evitando di ricostruirlo istanza per istanza.
    instancedMoss.instanceMatrix.array.set(data.mossMatrix);
    instancedMoss.instanceMatrix.needsUpdate = true; // Forza il riupload del buffer alla GPU
    
    instancedMoss.receiveShadow = true;
    instancedMoss.castShadow = true;
    
    mesh.add(instancedMoss);
  }

  return mesh;
}
