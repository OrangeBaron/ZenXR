import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { createSingleMatch } from '../entities/IncenseGenerator.js';
import { GARDEN_WIDTH, GARDEN_DEPTH } from '../utils/GardenLayout.js';

export class IncenseInteractionManager {
  constructor({ scene, garden, stateManager, physicsManager }) {
    this.scene = scene;
    this.garden = garden;
    this.stateManager = stateManager;
    this.physicsManager = physicsManager;
    
    this.activeMatch = null;
    this.matchHand = null;
    this.isIncenseLit = false;
    
    this.fallingMatches = [];
    
    this._lastMatchPos = null;
    this.clock = new THREE.Clock();
    this._tempMatchPos = new THREE.Vector3();
    this._tempIncensePos = new THREE.Vector3();
    this._tempLocalPos = new THREE.Vector3();
    this._parentWorldQuat = new THREE.Quaternion();
    
    this._currentVelocity = new THREE.Vector3();
    this._tempVelocity = new THREE.Vector3();
    this._tempFirePos = new THREE.Vector3();
    
    // Setup sistema particellare fumo
    this.smokeParticles = [];
    this.smokeGeo = new THREE.TetrahedronGeometry(0.004); 
    this.smokeMat = new THREE.MeshBasicMaterial({
        color: 0xe0e0e0,
        transparent: true,
        opacity: 0.1,
        depthWrite: false
    });
    this.smokeTimer = 0;
    this.smokeSpawnRate = 0.15;

    this.stateManager.onChange((event) => {
      if (event.detail?.action === 'spawn_match') {
        this._spawnMatchInHand(event.detail.hand, event.detail.anchor);
      }
      if (event.detail?.action === 'pinch_end') {
        if (this.activeMatch && this.matchHand === event.detail.hand) {
          this._dropMatch();
        }
      }
      if (event.detail?.action === 'reset_incense') {
        this._resetIncense();
      }
    });
  }

  _spawnMatchInHand(hand, anchor) {
    if (this.activeMatch) return;

    this.activeMatch = createSingleMatch();
    anchor.add(this.activeMatch);
    this.matchHand = hand;
    this._lastMatchPos = null; 
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
    
    console.log('[ZenXR] Fiammifero spento.');
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

  _lightIncense() {
    if (this.isIncenseLit || !this.garden.incense) return;

    this.isIncenseLit = true;
    
    const incenseData = this.garden.incense.userData;
    if (incenseData && incenseData.glowPart) {
      incenseData.glowPart.visible = true; 
    }
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
            match.traverse((child) => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    child.material.dispose();
                }
            });
            const index = this.fallingMatches.indexOf(match);
            if (index > -1) {
                this.fallingMatches.splice(index, 1);
            }
        })
        .start();
  }

  _resetIncense() {
    if (!this.garden.incense) return;
    
    this.isIncenseLit = false;
    
    const incenseData = this.garden.incense.userData;
    if (incenseData) {
      if (incenseData.glowPart) {
        incenseData.glowPart.visible = false;
        incenseData.glowPart.position.y = 0.05 + 0.20;
      }
      if (incenseData.burnPart) {
        incenseData.burnPart.scale.y = 1.0;
      }
    }
    
    console.log('[ZenXR] Incenso resettato.');
  }

  update(hitPose = null) {
    const dt = this.clock.getDelta();
    const time = this.clock.getElapsedTime();

    // --- GESTIONE FIAMMIFERO IN MANO ---
    if (this.activeMatch) {
      const data = this.activeMatch.userData;
      this.activeMatch.getWorldPosition(this._tempMatchPos);
      
      if (this._lastMatchPos && dt > 0) {
        this._tempVelocity.subVectors(this._tempMatchPos, this._lastMatchPos).divideScalar(dt);
        
        this._currentVelocity.lerp(this._tempVelocity, 0.4);

        const speed = this._currentVelocity.length();
        if (speed > 1.5 && data.isLit) {
          this._extinguishMatch();
        }
      } else {
        this._lastMatchPos = new THREE.Vector3();
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
        
        data.fireCore.position.x = Math.sin(baseFreq * 0.3) * 0.005;
        data.fireOuter.position.x = Math.sin(baseFreq * 0.3) * 0.005;

        if (!this.isIncenseLit && this.garden.incense) {
          const incenseData = this.garden.incense.userData;
          if (incenseData && incenseData.glowPart) {
            incenseData.glowPart.getWorldPosition(this._tempIncensePos);
            
            data.fireGroup.getWorldPosition(this._tempFirePos);

            if (this._tempFirePos.distanceTo(this._tempIncensePos) < 0.04) {
              this._lightIncense();
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

    // --- GESTIONE INCENSO ---
    if (this.isIncenseLit && this.garden.incense) {
        const incenseData = this.garden.incense.userData;
        const burnPart = incenseData.burnPart;
        const glowPart = incenseData.glowPart;

        if (burnPart.scale.y > 0.01) {
            burnPart.scale.y -= dt * 0.01;
            
            glowPart.position.y = 0.05 + (0.2 * burnPart.scale.y);

            // SPAWN DEL FUMO
            this.smokeTimer += dt;
            if (this.smokeTimer > this.smokeSpawnRate) {
                this.smokeTimer = 0;
                glowPart.getWorldPosition(this._tempIncensePos);

                const p = new THREE.Mesh(this.smokeGeo, this.smokeMat);
                p.position.copy(this._tempIncensePos);
                
                p.userData = {
                    life: 0,
                    maxLife: 4.5 + Math.random() * 2.5,
                    velX: (Math.random() - 0.5) * 0.0015,
                    velY: 0.025 + Math.random() * 0.008,
                    rotSpeedX: (Math.random() - 0.5) * 1.5,
                    rotSpeedY: (Math.random() - 0.5) * 1.5,
                    rotSpeedZ: (Math.random() - 0.5) * 1.5
                };
                
                p.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
                this.scene.add(p);
                this.smokeParticles.push(p);
            }
        } else {
            this.isIncenseLit = false;
            glowPart.visible = false;
        }
    }

    // --- AGGIORNAMENTO PARTICELLE FUMO ---
    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
        const p = this.smokeParticles[i];
        p.userData.life += dt;

        if (p.userData.life >= p.userData.maxLife) {
            this.scene.remove(p);
            this.smokeParticles.splice(i, 1);
        } else {
            p.position.y += p.userData.velY * dt;
            
            const lifeRatio = p.userData.life / p.userData.maxLife;
            const sway = Math.sin(time * 1.2 + p.userData.life * 1.5) * dt * (0.005 + lifeRatio * 0.01);
            p.position.x += p.userData.velX * dt + sway;
            
            p.rotation.x += p.userData.rotSpeedX * dt;
            p.rotation.y += p.userData.rotSpeedY * dt;
            p.rotation.z += p.userData.rotSpeedZ * dt;
            
            const scaleCurve = Math.sin(lifeRatio * Math.PI);
            p.scale.setScalar(scaleCurve * 1.4);
        }
    }
  }
}