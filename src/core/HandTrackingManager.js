/**
 * Responsabilità unica (SRP): gestire l'input delle mani in WebXR e
 * l'interazione di potatura, lo spostamento delle rocce, l'uso del rastrello
 * e le interazioni con il set da incenso tramite il gesto di pinch.
 */
import * as THREE from 'three';

/** Numero di mani gestite da una sessione WebXR (sinistra + destra). */
const HAND_COUNT = 2;

/**
 * Raggio base (metri) per il rilevamento del pinch.
 * Commisurato alla scala delle foglie del bonsai.
 */
const PINCH_DETECTION_RADIUS = 0.035;

export class HandTrackingManager {
  /**
   * @param {Object} options
   * @param {THREE.WebGLRenderer} options.renderer Renderer con `xr.enabled = true`.
   * @param {THREE.Scene} options.scene Scena a cui agganciare i gruppi delle mani.
   * @param {THREE.Group} options.bonsai Radice del bonsai in cui cercare le foglie.
   * @param {import('./StateManager.js').StateManager} [options.stateManager] Notificato quando lo stato cambia.
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

    // Se la sessione termina mentre una foglia è ancora "in mano", va comunque ripulita.
    this.renderer.xr.addEventListener('sessionend', () => this._releaseAllHeldLeaves());
  }

  /**
   * Da chiamare ad ogni frame XR. Risincronizza il punto di pinch di ogni mano
   * sulla posizione live di pollice e indice.
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
        wrist.getWorldQuaternion(wristQuat); 
        
        const handDir = new THREE.Vector3().subVectors(point, wristPos).normalize();
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
   * Gestisce l'inizio di un pinch delegando la ricerca ai provider di interazione.
   */
  _handlePinchStart(hand) {
    // Ignora il gesto se la mano tiene già qualcosa
    if (this._heldLeaves.has(hand) || this._heldObjects.has(hand)) return;

    const pinchPoint = this._getPinchPoint(hand);
    if (!pinchPoint) return;

    // Raccoglie tutti i possibili candidati di interazione validi
    const candidates = [
      this._findClosestLeaf(pinchPoint),
      this._findClosestRock(pinchPoint),
      this._findClosestRake(pinchPoint),
      this._findClosestMatchbox(pinchPoint),
      this._findClosestIncense(pinchPoint)
    ].filter(Boolean); // Rimuove i valori null

    if (candidates.length === 0) return;

    // Trova l'oggetto assoluto più vicino tra tutte le categorie
    const bestTarget = candidates.reduce((best, current) => 
      current.distanceSq < best.distanceSq ? current : best
    );

    this._executeGrabAction(hand, bestTarget);
  }

  // --- INTERACTION PROVIDERS ---

  _findClosestLeaf(pinchPoint) {
    if (!this.bonsai) return null;
    let closest = null;
    let minDistSq = PINCH_DETECTION_RADIUS * PINCH_DETECTION_RADIUS;
    const pos = new THREE.Vector3();

    this.bonsai.traverse((object) => {
      if (object.userData.kind === 'leaf' && object.userData.isDry) {
        object.getWorldPosition(pos);
        const distSq = pos.distanceToSquared(pinchPoint);
        if (distSq < minDistSq) {
          minDistSq = distSq;
          closest = object;
        }
      }
    });
    return closest ? { object: closest, type: 'leaf', distanceSq: minDistSq } : null;
  }

  _findClosestRock(pinchPoint) {
    if (!this.garden || !this.garden.rocks) return null;
    let closest = null;
    let minDistSq = 0.08 * 0.08;
    const pos = new THREE.Vector3();

    for (const rock of this.garden.rocks) {
      rock.getWorldPosition(pos);
      const distSq = pos.distanceToSquared(pinchPoint);
      if (distSq < minDistSq) {
        minDistSq = distSq;
        closest = rock;
      }
    }
    return closest ? { object: closest, type: 'rock', distanceSq: minDistSq } : null;
  }

  _findClosestRake(pinchPoint) {
    if (!this.garden || !this.garden.rake) return null;
    
    const pos = new THREE.Vector3();
    this.garden.rake.getWorldPosition(pos);
    
    const distSq = pos.distanceToSquared(pinchPoint);
    
    return distSq < (0.2 * 0.2) ? { object: this.garden.rake, type: 'rake', distanceSq: distSq } : null;
  }

  _findClosestMatchbox(pinchPoint) {
    if (!this.garden || !this.garden.matchbox) return null;
    const pos = new THREE.Vector3();
    this.garden.matchbox.getWorldPosition(pos);
    const distSq = pos.distanceToSquared(pinchPoint);
    return distSq < (0.15 * 0.15) ? { object: this.garden.matchbox, type: 'matchbox', distanceSq: distSq } : null;
  }

  _findClosestIncense(pinchPoint) {
    if (!this.garden || !this.garden.incense) return null;
    const pos = new THREE.Vector3();
    this.garden.incense.getWorldPosition(pos);
    pos.y += 0.05;
    const distSq = pos.distanceToSquared(pinchPoint);
    return distSq < (0.12 * 0.12) ? { object: this.garden.incense, type: 'incense', distanceSq: distSq } : null;
  }

  // --- EXECUTION ---

  _executeGrabAction(hand, target) {
    const anchor = this._pinchAnchors.get(hand);
    const { object, type } = target;

    if (type === 'leaf') {
      anchor.position.copy(anchor.position);
      anchor.attach(object);
      this._heldLeaves.set(hand, object);
    } 
    else if (type === 'rock' || type === 'rake') {
      this._heldObjects.set(hand, object);
      if (this.physicsManager) {
        this.physicsManager.setObjectGrabbed(object, true, anchor.quaternion);
      }
    } 
    else if (type === 'matchbox') {
      this.stateManager?.notifyChange({ 
        action: 'spawn_match', 
        hand: hand, 
        anchor: anchor 
      });
    } 
    else if (type === 'incense') {
      this.stateManager?.notifyChange({ 
        action: 'reset_incense' 
      });
    }
  }

  /**
   * Gestisce la fine di un pinch su una mano.
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
      if (obj.userData && obj.userData.kind !== 'rake') {
        this.stateManager?.notifyChange({ action: 'rock_moved' });
      }
    }

    this.stateManager?.notifyChange({ action: 'pinch_end', hand: hand });
  }

  /** Rilascia forzatamente tutte le foglie ancora in mano. */
  _releaseAllHeldLeaves() {
    for (const leaf of this._heldLeaves.values()) {
      this._destroyLeaf(leaf);
    }
    this._heldLeaves.clear();
  }

  /** Rimuove una foglia e ne libera la memoria. */
  _destroyLeaf(leaf) {
    leaf.parent?.remove(leaf);
    leaf.geometry.dispose();
    leaf.material.dispose();
  }
}