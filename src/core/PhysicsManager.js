/**
 * ============================================================================
 * PhysicsManager.js
 * ============================================================================
 * Responsabilità unica (SRP): inizializzare e aggiornare il motore fisico
 * Rapier3D. Gestisce la creazione dei corpi rigidi, la presa basata sulla
 * velocità (Velocity-based Grab) per evitare compenetrazioni, e il controllo
 * dei limiti (OOB) per evitare fughe di oggetti.
 * ============================================================================
 */
import * as THREE from 'three';
import RAPIER from 'rapier';
import { serializeGeometryPositions } from '../utils/GeometrySerializer.js';

export class PhysicsManager {
  constructor() {
    this.world = null;
    this.meshBodyMap = new Map();
    this.grabbedRocks = new Map(); // Rocce attualmente afferrate
    this.gardenLimits = null;      // Limiti locali della vasca per l'OOB check
    
    this._worldPos = new THREE.Vector3();
    this._worldQuat = new THREE.Quaternion();
    this._parentQuat = new THREE.Quaternion();
  }

  async init() {
    await RAPIER.init();
    const gravity = { x: 0.0, y: -2.0, z: 0.0 };
    this.world = new RAPIER.World(gravity);
    console.log('[ZenXR] Motore fisico (Rapier) inizializzato.');
  }

