/**
 * Responsabilità unica (SRP): gestire l'input delle mani in WebXR e
 * l'interazione di potatura, ossia "pizzicare" (pinch) una foglia secca del
 * bonsai per staccarla, oltre allo spostamento delle rocce del giardino
 * tramite lo stesso gesto.
 *
 * Espone due `THREE.Group` (una per mano, da `renderer.xr.getHand(n)`) i cui
 * `joints` sono aggiornati automaticamente da Three.js ad ogni frame XR.
 *
 * Rilevamento del pinch: sugli input source di tipo "mano", il gesto di
 * pinch viene tradotto dal browser XR negli stessi eventi standard del
 * grilletto di un controller (`selectstart`/`selectend`), che Three.js
 * inoltra sul gruppo della mano corretta — non serve quindi calcolare a mano
 * una soglia di distanza per capire SE è in corso un pinch.
 *
 * Punto di contatto e aggancio della foglia: il gruppo "mano" restituito da
 * `getHand()` NON si muove esso stesso (è un semplice contenitore sempre
 * all'origine) — sono i suoi `joints` figli ad avere la trasformazione
 * tracciata. Per questo la foglia pizzicata non viene agganciata al gruppo
 * mano, ma a un piccolo Object3D "fantasma" (`pinchAnchor`, uno per mano)
 * che `update()` risincronizza ogni frame sul punto medio fra `thumb-tip` e
 * `index-finger-tip`: così la foglia segue davvero le dita che la tengono,
 * finché il pinch resta attivo.
 *
 * Rilevamento delle collisioni: al `selectstart`, viene cercata la foglia
 * secca (`userData.kind === 'leaf'`, `userData.isDry === true`) del bonsai
 * più vicina al punto di pinch entro un piccolo raggio di tolleranza (una
 * bounding sphere leggera, più adatta di un raycast a un gesto di "tocco"
 * localizzato nello spazio anziché diretto lungo una linea).
 *
 * Non gestisce: la caduta fisica della foglia una volta staccata
 * (LeafFallManager.js, a cui la foglia viene passata al rilascio del pinch),
 * l'occlusione visiva delle mani reali (HandOcclusionManager.js), la
 * generazione del bonsai (BonsaiGenerator.js) né la persistenza dello stato
 * (StateManager.js / SaveSystem.js) — si limita a notificarne il cambiamento.
 */
import * as THREE from 'three';

/** Numero di mani gestite da una sessione WebXR (sinistra + destra). */
const HAND_COUNT = 2;

/**
 * Raggio (metri) entro cui una foglia secca è considerata "pizzicabile" dal
 * punto medio pollice-indice. Commisurato alla scala delle foglie del bonsai
 * (raggio icosaedro ~0.01-0.02m): abbastanza ampio da tollerare l'imprecisione
 * del tracking delle mani, abbastanza stretto da non selezionare foglie vicine.
 */
const PINCH_DETECTION_RADIUS = 0.035;

export class HandTrackingManager {
  /**
   * @param {Object} options
   * @param {THREE.WebGLRenderer} options.renderer Renderer con `xr.enabled = true`.
   * @param {THREE.Scene} options.scene Scena a cui agganciare i gruppi delle mani.
   * @param {THREE.Group} options.bonsai Radice del bonsai (`GardenBase.bonsai`) in cui cercare le foglie.
   * @param {import('./StateManager.js').StateManager} [options.stateManager] Notificato quando una foglia viene potata.
   */
  constructor({ renderer, scene, bonsai, garden, stateManager, leafFallManager, physicsManager }) {
    this.renderer = renderer;
    this.scene = scene;
    this.bonsai = bonsai;
    this.garden = garden;
    this.stateManager = stateManager;
    this.leafFallManager = leafFallManager;
    this.physicsManager = physicsManager;

    this._heldLeaves = new Map();
    this._heldObjects = new Map();
    this._pinchAnchors = new Map();
    this._tempThumbPos = new THREE.Vector3();
    this._tempIndexPos = new THREE.Vector3();

    this.hands = [];
    for (let i = 0; i < HAND_COUNT; i++) {
      const hand = this.renderer.xr.getHand(i);
      this.scene.add(hand);
      this.hands.push(hand);

      // Object3D "fantasma", in coordinate mondo: `update()` lo tiene
      // sincronizzato sul punto medio pollice-indice di questa mano.
      const pinchAnchor = new THREE.Group();
      this.scene.add(pinchAnchor);
      this._pinchAnchors.set(hand, pinchAnchor);

      hand.addEventListener('selectstart', () => this._handlePinchStart(hand));
      hand.addEventListener('selectend', () => this._handlePinchEnd(hand));
    }

    // Se la sessione termina mentre una foglia è ancora "in mano", va comunque
    // ripulita: altrimenti resterebbe agganciata al suo anchor tra una
    // sessione e l'altra.
    this.renderer.xr.addEventListener('sessionend', () => this._releaseAllHeldLeaves());
  }

