import { saveGardenState } from '../utils/SaveSystem.js';

/**
 * Responsabilità unica (SRP): Ascoltare gli eventi di cambiamento di stato
 * dal StateManager e orchestrare i salvataggi su IndexedDB applicando
 * logiche di debounce (ritardo) specifiche per ogni tipo di interazione,
 * per evitare scritture troppo frequenti e cali di framerate.
 */
export class AutoSaveManager {
  /**
   * @param {Object} options
   * @param {import('./StateManager.js').StateManager} options.stateManager
   * @param {import('./GardenLifecycleManager.js').GardenLifecycleManager} options.lifecycleManager
   * @param {import('./SandSurfaceManager.js').SandSurfaceManager} options.sandSurfaceManager
   */
  constructor({ stateManager, lifecycleManager, sandSurfaceManager }) {
    this.stateManager = stateManager;
    this.lifecycleManager = lifecycleManager;
    this.sandSurfaceManager = sandSurfaceManager;

    this.saveDebounceTimer = null;
    
    // Ritardi (in millisecondi) prima che il salvataggio parta effettivamente
    this.DEBOUNCE_TIMES = {
      'rock_moved': 2000,
      'leaf_pruned': 1000,
      'sand_drawn': 1500,
      'default': 1000
    };

    // Colleghiamo l'ascoltatore di eventi
    this.stateManager.onChange(this._handleStateChange.bind(this));
  }

  _handleStateChange(event) {
    clearTimeout(this.saveDebounceTimer);
    
    const action = event.detail?.action || 'default';
    const delay = this.DEBOUNCE_TIMES[action] || this.DEBOUNCE_TIMES['default'];

    this.saveDebounceTimer = setTimeout(async () => {
      await this.performSave(action, delay);
    }, delay);
  }

  /**
   * Esegue materialmente il salvataggio.
   * Può essere chiamato anche manualmente bypassando il timer.
   */
  async performSave(action = 'manual', delay = 0) {
    const activeGarden = this.lifecycleManager.garden;
    if (!activeGarden) return;

    try {
      const state = activeGarden.getState();
      state.sand = await this.sandSurfaceManager.exportBlob(); 
      
      await saveGardenState(state);
      console.log(`[ZenXR] Stato salvato con successo (Trigger: ${action}, Attesa: ${delay}ms)`);
    } catch (err) {
      console.warn(`[ZenXR] Errore nel salvataggio automatico (${action}):`, err);
    }
  }
}