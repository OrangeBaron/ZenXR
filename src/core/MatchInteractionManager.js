/**
 * Responsabilità unica (SRP): Gestire lo spawn, il movimento in mano, lo spegnimento
 * e la caduta fisica dei fiammiferi. Quando un fiammifero acceso si avvicina all'incenso,
 * notifica lo StateManager per innescare l'accensione.
 */
import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { createSingleMatch } from '../entities/IncenseGenerator.js';
import { GARDEN_WIDTH, GARDEN_DEPTH } from '../utils/GardenLayout.js';
import { disposeGraph } from '../utils/DisposeUtils.js';

export class MatchInteractionManager {
  constructor({ scene, garden, stateManager }) {
    this.scene = scene;
    this.garden = garden;
    this.stateManager = stateManager;
    
    this.activeMatch = null;
    this.matchHand = null;
    this.fallingMatches = [];
    
    this.clock = new THREE.Clock();
    
    // Variabili temporanee pre-allocate per evitare il Garbage Collection
    this._lastMatchPos = new THREE.Vector3();
    this._hasLastMatchPos = false; // Flag per tracciare il primo frame di vita
    
    this._tempMatchPos = new THREE.Vector3();
    this._tempIncensePos = new THREE.Vector3();
    this._tempLocalPos = new THREE.Vector3();
    this._parentWorldQuat = new THREE.Quaternion();
    this._currentVelocity = new THREE.Vector3();
    this._tempVelocity = new THREE.Vector3();
    this._tempFirePos = new THREE.Vector3();

    this.stateManager.onChange((event) => {
      if (event.detail?.action === 'spawn_match') {
        this._spawnMatchInHand(event.detail.hand, event.detail.anchor);
      }
      if (event.detail?.action === 'pinch_end') {
        if (this.activeMatch && this.matchHand === event.detail.hand) {
          this._dropMatch();
        }
      }
    });
  }

  _spawnMatchInHand(hand, anchor) {
    if (this.activeMatch) return;

    this.activeMatch = createSingleMatch();
    anchor.add(this.activeMatch);
    this.matchHand = hand;
    
    this._hasLastMatchPos = false;
    this._currentVelocity.set(0, 0, 0);
    this.activeMatch.rotation.set(-Math.PI / 2, 0, 0);
  }

  _extinguishMatch() {
    if (!this.activeMatch || !this.activeMatch.userData.isLit) return;
    
    const data = this.activeMatch.userData;
    data.isLit = false;
    data.fireGroup.visible = false;
    
    data.woodMesh.material = data.burntWoodMat;
    data.tipMesh.material = data.burntTipMat;
  }