  /**
   * Da chiamare ad ogni frame XR (nell'animation loop di main.js, insieme a
   * `HandOcclusionManager.update()`): risincronizza il punto di pinch di
   * ogni mano sulla posizione live di pollice e indice, così una foglia
   * agganciata segue le dita invece di restare ferma nel punto in cui è
   * stata pizzicata.
   */
  update() {
    for (const hand of this.hands) {
      const point = this._getPinchPoint(hand);
      if (!point) continue;
      
      const anchor = this._pinchAnchors.get(hand);
      anchor.position.copy(point);

      const wrist = hand.joints['wrist'];
      if (wrist) {
        const wristPos = new THREE.Vector3();
        const wristQuat = new THREE.Quaternion();
        wrist.getWorldPosition(wristPos);
        wrist.getWorldQuaternion(wristQuat); // Prende la rotazione reale 3D del polso
        
        const handDir = new THREE.Vector3().subVectors(point, wristPos).normalize();
        
        // Estrae il vettore "Up" reale per preservare la supinazione/pronazione
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(wristQuat);
        
        if (Math.abs(handDir.y) < 0.99) {
          const targetMtx = new THREE.Matrix4().lookAt(new THREE.Vector3(), handDir, up);
          anchor.quaternion.setFromRotationMatrix(targetMtx);
        }
      }

      if (this._heldObjects.has(hand)) {
        const rock = this._heldObjects.get(hand);
        if (this.physicsManager) {
          this.physicsManager.moveGrabbedObject(rock, point, anchor.quaternion);
        }
      }
    }
  }

  /**
   * Calcola il punto medio (in coordinate mondo) fra la punta del pollice e
   * quella dell'indice di una mano, usato come "punto di contatto" del pinch.
   *
   * @param {THREE.Group} hand
   * @returns {THREE.Vector3|null} `null` se i joint non sono ancora disponibili
   *   (es. la mano non è nel campo visivo del tracking in questo frame).
   */
  _getPinchPoint(hand) {
    const thumbTip = hand.joints['thumb-tip'];
    const indexTip = hand.joints['index-finger-tip'];
    if (!thumbTip || !indexTip) return null;

    thumbTip.getWorldPosition(this._tempThumbPos);
    indexTip.getWorldPosition(this._tempIndexPos);

    return this._tempThumbPos.add(this._tempIndexPos).multiplyScalar(0.5);
  }

