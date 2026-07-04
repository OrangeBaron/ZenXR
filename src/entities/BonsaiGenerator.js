/**
 * ============================================================================
 * BonsaiGenerator.js
 * ============================================================================
 * Responsabilità unica (SRP): generare proceduralmente un bonsai stilizzato
 * tramite un sistema di ramificazione ricorsivo semplificato ("L-System
 * semplificato", GDD §6).
 *
 * Tronco e rami non sono singoli cilindri dritti: ogni "arto" è una catena
 * di brevi segmenti (CylinderGeometry) con una leggera inclinazione casuale
 * accumulata tra un segmento e il successivo, per ottenere la silhouette
 * spessa, nodosa e contorta di un bonsai reale invece di un tronco dritto
 * e sottile.
 *
 * Il fogliame non è più un ciuffo di grandi icosaedri: ogni "chioma" è un
 * piccolo gruppo di foglioline individuali (icosaedri appiattiti ed
 * elongati), per lo più coerenti in colore/dimensione ma con un'occasionale
 * foglia "secca" (colore bruno, spesso più piccola) — sono le foglie secche
 * di cui parla il GDD (§4), destinate a essere pizzicate via durante la
 * potatura. Ogni foglia porta `userData.isDry` per riconoscerle in futuro.
 *
 * NON gestisce: potatura, crescita nel tempo o interazione pinch — quelle
 * arriveranno con l'hand-tracking (Fase 4/7, GDD §4).
 * ============================================================================
 */
import * as THREE from 'three';
import { createMatcapTexture } from '../utils/MatcapTextureFactory.js';
import { serializeGeometryPositions, geometryFromPositions } from '../utils/GeometrySerializer.js';

const barkMaterial = new THREE.MeshMatcapMaterial({
  matcap: createMatcapTexture(0x5a3d2b),
  flatShading: true,
});

// Matcap neutro e chiaro per le foglie: la colorazione vera e propria (verde
// sano o bruno secco) viene applicata per-foglia tramite `material.color`,
// così una sola texture condivisa basta per tutte le variazioni cromatiche.
const LEAF_MATCAP = createMatcapTexture(0xe4e4e0);

const UP_AXIS = new THREE.Vector3(0, 1, 0);
const TILT_AXIS = new THREE.Vector3(1, 0, 0);

const TRUNK_SEGMENTS = 3;
const BEND_STRENGTH = 0.34;

/**
 * Costruisce un "arto" (tronco o ramo) come una catena di brevi segmenti
 * cilindrici, ciascuno leggermente e casualmente inclinato rispetto al
 * precedente e con un piccolo rumore sul raggio ai giunti. Il risultato,
 * invece di un singolo cilindro dritto e liscio, è una forma spessa,
 * nodosa e contorta.
 *
 * @returns {{ root: THREE.Group, tip: THREE.Group }} `root` va aggiunto al
 *   genitore; `tip` è il punto (con l'orientamento accumulato) da cui far
 *   proseguire rami figli o attaccare il fogliame.
 */
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
    mesh.userData.kind = 'branch'; // marcatura per il (de)serializzatore di stato (Fase 3)
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

/**
 * Aggiunge una piccola chioma di foglioline individuali al punto `tip`.
 * La maggior parte delle foglie condivide colore/forma/dimensione entro un
 * intervallo stretto; una minoranza ("secche") è cromaticamente e
 * dimensionalmente difforme — sono i candidati alla potatura.
 *
 * @param {THREE.Group} tip Punto di attacco (fine di un ramo terminale).
 * @param {number} branchLength Lunghezza del ramo terminale, usata come scala.
 */
