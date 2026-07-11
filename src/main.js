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
import GUI from 'lil-gui';
import { SceneManager } from './core/SceneManager.js';
import { XRManager } from './core/XRManager.js';
import { XRInteractionManager } from './core/XRInteractionManager.js';
import { HandTrackingManager } from './core/HandTrackingManager.js';
import { HandOcclusionManager } from './core/HandOcclusionManager.js';
import { StateManager } from './core/StateManager.js';
import { PlacementPreview } from './entities/PlacementPreview.js';
import { GardenBase } from './entities/GardenBase.js';
import { loadGardenState, saveGardenState, clearGardenState } from './utils/SaveSystem.js';
import { PhysicsManager } from './core/PhysicsManager.js';
import { LeafFallManager } from './core/LeafFallManager.js';

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
 * Il pannello è un overlay DOM: durante la sessione immersiva il compositor
 * WebXR sostituisce la vista di pagina con il rendering stereo, quindi il
 * pannello risulta già "nascosto in visore" e visibile solo su monitor
 * desktop. Lo nascondiamo comunque esplicitamente per pulizia.
 *
 * @param {SceneManager} sceneManager
 * @param {PlacementPreview} placementPreview
 * @param {GardenBase} garden
 * @param {StateManager} stateManager
 * @param {() => void} onResetMemory Azzera il salvataggio e ricarica il giardino.
 * @returns {GUI}
 */
function createDebugGUI(sceneManager, placementPreview, garden, stateManager, onResetMemory) {
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

  // Affordance di debug per testare la generazione procedurale su desktop,
  // dove non è disponibile alcun grilletto/pinch per innescare l'evento
  // 'select' della sessione XR.
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

  // Azione di debug in sostituzione del futuro rituale fisico del gong
  // ("colpirlo 3 volte per ripulire il giardino").
  const memoryFolder = gui.addFolder('Memoria');
  memoryFolder
    .add({ reset: onResetMemory }, 'reset')
    .name('Reset memoria giardino');

  // Simula un'interazione con un oggetto del giardino per verificare che il
  // debounce e il salvataggio dinamico via StateManager funzionino.
  memoryFolder
    .add({ simula: () => stateManager.notifyChange() }, 'simula')
    .name('Simula modifica e salva');

  return gui;
}

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

  const placementPreview = new PlacementPreview();
  sceneManager.scene.add(placementPreview.mesh);

  // Al primo avvio non c'è nulla da ripristinare, quindi il giardino nasce
  // dalla generazione procedurale casuale e viene salvato subito, per non
  // rigenerare rocce/albero diversi a ogni ricarica.
  const savedState = loadGardenState();
  const garden = new GardenBase({ savedState });
  sceneManager.scene.add(garden.group);
  if (!savedState) {
    saveGardenState(garden.getState());
  }

  let physicsReady = false;
  function startGardenPhysics() {
    if (physicsReady) return;
    physicsReady = true;
    physicsManager.addStaticFloor(garden.sand);
    physicsManager.addStaticBonsai(garden.bonsai);
    garden.rocks.forEach(rock => physicsManager.addRock(rock));
    if (garden.rake) {
      physicsManager.addRake(garden.rake);
    }
  }

  // Lo StateManager fa solo da "campanello" (nessun I/O, nessun THREE.js):
  // è main.js a decidere come reagire alle notifiche di modifica, qui con
  // un debounce per non scrivere su LocalStorage a ogni interazione.
  const stateManager = new StateManager();
  let saveDebounceTimer = null;
  stateManager.onChange(() => {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
      saveGardenState(garden.getState());
    }, SAVE_DEBOUNCE_MS);
  });

  const gui = createDebugGUI(sceneManager, placementPreview, garden, stateManager, () => {
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

  // Mappa le mani dell'utente e gestisce il pinch delle foglie secche del
  // bonsai. Ogni foglia potata notifica lo StateManager, che (tramite il
  // listener sopra) fa scattare il debounce di salvataggio.
  const handTrackingManager = new HandTrackingManager({
    renderer: sceneManager.renderer,
    scene: sceneManager.scene,
    bonsai: garden.bonsai,
    garden: garden,
    stateManager,
    leafFallManager,
    physicsManager: physicsManager
  });

  // Sfere di occlusione invisibili agganciate ai giunti delle mani, così le
  // mani reali dell'utente coprono correttamente gli oggetti virtuali del
  // giardino invece di finire sempre "dietro" di essi.
  const handOcclusionManager = new HandOcclusionManager({
    renderer: sceneManager.renderer,
    scene: sceneManager.scene,
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

    sceneManager.render();
  });
}

// Se lo script viene eseguito prima del parsing completo del DOM, l'avvio
// va posticipato a DOMContentLoaded; altrimenti l'evento è già passato e
// bootstrap() va invocato subito.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => bootstrap(), { once: true });
} else {
  bootstrap();
}