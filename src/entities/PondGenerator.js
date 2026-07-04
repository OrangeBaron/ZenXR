/**
 * ============================================================================
 * PondGenerator.js
 * ============================================================================
 * Responsabilità unica (SRP): generare proceduralmente la geometria di un
 * laghetto a forma di "macchia" organica irregolare — un contorno chiuso
 * ottenuto perturbando con rumore casuale il raggio di un cerchio a
 * intervalli angolari regolari, poi triangolato a ventaglio sul piano
 * orizzontale (X/Z) — e fornire il test geometrico "il punto (x,z) è in
 * acqua?" usato da `GardenBase.js` per mantenere rocce e bonsai sempre
 * all'asciutto (Fase 5, GDD §4).
 *
 * NOTA SUL CONTORNO: i punti sono generati a un angolo FISSO ed equispaziato
 * (solo il raggio è casuale), quindi il contorno è sempre "a stella" rispetto
 * al proprio centro locale (ogni raggio dal centro incontra il bordo una sola
 * volta). Questo rende sia la triangolazione a ventaglio sia il test
 * `isInsidePond` semplici ed esatti, senza bisogno di un vero point-in-polygon.
 *
 * NON gestisce: il layout della vasca (quanta area destinare al laghetto,
 * dove posizionarlo) — quello è compito di `GardenBase.js` — né lo shader
 * d'acqua interattivo con le increspature (Fase 8).
 * ============================================================================
 */
import * as THREE from 'three';
import { createMatcapTexture } from '../utils/MatcapTextureFactory.js';
import { serializeGeometryPositions, geometryFromPositions } from '../utils/GeometrySerializer.js';

const POND_MATCAP = createMatcapTexture(0x3f6d7a);

// Il laghetto è disegnato leggermente sopra il piano della sabbia (che è un
// box pieno, senza foro), per evitare z-fighting e restare comunque visibile
// invece di risultare "sepolto" sotto di essa.
const SURFACE_LIFT = 0.003;

/**
 * Genera un contorno chiuso "a macchia": un cerchio il cui raggio è
 * perturbato con rumore casuale ad ogni angolo, poi leggermente smussato
 * mediando ciascun valore con i vicini — così la silhouette risulta organica
 * e arrotondata invece che una stella dentellata.
 *
 * @param {number} radiusX Raggio di base lungo l'asse X (metri).
 * @param {number} radiusZ Raggio di base lungo l'asse Z (metri).
 * @param {number} irregularity Ampiezza relativa del rumore (0-1 circa).
 * @param {number} segments Numero di punti del contorno.
 * @returns {{x:number, z:number}[]} Punti del contorno in spazio locale (centro = origine).
 */
function generateContour(radiusX, radiusZ, irregularity, segments) {
  const rawNoise = [];
  for (let i = 0; i < segments; i++) {
    rawNoise.push(1 + (Math.random() - 0.5) * 2 * irregularity);
  }

  // Rumore "a bassa frequenza": media ogni valore con i due vicini per
  // ottenere una macchia morbida invece di un contorno a stella dentellata.
  const smoothed = rawNoise.map((value, i) => {
    const prev = rawNoise[(i - 1 + segments) % segments];
    const next = rawNoise[(i + 1) % segments];
    return (prev + value * 2 + next) / 4;
  });

  const points = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push({
      x: Math.cos(angle) * radiusX * smoothed[i],
      z: Math.sin(angle) * radiusZ * smoothed[i],
    });
  }
  return points;
}

/**
 * Triangola a ventaglio il contorno (centro + coppie di punti consecutivi).
 * Valido perché il contorno è sempre "a stella" rispetto al centro locale
 * (vedi nota in testa al file). L'ordine dei vertici (centro, b, a) produce
 * una normale rivolta verso +Y, necessaria perché la superficie sia visibile
 * da sopra con `MeshMatcapMaterial` (single-sided di default).
 *
 * @param {{x:number, z:number}[]} contour
 * @returns {THREE.BufferGeometry}
 */
function buildPondGeometry(contour) {
  const vertices = [];
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i];
    const b = contour[(i + 1) % contour.length];
    vertices.push(0, 0, 0, b.x, 0, b.z, a.x, 0, a.z);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Crea il laghetto procedurale: una mesh piatta a forma di macchia organica,
 * pronta per essere posizionata da `GardenBase.js` all'interno della vasca.
 *
 * @param {Object} [options]
 * @param {number} [options.radiusX=0.15] Raggio di base lungo X (metri).
 * @param {number} [options.radiusZ=0.12] Raggio di base lungo Z (metri).
 * @param {number} [options.irregularity=0.32] Ampiezza del rumore sul contorno (0-1 circa).
 * @param {number} [options.segments=20] Numero di punti del contorno (dettaglio della macchia).
 * @param {number} [options.color=0x3f6d7a] Colore base dell'acqua.
 * @returns {THREE.Mesh}
 */
