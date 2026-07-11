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
 * @param {() => void} onResetMemory Azzera il salvataggio e ricarica il giardino.
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
          startGardenPhysics(); // La funzione sarà iniettata da bootstrap
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

  // Inizializza il manager della sabbia passando il renderer
  const sandSurfaceManager = new SandSurfaceManager(sceneManager.renderer);

  const placementPreview = new PlacementPreview();
  sceneManager.scene.add(placementPreview.mesh);

  const savedState = loadGardenState();
  const garden = new GardenBase({ 
    savedState, 
    sandTexture: sandSurfaceManager.getTexture() 
  });
  sceneManager.scene.add(garden.group);

  if (savedState && savedState.sand) {
    sandSurfaceManager.restoreFromBase64(savedState.sand);
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
  };

  const stateManager = new StateManager();
  let saveDebounceTimer = null;
  stateManager.onChange(() => {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
      const state = garden.getState();
      
      state.sand = sandSurfaceManager.exportBase64(); 
      
      saveGardenState(state);
      console.log('[ZenXR] Stato del giardino salvato con successo.');
    }, SAVE_DEBOUNCE_MS);
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

  removeBootOverlay();

  // Vettore pre-allocato per evitare garbage collection nel loop
  const _tempToothPos = new THREE.Vector3();

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

    // --- LOGICA DISEGNO SABBIA ---
    if (garden.rake && garden.group.visible) {
      garden.rake.updateMatrixWorld(true);

      const segments = [];
      const teeth = garden.rake.children.slice(2);
      
      for (const tooth of teeth) {
        _tempToothPos.set(0, -0.025, 0);
        tooth.localToWorld(_tempToothPos);
        garden.group.worldToLocal(_tempToothPos);

        const isTouching = _tempToothPos.y <= garden.sandTopY + 0.015;

        if (isTouching) {
          const currentPos = { x: _tempToothPos.x, z: _tempToothPos.z };
          
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

      if (segments.length > 0) {
        sandSurfaceManager.drawStrokes(segments);
        
        const tex = sandSurfaceManager.getTexture();
        garden.sand.material.displacementMap = tex;
        garden.sand.material.bumpMap = tex;
        garden.sand.material.aoMap = tex;

        stateManager.notifyChange();
      }
    }
    // -----------------------------

    sceneManager.render();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => bootstrap(), { once: true });
} else {
  bootstrap();
}