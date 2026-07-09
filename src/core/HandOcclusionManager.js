/**
 * Responsabilità unica (SRP): far sì che le mani reali dell'utente possano
 * occludere visivamente gli oggetti virtuali del giardino in `immersive-ar`.
 * Utilizza XRHandModelFactory per generare una mesh continua della mano.
 */
import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

/** Numero di mani gestite da una sessione WebXR (sinistra + destra). */
const HAND_COUNT = 2;

/** Disegnata per prima: deve "bucare" lo z-buffer prima degli altri oggetti. */
const OCCLUSION_RENDER_ORDER = -1;

// colorWrite: false rende il materiale invisibile mantenendo la scrittura nello z-buffer.
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

    const handModelFactory = new XRHandModelFactory();

    for (let i = 0; i < HAND_COUNT; i++) {
      const hand = this.renderer.xr.getHand(i);
      this.scene.add(hand);
      this.hands.push(hand);

      const handModel = handModelFactory.createHandModel(hand, 'mesh');
      hand.add(handModel);

      // Il glTF della mano è caricato in modo asincrono: il materiale di
      // occlusione va applicato solo dopo che il device l'ha riconosciuta.
      hand.addEventListener('connected', () => {
        this._applyOcclusionMaterial(handModel);
      });
    }
  }

  /**
   * Applica ricorsivamente il materiale di occlusione a tutte le mesh del
   * modello e marca il modello come già elaborato.
   *
   * @param {THREE.Object3D} model Root del modello della mano generato da XRHandModelFactory.
   */
  _applyOcclusionMaterial(model) {
    model.traverse((child) => {
      if (child.isMesh && child.material !== occlusionMaterial) {
        child.material = occlusionMaterial;
        child.renderOrder = OCCLUSION_RENDER_ORDER;
      }
    });
    model.userData.isOccluded = true;
  }

  /**
   * Da chiamare ad ogni frame XR nell'animation loop. Rete di sicurezza per
   * il caso in cui il listener `connected` non abbia ancora applicato il
   * materiale di occlusione al momento in cui il modello risulta popolato.
   */
  update() {
    for (const hand of this.hands) {
      if (hand.children.length === 0 || hand.userData.isOccluded) continue;

      hand.traverse((child) => {
        if (child.isMesh && child.material !== occlusionMaterial) {
          child.material = occlusionMaterial;
          child.renderOrder = OCCLUSION_RENDER_ORDER;
          hand.userData.isOccluded = true;
        }
      });
    }
  }
}