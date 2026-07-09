/**
 * Responsabilità unica (SRP): ascoltare l'evento 'select' della sessione
 * WebXR — normalizzato dallo standard sia per il grilletto di un controller
 * sia per il gesto di pinch in hand-tracking — e posizionare un gruppo
 * target (il "Garden Group") sulla posa corrente dell'anteprima di
 * posizionamento (hit-test).
 *
 * Non gestisce l'hit-testing (XRManager.js) né la generazione degli asset
 * (GardenBase.js).
 *
 * Dopo il primo posizionamento il listener si autodisattiva (`hasPlaced`) e
 * l'anteprima viene nascosta definitivamente, per evitare di riposizionare
 * accidentalmente l'intero giardino a ogni ulteriore trigger/pinch.
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

    this.anchor = null; 
    this.lastHitTransform = null;

    this._handleSelect = this._handleSelect.bind(this);
    this._handleSessionStart = this._handleSessionStart.bind(this);
    this._handleSessionEnd = this._handleSessionEnd.bind(this);

    this.renderer.xr.addEventListener('sessionstart', this._handleSessionStart);
    this.renderer.xr.addEventListener('sessionend', this._handleSessionEnd);
  }

  _handleSessionStart() {
    this.session = this.renderer.xr.getSession();
    this.session.addEventListener('select', this._handleSelect);

    // Ogni nuova sessione XR richiede un nuovo posizionamento (non c'è
    // persistenza tra sessioni): resettiamo lo stato e riabilitiamo l'anteprima.
    this.hasPlaced = false;
    this.anchor = null;
    this.lastHitTransform = null;

    this.placementPreview.setEnabled(true);
    this.targetGroup.visible = false;
  }

  _handleSessionEnd() {
    this.session?.removeEventListener('select', this._handleSelect);
    this.session = null;
    this.anchor = null;
  }

  /**
   * Gestisce l'evento 'select' della sessione XR (trigger o pinch): piazza
   * il gruppo target sulla posa corrente dell'anteprima di hit-test e avvia
   * la creazione dell'ancora spaziale WebXR corrispondente.
   * @param {XRInputSourceEvent} event Evento 'select' emesso dalla sessione XR.
   */
  _handleSelect(event) {
    // Interrompe se già piazzato, se l'anteprima non è visibile, o se non è disponibile una posa valida.
    if (this.hasPlaced || !this.placementPreview.mesh.visible || !this.lastHitTransform) return;

    // Posiziona subito il giardino a livello visivo, senza attendere la
    // creazione dell'ancora, per una risposta immediata al gesto.
    this.targetGroup.position.setFromMatrixPosition(this.placementPreview.mesh.matrix);
    this.targetGroup.quaternion.setFromRotationMatrix(this.placementPreview.mesh.matrix);
    this.targetGroup.visible = true;
    this.hasPlaced = true;
    this.placementPreview.setEnabled(false);

    // Richiede a WebXR la creazione dell'ancora spaziale, che aggancerà il
    // giardino alla superficie reale in modo stabile rispetto al tracking.
    const frame = event.frame;
    const referenceSpace = this.renderer.xr.getReferenceSpace();

    if (frame.createAnchor) {
      frame.createAnchor(this.lastHitTransform, referenceSpace)
        .then((anchor) => {
          this.anchor = anchor;
          console.log('[ZenXR] WebXR Anchor creata con successo.');
        })
        .catch((err) => {
          console.warn('[ZenXR] Impossibile creare l\'ancora:', err);
        });
    } else {
      console.warn('[ZenXR] WebXR Anchors API non supportata. Fallback al posizionamento statico.');
    }

    this.onPlace?.();
  }

  /**
   * Aggiorna lo stato dell'ancora o traccia l'ultima posa dell'hit-test.
   * Da chiamare ad ogni frame XR nell'animation loop.
   */
  update(frame, hitPose) {
    // Prima del piazzamento: mantiene in memoria l'ultima transform valida
    // dell'hit-test, da usare per creare l'ancora al momento del select.
    if (!this.hasPlaced) {
      if (hitPose) {
        this.lastHitTransform = hitPose.transform;
      }
      return;
    }

    // Dopo il piazzamento: sincronizza il giardino con la posa aggiornata
    // dell'ancora tracciata.
    if (this.anchor) {
      const referenceSpace = this.renderer.xr.getReferenceSpace();
      const pose = frame.getPose(this.anchor.anchorSpace, referenceSpace);

      if (pose) {
        // Usa i valori grezzi invece di .copy() per compatibilità con i DOMPointReadOnly
        this.targetGroup.position.set(
          pose.transform.position.x, 
          pose.transform.position.y, 
          pose.transform.position.z
        );
        this.targetGroup.quaternion.set(
          pose.transform.orientation.x, 
          pose.transform.orientation.y, 
          pose.transform.orientation.z, 
          pose.transform.orientation.w
        );
        this.targetGroup.visible = true;
      } else {
        // Il tracking dell'ancora è momentaneamente perso (es. l'utente guarda altrove).
        // Evitiamo di nascondere il giardino (visible = false), mantenendolo all'ultima posa nota.
      }
    }
  }
}
