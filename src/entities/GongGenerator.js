/**
 * Responsabilità unica: generare proceduralmente il gong assemblando
 * primitive di base di Three.js (CylinderGeometry, BoxGeometry).
 * Il gong è composto da una struttura di supporto in legno e da un
 * piatto metallico. Il piatto è separato per permettere l'animazione
 * indipendente quando viene colpito.
 */
import * as THREE from 'three';
import { createMatcapTexture } from '../utils/MatcapTextureFactory.js';
import { gongBaseTexture } from '../utils/ProceduralTextureFactory.js';

/**
 * Crea il gong procedurale.
 * @returns {THREE.Group} Il gruppo contenente la struttura e il piatto metallico.
 */
export function createGong() {
  const group = new THREE.Group();

  // --- MATERIALI ---
  const woodMaterial = new THREE.MeshMatcapMaterial({
    matcap: createMatcapTexture(0xc2b280), // Colore bambù/legno chiaro
    flatShading: true,
  });

  const metalMaterial = new THREE.MeshMatcapMaterial({
    matcap: createMatcapTexture(0xbd9b58), // Colore ottone/bronzo base
    map: gongBaseTexture,                  // <--- Aggiunta la texture dipinta
    bumpMap: gongBaseTexture,              // <--- I graffi faranno spessore
    bumpScale: 0.003,                      // <--- Rilievo sottilissimo
    flatShading: true,
  });

  const ropeMaterial = new THREE.MeshMatcapMaterial({
    matcap: createMatcapTexture(0x4a4a4a), // Corda scura
    flatShading: true,
  });

  // --- STRUTTURA DI SUPPORTO ---
  const standGroup = new THREE.Group();
  standGroup.userData = { physics: { type: 'kinematicPositionBased', isCompoundRoot: true } };
  
  // Parametri struttura
  const legHeight = 0.20;
  const legRadius = 0.006;
  const standWidth = 0.16;

  // Gamba Sinistra
  const legGeo = new THREE.CylinderGeometry(legRadius, legRadius, legHeight, 8);
  const leftLeg = new THREE.Mesh(legGeo, woodMaterial);
  leftLeg.userData.physics = { shape: 'convexHull' };
  leftLeg.position.set(-standWidth / 2, legHeight / 2, 0);
  leftLeg.castShadow = true;
  standGroup.add(leftLeg);

  // Gamba Destra
  const rightLeg = new THREE.Mesh(legGeo, woodMaterial);
  rightLeg.userData.physics = { shape: 'convexHull' };
  rightLeg.position.set(standWidth / 2, legHeight / 2, 0);
  rightLeg.castShadow = true;
  standGroup.add(rightLeg);

  // Traversa superiore
  const topBarGeo = new THREE.CylinderGeometry(legRadius, legRadius, standWidth + 0.04, 8);
  topBarGeo.rotateZ(Math.PI / 2);
  const topBar = new THREE.Mesh(topBarGeo, woodMaterial);
  topBar.userData.physics = { shape: 'convexHull' };
  topBar.position.set(0, legHeight - 0.01, 0);
  topBar.castShadow = true;
  standGroup.add(topBar);

  // Basi dei piedi (per stabilità visiva)
  const footGeo = new THREE.BoxGeometry(0.04, 0.01, 0.06);
  const leftFoot = new THREE.Mesh(footGeo, woodMaterial);
  leftFoot.userData.physics = { shape: 'convexHull' };
  leftFoot.position.set(-standWidth / 2, 0.005, 0);
  leftFoot.castShadow = true;
  standGroup.add(leftFoot);

  const rightFoot = new THREE.Mesh(footGeo, woodMaterial);
  rightFoot.userData.physics = { shape: 'convexHull' };
  rightFoot.position.set(standWidth / 2, 0.005, 0);
  rightFoot.castShadow = true;
  standGroup.add(rightFoot);

  group.add(standGroup);

  // --- PIATTO DEL GONG ---
  // Raggruppiamo il piatto e le corde per poterli animare insieme
  const plateGroup = new THREE.Group();
  plateGroup.userData = { physics: { type: 'kinematicPositionBased', isCompoundRoot: true } };
  // Posizioniamo il centro del plateGroup in alto (dove si aggancia la corda)
  // per facilitare una rotazione a pendolo realistica.
  const suspensionY = legHeight - 0.01; 
  plateGroup.position.set(0, suspensionY, 0);

  const gongRadius = 0.06;
  const gongThickness = 0.004;

  // Il disco di metallo (spostato verso il basso rispetto al pivot)
  const plateGeo = new THREE.CylinderGeometry(gongRadius, gongRadius, gongThickness, 16);
  plateGeo.rotateX(Math.PI / 2); // Orientiamo la faccia verso Z
  const plateMesh = new THREE.Mesh(plateGeo, metalMaterial);
  plateMesh.position.set(0, -gongRadius - 0.01, 0); // Abbassiamo il disco
  plateMesh.castShadow = true;
  
  // Identificatore cruciale per le collisioni fisiche in seguito
  plateMesh.userData = {
    kind: 'gong_plate',
    physics: {
      shape: 'cuboid',
      extents: [0.06, 0.06, 0.015],
      activeEvents: true,
      id: 'gong_plate'
    }
  }; 
  
  plateGroup.add(plateMesh);

  // Cordicelle di sospensione
  const ropeLength = Math.hypot(standWidth / 4, gongRadius + 0.01);
  const ropeGeo = new THREE.CylinderGeometry(0.001, 0.001, ropeLength, 4);
  
  const leftRope = new THREE.Mesh(ropeGeo, ropeMaterial);
  leftRope.position.set(-standWidth / 8, -ropeLength / 2, 0);
  leftRope.rotation.z = -Math.PI / 6;
  plateGroup.add(leftRope);

  const rightRope = new THREE.Mesh(ropeGeo, ropeMaterial);
  rightRope.position.set(standWidth / 8, -ropeLength / 2, 0);
  rightRope.rotation.z = Math.PI / 6;
  plateGroup.add(rightRope);

  group.add(plateGroup);

  // Riferimento comodo al plateGroup per poterlo animare in seguito dall'esterno
  group.userData.plateGroup = plateGroup;
  // Identificatore per il gruppo intero
  group.userData.kind = 'gong_structure';

  return group;
}