/**
 * ============================================================================
 * XRInteractionManager.js
 * ============================================================================
 * Responsabilità unica (SRP): ascoltare l'evento 'select' della sessione
 * WebXR — normalizzato dallo standard sia per il grilletto di un
 * controller sia per il gesto di pinch in hand-tracking — e posizionare un
 * gruppo target (il "Garden Group") sulla posa corrente dell'anteprima di
 * posizionamento (hit-test).
 *
 * NON gestisce: hit-testing (XRManager.js) né la generazione degli asset
 * (GardenBase.js).
 *
 * Dopo il primo posizionamento il listener si autodisattiva (`hasPlaced`) e
 * l'anteprima viene nascosta definitivamente, per evitare di riposizionare
 * accidentalmente l'intero giardino a ogni ulteriore trigger/pinch.
 * ============================================================================
 */
export class XRInteractionManager {
  /**
   * @param {Object} options
   * @param {THREE.WebGLRenderer} options.renderer
   * @param {import('../entities/PlacementPreview.js').PlacementPreview} options.placementPreview
   * @param {THREE.Object3D} options.targetGroup Gruppo da posizionare (es. GardenBase.group).
   * @param {() => void} [options.onPlace] Callback invocata ad ogni posizionamento.
   */
  constructor({ renderer, placementPreview, targetGroup, onPlace }) {
    this.renderer = renderer;
    this.placementPreview = placementPreview;
    this.targetGroup = targetGroup;
    this.onPlace = onPlace;
    this.session = null;
    this.hasPlaced = false;

    this._handleSelect = this._handleSelect.bind(this);
    this._handleSessionStart = this._handleSessionStart.bind(this);
    this._handleSessionEnd = this._handleSessionEnd.bind(this);

    this.renderer.xr.addEventListener('sessionstart', this._handleSessionStart);
    this.renderer.xr.addEventListener('sessionend', this._handleSessionEnd);
  }

  _handleSessionStart() {
    this.session = this.renderer.xr.getSession();
    this.session.addEventListener('select', this._handleSelect);

    // Ogni nuova sessione richiede un nuovo posizionamento (non c'è ancora
    // persistenza, vedi Fase 3): resettiamo lo stato e riabilitiamo l'anteprima.
    this.hasPlaced = false;
    this.placementPreview.setEnabled(true);
    this.targetGroup.visible = false;
  }

  _handleSessionEnd() {
    this.session?.removeEventListener('select', this._handleSelect);
    this.session = null;
  }

  _handleSelect() {
    if (this.hasPlaced || !this.placementPreview.mesh.visible) return;

    this.targetGroup.position.setFromMatrixPosition(this.placementPreview.mesh.matrix);
    this.targetGroup.quaternion.setFromRotationMatrix(this.placementPreview.mesh.matrix);
    this.targetGroup.visible = true;

    this.hasPlaced = true;
    this.placementPreview.setEnabled(false);

    this.onPlace?.();
  }
}
