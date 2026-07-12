/**
 * Responsabilità unica (SRP): Gestire l'interazione logica e visiva con il gong.
 * Tiene traccia dei colpi, anima il pendolo tramite TWEEN e innesca la sequenza
 * di dissolvenza/reset del giardino al raggiungimento del terzo colpo.
 */
import * as TWEEN from '@tweenjs/tween.js';

export class GongInteractionManager {
  /**
   * @param {Object} options
   * @param {THREE.Group} options.gong Il gruppo 3D del gong.
   * @param {THREE.Group} options.gardenGroup Il gruppo radice del giardino (per la dissolvenza).
   * @param {() => void} options.onReset Callback invocata al termine della dissolvenza per resettare il gioco.
   */
  constructor({ gong, gardenGroup, onReset }) {
    this.gong = gong;
    this.gardenGroup = gardenGroup;
    this.onReset = onReset;

    this.gongHits = 0;
    this.lastGongHitTime = 0;
    this.GONG_COOLDOWN_MS = 300;
  }

  /**
   * Da invocare quando il motore fisico rileva una collisione valida sul piatto del gong.
   */
  handleHit() {
    const now = performance.now();
    if (now - this.lastGongHitTime < this.GONG_COOLDOWN_MS) return;
    this.lastGongHitTime = now;

    this.gongHits++;
    console.log(`%c⛩️ [ZenXR] Gong colpito! Impatto: ${this.gongHits}/3`, 'color:#bd9b58; font-weight:bold;');

    this._playPendulumAnimation();

    if (this.gongHits >= 3) {
      this._triggerResetSequence();
    }
  }

  _playPendulumAnimation() {
    const plateGroup = this.gong.userData.plateGroup;
    if (!plateGroup) return;

    // Se c'erano tween precedenti, li fermiamo
    if (plateGroup.userData.tweens) {
      plateGroup.userData.tweens.forEach(t => t.stop());
    }
    
    plateGroup.rotation.x = 0; // Reset di partenza
    
    const t1 = new TWEEN.Tween(plateGroup.rotation).to({ x: 0.25 }, 120).easing(TWEEN.Easing.Quadratic.Out);
    const t2 = new TWEEN.Tween(plateGroup.rotation).to({ x: -0.12 }, 220).easing(TWEEN.Easing.Quadratic.InOut);
    const t3 = new TWEEN.Tween(plateGroup.rotation).to({ x: 0 }, 300).easing(TWEEN.Easing.Quadratic.InOut);
    
    t1.chain(t2);
    t2.chain(t3);
    
    plateGroup.userData.tweens = [t1, t2, t3];
    t1.start();
  }

  _triggerResetSequence() {
    console.log('%c⛩️ [ZenXR] Terzo colpo! Dissolvenza in corso...', 'color:#ff4444; font-weight:bold;');
    
    // Impediamo ulteriori interazioni fisiche sul gong portando il cooldown all'infinito
    this.lastGongHitTime = Infinity;

    // Attraversiamo TUTTI gli oggetti del giardino per farli svanire
    this.gardenGroup.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.transparent = true;
        child.material.needsUpdate = true;
        
        new TWEEN.Tween(child.material)
          .to({ opacity: 0 }, 1500)
          .easing(TWEEN.Easing.Quadratic.Out)
          .start();
      }
    });

    // Eseguiamo il ricaricamento passando la palla al main tramite callback
    setTimeout(() => {
      if (this.onReset) this.onReset();
    }, 1600);
  }
}