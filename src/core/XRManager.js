/**
 * ============================================================================
 * XRManager.js
 * ============================================================================
 * Responsabilità unica (SRP): gestire il ciclo di vita della sessione WebXR
 * "immersive-ar" — bottone di ingresso, reference space e hit-test source.
 *
 * NON gestisce: contenuti di scena, entità procedurali o stato di gioco.
 * Espone `getHitPose(frame)`, da interrogare ad ogni frame XR per ottenere
 * la posa (posizione+orientamento) del punto della superficie reale colpita
 * al centro dello sguardo dell'utente (usata per posizionare il reticolo).
 * ============================================================================
 */
import { ARButton } from 'three/addons/webxr/ARButton.js';

export class XRManager {
  /**
   * @param {Object} options
   * @param {THREE.WebGLRenderer} options.renderer Renderer con `xr.enabled = true`.
   * @param {() => void} [options.onSessionStart] Callback all'avvio della sessione AR.
   * @param {() => void} [options.onSessionEnd] Callback alla fine della sessione AR.
   */
  constructor({ renderer, onSessionStart, onSessionEnd } = {}) {
    this.renderer = renderer;
    this.onSessionStart = onSessionStart;
    this.onSessionEnd = onSessionEnd;

    this.hitTestSource = null;
    this.hitTestSourceRequested = false;

    // Il giardino deve appoggiarsi sul pavimento/tavolo reale: 'local-floor'
    // fornisce un'origine coerente con il suolo rilevato dal dispositivo.
    this.renderer.xr.setReferenceSpaceType('local-floor');

    this.button = ARButton.createButton(renderer, {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.body },
    });
    document.body.appendChild(this.button);

    this.renderer.xr.addEventListener('sessionstart', () => this._handleSessionStart());
    this.renderer.xr.addEventListener('sessionend', () => this._handleSessionEnd());
  }

  _handleSessionStart() {
    this.hitTestSourceRequested = false;
    this.hitTestSource = null;
    this.onSessionStart?.();
  }

  _handleSessionEnd() {
    this.hitTestSource = null;
    this.hitTestSourceRequested = false;
    this.onSessionEnd?.();
  }

  /**
   * Da chiamare ad ogni frame all'interno dell'animation loop, passando
   * l'XRFrame ricevuto da `renderer.setAnimationLoop((t, frame) => ...)`.
   *
   * @param {XRFrame} frame
   * @returns {XRPose|null} Posa del primo risultato di hit-test, o null se
   *   nessuna superficie è stata rilevata in questo frame.
   */
  getHitPose(frame) {
    const session = this.renderer.xr.getSession();
    if (!session || !frame) return null;

    if (!this.hitTestSourceRequested) {
      this.hitTestSourceRequested = true;

      session.requestReferenceSpace('viewer').then((viewerSpace) => {
        session.requestHitTestSource({ space: viewerSpace }).then((source) => {
          this.hitTestSource = source;
        });
      });

      session.addEventListener('end', () => {
        this.hitTestSourceRequested = false;
        this.hitTestSource = null;
      });
    }

    if (!this.hitTestSource) return null;

    const referenceSpace = this.renderer.xr.getReferenceSpace();
    const results = frame.getHitTestResults(this.hitTestSource);
    if (results.length === 0) return null;

    return results[0].getPose(referenceSpace);
  }
}
