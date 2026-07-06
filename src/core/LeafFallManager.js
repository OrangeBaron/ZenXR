/**
 * ============================================================================
 * LeafFallManager.js
 * ============================================================================
 * Responsabilità unica (SRP): gestire l'animazione di caduta "a zig-zag" e il
 * fade-out delle foglie potate, ignorando gli ostacoli della scena virtuale
 * per posarsi fluidamente sulla vasca o cadere oltre.
 * ============================================================================
 */
import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { GARDEN_WIDTH, GARDEN_DEPTH } from '../utils/GardenLayout.js';

export class LeafFallManager {
  /**
   * @param {Object} options
   * @param {THREE.Scene} options.scene
   * @param {import('../entities/GardenBase.js').GardenBase} options.garden 
   */
  constructor({ scene, garden }) {
    this.scene = scene;
    this.garden = garden;
    this.fallingLeaves = [];
    this.clock = new THREE.Clock();
  }

  /**
   * Prende in carico una foglia rilasciata dal pinch.
   * @param {THREE.Mesh} leaf 
   */
  addFallingLeaf(leaf) {
    this.scene.attach(leaf);
    leaf.material.transparent = true;
    leaf.material.opacity = 1.0;
    leaf.material.needsUpdate = true; 

    const phaseOffset = Math.random() * Math.PI * 2;
    const zigZagWidth = 0.04 + Math.random() * 0.06;

    leaf.userData.fallData = {
      time: 0,
      startX: leaf.position.x - Math.sin(phaseOffset) * zigZagWidth,
      startY: leaf.position.y, // Salviamo la quota di partenza
      startZ: leaf.position.z - Math.cos(phaseOffset) * zigZagWidth,
      phaseOffset: phaseOffset,
      speedY: 0.15 + Math.random() * 0.1,
      zigZagWidth: zigZagWidth,
      zigZagSpeed: 1.5 + Math.random() * 1.5,
      isFading: false
    };

    this.fallingLeaves.push(leaf);
  }

  /**
   * Da chiamare ad ogni frame nell'animation loop.
   * @param {XRPose|null} hitPose La posa del mondo reale rilevata in questo frame.
   */
  update(hitPose = null) { // <-- Accetta la pose da main.js
    const delta = this.clock.getDelta();
    TWEEN.update();

    for (let i = this.fallingLeaves.length - 1; i >= 0; i--) {
      const leaf = this.fallingLeaves[i];
      const data = leaf.userData.fallData;

      if (data.isFading) continue;

      data.time += delta;

      leaf.position.y -= data.speedY * delta;
      leaf.position.x = data.startX + Math.sin(data.time * data.zigZagSpeed + data.phaseOffset) * data.zigZagWidth;
      leaf.position.z = data.startZ + Math.cos(data.time * data.zigZagSpeed * 0.8 + data.phaseOffset) * data.zigZagWidth;
      leaf.rotation.x += delta * 0.8;
      leaf.rotation.y += delta * 1.2;

      // --- LOGICA DI COLLISIONE ---
      const localPos = leaf.position.clone();
      this.garden.group.worldToLocal(localPos);

      const halfWidth = GARDEN_WIDTH / 2;
      const halfDepth = GARDEN_DEPTH / 2;
      const isOverTray = Math.abs(localPos.x) <= halfWidth && Math.abs(localPos.z) <= halfDepth;

      if (isOverTray) {
        // Cade DENTRO la vasca
        if (localPos.y <= this.garden.sandTopY) {
          localPos.y = this.garden.sandTopY;
          this.garden.group.localToWorld(localPos);
          leaf.position.copy(localPos);
          this._startFadeOut(leaf);
        }
      } else {
        // Cade FUORI dalla vasca (Mondo Reale)
        const fallbackY = this.garden.group.position.y - 1.0;
        let surfaceY = fallbackY;

        // Se WebXR sta tracciando una superficie in questo momento, la usiamo.
        if (hitPose) {
          const hitY = hitPose.transform.position.y;
          // Evitiamo false collisioni con i muri: accettiamo la superficie solo se 
          // è fisicamente più in basso di dove abbiamo mollato la foglia.
          if (hitY < data.startY) {
            surfaceY = hitY;
          }
        }

        if (leaf.position.y <= surfaceY) {
          leaf.position.y = surfaceY; // Snap sul pavimento o tavolo reale
          this._startFadeOut(leaf);
        } else if (leaf.position.y <= fallbackY) {
          // Raggiunto il limite di sicurezza (es. non stavamo guardando nessuna superficie)
          this._startFadeOut(leaf);
        }
      }
    }
  }

  /**
   * Avvia la dissolvenza e smaltisce la memoria della foglia.
   */
  _startFadeOut(leaf) {
    leaf.userData.fallData.isFading = true;

    new TWEEN.Tween(leaf.material)
      .to({ opacity: 0 }, 2000)
      .easing(TWEEN.Easing.Quadratic.Out)
      .onComplete(() => {
        // Pulizia dalla scena e dalla memoria
        this.scene.remove(leaf);
        leaf.geometry.dispose();
        leaf.material.dispose();
        
        // Rimuoviamo la foglia dall'array
        const index = this.fallingLeaves.indexOf(leaf);
        if (index > -1) {
          this.fallingLeaves.splice(index, 1);
        }
      })
      .start();
  }
}