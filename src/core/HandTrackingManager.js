/**
 * Responsabilità unica (SRP): gestire l'input delle mani in WebXR (rilevamento
 * della posizione e del gesto di pinch). Non conosce la logica di business
 * specifica degli oggetti, ma si limita a cercare mesh marcate come "interactable"
 * nel userData e a notificare lo StateManager.
 */
import * as THREE from 'three';

const HAND_COUNT = 2;
const DEFAULT_PINCH_RADIUS = 0.08;

export class HandTrackingManager {
  constructor({ renderer, scene, garden, stateManager, physicsManager }) {
    this.renderer = renderer;
    this.scene = scene;
    this.garden = garden;
    this.stateManager = stateManager;
    this.physicsManager = physicsManager;

    this._heldObjects = new Map();
    this._pinchAnchors = new Map();

    // --- VARIABILI PRE-ALLOCATE PER EVITARE IL GARBAGE COLLECTION ---
    this._tempThumbPos = new THREE.Vector3();
    this._tempIndexPos = new THREE.Vector3();
    this._tempWristPos = new THREE.Vector3();
    this._tempWristQuat = new THREE.Quaternion();
    this._tempHandDir = new THREE.Vector3();
    this._tempUp = new THREE.Vector3();
    this._tempTargetMtx = new THREE.Matrix4();
    this._tempZero = new THREE.Vector3(0, 0, 0);
    this._tempSearchPos = new THREE.Vector3();
    // ----------------------------------------------------------------

    this.hands = [];

    for (let i = 0; i < HAND_COUNT; i++) {
      const hand = this.renderer.xr.getHand(i);
      this.scene.add(hand);
      this.hands.push(hand);

      const pinchAnchor = new THREE.Group();
      this.scene.add(pinchAnchor);
      this._pinchAnchors.set(hand, pinchAnchor);

      hand.addEventListener('selectstart', () => this._handlePinchStart(hand));
      hand.addEventListener('selectend', () => this._handlePinchEnd(hand));
    }
  }

  update() {
    for (const hand of this.hands) {
      const point = this._getPinchPoint(hand);
      if (!point) continue;

      const anchor = this._pinchAnchors.get(hand);
      anchor.position.copy(point);

      const wrist = hand.joints['wrist'];
      if (wrist) {
        // Popoliamo le variabili pre-allocate senza usare "new"
        wrist.getWorldPosition(this._tempWristPos);
        wrist.getWorldQuaternion(this._tempWristQuat);
        
        this._tempHandDir.subVectors(point, this._tempWristPos).normalize();
        this._tempUp.set(0, 1, 0).applyQuaternion(this._tempWristQuat);
        
        if (Math.abs(this._tempHandDir.y) < 0.99) {
          this._tempTargetMtx.lookAt(this._tempZero, this._tempHandDir, this._tempUp);
          anchor.quaternion.setFromRotationMatrix(this._tempTargetMtx);
        }
      }

      if (this._heldObjects.has(hand)) {
        const obj = this._heldObjects.get(hand);
        if (this.physicsManager && obj.userData.physicalGrab) {
          this.physicsManager.moveGrabbedObject(obj, point, anchor.quaternion);
        }
      }
    }
  }

  _getPinchPoint(hand) {
    const thumbTip = hand.joints['thumb-tip'];
    const indexTip = hand.joints['index-finger-tip'];
    if (!thumbTip || !indexTip) return null;

    thumbTip.getWorldPosition(this._tempThumbPos);
    indexTip.getWorldPosition(this._tempIndexPos);

    return this._tempThumbPos.add(this._tempIndexPos).multiplyScalar(0.5);
  }

  _handlePinchStart(hand) {
    if (this._heldObjects.has(hand)) return;

    const pinchPoint = this._getPinchPoint(hand);
    if (!pinchPoint) return;

    const closestTarget = this._findClosestInteractable(pinchPoint);
    if (!closestTarget) return;

    this._executeGrabAction(hand, closestTarget.object);
  }

  // Cerca qualsiasi cosa abbia userData.interactable = true
  _findClosestInteractable(pinchPoint) {
    if (!this.garden || !this.garden.group) return null;

    let closest = null;
    let minDistSq = Infinity;
    
    // Usiamo il Vector3 pre-allocato invece di istanziarlo ad ogni pinch
    const pos = this._tempSearchPos;

    this.garden.group.traverse((object) => {
      if (object.userData && object.userData.interactable) {
        const detectionRadius = object.userData.interactionRadius || DEFAULT_PINCH_RADIUS;
        const maxDistSq = detectionRadius * detectionRadius;
        
        object.getWorldPosition(pos);
        
        if (object.userData.interactionOffsetY) {
            pos.y += object.userData.interactionOffsetY;
        }

        const distSq = pos.distanceToSquared(pinchPoint);

        if (distSq < maxDistSq && distSq < minDistSq) {
          minDistSq = distSq;
          closest = object;
        }
      }
    });

    return closest ? { object: closest, distanceSq: minDistSq } : null;
  }

  _executeGrabAction(hand, object) {
    const anchor = this._pinchAnchors.get(hand);
    
    // Attacchiamo l'oggetto alla mano solo se non è demandato alla fisica
    if (object.userData.attachToHand) {
        anchor.attach(object);
    }
    
    this._heldObjects.set(hand, object);

    if (this.physicsManager && object.userData.physicalGrab) {
      this.physicsManager.setObjectGrabbed(object, true, anchor.quaternion);
    }

    // Notifichiamo il resto del sistema in modo agnostico
    this.stateManager?.notifyChange({
      action: 'interactable_grabbed',
      hand: hand,
      anchor: anchor,
      object: object,
      kind: object.userData.kind
    });
  }

  _handlePinchEnd(hand) {
    const obj = this._heldObjects.get(hand);
    
    this.stateManager?.notifyChange({ action: 'pinch_end', hand: hand });

    if (!obj) {
      return;
    }

    this._heldObjects.delete(hand);

    if (this.physicsManager && obj.userData.physicalGrab) {
      this.physicsManager.setObjectGrabbed(obj, false);
    }

    // Notifichiamo il rilascio dell'oggetto specifico
    this.stateManager?.notifyChange({
         action: 'interactable_released',
         hand: hand,
         object: obj,
         kind: obj.userData.kind
     });
  }
}