/**
 * ============================================================================
 * SceneManager.js
 * ============================================================================
 * Responsabilità unica (SRP): creare e possedere Scene, PerspectiveCamera e
 * WebGLRenderer, con shadow map abilitate e ottimizzate per Quest 3.
 * Gestisce anche il resize della finestra e il rendering del frame corrente.
 *
 * NON gestisce: sessioni WebXR (vedi XRManager.js), input, stato di gioco o
 * contenuti procedurali (vedi /src/entities).
 * ============================================================================
 */
import * as THREE from 'three';

export class SceneManager {
  /**
   * @param {Object} [options]
   * @param {HTMLElement} [options.container] Elemento DOM che ospiterà il canvas.
   */
  constructor({ container } = {}) {
    this.container = container ?? document.getElementById('app');

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.01,
      50
    );
    // Posizione di anteprima utile solo per il test desktop (fuori sessione XR,
    // dove la posa camera è comunque pilotata dal dispositivo).
    this.camera.position.set(0, 1.0, 0);
    this.camera.lookAt(0, 0, -1.7);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Shadow map: abilitate ma "leggere" (PCFSoft = buon compromesso qualità/costo
    // su chip mobile). Il GDD (§6) prevede ombre dinamiche solo per mani/rastrello:
    // saranno le entità future a impostare castShadow/receiveShadow selettivamente.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Necessario per il rendering stereo/immersivo gestito da XRManager.
    this.renderer.xr.enabled = true;

    this.container.appendChild(this.renderer.domElement);

    this._addBaseLighting();

    window.addEventListener('resize', () => this._onResize());
  }

  /**
   * Illuminazione minimale provvisoria. Verrà sostituita/estesa dalla
   * Lighting Estimation API di WebXR (Fase 8) per adattarsi alla stanza reale.
   */
  _addBaseLighting() {
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x445544, 1.2);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfff4e0, 1.5);
    this.dirLight.position.set(2, 4, 2);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(1024, 1024);
    this.dirLight.shadow.camera.near = 0.1;
    this.dirLight.shadow.camera.far = 10;
    this.dirLight.shadow.camera.left = -2;
    this.dirLight.shadow.camera.right = 2;
    this.dirLight.shadow.camera.top = 2;
    this.dirLight.shadow.camera.bottom = -2;
    this.scene.add(this.dirLight);
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /** Renderizza il frame corrente. Da chiamare nell'animation loop. */
  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
