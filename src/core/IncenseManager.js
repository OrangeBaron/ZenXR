/**
 * Responsabilità unica (SRP): Gestire l'accensione dell'incenso, il consumo
 * visivo del bastoncino e la generazione/animazione delle particelle di fumo.
 */
import * as THREE from 'three';

export class IncenseManager {
  constructor({ scene, garden, stateManager }) {
    this.scene = scene;
    this.garden = garden;
    this.stateManager = stateManager;
    
    this.isIncenseLit = false;
    this.clock = new THREE.Clock();
    this._tempIncensePos = new THREE.Vector3();
    
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
      if (event.detail?.action === 'light_incense') {
        this._lightIncense();
      }
      if (event.detail?.action === 'reset_incense') {
        this._resetIncense();
      }
    });
  }

  _lightIncense() {
    if (this.isIncenseLit || !this.garden.incense) return;
    
    this.isIncenseLit = true;
    this.garden.incense.userData.isLit = true;
    
    const incenseData = this.garden.incense.userData;
    if (incenseData && incenseData.glowPart) {
      incenseData.glowPart.visible = true; 
    }
  }

  _resetIncense() {
    if (!this.garden.incense) return;
    
    this.isIncenseLit = false;
    this.garden.incense.userData.isLit = false;
    
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
    
    for (const particle of this.smokeParticles) {
      this.scene.remove(particle);
    }
    this.smokeParticles = [];
    this.smokeTimer = 0;
  }

  update() {
    const dt = this.clock.getDelta();
    const time = this.clock.getElapsedTime();

    // --- GESTIONE INCENSO E SPAWN FUMO ---
    if (this.isIncenseLit && this.garden.incense) {
      const incenseData = this.garden.incense.userData;
      const burnPart = incenseData.burnPart;
      const glowPart = incenseData.glowPart;
      
      if (burnPart.scale.y > 0.01) {
        burnPart.scale.y -= dt * 0.01; 
        glowPart.position.y = 0.05 + (0.2 * burnPart.scale.y);
        
        // Generazione del fumo
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

    // --- AGGIORNAMENTO POSIZIONE PARTICELLE DI FUMO ---
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

  /**
   * Pulisce la memoria condivisa del sistema particellare.
   */
  dispose() {
    if (this.smokeGeo) this.smokeGeo.dispose();
    if (this.smokeMat) this.smokeMat.dispose();
    
    for (const particle of this.smokeParticles) {
      this.scene.remove(particle);
    }
    this.smokeParticles = [];
  }
}