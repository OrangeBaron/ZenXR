/**
 * Punto di ingresso dell'applicazione ZenXR. Responsabilità unica: orchestrare
 * il bootstrap e l'animation loop, inizializzando in ordine i moduli core
 * (scena, fisica, WebXR, interazione, hand-tracking, persistenza) e
 * collegandoli tra loro tramite callback ed eventi. Non contiene logica di
 * gioco, generazione procedurale o (de)serializzazione dello stato: queste
 * responsabilità sono delegate ai moduli dedicati importati sotto
 * (`GardenBase`, `PondGenerator`, `SaveSystem`, `HandTrackingManager`, ecc.).
 *
 * Architettura: Vanilla JS (ES6+) senza framework UI né bundler; gli import
 * "bare" sono risolti tramite Import Map in `index.html`.
 */
import * as THREE from 'three';
import GUI from 'lil-gui';
import * as TWEEN from '@tweenjs/tween.js';
import { SceneManager } from './core/SceneManager.js';
import { XRManager } from './core/XRManager.js';
import { XRInteractionManager } from './core/XRInteractionManager.js';
import { HandTrackingManager } from './core/HandTrackingManager.js';
import { HandOcclusionManager } from './core/HandOcclusionManager.js';
import { StateManager } from './core/StateManager.js';
import { PhysicsManager } from './core/PhysicsManager.js';
import { LeafFallManager } from './core/LeafFallManager.js';
import { SandSurfaceManager } from './core/SandSurfaceManager.js';
import { PlacementPreview } from './entities/PlacementPreview.js';
import { GardenBase } from './entities/GardenBase.js';
import { loadGardenState, saveGardenState, clearGardenState } from './utils/SaveSystem.js';
import { GongInteractionManager } from './core/GongInteractionManager.js';
import { RakeInteractionManager } from './core/RakeInteractionManager.js';

/** Ritardo (ms) del debounce fra una notifica di modifica e il salvataggio effettivo. */
const SAVE_DEBOUNCE_MS = 1000;

/**
 * Rimuove l'overlay di boot statico una volta che l'infrastruttura 3D/XR
 * è pronta e il bottone AR (creato da XRManager) è visibile in pagina.
 */
function removeBootOverlay() {
  document.getElementById('boot')?.remove();
}

/**
 * Crea e collega il pannello lil-gui di debug per i parametri procedurali.
 *
 * @param {SceneManager} sceneManager
 * @param {PlacementPreview} placementPreview
 * @param {GardenBase} garden
 * @param {StateManager} stateManager
 * @param {SandSurfaceManager} sandSurfaceManager
 * @param {() => void} onResetMemory
 * @returns {GUI}
 */
function createDebugGUI(sceneManager, placementPreview, garden, stateManager, sandSurfaceManager, onResetMemory) {
  const gui = new GUI({ title: 'ZenXR • Debug' });

  const lightsFolder = gui.addFolder('Illuminazione (provvisoria)');
  lightsFolder.add(sceneManager.hemiLight, 'intensity', 0, 3, 0.01).name('Hemisphere');
  lightsFolder.add(sceneManager.dirLight, 'intensity', 0, 3, 0.01).name('Direzionale');

  const previewFolder = gui.addFolder('Anteprima posizionamento');
  const previewParams = { colore: '#9fd8b8' };
  previewFolder
    .addColor(previewParams, 'colore')
    .onChange((hex) => placementPreview.mesh.material.color.set(hex));
  previewFolder.add(placementPreview.mesh.material, 'opacity', 0, 1, 0.01).name('Opacità');

  const gardenFolder = gui.addFolder('Giardino (debug desktop)');
  gardenFolder
    .add(
      {
        mostra: () => {
          garden.group.position.set(0, 0, -1);
          garden.group.rotation.set(0, Math.PI, 0);
          garden.group.visible = true;
          startGardenPhysics();
        },
      },
      'mostra'
    )
    .name('Mostra al centro');
  
  // Tasto di debug per cancellare manualmente i solchi della sabbia
  gardenFolder
    .add({ pulisciSabbia: () => {
      sandSurfaceManager.clear();
      stateManager.notifyChange();
    } }, 'pulisciSabbia')
    .name('Pulisci Sabbia (Debug)');

  const memoryFolder = gui.addFolder('Memoria');
  memoryFolder
    .add({ reset: onResetMemory }, 'reset')
    .name('Reset memoria giardino');
  memoryFolder
    .add({ simula: () => stateManager.notifyChange() }, 'simula')
    .name('Simula modifica e salva');

  return gui;
}

// Iniezione dipendenza per permettere alla GUI di avviare la fisica su desktop
let startGardenPhysics = () => {};

/**
 * Bootstrap dell'applicazione. Inizializza scena, sessione XR, anteprima di
 * posizionamento, giardino procedurale e pannello di debug, poi avvia
 * l'animation loop.
 */
