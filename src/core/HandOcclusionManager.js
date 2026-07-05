/**
 * ============================================================================
 * HandOcclusionManager.js
 * ============================================================================
 * Responsabilità unica (SRP): far sì che le mani reali dell'utente possano
 * "occludere" visivamente gli oggetti virtuali del giardino in `immersive-ar`.
 * 
 * Invece di usare sfere separate sui singoli giunti, questa versione usa
 * l'addon ufficiale XRHandModelFactory per caricare una Skinned Mesh continua
 * della mano. Successivamente, applica dinamicamente a questa mesh il
 * materiale di occlusione (colorWrite: false) per bucare lo z-buffer.
 * ============================================================================
 */
import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

const HAND_COUNT = 2;
const OCCLUSION_RENDER_ORDER = -1;

// Il materiale invisibile che scrive solo nello z-buffer
const occlusionMaterial = new THREE.MeshBasicMaterial({ colorWrite: false });

export class HandOcclusionManager {
  /**
   * @param {Object} options
   * @param {THREE.WebGLRenderer} options.renderer Renderer con `xr.enabled = true`.
   * @param {THREE.Scene} options.scene Scena a cui agganciare i gruppi delle mani.
   */
  constructor({ renderer, scene }) {
    this.renderer = renderer;
    this.scene = scene;
    
    this.hands = [];
    this.handModels = [];

    // Inizializza la factory ufficiale di Three.js per le mani WebXR
    const handModelFactory = new XRHandModelFactory();
    // Nota: di default, la factory scarica il GLB generico della mano 
    // dalla CDN di jsDelivr (WebXR Input Profiles), rispettando il tuo setup.

    for (let i = 0; i < HAND_COUNT; i++) {
      // 1. Ottieni il controller logico della mano
      const hand = this.renderer.xr.getHand(i);
      this.scene.add(hand);
      this.hands.push(hand);

      // 2. Crea il modello tridimensionale continuo ('mesh') agganciato ai giunti
      const handModel = handModelFactory.createHandModel(hand, 'mesh');
      this.scene.add(handModel);
      this.handModels.push(handModel);
    }
  }

  /**
   * Da chiamare ad ogni frame XR (nell'animation loop di main.js).
   */
  update() {
    // La factory carica il modello GLB in modo asincrono.
    // Poiché non espone una callback diretta di fine caricamento, controlliamo
    // ad ogni frame se la SkinnedMesh è arrivata. Appena la troviamo,
    // le applichiamo il nostro materiale di occlusione invisibile.
    for (const handModel of this.handModels) {
      handModel.traverse((child) => {
        if (child.isMesh && child.material !== occlusionMaterial) {
          child.material = occlusionMaterial;
          child.renderOrder = OCCLUSION_RENDER_ORDER;
        }
      });
    }
  }
}