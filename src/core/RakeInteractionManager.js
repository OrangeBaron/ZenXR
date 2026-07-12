/**
 * Responsabilità unica (SRP): Gestire il disegno sulla sabbia tramite il rastrello.
 * Controlla la posizione tridimensionale dei denti del rastrello rispetto alla vasca,
 * calcola i segmenti di tratto validi ed invia il comando di disegno al SandSurfaceManager.
 */
import * as THREE from 'three';

export class RakeInteractionManager {
  /**
   * @param {Object} options
   * @param {import('../entities/GardenBase.js').GardenBase} options.garden
   * @param {import('./SandSurfaceManager.js').SandSurfaceManager} options.sandSurfaceManager
   * @param {import('./StateManager.js').StateManager} options.stateManager
   */
  constructor({ garden, sandSurfaceManager, stateManager }) {
    this.garden = garden;
    this.sandSurfaceManager = sandSurfaceManager;
    this.stateManager = stateManager;

    // Vettore pre-allocato per evitare garbage collection nel loop
    this._tempToothPos = new THREE.Vector3();
  }

  /**
   * Da chiamare ad ogni frame nell'animation loop per processare l'interazione.
   */
  update() {
    // Se il rastrello non esiste o il giardino è invisibile (non ancora piazzato in AR)
    if (!this.garden.rake || !this.garden.group.visible) return;

    this.garden.rake.updateMatrixWorld(true);

    const segments = [];
    // I denti del rastrello sono i figli dal terzo in poi (i primi due sono manico e traversa)
    const teeth = this.garden.rake.children.slice(2);
    
    for (const tooth of teeth) {
      // Offset verso il basso: andiamo sulla punta del dente
      this._tempToothPos.set(0, -0.025, 0); 
      tooth.localToWorld(this._tempToothPos);
      
      // Portiamo la posizione nello spazio locale del giardino
      this.garden.group.worldToLocal(this._tempToothPos);

      // Verifichiamo se il dente tocca o penetra la quota della sabbia
      const isTouching = this._tempToothPos.y <= this.garden.sandTopY + 0.015;

      if (isTouching) {
        const currentPos = { x: this._tempToothPos.x, z: this._tempToothPos.z };
        
        if (tooth.userData.lastPos) {
          // Evita di disegnare micro-segmenti se il rastrello è praticamente fermo
          const dist = Math.hypot(currentPos.x - tooth.userData.lastPos.x, currentPos.z - tooth.userData.lastPos.z);
          if (dist > 0.0005) { 
            segments.push({ start: tooth.userData.lastPos, end: currentPos });
            tooth.userData.lastPos = currentPos;
          }
        } else {
          // È il primissimo frame di contatto, salviamo il punto di partenza
          tooth.userData.lastPos = currentPos;
        }
      } else {
        // Il dente si è sollevato, resettiamo il tracciamento
        tooth.userData.lastPos = null;
      }
    }

    // Se ci sono nuovi segmenti, inviamoli alla texture e aggiorniamo il materiale
    if (segments.length > 0) {
      this.sandSurfaceManager.drawStrokes(segments);
      
      const tex = this.sandSurfaceManager.getTexture();
      this.garden.sand.material.displacementMap = tex;
      this.garden.sand.material.bumpMap = tex;
      this.garden.sand.material.aoMap = tex;

      // Notifichiamo il salvataggio
      this.stateManager.notifyChange({ action: 'sand_drawn' });
    }
  }
}