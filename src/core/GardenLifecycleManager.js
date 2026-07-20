import { GardenBase } from '../entities/GardenBase.js';
import { loadGardenState, saveGardenState, clearGardenState } from '../utils/SaveSystem.js';
import { disposeGraph } from '../utils/DisposeUtils.js';
import * as TWEEN from '@tweenjs/tween.js';

export class GardenLifecycleManager {
  constructor({ sceneManager, physicsManager, sandSurfaceManager, xrInteractionManager }) {
    this.sceneManager = sceneManager;
    this.physicsManager = physicsManager;
    this.sandSurfaceManager = sandSurfaceManager;
    this.xrInteractionManager = xrInteractionManager;
    
    // Riferimento centralizzato al giardino attivo
    this.garden = null;
    
    // Lista dinamica dei sistemi interattivi per automatizzare il reset
    this.systems = [];
    this.onPhysicsRestart = null;
  }

  /**
   * Registra dinamicamente i manager interattivi passati come oggetto 
   * e la callback di riavvio della fisica.
   */
  initManagers(managers) {
    this.onPhysicsRestart = managers.onPhysicsRestart;
    
    // Popola dinamicamente la lista dei sistemi escludendo la callback
    for (const key in managers) {
      if (key !== 'onPhysicsRestart' && managers[key]) {
        this.systems.push(managers[key]);
      }
    }
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
    
    // Memorizza la visibilità del vecchio giardino per ereditarla nel nuovo
    const wasVisible = this.garden.group.visible;

    // 2. Rimuovi visivamente e fisicamente il VECCHIO giardino
    this.sceneManager.scene.remove(this.garden.group);
    this.physicsManager.clear();

    disposeGraph(this.garden.group);
    
    // Sgancia eventuali rocce o interazioni in corso in tutti i sistemi registrati
    for (const system of this.systems) {
      if (system._heldLeaves) system._heldLeaves.clear();
      if (system._heldObjects) system._heldObjects.clear();
    }

    // 3. Genera il NUOVO giardino (fresco e casuale)
    this.garden = new GardenBase({ sandTexture: this.sandSurfaceManager.getTexture() });
    
    // 4. Manteniamo la posizione ancorata e la visibilità del precedente
    this.garden.group.position.copy(this.xrInteractionManager.targetGroup.position);
    this.garden.group.quaternion.copy(this.xrInteractionManager.targetGroup.quaternion);
    this.garden.group.visible = wasVisible;
    
    this.sceneManager.scene.add(this.garden.group);
    
    // 5. Aggiorna automaticamente i riferimenti dinamici in tutti i manager interattivi
    this.xrInteractionManager.targetGroup = this.garden.group;
    
    for (const system of this.systems) {
      if ('garden' in system) system.garden = this.garden;
      if ('bonsai' in system) system.bonsai = this.garden.bonsai;
      
      // Hook opzionale per manager che richiedono procedure di reset specifiche (es. Incenso)
      if (typeof system._resetIncense === 'function') {
        system._resetIncense();
      }
    }

    // 6. Riavvia il motore fisico per i nuovi elementi
    if (this.onPhysicsRestart) {
      this.onPhysicsRestart();
    }

    // 7. Effetto di Dissolvenza in Entrata (Fade-In) per il nuovo giardino
    this.garden.group.traverse((child) => {
      if (child.isMesh && child.material) {
        // Gestione array di materiali se presenti
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        
        materials.forEach(mat => {
          mat.transparent = true;
          mat.needsUpdate = true; // Essenziale affinché Three.js ricompili lo shader abilitando la trasparenza
          mat.opacity = 0;
          
          new TWEEN.Tween(mat)
            .to({ opacity: 1 }, 1500)
            .easing(TWEEN.Easing.Quadratic.Out)
            .start();
        });
      }
    });

    // 8. Salva immediatamente il nuovo stato generato
    saveGardenState(this.garden.getState());
  }
}