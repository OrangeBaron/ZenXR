/**
 * Punto di ingresso dell'applicazione ZenXR. Responsabilità unica: orchestrare
 * il bootstrap e l'animation loop, inizializzando in ordine i moduli core
 * (scena, fisica, WebXR, interazione, hand-tracking, persistenza) e
 * collegandoli tra loro tramite callback ed eventi. Non contiene logica di
 * gioco, generazione procedurale o (de)serializzazione dello stato: queste
 * responsabilità sono delegate ai moduli dedicati.
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
import { clearGardenState } from './utils/SaveSystem.js';
import { GongInteractionManager } from './core/GongInteractionManager.js';
import { RakeInteractionManager } from './core/RakeInteractionManager.js';
import { GardenLifecycleManager } from './core/GardenLifecycleManager.js';
import { AutoSaveManager } from './core/AutoSaveManager.js';
import { IncenseInteractionManager } from './core/IncenseInteractionManager.js';

/**
 * Rimuove l'overlay di boot statico una volta che l'infrastruttura 3D/XR
 * è pronta e il bottone AR (creato da XRManager) è visibile in pagina.
 */
function removeBootOverlay() {
  document.getElementById('boot')?.remove();
}

/**
 * Crea e collega il pannello lil-gui di debug per i parametri procedurali.
 */
function createDebugGUI(sceneManager, placementPreview, lifecycleManager, stateManager, sandSurfaceManager, onResetMemory) {
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
          const garden = lifecycleManager.garden;
          if (garden) {
            garden.group.position.set(0, 0, -1);
            garden.group.rotation.set(0, Math.PI, 0);
            garden.group.visible = true;
          }
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

  // Istanziamo l'XRInteractionManager passando un gruppo temporaneo che verrà 
  // aggiornato dinamicamente dal LifecycleManager al bootstrap o dopo il reset.
  const xrInteractionManager = new XRInteractionManager({
    renderer: sceneManager.renderer,
    placementPreview,
    targetGroup: new THREE.Group(),
    onPlace: () => {
      console.log('[ZenXR] Giardino posizionato sulla superficie reale.');
      startGardenPhysics();
    }
  });

  // Gestore del Ciclo di Vita
  const lifecycleManager = new GardenLifecycleManager({
    sceneManager,
    physicsManager,
    sandSurfaceManager,
    xrInteractionManager
  });

  // Inizializzazione live del giardino
  const garden = await lifecycleManager.initGarden();
  xrInteractionManager.targetGroup = garden.group;

  let physicsReady = false;
  startGardenPhysics = () => {
    if (physicsReady) return;
    physicsReady = true;

    const activeGarden = lifecycleManager.garden;

    physicsManager.addStaticFloor(activeGarden.sand);
    physicsManager.addStaticBonsai(activeGarden.bonsai);
    activeGarden.rocks.forEach(rock => physicsManager.addRock(rock));
    if (activeGarden.rake) {
      physicsManager.addRake(activeGarden.rake);
    }

    // Il GongInteractionManager ora delega l'azione al LifecycleManager
    const gongManager = new GongInteractionManager({
      gong: activeGarden.gong,
      gardenGroup: activeGarden.group,
      onReset: () => lifecycleManager.resetGarden()
    });

    physicsManager.addGong(activeGarden.gong, () => gongManager.handleHit());
  };

  const stateManager = new StateManager();

  // Gestore del Salvataggio Automatico
  const autoSaveManager = new AutoSaveManager({
    stateManager,
    lifecycleManager,
    sandSurfaceManager
  });

  // Passiamo il lifecycleManager alla GUI in modo che acceda dinamicamente alla proprietà live del giardino
  const gui = createDebugGUI(sceneManager, placementPreview, lifecycleManager, stateManager, sandSurfaceManager, () => {
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

  const incenseManager = new IncenseInteractionManager({
    scene: sceneManager.scene,
    garden: garden,
    stateManager: stateManager,
    physicsManager: physicsManager
  });

  // Forniamo i riferimenti dei moduli interattivi al LifecycleManager per i futuri reset in-game
  lifecycleManager.initManagers({
    handTrackingManager,
    leafFallManager,
    rakeManager,
    incenseManager,
    onPhysicsRestart: () => {
      physicsReady = false;
      startGardenPhysics();
    }
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
    incenseManager.update(pose);
  
    sceneManager.render();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => bootstrap(), { once: true });
} else {
  bootstrap();
}