/**
 * Genera proceduralmente la geometria di un laghetto a forma di "macchia"
 * organica, ancorato a un angolo della vasca: il vertice del laghetto
 * coincide esattamente con l'angolo, i due lati corrono lungo le due pareti
 * che vi si incontrano, e il bordo opposto — quello rivolto verso l'interno
 * della vasca — è una curva irregolare ottenuta perturbando con rumore
 * casuale il raggio di un quarto di cerchio. Il risultato equivale a una
 * macchia più grande che sporge oltre il bordo della vasca: qui viene
 * generata direttamente e soltanto la porzione visibile, senza bisogno di
 * ritagliarla in un secondo passo.
 *
 * Nota sul contorno: i punti sono generati a un angolo fisso ed equispaziato
 * entro il quarto di cerchio rivolto verso l'interno della vasca (solo il
 * raggio è casuale). Il contorno è quindi sempre "a stella" rispetto
 * all'angolo (ogni raggio dall'angolo incontra il bordo una sola volta) e i
 * due punti estremi giacciono per costruzione esattamente sulle due pareti
 * (a quegli angoli seno o coseno sono esattamente 0), qualunque sia il
 * rumore applicato al raggio: è così che il laghetto "arriva fino al bordo".
 * Questo rende sia la triangolazione a ventaglio sia il test `isInsidePond`
 * semplici ed esatti, senza bisogno di un vero point-in-polygon.
 *
 * Non gestisce il layout della vasca (quale angolo scegliere, quanto grande
 * dev'essere il laghetto), compito di `GardenBase.js`, né lo shader d'acqua
 * interattivo con le increspature.
 */
import * as THREE from 'three';
import { createMatcapTexture } from '../utils/MatcapTextureFactory.js';
import { serializeGeometryPositions, geometryFromPositions } from '../utils/GeometrySerializer.js';

const POND_MATCAP_COLOR = 0x3f6d7a;

// Il laghetto è disegnato leggermente sopra il piano della sabbia (che è un
// box pieno, senza foro), per evitare z-fighting e restare comunque visibile
// invece di risultare "sepolto" sotto di essa.
const SURFACE_LIFT = 0.003;

/**
 * Determina, in base all'angolo della vasca scelto (`cornerX`/`cornerZ`,
 * ciascuno -1 o +1), il quarto di cerchio rivolto verso l'interno della
 * vasca. Es. per l'angolo (+X,+Z) l'interno è verso (-X,-Z), cioè l'intervallo
 * angolare [180°, 270°].
 *
 * @param {number} cornerX -1 o +1: lato della vasca lungo X.
 * @param {number} cornerZ -1 o +1: lato della vasca lungo Z.
 * @returns {[number, number]} `[angleStart, angleEnd]` in radianti, in [0, 2π).
 */
function interiorAngleRange(cornerX, cornerZ) {
  if (cornerX > 0 && cornerZ > 0) return [Math.PI, 1.5 * Math.PI];
  if (cornerX > 0 && cornerZ < 0) return [0.5 * Math.PI, Math.PI];
  if (cornerX < 0 && cornerZ > 0) return [1.5 * Math.PI, 2 * Math.PI];
  return [0, 0.5 * Math.PI];
}

/**
 * Genera il contorno del laghetto: un ventaglio di punti equispaziati tra
 * `angleStart` e `angleEnd`, con il raggio (ellittico, `radiusX`/`radiusZ`)
 * perturbato da rumore casuale e leggermente smussato mediando ciascun
 * valore con i vicini — così la curva verso l'interno risulta organica e
 * arrotondata invece che dentellata. I due punti estremi restano comunque
 * esattamente sulle pareti (vedi nota in testa al file), qualunque sia il
 * rumore.
 *
 * @returns {{x:number, z:number}[]} Punti del contorno in spazio locale (angolo = origine).
 */
function generateContour(angleStart, angleEnd, radiusX, radiusZ, irregularity, segments) {
  const rawNoise = [];
  for (let i = 0; i < segments; i++) {
    rawNoise.push(1 + (Math.random() - 0.5) * 2 * irregularity);
  }

  // Rumore "a bassa frequenza": media ogni valore con i vicini (senza
  // avvolgere agli estremi, il ventaglio non è una forma chiusa) per una
  // macchia morbida invece di un contorno dentellato.
  const smoothed = rawNoise.map((value, i) => {
    const prev = rawNoise[Math.max(0, i - 1)];
    const next = rawNoise[Math.min(segments - 1, i + 1)];
    return (prev + value * 2 + next) / 4;
  });

  const points = [];
  for (let i = 0; i < segments; i++) {
    const angle = THREE.MathUtils.lerp(angleStart, angleEnd, i / (segments - 1));
    points.push({
      x: Math.cos(angle) * radiusX * smoothed[i],
      z: Math.sin(angle) * radiusZ * smoothed[i],
    });
  }
  return points;
}

