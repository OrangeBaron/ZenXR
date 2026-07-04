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
import { createMatcapTexture } from '../utils/MatcapTextureFactory.js';

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
  return mesh;
}
