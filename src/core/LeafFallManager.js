/**
 * Responsabilità unica (SRP): gestire l'animazione di caduta "a zig-zag" e il
 * fade-out delle foglie potate, rilevando in modo semplificato il contatto
 * con la vasca del bonsai o con una superficie reale tracciata via WebXR,
 * senza collisioni fisiche vere e proprie con il resto della scena.
 */
import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { GARDEN_WIDTH, GARDEN_DEPTH } from '../utils/GardenLayout.js';
import { disposeGraph } from '../utils/DisposeUtils.js';

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
    this._tempLocalPos = new THREE.Vector3();
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
      startY: leaf.position.y,
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
  update(hitPose = null) {
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

      // Verifica del contatto: converte la posizione in coordinate locali
      // rispetto al gruppo del giardino per determinare se la foglia si trova
      // sopra la vasca oppure fuori, nello spazio reale.
      const localPos = this._tempLocalPos.copy(leaf.position);
      this.garden.group.worldToLocal(localPos);

      const halfWidth = GARDEN_WIDTH / 2;
      const halfDepth = GARDEN_DEPTH / 2;
      const isOverTray = Math.abs(localPos.x) <= halfWidth && Math.abs(localPos.z) <= halfDepth;

      if (isOverTray) {
        // Cade dentro la vasca.
        if (localPos.y <= this.garden.sandTopY) {
          localPos.y = this.garden.sandTopY;
          this.garden.group.localToWorld(localPos);
          leaf.position.copy(localPos);
          this._startFadeOut(leaf);
        }
      } else {
        // Cade fuori dalla vasca, nello spazio reale circostante.
        const fallbackY = this.garden.group.position.y - 1.0;
        let surfaceY = fallbackY;

        // Se WebXR sta tracciando una superficie in questo momento, la usa come piano d'appoggio.
        if (hitPose) {
          const hitY = hitPose.transform.position.y;
          // Evita false collisioni con i muri: accetta la superficie solo se
          // è fisicamente più in basso del punto in cui la foglia è stata rilasciata.
          if (hitY < data.startY) {
            surfaceY = hitY;
          }
        }

        if (leaf.position.y <= surfaceY) {
          leaf.position.y = surfaceY; // Aggancia la foglia al pavimento o al tavolo reale tracciato.
          this._startFadeOut(leaf);
        } else if (leaf.position.y <= fallbackY) {
          // Limite di sicurezza raggiunto senza alcuna superficie tracciata: la foglia dissolve comunque.
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
        this.scene.remove(leaf);
        disposeGraph(leaf);
        
        const index = this.fallingLeaves.indexOf(leaf);
        if (index > -1) {
          this.fallingLeaves.splice(index, 1);
        }
      })
      .start();
  }
}