function addFoliageCluster(tip, branchLength) {
  const leafCount = 4 + Math.floor(Math.random() * 3); // 4-6 foglie
  const spread = branchLength * 0.7;

  for (let i = 0; i < leafCount; i++) {
    const isDry = Math.random() < 0.12;

    const baseRadius = 0.014 + Math.random() * 0.006;
    const sizeFactor = isDry ? 0.55 + Math.random() * 0.4 : 0.9 + Math.random() * 0.25;

    const leafGeometry = new THREE.IcosahedronGeometry(baseRadius * sizeFactor, 0);
    // Appiattita ed elongata: una fogliolina, non una sfera.
    leafGeometry.scale(0.55, 1.7, 0.22);

    const color = new THREE.Color();
    if (isDry) {
      color.setHSL(0.08 + Math.random() * 0.06, 0.55 + Math.random() * 0.15, 0.38 + Math.random() * 0.12);
    } else {
      color.setHSL(0.28 + Math.random() * 0.08, 0.45 + Math.random() * 0.2, 0.3 + Math.random() * 0.15);
    }

    const leafMaterial = new THREE.MeshMatcapMaterial({
      matcap: LEAF_MATCAP,
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
    leaf.userData.isDry = isDry; // marcatura per la futura potatura via pinch (Fase 4/7)
    leaf.userData.kind = 'leaf'; // marcatura per il (de)serializzatore di stato (Fase 3)

    tip.add(leaf);
  }
}

/**
 * Crea ricorsivamente un ramo (o il tronco, alla prima chiamata): un arto
 * segmentato e contorto, che ai livelli intermedi si dirama in altri rami
 * figli e ai rami terminali porta una chioma di foglioline.
 *
 * @param {Object} params
 * @param {number} params.length Lunghezza dell'arto corrente.
 * @param {number} params.radius Raggio alla base dell'arto corrente.
 * @param {number} params.depth Profondità di ricorsione residua.
 * @param {number} params.segments Numero di segmenti della catena per questo arto.
 * @returns {THREE.Group} Gruppo con base nell'origine locale, arto lungo +Y.
 */
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

  const childCount = 2 + Math.floor(Math.random() * 2); // 2 o 3 rami figli
  for (let i = 0; i < childCount; i++) {
    const childGroup = createBranch({
      length: length * (0.6 + Math.random() * 0.15),
      radius: tipRadius * (0.65 + Math.random() * 0.2),
      depth: depth - 1,
      segments: Math.max(2, segments - 1),
    });

    // Inclinazione verso l'esterno + rotazione azimutale casuale attorno al
    // ramo genitore, per una silhouette organica e non simmetrica.
    const azimuth = Math.random() * Math.PI * 2;
    const tilt = 0.35 + Math.random() * 0.5;
    const qAzimuth = new THREE.Quaternion().setFromAxisAngle(UP_AXIS, azimuth);
    const qTilt = new THREE.Quaternion().setFromAxisAngle(TILT_AXIS, tilt);
    childGroup.quaternion.copy(qAzimuth).multiply(qTilt);

    tip.add(childGroup);
  }

  return group;
}

/**
 * Genera un bonsai completo, con base nell'origine locale.
 * @param {Object} [options]
 * @param {number} [options.trunkHeight=0.36] Altezza del tronco principale (metri).
 * @param {number} [options.trunkRadius=0.035] Raggio alla base del tronco (metri).
 * @param {number} [options.branchDepth=3] Profondità di ricorsione dei rami.
 * @returns {THREE.Group}
 */
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

/**
 * Serializza ricorsivamente l'intero albero (gruppi, segmenti di rami e
 * foglie) in un oggetto JSON-serializzabile, per la persistenza tramite
 * `SaveSystem` (Fase 3, GDD §2). Vengono salvati forma (vertici), colore e
 * trasformazione locale di ogni nodo, così il ripristino ricrea l'identica
 * geometria generata proceduralmente invece di rigenerarne una nuova casuale.
 *
 * @param {THREE.Group} bonsai Radice dell'albero creata da `createBonsai`.
 * @returns {Object} Stato serializzabile dell'albero.
 */
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
    node.positions = serializeGeometryPositions(object.geometry);
    if (node.kind === 'leaf') {
      node.color = object.material.color.getHex();
      node.isDry = !!object.userData.isDry;
    }
  }

  return node;
}

/**
 * Ricostruisce l'albero (gruppi, rami e foglie) a partire dallo stato
 * prodotto da `serializeBonsai`.
 * @param {Object} data
 * @returns {THREE.Group}
 */
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
  const isLeaf = data.kind === 'leaf';

  const material = isLeaf
    ? new THREE.MeshMatcapMaterial({ matcap: LEAF_MATCAP, flatShading: true, color: data.color })
    : barkMaterial;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.userData.kind = data.kind;
  if (isLeaf) mesh.userData.isDry = data.isDry;

  return mesh;
}
