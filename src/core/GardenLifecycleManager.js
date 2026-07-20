import { GardenBase } from '../entities/GardenBase.js';
import { loadGardenState, saveGardenState, clearGardenState } from '../utils/SaveSystem.js';
import * as TWEEN from '@tweenjs/tween.js';

export class GardenLifecycleManager {
  constructor({ sceneManager, physicsManager, sandSurfaceManager, xrInteractionManager }) {
    this.sceneManager = sceneManager;
    this.physicsManager = physicsManager;
    this.sandSurfaceManager = sandSurfaceManager;
    this.xrInteractionManager = xrInteractionManager;
    
    // Riferimento centralizzato al giardino attivo
    this.garden = null;
    
    // Riferimenti ai manager interattivi
    this.handTrackingManager = null;
    this.leafFallManager = null;
    this.rakeManager = null;
    this.matchManager = null;
    this.incenseManager = null;
    this.onPhysicsRestart = null;
  }

  /**
   * Collega i manager interattivi e la callback di riavvio della fisica.
   */
  initManagers({ handTrackingManager, leafFallManager, rakeManager, matchManager, incenseManager, onPhysicsRestart }) {
    this.handTrackingManager = handTrackingManager;
    this.leafFallManager = leafFallManager;
    this.rakeManager = rakeManager;
    this.matchManager = matchManager;
    this.incenseManager = incenseManager;
    this.onPhysicsRestart = onPhysicsRestart;
  }

  /**
   * Gestisce il bootstrap iniziale del giardino (caricamento o creazione da zero).
   */
  async initGarden() {
    const savedState = await loadGardenState();
    this.garden = new GardenBase({ 
      savedState, 
      sandTexture: this.sandSurfaceManager.getTexture() 
    });
    
    this.sceneManager.scene.add(this.garden.group);

    if (savedState && savedState.sand) {
      this.sandSurfaceManager.restoreFromBlob(savedState.sand);
    }
    
    if (!savedState) {
      saveGardenState(this.garden.getState());
    }

    return this.garden;
  }

  /**
   * Svolge l'intera sequenza di reset e rigenerazione del giardino.
   */
  async resetGarden() {
    console.log('[ZenXR] Reset del giardino in corso...');
    
    // 1. Pulisci i dati persistenti e la sabbia
    await clearGardenState();
    this.sandSurfaceManager.clear();

    // 2. Rimuovi visivamente e fisicamente il VECCHIO giardino
    this.sceneManager.scene.remove(this.garden.group);
    this.physicsManager.clear();
    
    // Sgancia eventuali rocce o foglie rimaste in mano all'utente
    if (this.handTrackingManager) {
      this.handTrackingManager._heldLeaves.clear();
      this.handTrackingManager._heldObjects.clear();
    }

    // 3. Genera il NUOVO giardino (fresco e casuale)
    this.garden = new GardenBase({ sandTexture: this.sandSurfaceManager.getTexture() });

    // 4. Se l'utente aveva già ancorato il giardino nella stanza, manteniamo la posizione
    if (this.xrInteractionManager.hasPlaced) {
      this.garden.group.position.copy(this.xrInteractionManager.targetGroup.position);
      this.garden.group.quaternion.copy(this.xrInteractionManager.targetGroup.quaternion);
      this.garden.group.visible = true;
    }

    this.sceneManager.scene.add(this.garden.group);

    // 5. Aggiorna i riferimenti dinamici in tutti i manager interattivi
    this.xrInteractionManager.targetGroup = this.garden.group;
    
    if (this.handTrackingManager) {
      this.handTrackingManager.bonsai = this.garden.bonsai;
      this.handTrackingManager.garden = this.garden;
    }
    if (this.leafFallManager) {
      this.leafFallManager.garden = this.garden;
    }
    if (this.rakeManager) {
      this.rakeManager.garden = this.garden;
    }
    if (this.matchManager) {
      this.matchManager.garden = this.garden;
    }
    if (this.incenseManager) {
      this.incenseManager.garden = this.garden;
      this.incenseManager._resetIncense();
    }

    // 6. Riavvia il motore fisico per i nuovi elementi
    if (this.onPhysicsRestart) {
      this.onPhysicsRestart();
    }

    // 7. Effetto di Dissolvenza in Entrata (Fade-In) per il nuovo giardino
    this.garden.group.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.transparent = true;
        child.material.opacity = 0;
        new TWEEN.Tween(child.material)
          .to({ opacity: 1 }, 1500)
          .easing(TWEEN.Easing.Quadratic.Out)
          .start();
      }
    });

    // 8. Salva immediatamente il nuovo stato generato
    saveGardenState(this.garden.getState());
  }
}