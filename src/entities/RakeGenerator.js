/**
 * Responsabilità unica: generare proceduralmente il rastrello assemblando
 * primitive di base di Three.js (CylinderGeometry, BoxGeometry) in un
 * singolo gruppo.
 * * L'origine del gruppo (0,0,0) è posta al centro del manico, ideale
 * per facilitare l'aggancio alla mano dell'utente nella logica di presa (Grab).
 */
import * as THREE from 'three';
import { createMatcapTexture } from '../utils/MatcapTextureFactory.js';

/**
 * Crea il rastrello procedurale.
 * @param {Object} [options]
 * @param {number} [options.handleLength=0.4] Lunghezza del manico.
 * @param {number} [options.handleRadius=0.008] Spessore del manico.
 * @param {number} [options.crossbarWidth=0.12] Larghezza della traversa porta-denti.
 * @param {number} [options.color=0xc2b280] Colore base (legno chiaro/bambù).
 * @returns {THREE.Group} Il gruppo contenente il rastrello completo.
 */
export function createRake({
  handleLength = 0.4,
  handleRadius = 0.008,
  crossbarWidth = 0.12,
  color = 0xc2b280
} = {}) {
  const group = new THREE.Group();

  const woodMaterial = new THREE.MeshMatcapMaterial({
    matcap: createMatcapTexture(color),
    flatShading: true,
  });

  // 1. Manico (CylinderGeometry)
  // Three.js orienta i cilindri lungo l'asse Y di default. Lo ruotiamo
  // per allinearlo lungo l'asse Z, che rappresenta la direzione "in avanti".
  const handleGeometry = new THREE.CylinderGeometry(handleRadius, handleRadius, handleLength, 8);
  handleGeometry.rotateX(Math.PI / 2); 
  const handle = new THREE.Mesh(handleGeometry, woodMaterial);
  handle.castShadow = true;
  group.add(handle);

  // 2. Traversa (BoxGeometry)
  const crossbarHeight = 0.015;
  const crossbarDepth = 0.015;
  const crossbarGeometry = new THREE.BoxGeometry(crossbarWidth, crossbarHeight, crossbarDepth);
  const crossbar = new THREE.Mesh(crossbarGeometry, woodMaterial);
  // La posizioniamo a un'estremità del manico (asse Z negativo)
  crossbar.position.set(0, 0, -handleLength / 2);
  crossbar.castShadow = true;
  group.add(crossbar);

  // 3. Denti (CylinderGeometry)
  const teethCount = 5;
  const toothLength = 0.025;
  const toothRadius = 0.003;
  const toothGeometry = new THREE.CylinderGeometry(toothRadius, toothRadius, toothLength, 6);
  // Spostiamo i vertici affinché l'origine del dente sia in cima, per agganciarlo facilmente
  toothGeometry.translate(0, -toothLength / 2, 0);

  const spacing = crossbarWidth / (teethCount + 1);
  for (let i = 0; i < teethCount; i++) {
    const tooth = new THREE.Mesh(toothGeometry, woodMaterial);
    const xOffset = -crossbarWidth / 2 + spacing * (i + 1);
    // Posizioniamo il dente sotto la traversa
    tooth.position.set(xOffset, -crossbarHeight / 2, -handleLength / 2);
    tooth.castShadow = true;
    group.add(tooth);
  }

  // Marcatura utile per le interazioni o il salvataggio futuro
  group.userData.kind = 'rake';

  return group;
}