  _dropMatch() {
    if (!this.activeMatch) return;
    
    this._extinguishMatch();

    const match = this.activeMatch;
    this.activeMatch = null;
    this.matchHand = null;

    this.scene.attach(match);

    match.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.transparent = true;
        child.material.needsUpdate = true;
      }
    });

    const throwVelocity = this._currentVelocity.clone().multiplyScalar(0.8);
    
    match.userData.fallData = {
      velocity: throwVelocity,
      startY: match.position.y,
      isFading: false
    };

    this.fallingMatches.push(match);
  }

  _startFadeOut(match) {
    match.userData.fallData.isFading = true;
    
    const materials = [];
    
    match.traverse((child) => {
      if (child.isMesh && child.material) {
        materials.push(child.material);
      }
    });

    new TWEEN.Tween({ opacity: 1 })
      .to({ opacity: 0 }, 1500)
      .easing(TWEEN.Easing.Quadratic.Out)
      .onUpdate((obj) => {
        materials.forEach(mat => {
          mat.opacity = obj.opacity;
        });
      })
      .onComplete(() => {
        this.scene.remove(match);
        disposeGraph(match);
        
        const index = this.fallingMatches.indexOf(match);
        if (index > -1) {
          this.fallingMatches.splice(index, 1);
        }
      })
      .start();
  }

  update(hitPose = null) {
    const dt = this.clock.getDelta();
    const time = this.clock.getElapsedTime();

    // --- GESTIONE FIAMMIFERO IN MANO ---
    if (this.activeMatch) {
      const data = this.activeMatch.userData;
      this.activeMatch.getWorldPosition(this._tempMatchPos);
      
      if (this._hasLastMatchPos && dt > 0) {
        this._tempVelocity.subVectors(this._tempMatchPos, this._lastMatchPos).divideScalar(dt);
        this._currentVelocity.lerp(this._tempVelocity, 0.4);
        
        const speed = this._currentVelocity.length();
        if (speed > 1.5 && data.isLit) {
          this._extinguishMatch();
        }
      } else {
        this._hasLastMatchPos = true;
      }
      
      this._lastMatchPos.copy(this._tempMatchPos);

      if (data.isLit) {
        this.activeMatch.getWorldQuaternion(this._parentWorldQuat);
        data.fireGroup.quaternion.copy(this._parentWorldQuat).invert();
        
        const baseFreq = time * 20;
        const flickerH = 1 + Math.sin(baseFreq) * 0.12 + Math.sin(baseFreq * 0.5) * 0.05;
        const flickerW = 1 + Math.cos(baseFreq * 0.8) * 0.06;
        
        data.fireCore.scale.set(flickerW, 2.2 * flickerH, flickerW);
        data.fireOuter.scale.set(flickerW, 2.8 * flickerH, flickerW);
        
        data.fireCore.position.x = Math.sin(baseFreq * 0.3) * 0.002;
        data.fireOuter.position.x = Math.sin(baseFreq * 0.3) * 0.002;

        // Se l'incenso esiste e non è ancora acceso, controlliamo la distanza
        if (this.garden.incense && !this.garden.incense.userData.isLit) {
          const incenseData = this.garden.incense.userData;
          
          if (incenseData && incenseData.glowPart) {
            incenseData.glowPart.getWorldPosition(this._tempIncensePos);
            data.fireGroup.getWorldPosition(this._tempFirePos);
            
            if (this._tempFirePos.distanceTo(this._tempIncensePos) < 0.04) {
              this.stateManager.notifyChange({ action: 'light_incense' });
            }
          }
        }
      }
    }
    
    // --- GESTIONE CADUTA FIAMMIFERI ---
    for (let i = this.fallingMatches.length - 1; i >= 0; i--) {
      const match = this.fallingMatches[i];
      const fallData = match.userData.fallData;
      
      if (fallData.isFading) continue;
      
      fallData.velocity.y -= 4.0 * dt; 
      match.position.addScaledVector(fallData.velocity, dt);
      
      const speedFactor = fallData.velocity.length();
      match.rotation.x += dt * speedFactor;
      match.rotation.z += dt * (speedFactor * 0.5);

      const localPos = this._tempLocalPos.copy(match.position);
      this.garden.group.worldToLocal(localPos);
      
      const halfWidth = GARDEN_WIDTH / 2;
      const halfDepth = GARDEN_DEPTH / 2;
      const isOverTray = Math.abs(localPos.x) <= halfWidth && Math.abs(localPos.z) <= halfDepth;
      
      if (isOverTray) {
        if (localPos.y <= this.garden.sandTopY) {
          localPos.y = this.garden.sandTopY;
          this.garden.group.localToWorld(localPos);
          match.position.copy(localPos);
          this._startFadeOut(match);
        }
      } else {
        const fallbackY = this.garden.group.position.y - 1.0;
        let surfaceY = fallbackY;
        
        if (hitPose) {
          const hitY = hitPose.transform.position.y;
          if (hitY < fallData.startY) {
            surfaceY = hitY;
          }
        }
        
        if (match.position.y <= surfaceY) {
          match.position.y = surfaceY;
          this._startFadeOut(match);
        } else if (match.position.y <= fallbackY) {
          this._startFadeOut(match);
        }
      }
    }
  }
}