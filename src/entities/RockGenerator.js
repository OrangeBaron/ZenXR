/**
 * ============================================================================
 * RockGenerator.js
 * ============================================================================
 * Responsabilità unica (SRP): generare procedimentalmente una singola roccia
 * low-poly deformando i vertici di un IcosahedronGeometry con rumore
 * casuale (GDD §6). Nessuna geometria o materiale viene caricato da file
 * esterni.
 *
 * NOTA TECNICA: `IcosahedronGeometry` (come tutte le PolyhedronGeometry di
 * Three.js) NON condivide i vertici tra facce adiacenti — ogni faccia ha la
 * propria copia degli angoli, anche se coincidono nello spazio. Spostando
 * ogni vertice in modo indipendente si "strappano" questi angoli condivisi,
 * creando fessure visibili tra i triangoli. Per evitarlo, calcoliamo UN solo
 * spostamento casuale per ogni posizione spaziale unica e lo applichiamo a
 * tutte le copie coincidenti, mantenendo la mesh chiusa ("watertight").
 * ============================================================================
 */
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { createMatcapTexture } from '../utils/MatcapTextureFactory.js';
import { serializeGeometryPositions, geometryFromPositions } from '../utils/GeometrySerializer.js';

/**
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

  // --- GENERAZIONE DEL MUSCHIO ---
  
  // 1. Definiamo quanto muschio vogliamo in base alla grandezza della roccia
  const mossCount = Math.floor(radius * 800); // Es. raggio 0.05 produrrà ~40 ciuffi
  
  if (mossCount > 0) {
    // 2. Geometria e materiale del singolo ciuffo di muschio
    const mossGeometry = new THREE.IcosahedronGeometry(0.004, 0);
    // Un verde organico e desaturato per il muschio
    const mossMaterial = new THREE.MeshMatcapMaterial({
      matcap: createMatcapTexture(0x4a5d23), 
      flatShading: true,
    });

    // 3. Creiamo l'InstancedMesh per le performance
    const instancedMoss = new THREE.InstancedMesh(mossGeometry, mossMaterial, mossCount);
    instancedMoss.receiveShadow = true;
    instancedMoss.castShadow = true;

    // 4. Inizializziamo il Sampler passandogli la mesh della roccia appena creata
    const sampler = new MeshSurfaceSampler(mesh).build();
    
    // Variabili d'appoggio per evitare di allocare nuova memoria in ogni ciclo
    const position = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const dummy = new THREE.Object3D();

    // 5. Ciclo di campionamento
    for (let i = 0; i < mossCount; i++) {
      // Estraiamo un punto casuale e la sua normale
      sampler.sample(position, normal);

      // Posizioniamo il dummy sul punto trovato
      dummy.position.copy(position);
      
      // Orientiamo il muschio in modo che "esca" perpendicolarmente dalla roccia
      dummy.lookAt(position.clone().add(normal));
      
      // Aggiungiamo un po' di variazione casuale per spezzare la ripetitività
      dummy.rotateZ(Math.random() * Math.PI);
      dummy.scale.setScalar(0.4 + Math.random() * 0.8);
      
      dummy.updateMatrix();
      
      // Salviamo la trasformazione nell'InstancedMesh
      instancedMoss.setMatrixAt(i, dummy.matrix);
    }

    // 6. Agganciamo il muschio alla roccia (diventa "figlio" della roccia)
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

  // Cerchiamo l'InstancedMesh (il muschio) tra i figli della roccia
  const moss = rock.children.find((child) => child.isInstancedMesh);
  if (moss) {
    data.mossCount = moss.count;
    // instanceMatrix.array è un Float32Array, lo convertiamo in un array standard per il JSON
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

  // Ripristino del Muschio (se presente nel salvataggio)
  if (data.mossCount && data.mossMatrix) {
    const mossGeometry = new THREE.IcosahedronGeometry(0.004, 0);
    const mossMaterial = new THREE.MeshMatcapMaterial({
      matcap: createMatcapTexture(0x4a5d23), 
      flatShading: true,
    });
    
    const instancedMoss = new THREE.InstancedMesh(mossGeometry, mossMaterial, data.mossCount);
    
    // Iniettiamo l'array delle matrici salvato nel Float32Array dell'InstancedMesh
    instancedMoss.instanceMatrix.array.set(data.mossMatrix);
    instancedMoss.instanceMatrix.needsUpdate = true; // Diciamo alla GPU che i dati sono aggiornati
    
    instancedMoss.receiveShadow = true;
    instancedMoss.castShadow = true;
    
    mesh.add(instancedMoss);
  }

  return mesh;
}
