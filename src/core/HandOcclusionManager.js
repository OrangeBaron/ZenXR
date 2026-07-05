/**
 * ============================================================================
 * HandOcclusionManager.js
 * ============================================================================
 * Responsabilità unica (SRP): far sì che le mani reali dell'utente possano
 * "occludere" visivamente gli oggetti virtuali del giardino in `immersive-ar`.
 * Utilizza XRHandModelFactory per generare una mesh continua della mano.
 * ============================================================================
 */
import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

/** Numero di mani gestite da una sessione WebXR (sinistra + destra). */
const HAND_COUNT = 2;

/** Disegnata per prima: deve "bucare" lo z-buffer prima degli altri oggetti. */
const OCCLUSION_RENDER_ORDER = -1;

// Materiale invisibile che scrive solo nello z-buffer
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

    // Inizializziamo la factory per i modelli delle mani
    const handModelFactory = new XRHandModelFactory();

    for (let i = 0; i < HAND_COUNT; i++) {
      const hand = this.renderer.xr.getHand(i);
      this.scene.add(hand);
      this.hands.push(hand);

      // Generiamo il modello continuo della mano (profilo 'mesh')
      const handModel = handModelFactory.createHandModel(hand, 'mesh');
      hand.add(handModel);

      // Assicuriamoci di applicare il materiale di occlusione non appena
      // la mano viene riconosciuta e connessa
      hand.addEventListener('connected', () => {
        this._applyOcclusionMaterial(handModel);
      });
    }
  }

  /**
   * Applica ricorsivamente il materiale invisibile a tutte le mesh del modello.
   * @param {THREE.Object3D} model 
   */
  _applyOcclusionMaterial(model) {
    model.traverse((child) => {
      if (child.isMesh) {
        child.material = occlusionMaterial;
        child.renderOrder = OCCLUSION_RENDER_ORDER;
      }
    });
  }

  /**
   * Da chiamare ad ogni frame XR nell'animation loop.
   * A differenza dell'approccio a sfere, i giunti sono aggiornati in 
   * automatico dalla factory, ma forziamo l'applicazione del materiale
   * in caso il glTF della mano venga caricato asincronamente con ritardo.
   */
  update() {
    for (const hand of this.hands) {
      hand.traverse((child) => {
        if (child.isMesh && child.material !== occlusionMaterial) {
          child.material = occlusionMaterial;
          child.renderOrder = OCCLUSION_RENDER_ORDER;
        }
      });
    }
  }
}