async function bootstrap() {
  console.log('%c🌱 ZenXR – Core 3D / WebXR / Giardino procedurale', 'font-weight:bold;color:#8fbf9f');
  
  const sceneManager = new SceneManager();

  const physicsManager = new PhysicsManager();
  await physicsManager.init();

  const sandSurfaceManager = new SandSurfaceManager(sceneManager.renderer);

  const placementPreview = new PlacementPreview();
  sceneManager.scene.add(placementPreview.mesh);

  const savedState = await loadGardenState();
  let garden = new GardenBase({ 
    savedState, 
    sandTexture: sandSurfaceManager.getTexture() 
  });
  sceneManager.scene.add(garden.group);

  if (savedState && savedState.sand) {
    sandSurfaceManager.restoreFromBlob(savedState.sand);
  }
  
  if (!savedState) {
    saveGardenState(garden.getState());
  }

  let physicsReady = false;
  startGardenPhysics = () => {
    if (physicsReady) return;
    physicsReady = true;
    physicsManager.addStaticFloor(garden.sand);
    physicsManager.addStaticBonsai(garden.bonsai);
    garden.rocks.forEach(rock => physicsManager.addRock(rock));
    if (garden.rake) {
      physicsManager.addRake(garden.rake);
    }

    const gongManager = new GongInteractionManager({
      gong: garden.gong,
      gardenGroup: garden.group,
      onReset: async () => {
        // 1. Pulisci i dati persistenti e la sabbia
        await clearGardenState();
        sandSurfaceManager.clear();

        // 2. Rimuovi visivamente e fisicamente il VECCHIO giardino
        sceneManager.scene.remove(garden.group);
        physicsManager.clear();
        
        // Sgancia eventuali rocce o foglie rimaste in mano all'utente
        handTrackingManager._heldLeaves.clear();
        handTrackingManager._heldObjects.clear();

        // 3. Genera il NUOVO giardino (senza savedState, quindi fresco e casuale)
        garden = new GardenBase({ sandTexture: sandSurfaceManager.getTexture() });

        // 4. Se l'utente aveva già ancorato il giardino nella stanza, manteniamo la posizione
        if (xrInteractionManager.hasPlaced) {
          garden.group.position.copy(xrInteractionManager.targetGroup.position);
          garden.group.quaternion.copy(xrInteractionManager.targetGroup.quaternion);
          garden.group.visible = true;
        }

        sceneManager.scene.add(garden.group);

        // 5. Aggiorna i riferimenti in tutti i manager interattivi
        xrInteractionManager.targetGroup = garden.group;
        handTrackingManager.bonsai = garden.bonsai;
        handTrackingManager.garden = garden;
        leafFallManager.garden = garden;
        rakeManager.garden = garden;

        // 6. Riavvia il motore fisico per i nuovi elementi
        physicsReady = false; 
        startGardenPhysics();

        // 7. Effetto di Dissolvenza in Entrata (Fade-In) per il nuovo giardino
        garden.group.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material.transparent = true;
            child.material.opacity = 0; // Parte invisibile
            new TWEEN.Tween(child.material)
              .to({ opacity: 1 }, 1500) // Appare gradualmente in 1.5 secondi
              .easing(TWEEN.Easing.Quadratic.Out)
              .start();
          }
        });

        // 8. Salva immediatamente il nuovo stato generato
        saveGardenState(garden.getState());
      }
    });

    physicsManager.addGong(garden.gong, () => gongManager.handleHit());
  };

  const stateManager = new StateManager();
  let saveDebounceTimer = null;
  
  const DEBOUNCE_TIMES = {
    'rock_moved': 2000,
    'leaf_pruned': 1000,
    'sand_drawn': 1500,
    'default': 1000
  };

  stateManager.onChange((event) => {
    clearTimeout(saveDebounceTimer);
    
    const action = event.detail?.action || 'default';
    const delay = DEBOUNCE_TIMES[action] || DEBOUNCE_TIMES['default'];

    saveDebounceTimer = setTimeout(async () => {
      const state = garden.getState();
      
      state.sand = await sandSurfaceManager.exportBlob(); 
      
      saveGardenState(state);
      console.log(`[ZenXR] Stato salvato con successo (Trigger: ${action}, Attesa: ${delay}ms)`);
    }, delay);
  });

  const gui = createDebugGUI(sceneManager, placementPreview, garden, stateManager, sandSurfaceManager, () => {
    clearGardenState();
    window.location.reload();
  });

  const xrManager = new XRManager({
    renderer: sceneManager.renderer,
    onSessionStart: () => {
      gui.domElement.style.display = 'none';
    },
    onSessionEnd: () => {
      gui.domElement.style.display = '';
    },
  });

  const xrInteractionManager = new XRInteractionManager({
    renderer: sceneManager.renderer,
    placementPreview,
    targetGroup: garden.group,
    onPlace: () => {
      console.log('[ZenXR] Giardino posizionato sulla superficie reale.');
      startGardenPhysics();
    }
  });

  const leafFallManager = new LeafFallManager({
    scene: sceneManager.scene,
    garden: garden
  });

  const handTrackingManager = new HandTrackingManager({
    renderer: sceneManager.renderer,
    scene: sceneManager.scene,
    bonsai: garden.bonsai,
    garden: garden,
    stateManager,
    leafFallManager,
    physicsManager: physicsManager
  });

  const handOcclusionManager = new HandOcclusionManager({
    renderer: sceneManager.renderer,
    scene: sceneManager.scene,
  });

  const rakeManager = new RakeInteractionManager({
    garden,
    sandSurfaceManager,
    stateManager
  });

  removeBootOverlay();

  sceneManager.renderer.setAnimationLoop((_timestamp, frame) => {
    let pose = null;
    if (frame) {
      pose = xrManager.getHitPose(frame);
      placementPreview.update(pose);
      xrInteractionManager.update(frame, pose);
      handTrackingManager.update();
      handOcclusionManager.update();
    }

    physicsManager.update();
    leafFallManager.update(pose);
    rakeManager.update();
  
    sceneManager.render();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => bootstrap(), { once: true });
} else {
  bootstrap();
}