  addStaticFloor(mesh) {
    mesh.geometry.computeBoundingBox();
    const bbox = mesh.geometry.boundingBox;
    const hx = (bbox.max.x - bbox.min.x) / 2;
    const hy = (bbox.max.y - bbox.min.y) / 2;
    const hz = (bbox.max.z - bbox.min.z) / 2;

    mesh.getWorldPosition(this._worldPos);
    mesh.getWorldQuaternion(this._worldQuat);

    // Registriamo i limiti locali della vasca per impedire fughe in update()
    this.gardenLimits = {
      hx: hx - 0.02, 
      hz: hz - 0.02,
      minY: mesh.position.y + hy
    };

    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(this._worldPos.x, this._worldPos.y, this._worldPos.z)
      .setRotation(this._worldQuat);
    
    const rigidBody = this.world.createRigidBody(bodyDesc);
    
    const floorCollider = RAPIER.ColliderDesc.cuboid(hx, hy, hz);
    this.world.createCollider(floorCollider, rigidBody);

    const wallH = 1.0; 
    const wallT = 0.05; 
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(wallT, wallH, hz).setTranslation(-hx - wallT, wallH, 0), rigidBody);
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(wallT, wallH, hz).setTranslation(hx + wallT, wallH, 0), rigidBody);
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx + wallT * 2, wallH, wallT).setTranslation(0, wallH, -hz - wallT), rigidBody);
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx + wallT * 2, wallH, wallT).setTranslation(0, wallH, hz + wallT), rigidBody);

    this.meshBodyMap.set(mesh, rigidBody);
  }

  addStaticBonsai(bonsaiGroup) {
    bonsaiGroup.traverse((mesh) => {
      if (mesh.isMesh && mesh.userData.kind === 'branch') {
        mesh.getWorldPosition(this._worldPos);
        mesh.getWorldQuaternion(this._worldQuat);
        const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
          .setTranslation(this._worldPos.x, this._worldPos.y, this._worldPos.z)
          .setRotation(this._worldQuat);
        const rigidBody = this.world.createRigidBody(bodyDesc);
        const positions = new Float32Array(serializeGeometryPositions(mesh.geometry));
        const colliderDesc = RAPIER.ColliderDesc.convexHull(positions);
        this.world.createCollider(colliderDesc, rigidBody);
        this.meshBodyMap.set(mesh, rigidBody);
      }
    });
  }

  addRock(mesh) {
    mesh.getWorldPosition(this._worldPos);
    mesh.getWorldQuaternion(this._worldQuat);

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(this._worldPos.x, this._worldPos.y, this._worldPos.z)
      .setRotation(this._worldQuat)
      .setLinearDamping(0.3)
      .setAngularDamping(0.3);
        
    const rigidBody = this.world.createRigidBody(bodyDesc);
    const positions = new Float32Array(serializeGeometryPositions(mesh.geometry));
    const colliderDesc = RAPIER.ColliderDesc.convexHull(positions)
      .setMass(1.0)
      .setFriction(0.8)
      .setRestitution(0.1);

    this.world.createCollider(colliderDesc, rigidBody);
    this.meshBodyMap.set(mesh, rigidBody);
  }

  /**
   * Avvia o ferma la presa di una roccia. Non la rende cinematica, ma azzera 
   * la gravità permettendole di muoversi verso la mano scontrandosi col mondo.
   */
  setRockGrabbed(mesh, isGrabbed) {
    const body = this.meshBodyMap.get(mesh);
    if (!body) return;
    
    if (isGrabbed) {
      body.setGravityScale(0, true);
      this.grabbedRocks.set(mesh, new THREE.Vector3());
    } else {
      body.setGravityScale(1, true);
      this.grabbedRocks.delete(mesh);
      body.wakeUp(); // Assicura che la fisica riprenda
    }
  }

  /**
   * Aggiorna il punto bersaglio mondiale verso cui la roccia afferrata deve viaggiare.
   */
  moveGrabbedRock(mesh, targetWorldPos) {
    if (this.grabbedRocks.has(mesh)) {
      this.grabbedRocks.get(mesh).copy(targetWorldPos);
    }
  }

  update() {
    if (!this.world) return;

    // 1. Applica le forze alle rocce afferrate per farle seguire la mano
    for (const [mesh, targetPos] of this.grabbedRocks) {
      const body = this.meshBodyMap.get(mesh);
      if (!body) continue;
      
      const currentPos = body.translation();
      const dt = 1 / 60; // Tick logico
      const smooth = 0.4; // Smorzamento per non farla schizzare via
      
      const vx = ((targetPos.x - currentPos.x) / dt) * smooth;
      const vy = ((targetPos.y - currentPos.y) / dt) * smooth;
      const vz = ((targetPos.z - currentPos.z) / dt) * smooth;
      
      body.setLinvel({ x: vx, y: vy, z: vz }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true); // Blocca la rotazione mentre è in mano
    }

    this.world.step();

    // 2. Sincronizza Rapier -> Three.js e controlla le fuoriuscite (OOB)
    for (const [mesh, body] of this.meshBodyMap) {
      if (body.bodyType() === RAPIER.RigidBodyType.Dynamic) {
        const t = body.translation();
        const r = body.rotation();
        
        this._worldPos.set(t.x, t.y, t.z);
        this._worldQuat.set(r.x, r.y, r.z, r.w);

        if (mesh.parent) {
          mesh.parent.worldToLocal(this._worldPos);
          mesh.parent.getWorldQuaternion(this._parentQuat);
          this._worldQuat.premultiply(this._parentQuat.invert());

          // --- OOB CHECK: Ripristino nei confini dell'acquario ---
          if (this.gardenLimits) {
            let oob = false;
            if (this._worldPos.x < -this.gardenLimits.hx) { this._worldPos.x = -this.gardenLimits.hx; oob = true; }
            if (this._worldPos.x > this.gardenLimits.hx) { this._worldPos.x = this.gardenLimits.hx; oob = true; }
            if (this._worldPos.z < -this.gardenLimits.hz) { this._worldPos.z = -this.gardenLimits.hz; oob = true; }
            if (this._worldPos.z > this.gardenLimits.hz) { this._worldPos.z = this.gardenLimits.hz; oob = true; }
            
            // Se sprofonda sotto la sabbia (es. glitch spingendola fortissimo in giù)
            if (this._worldPos.y < this.gardenLimits.minY) { 
              this._worldPos.y = this.gardenLimits.minY + 0.05; // La teletrasporta 5cm sopra la sabbia
              oob = true; 
            }

            if (oob) {
              // Se la roccia era uscita, azzeriamo la forza d'urto
              body.setLinvel({ x: 0, y: 0, z: 0 }, true);
              body.setAngvel({ x: 0, y: 0, z: 0 }, true);
              
              // Riconvertiamo la posizione corretta in coordinate mondo per dire a Rapier dove rimetterla
              const correctedWorld = this._worldPos.clone();
              mesh.parent.localToWorld(correctedWorld);
              body.setTranslation({ x: correctedWorld.x, y: correctedWorld.y, z: correctedWorld.z }, true);
            }
          }
        }

        mesh.position.copy(this._worldPos);
        mesh.quaternion.copy(this._worldQuat);

      } else if (body.bodyType() === RAPIER.RigidBodyType.KinematicPositionBased) {
        // [Sabbia, Bonsai] Sincronizza Three.js -> Rapier
        mesh.getWorldPosition(this._worldPos);
        mesh.getWorldQuaternion(this._worldQuat);
        body.setNextKinematicTranslation(this._worldPos);
        body.setNextKinematicRotation(this._worldQuat);
      }
    }
  }
}