/**
 * Triangola a ventaglio il contorno, dall'angolo della vasca (centro locale,
 * raggio 0) a coppie di punti consecutivi. Valido perché il contorno è
 * sempre "a stella" rispetto all'angolo (vedi nota in testa al file). A
 * differenza di una macchia "chiusa", qui il ventaglio resta APERTO (nessun
 * triangolo di chiusura tra il primo e l'ultimo punto): i due lati del
 * ventaglio, che corrono lungo le pareti della vasca, sono già la parte
 * visibile del bordo. L'ordine dei vertici (centro, b, a) produce una
 * normale rivolta verso +Y, necessaria perché la superficie sia visibile da
 * sopra con `MeshMatcapMaterial` (single-sided di default).
 *
 * @param {{x:number, z:number}[]} contour
 * @returns {THREE.BufferGeometry}
 */
function buildPondGeometry(contour) {
  const vertices = [];
  for (let i = 0; i < contour.length - 1; i++) {
    const a = contour[i];
    const b = contour[i + 1];
    vertices.push(0, 0, 0, b.x, 0, b.z, a.x, 0, a.z);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Crea il laghetto procedurale ancorato a un angolo della vasca: una mesh
 * piatta a forma di quarto di macchia organica, pronta per essere
 * posizionata da `GardenBase.js` esattamente sull'angolo scelto.
 *
 * @param {Object} [options]
 * @param {number} [options.cornerX=1] -1 o +1: lato della vasca lungo X in cui affonda l'angolo del laghetto.
 * @param {number} [options.cornerZ=1] -1 o +1: lato della vasca lungo Z in cui affonda l'angolo del laghetto.
 * @param {number} [options.radiusX=0.3] Estensione massima (rumore escluso) lungo X, dall'angolo verso l'interno.
 * @param {number} [options.radiusZ=0.25] Estensione massima (rumore escluso) lungo Z, dall'angolo verso l'interno.
 * @param {number} [options.irregularity=0.3] Ampiezza del rumore sul bordo interno (0-1 circa).
 * @param {number} [options.segments=12] Numero di punti del bordo interno (dettaglio della macchia).
 * @param {number} [options.color=0x3f6d7a] Colore base dell'acqua.
 * @returns {THREE.Mesh}
 */
export function createPond({
  cornerX = 1,
  cornerZ = 1,
  radiusX = 0.3,
  radiusZ = 0.25,
  irregularity = 0.3,
  segments = 12,
  color = POND_MATCAP_COLOR,
} = {}) {
  const [angleStart, angleEnd] = interiorAngleRange(cornerX, cornerZ);
  const contour = generateContour(angleStart, angleEnd, radiusX, radiusZ, irregularity, segments);
  const geometry = buildPondGeometry(contour);

  const material = new THREE.MeshMatcapMaterial({
    matcap: createMatcapTexture(color),
    flatShading: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.userData.color = color;
  // Contorno e range angolare in spazio locale: servono a `isInsidePond` per
  // il test "punto (x,z) in acqua?" una volta che la mesh è stata posizionata.
  mesh.userData.contour = contour;
  mesh.userData.angleStart = angleStart;
  mesh.userData.angleEnd = angleEnd;
  return mesh;
}

/**
 * Calcola il raggio del bordo del laghetto all'angolo dato, interpolando
 * linearmente tra i due punti del contorno più vicini. Restituisce 0 se
 * l'angolo cade fuori dal quarto di cerchio del laghetto (vedi nota in testa
 * al file): non essendo il contorno chiuso, in quelle direzioni non c'è
 * acqua a nessuna distanza dall'angolo.
 *
 * @param {THREE.Mesh} pond
 * @param {number} angle Angolo in radianti (spazio locale del laghetto, cioè centrato sull'angolo della vasca).
 * @returns {number}
 */
function boundaryRadiusAtAngle(pond, angle) {
  const { contour, angleStart, angleEnd } = pond.userData;
  const normalizedAngle = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (normalizedAngle < angleStart || normalizedAngle > angleEnd) return 0;

  const segments = contour.length - 1;
  const step = (angleEnd - angleStart) / segments;
  const t = (normalizedAngle - angleStart) / step;
  const i0 = Math.min(Math.floor(t), segments - 1);
  const i1 = i0 + 1;
  const localT = t - i0;

  const r0 = Math.hypot(contour[i0].x, contour[i0].z);
  const r1 = Math.hypot(contour[i1].x, contour[i1].z);
  return THREE.MathUtils.lerp(r0, r1, localT);
}

/**
 * Verifica se il punto `(x, z)` (nello spazio locale del gruppo del
 * giardino, cioè lo stesso spazio delle posizioni di rocce e bonsai) cade
 * dentro il laghetto — usato da `GardenBase.js` per non generare rocce o
 * bonsai in acqua.
 *
 * @param {THREE.Mesh} pond Laghetto creato da `createPond` (o `deserializePond`), già posizionato.
 * @param {number} x
 * @param {number} z
 * @param {number} [margin=0] Distanza extra (metri) da considerare "acqua" oltre il bordo reale — utile per tenere gli oggetti a debita distanza dalla riva.
 * @returns {boolean}
 */
export function isInsidePond(pond, x, z, margin = 0) {
  const localX = x - pond.position.x;
  const localZ = z - pond.position.z;
  const radius = Math.hypot(localX, localZ);
  const boundary = boundaryRadiusAtAngle(pond, Math.atan2(localZ, localX));
  return radius < boundary + margin;
}

/**
 * Cattura forma (vertici), contorno, range angolare, colore e posizione di
 * un laghetto già generato, in un oggetto JSON-serializzabile pronto per il
 * `SaveSystem`, così il ripristino ricrea l'identica macchia invece di
 * rigenerarne una nuova casuale.
 *
 * @param {THREE.Mesh} pond Laghetto creato da `createPond`.
 * @returns {Object} Stato serializzabile del laghetto.
 */
export function serializePond(pond) {
  return {
    positions: serializeGeometryPositions(pond.geometry),
    contour: pond.userData.contour.map((point) => [point.x, point.z]),
    angleStart: pond.userData.angleStart,
    angleEnd: pond.userData.angleEnd,
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
  mesh.userData.angleStart = data.angleStart;
  mesh.userData.angleEnd = data.angleEnd;
  return mesh;
}

/**
 * Genera un gruppo (InstancedMesh) di ciottoli disposti lungo il bordo irregolare
 * del laghetto passato come parametro.
 * @param {THREE.Mesh} pond Il laghetto generato.
 * @param {number} sandTopY La quota Y della sabbia per appoggiare i ciottoli.
 * @returns {THREE.InstancedMesh|null}
 */
export function generatePondPebbles(pond, sandTopY) {
  const contour = pond.userData.contour;
  if (!contour || contour.length < 2) return null;

  // Hash trigonometrico deterministico: a parità di seed produce sempre lo
  // stesso valore in [0,1), utile per variazioni riproducibili senza stato.
  const pseudoRandom = (seed) => {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };

  const pebbleGeometry = new THREE.IcosahedronGeometry(0.02, 0);
  const pebbleMaterial = new THREE.MeshMatcapMaterial({
    matcap: createMatcapTexture(0x6e6b66),
    flatShading: true,
  });

  let totalLength = 0;
  const segmentLengths = [];
  for (let i = 0; i < contour.length - 1; i++) {
    const dist = Math.hypot(contour[i+1].x - contour[i].x, contour[i+1].z - contour[i].z);
    totalLength += dist;
    segmentLengths.push(dist);
  }

  const pebbleCount = Math.floor(totalLength / 0.03);
  const instancedPebbles = new THREE.InstancedMesh(pebbleGeometry, pebbleMaterial, pebbleCount);
  instancedPebbles.receiveShadow = true;
  instancedPebbles.castShadow = true;

  const dummy = new THREE.Object3D();

  // Parametrizzazione per lunghezza d'arco: ogni ciottolo è posizionato a
  // una distanza percorsa costante lungo il contorno (non per indice di
  // vertice), così la densità visiva resta uniforme anche se i segmenti del
  // contorno hanno lunghezze diverse.
  for (let i = 0; i < pebbleCount; i++) {
    const targetDistance = (i / pebbleCount) * totalLength;

    let accumulated = 0;
    let segIdx = 0;
    while (segIdx < segmentLengths.length && accumulated + segmentLengths[segIdx] <= targetDistance) {
      accumulated += segmentLengths[segIdx];
      segIdx++;
    }
    if (segIdx >= contour.length - 1) segIdx = contour.length - 2;

    const t = (targetDistance - accumulated) / segmentLengths[segIdx];
    const ptA = contour[segIdx];
    const ptB = contour[segIdx + 1];

    const baseX = THREE.MathUtils.lerp(ptA.x, ptB.x, t);
    const baseZ = THREE.MathUtils.lerp(ptA.z, ptB.z, t);

    const offsetDist = (pseudoRandom(i) - 0.5) * 0.025; 
    const randScale = 0.5 + pseudoRandom(i + 100) * 1.0;
    const randRotX = pseudoRandom(i + 200) * Math.PI;
    const randRotY = pseudoRandom(i + 300) * Math.PI;

    dummy.position.set(
      pond.position.x + baseX + offsetDist,
      sandTopY + 0.001,
      pond.position.z + baseZ + offsetDist
    );
    
    dummy.rotation.set(randRotX, randRotY, 0);
    dummy.scale.setScalar(randScale);
    dummy.scale.y *= 0.4;
    dummy.updateMatrix();
    instancedPebbles.setMatrixAt(i, dummy.matrix);
  }

  return instancedPebbles;
}

export { SURFACE_LIFT as POND_SURFACE_LIFT };