  /**
   * Gestisce l'inizio di un pinch su una mano: cerca prima una foglia secca
   * nel raggio di rilevamento e, se non trovata, la roccia più vicina.
   * L'elemento trovato viene agganciato alla mano e, per le rocce, la presa
   * viene comunicata al motore fisico.
   *
   * @param {THREE.Group} hand Gruppo mano su cui è iniziato il pinch.
   */
  _handlePinchStart(hand) {
    // Ignora il gesto se la mano tiene già qualcosa
    if (this._heldLeaves.has(hand) || this._heldObjects.has(hand)) return;

    const pinchPoint = this._getPinchPoint(hand);
    if (!pinchPoint) return;

    let closestObject = null;
    let closestType = null;
    let minDistanceSq = Infinity;

    // 1. Compete per le Foglie Secche
    if (this.bonsai) {
      const maxDistSq = 0.035 * 0.035;
      const pos = new THREE.Vector3();
      this.bonsai.traverse((object) => {
        if (object.userData.kind === 'leaf' && object.userData.isDry) {
          object.getWorldPosition(pos);
          const distSq = pos.distanceToSquared(pinchPoint);
          if (distSq < maxDistSq && distSq < minDistanceSq) {
            minDistanceSq = distSq;
            closestObject = object;
            closestType = 'leaf';
          }
        }
      });
    }

    // 2. Competono le Rocce
    if (this.garden && this.garden.rocks) {
      const maxDistSq = 0.08 * 0.08;
      const pos = new THREE.Vector3();
      for (const rock of this.garden.rocks) {
        rock.getWorldPosition(pos);
        const distSq = pos.distanceToSquared(pinchPoint);
        if (distSq < maxDistSq && distSq < minDistanceSq) {
          minDistanceSq = distSq;
          closestObject = rock;
          closestType = 'rock';
        }
      }
    }

    // 3. Compete il Rastrello
    if (this.garden && this.garden.rake) {
      const maxDistSq = 0.2 * 0.2; 
      const pos = new THREE.Vector3();
      this.garden.rake.getWorldPosition(pos); 
      const distSq = pos.distanceToSquared(pinchPoint);
      if (distSq < maxDistSq && distSq < minDistanceSq) {
        minDistanceSq = distSq;
        closestObject = this.garden.rake;
        closestType = 'rake';
      }
    }

    // 4. Compete la Scatola di Fiammiferi
    if (this.garden && this.garden.matchbox) {
      const maxDistSq = 0.15 * 0.15;
      const pos = new THREE.Vector3();
      this.garden.matchbox.getWorldPosition(pos);
      const distSq = pos.distanceToSquared(pinchPoint);
      if (distSq < maxDistSq && distSq < minDistanceSq) {
        minDistanceSq = distSq;
        closestObject = this.garden.matchbox;
        closestType = 'matchbox';
      }
    }

    // 5. Compete l'Incenso
    if (this.garden && this.garden.incense) {
      const maxDistSq = 0.12 * 0.12;
      const pos = new THREE.Vector3();
      this.garden.incense.getWorldPosition(pos);
      
      pos.y += 0.05; 

      const distSq = pos.distanceToSquared(pinchPoint);
      if (distSq < maxDistSq && distSq < minDistanceSq) {
        minDistanceSq = distSq;
        closestObject = this.garden.incense;
        closestType = 'incense';
      }
    }

    if (!closestObject) return;

    // Recupera l'ancora corrente per la rotazione
    const anchor = this._pinchAnchors.get(hand);

    if (closestType === 'leaf') {
      anchor.position.copy(pinchPoint);
      anchor.attach(closestObject);
      this._heldLeaves.set(hand, closestObject);
    } else if (closestType === 'rock' || closestType === 'rake') {
      this._heldObjects.set(hand, closestObject);
      
      if (this.physicsManager) {
        // Passiamo anche la rotazione della mano al momento della presa!
        this.physicsManager.setObjectGrabbed(closestObject, true, anchor.quaternion);
      }
    } else if (closestType === 'matchbox') {
      // NON afferriamo la scatola. Diciamo all'app di spawnare un fiammifero.
      // Emetteremo un evento che il nuovo IncenseManager ascolterà.
      this.stateManager?.notifyChange({ 
        action: 'spawn_match', 
        hand: hand, 
        anchor: anchor 
      });
    } else if (closestType === 'incense') {
      // Diciamo all'app di resettare l'incenso
      this.stateManager?.notifyChange({ 
        action: 'reset_incense' 
      });
    }
  }

  /**
   * Gestisce la fine di un pinch su una mano: rilascia la foglia trattenuta
   * (passandola al gestore della caduta) oppure la roccia trattenuta
   * (ripristinandone la fisica normale), notificando lo StateManager del
   * cambiamento avvenuto.
   *
   * @param {THREE.Group} hand Gruppo mano su cui è terminato il pinch.
   */
  _handlePinchEnd(hand) {
    const leaf = this._heldLeaves.get(hand);
    if (leaf) {
      this._heldLeaves.delete(hand);
      if (this.leafFallManager) {
        this.leafFallManager.addFallingLeaf(leaf);
      } else {
        this._destroyLeaf(leaf);
      }
      this.stateManager?.notifyChange({ action: 'leaf_pruned' });
      return;
    }

    const obj = this._heldObjects.get(hand);
    if (obj) {
      this._heldObjects.delete(hand);

      if (this.physicsManager) {
        this.physicsManager.setObjectGrabbed(obj, false);
      }

      // Se è una roccia, notifichiamo il sistema (il rastrello non salva la posizione)
      if (obj.userData && obj.userData.kind !== 'rake') {
        this.stateManager?.notifyChange({ action: 'rock_moved' });
      }
    }

    this.stateManager?.notifyChange({ action: 'pinch_end', hand: hand });
  }

  /** Rilascia forzatamente (senza notificare lo stato) tutte le foglie ancora in mano. */
  _releaseAllHeldLeaves() {
    for (const leaf of this._heldLeaves.values()) {
      this._destroyLeaf(leaf);
    }
    this._heldLeaves.clear();
  }

  /**
   * Rimuove una foglia dal suo genitore corrente e libera geometria e
   * materiale. Il matcap condiviso (`LEAF_MATCAP` in BonsaiGenerator.js) non
   * viene toccato: solo il materiale — istanza unica per foglia — viene
   * smaltito.
   *
   * @param {THREE.Mesh} leaf
   */
  _destroyLeaf(leaf) {
    leaf.parent?.remove(leaf);
    leaf.geometry.dispose();
    leaf.material.dispose();
  }
}