export function createPond({
  radiusX = 0.15,
  radiusZ = 0.12,
  irregularity = 0.32,
  segments = 20,
  color = 0x3f6d7a,
} = {}) {
  const contour = generateContour(radiusX, radiusZ, irregularity, segments);
  const geometry = buildPondGeometry(contour);

  const material = new THREE.MeshMatcapMaterial({
    matcap: createMatcapTexture(color),
    flatShading: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.userData.color = color;
  // Contorno in spazio locale: serve a `isInsidePond` per il test
  // "punto (x,z) in acqua?" una volta che la mesh è stata posizionata.
  mesh.userData.contour = contour;
  return mesh;
}

/**
 * Calcola il raggio del contorno all'angolo dato, interpolando linearmente
 * tra i due punti del contorno più vicini (il contorno è "a stella" e i suoi
 * punti sono equispaziati angolarmente, vedi nota in testa al file).
 *
 * @param {{x:number, z:number}[]} contour
 * @param {number} angle Angolo in radianti (spazio locale del laghetto).
 * @returns {number}
 */
function boundaryRadiusAtAngle(contour, angle) {
  const segments = contour.length;
  const step = (Math.PI * 2) / segments;
  const normalizedAngle = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

  const i0 = Math.floor(normalizedAngle / step) % segments;
  const i1 = (i0 + 1) % segments;
  const t = (normalizedAngle - i0 * step) / step;

  const r0 = Math.hypot(contour[i0].x, contour[i0].z);
  const r1 = Math.hypot(contour[i1].x, contour[i1].z);
  return THREE.MathUtils.lerp(r0, r1, t);
}

/**
 * Verifica se il punto `(x, z)` (nello spazio locale del gruppo del
 * giardino, cioè lo stesso spazio delle posizioni di rocce e bonsai) cade
 * dentro il laghetto — usato da `GardenBase.js` per non generare rocce o
 * bonsai in acqua (Fase 5, GDD §4).
 *
 * @param {THREE.Mesh} pond Laghetto creato da `createPond` (o `deserializePond`), già posizionato.
 * @param {number} x
 * @param {number} z
 * @param {number} [margin=0] Distanza extra (metri) da considerare "acqua" oltre il contorno reale — utile per tenere gli oggetti a debita distanza dalla riva.
 * @returns {boolean}
 */
export function isInsidePond(pond, x, z, margin = 0) {
  const localX = x - pond.position.x;
  const localZ = z - pond.position.z;
  const radius = Math.hypot(localX, localZ);
  const boundary = boundaryRadiusAtAngle(pond.userData.contour, Math.atan2(localZ, localX));
  return radius < boundary + margin;
}

/**
 * Cattura forma (vertici), contorno, colore e posizione di un laghetto già
 * generato, in un oggetto JSON-serializzabile pronto per il `SaveSystem`
 * (GDD §2), così il ripristino ricrea l'identica macchia invece di
 * rigenerarne una nuova casuale.
 *
 * @param {THREE.Mesh} pond Laghetto creato da `createPond`.
 * @returns {Object} Stato serializzabile del laghetto.
 */
export function serializePond(pond) {
  return {
    positions: serializeGeometryPositions(pond.geometry),
    contour: pond.userData.contour.map((point) => [point.x, point.z]),
    position: pond.position.toArray(),
    color: pond.userData.color,
  };
}

/**
 * Ricostruisce un laghetto a partire dallo stato prodotto da `serializePond`.
 * @param {Object} data
 * @returns {THREE.Mesh}
 */
export function deserializePond(data) {
  const geometry = geometryFromPositions(data.positions);
  const material = new THREE.MeshMatcapMaterial({
    matcap: createMatcapTexture(data.color),
    flatShading: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.fromArray(data.position);
  mesh.receiveShadow = true;
  mesh.userData.color = data.color;
  mesh.userData.contour = data.contour.map(([x, z]) => ({ x, z }));
  return mesh;
}

export { SURFACE_LIFT as POND_SURFACE_LIFT };
