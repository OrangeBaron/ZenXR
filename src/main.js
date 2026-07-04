/**
 * ============================================================================
 * ZenXR — main.js  (Entry Point dell'applicazione)
 * ============================================================================
 * Fase 2 + primi passi di Fase 4/5: Core 3D, WebXR, posizionamento del
 * giardino tramite trigger/pinch e prima generazione procedurale (base,
 * bonsai centrale e rocce sparse casualmente).
 *
 * Responsabilità (Single Responsibility Principle):
 *   Questo file orchestra soltanto l'inizializzazione dei moduli core e
 *   l'animation loop. NON contiene logica di gioco, generazione procedurale
 *   o gestione dello stato: quella arriverà nelle fasi successive tramite
 *   moduli dedicati:
 *     - /src/core/StateManager.js   (stato globale)              [Fase 3]
 *     - /src/utils/SaveSystem.js    (persistenza LocalStorage)   [Fase 3]
 *     - /src/core/HandTrackingManager.js (input mani avanzato)   [Fase 4]
 *     - /src/entities/KoiBoids.js, ...                           [Fase 5+]
 *
 * Vincoli architetturali (GDD §7):
 *   - Puro Vanilla JS (ES6+). Nessun framework UI.
 *   - Nessun bundler: import "bare" risolti dalla Import Map in index.html.
 * ============================================================================
 */
import GUI from 'lil-gui';
import { SceneManager } from './core/SceneManager.js';
import { XRManager } from './core/XRManager.js';
import { XRInteractionManager } from './core/XRInteractionManager.js';
import { PlacementPreview } from './entities/PlacementPreview.js';
import { GardenBase } from './entities/GardenBase.js';

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
 * @returns {GUI}
 */
function createDebugGUI(sceneManager, placementPreview, garden) {
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
  // 'select' della sessione XR (utile finché non si testa in visore).
  const gardenFolder = gui.addFolder('Giardino (debug desktop)');
  gardenFolder
    .add(
      {
        mostra: () => {
          garden.group.position.set(0, 0, -1);
          garden.group.quaternion.identity();
          garden.group.visible = true;
        },
      },
      'mostra'
    )
    .name('Mostra al centro');

  return gui;
}

/**
 * Bootstrap dell'applicazione. Inizializza scena, sessione XR, anteprima di
 * posizionamento, giardino procedurale e pannello di debug, poi avvia
 * l'animation loop.
 */
function bootstrap() {
  console.log('%c⛩️ ZenXR — Core 3D / WebXR / Giardino procedurale', 'font-weight:bold;color:#8fbf9f');

  const sceneManager = new SceneManager();

  const placementPreview = new PlacementPreview();
  sceneManager.scene.add(placementPreview.mesh);

  const garden = new GardenBase();
  sceneManager.scene.add(garden.group);

  const gui = createDebugGUI(sceneManager, placementPreview, garden);

  const xrManager = new XRManager({
    renderer: sceneManager.renderer,
    onSessionStart: () => {
      gui.domElement.style.display = 'none';
    },
    onSessionEnd: () => {
      gui.domElement.style.display = '';
    },
  });

  new XRInteractionManager({
    renderer: sceneManager.renderer,
    placementPreview,
    targetGroup: garden.group,
    onPlace: () => console.log('[ZenXR] Giardino posizionato sulla superficie reale.'),
  });

  removeBootOverlay();

  sceneManager.renderer.setAnimationLoop((_timestamp, frame) => {
    if (frame) {
      const pose = xrManager.getHitPose(frame);
      placementPreview.update(pose);
    }
    sceneManager.render();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
