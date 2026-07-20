/**
 * Responsabilità unica (SRP): inizializzare e aggiornare il motore fisico
 * Rapier3D in modo agnostico.
 * Il manager non conosce le entità, ma si limita a parsare i contratti fisici
 * definiti in `userData.physics` per costruire le scene dinamiche.
 */
import * as THREE from 'three';
import RAPIER from 'rapier';
import { serializeGeometryPositions } from '../utils/GeometrySerializer.js';

export class PhysicsManager {
  constructor() {
    this.world = null;
    this.eventQueue = null;
    this.gongPlateColliderHandle = null;
    this.onGongHitCallback = null;
    this.meshBodyMap = new Map();
    this.grabbedObjects = new Map();
    this.gardenLimits = null;
    this.rakeMesh = null;
    
    // Variabili pre-allocate per evitare garbage collection
    this._worldPos = new THREE.Vector3();
    this._worldQuat = new THREE.Quaternion();
    this._parentQuat = new THREE.Quaternion();
    this._correctedWorld = new THREE.Vector3();
    this.clock = new THREE.Clock();
  }

  async init() {
    await RAPIER.init();
    const gravity = { x: 0.0, y: -2.0, z: 0.0 };
    this.world = new RAPIER.World(gravity);
    this.eventQueue = new RAPIER.EventQueue();
    console.log('[ZenXR] Motore fisico (Rapier) inizializzato. Data-driven OCP.');
  }

  /**
   * Traversa il gruppo e costruisce la simulazione leggendo i metadati fisici.
   */
  addGardenElements(gardenGroup) {
    gardenGroup.traverse((child) => {
      const phys = child.userData?.physics;
      if (!phys) return;

      if (phys.shape === 'tray') {
        this._addStaticFloor(child, phys);
      } else if (phys.isCompoundRoot) {
        this._createCompoundBody(child);
      } else if (child.isMesh && !phys.isPartOfCompound) {
        this._createGenericBody(child);
      }
    });
  }

  /**
   * Costruisce il descrittore del Collider leggendo la forma geometrica.
   */
  _createColliderDesc(mesh, phys, localPos = null, localQuat = null) {
    let colliderDesc = null;

    if (phys.shape === 'convexHull') {
      const positions = new Float32Array(serializeGeometryPositions(mesh.geometry));
      colliderDesc = RAPIER.ColliderDesc.convexHull(positions);
    } else if (phys.shape === 'cuboid') {
      const [hx, hy, hz] = phys.extents;
      colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz);
    } else if (phys.shape === 'cylinder') {
      colliderDesc = RAPIER.ColliderDesc.cylinder(phys.halfHeight, phys.radius);
    }

    if (colliderDesc) {
      // Calcolo offset di traslazione
      const tx = (localPos ? localPos.x : 0) + (phys.offsetX || 0);
      const ty = (localPos ? localPos.y : 0) + (phys.offsetY || 0);
      const tz = (localPos ? localPos.z : 0) + (phys.offsetZ || 0);

      if (tx !== 0 || ty !== 0 || tz !== 0) {
        colliderDesc.setTranslation(tx, ty, tz);
      }
      if (localQuat) {
        colliderDesc.setRotation(localQuat);
      }
    }
    return colliderDesc;
  }

  /**
   * Crea un corpo rigido standard per le Mesh singole (Rocce, Rami, Fiammiferi).
   */
  _createGenericBody(mesh) {
    const phys = mesh.userData.physics;
    mesh.getWorldPosition(this._worldPos);
    mesh.getWorldQuaternion(this._worldQuat);

    let bodyDesc;
    if (phys.type === 'dynamic') bodyDesc = RAPIER.RigidBodyDesc.dynamic();
    else if (phys.type === 'fixed') bodyDesc = RAPIER.RigidBodyDesc.fixed();
    else bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();

    bodyDesc.setTranslation(this._worldPos.x, this._worldPos.y, this._worldPos.z)
            .setRotation(this._worldQuat)
            .setLinearDamping(phys.linearDamping || 0.0)
            .setAngularDamping(phys.angularDamping || 0.0);

    const rigidBody = this.world.createRigidBody(bodyDesc);
    const colliderDesc = this._createColliderDesc(mesh, phys);

    if (colliderDesc) {
      if (phys.density) colliderDesc.setDensity(phys.density);
      if (phys.friction) colliderDesc.setFriction(phys.friction);
      if (phys.restitution) colliderDesc.setRestitution(phys.restitution);
      this.world.createCollider(colliderDesc, rigidBody);
    }

    this.meshBodyMap.set(mesh, rigidBody);
  }

  /**
   * Crea un corpo rigido composto (Rastrello, Gong) raccogliendo i collider dei figli.
   */
  _createCompoundBody(group) {
    const phys = group.userData.physics;
    group.getWorldPosition(this._worldPos);
    group.getWorldQuaternion(this._worldQuat);

    let bodyDesc;
    if (phys.type === 'dynamic') bodyDesc = RAPIER.RigidBodyDesc.dynamic();
    else if (phys.type === 'fixed') bodyDesc = RAPIER.RigidBodyDesc.fixed();
    else bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();

    bodyDesc.setTranslation(this._worldPos.x, this._worldPos.y, this._worldPos.z)
            .setRotation(this._worldQuat)
            .setLinearDamping(phys.linearDamping || 0.0)
            .setAngularDamping(phys.angularDamping || 0.0);
    
    if (phys.gravityScale !== undefined) bodyDesc.setGravityScale(phys.gravityScale);
    if (phys.ccdEnabled) bodyDesc.setCcdEnabled(phys.ccdEnabled);

    const rigidBody = this.world.createRigidBody(bodyDesc);
    
    // Inizializzazione specifica per la presa del rastrello
    if (group.userData.kind === 'rake') {
      this.rakeMesh = group;
      rigidBody.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    }

    const tempMatrix = new THREE.Matrix4();
    const localPos = new THREE.Vector3();
    const localQuat = new THREE.Quaternion();
    const localScale = new THREE.Vector3();

    group.updateMatrixWorld(true);

    group.traverse((child) => {
      const childPhys = child.userData?.physics;
      if (child.isMesh && childPhys) {
        child.updateMatrixWorld(true);
        tempMatrix.copy(group.matrixWorld).invert().multiply(child.matrixWorld);
        tempMatrix.decompose(localPos, localQuat, localScale);

        const colliderDesc = this._createColliderDesc(child, childPhys, localPos, localQuat);
        if (colliderDesc) {
          // Eredita le proprietà fisiche dal padre composto
          if (phys.density) colliderDesc.setDensity(phys.density);
          if (phys.friction) colliderDesc.setFriction(phys.friction);
          if (phys.restitution) colliderDesc.setRestitution(phys.restitution);
          if (phys.collisionGroups) colliderDesc.setCollisionGroups(phys.collisionGroups);
          
          if (childPhys.activeEvents) {
            colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
          }

          const collider = this.world.createCollider(colliderDesc, rigidBody);
          
          // Tracciamento specifico per gli eventi del gong
          if (childPhys.id === 'gong_plate') {
            this.gongPlateColliderHandle = collider.handle;
          }
        }
        childPhys.isPartOfCompound = true;
      }
    });

    this.meshBodyMap.set(group, rigidBody);
  }

  /**
   * Genera il recinto invisibile della vasca per contenere gli oggetti.
   */
  _addStaticFloor(mesh, phys) {
    mesh.geometry.computeBoundingBox();
    const bbox = mesh.geometry.boundingBox;
    const hx = (bbox.max.x - bbox.min.x) / 2;
    const hy = (bbox.max.y - bbox.min.y) / 2;
    const hz = (bbox.max.z - bbox.min.z) / 2;
    
    mesh.getWorldPosition(this._worldPos);
    mesh.getWorldQuaternion(this._worldQuat);
    
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

    const wallGroups = phys.wallGroups || 0x00020001;
    const wallH = phys.wallHeight || 1.0;
    const wallT = phys.wallThickness || 0.05;

    this.world.createCollider(RAPIER.ColliderDesc.cuboid(wallT, wallH, hz).setTranslation(-hx - wallT, wallH, 0).setCollisionGroups(wallGroups), rigidBody);
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(wallT, wallH, hz).setTranslation(hx + wallT, wallH, 0).setCollisionGroups(wallGroups), rigidBody);
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx + wallT * 2, wallH, wallT).setTranslation(0, wallH, -hz - wallT).setCollisionGroups(wallGroups), rigidBody);
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx + wallT * 2, wallH, wallT).setTranslation(0, wallH, hz + wallT).setCollisionGroups(wallGroups), rigidBody);

    this.meshBodyMap.set(mesh, rigidBody);
  }

  setObjectGrabbed(mesh, isGrabbed, handQuat = null) {
    const body = this.meshBodyMap.get(mesh);
    if (!body) return;
    
    if (isGrabbed) {
      if (mesh === this.rakeMesh) {
        body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      }
      body.setGravityScale(0, true);
      
      const offsetQuat = new THREE.Quaternion();
      if (handQuat && mesh !== this.rakeMesh) {
        const objectQuat = body.rotation();
        const qObj = new THREE.Quaternion(objectQuat.x, objectQuat.y, objectQuat.z, objectQuat.w);
        offsetQuat.copy(handQuat).invert().multiply(qObj);
      }
      
      this.grabbedObjects.set(mesh, {
        pos: new THREE.Vector3(),
        quat: new THREE.Quaternion(),
        offsetQuat: offsetQuat
      });
    } else {
      if (mesh === this.rakeMesh) {
        body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      } else {
        body.setGravityScale(1.0, true);
      }
      this.grabbedObjects.delete(mesh);
      body.wakeUp();
    }
  }

  moveGrabbedObject(mesh, targetWorldPos, targetWorldQuat = null) {
    if (this.grabbedObjects.has(mesh)) {
      const data = this.grabbedObjects.get(mesh);
      data.pos.copy(targetWorldPos);
      if (targetWorldQuat) {
        data.quat.copy(targetWorldQuat);
      }
    }
  }

  _applyGrabVelocities(dt) {
    for (const [mesh, targetData] of this.grabbedObjects) {
      const body = this.meshBodyMap.get(mesh);
      if (!body) return;
      
      const currentPos = body.translation();
      const smooth = 0.4;
      const vx = ((targetData.pos.x - currentPos.x) / dt) * smooth;
      const vy = ((targetData.pos.y - currentPos.y) / dt) * smooth;
      const vz = ((targetData.pos.z - currentPos.z) / dt) * smooth;
      
      body.setLinvel({ x: vx, y: vy, z: vz }, true);
      
      if (targetData.quat) {
        const currentQuat = body.rotation();
        const q0 = new THREE.Quaternion(currentQuat.x, currentQuat.y, currentQuat.z, currentQuat.w);
        const q1 = targetData.quat.clone().multiply(targetData.offsetQuat);
        
        const qDiff = q1.clone().multiply(q0.clone().invert());
        const angle = 2 * Math.acos(THREE.MathUtils.clamp(qDiff.w, -1, 1));
        const s = Math.sqrt(1 - qDiff.w * qDiff.w);
        
        let rx = qDiff.x, ry = qDiff.y, rz = qDiff.z;
        if (s > 0.001) { rx /= s; ry /= s; rz /= s; }
        
        let normAngle = angle;
        if (normAngle > Math.PI) normAngle -= 2 * Math.PI;
        
        const smoothRot = 0.3;
        body.setAngvel({
          x: (rx * normAngle / dt) * smoothRot,
          y: (ry * normAngle / dt) * smoothRot,
          z: (rz * normAngle / dt) * smoothRot
        }, true);
      }
    }
  }

  _processCollisionEvents() {
    if (this.eventQueue && this.onGongHitCallback) {
      this.eventQueue.drainCollisionEvents((handle1, handle2, started) => {
        if (started) {
          if (handle1 === this.gongPlateColliderHandle || handle2 === this.gongPlateColliderHandle) {
            this.onGongHitCallback();
          }
        }
      });
    }
  }

  _enforceGardenLimits(mesh, body) {
    if (!this.gardenLimits || mesh === this.rakeMesh) return;
    let oob = false;
    
    if (this._worldPos.x < -this.gardenLimits.hx) { this._worldPos.x = -this.gardenLimits.hx; oob = true; }
    if (this._worldPos.x > this.gardenLimits.hx) { this._worldPos.x = this.gardenLimits.hx; oob = true; }
    if (this._worldPos.z < -this.gardenLimits.hz) { this._worldPos.z = -this.gardenLimits.hz; oob = true; }
    if (this._worldPos.z > this.gardenLimits.hz) { this._worldPos.z = this.gardenLimits.hz; oob = true; }
    
    if (this._worldPos.y < this.gardenLimits.minY - 0.2) {
      this._worldPos.y = this.gardenLimits.minY + 0.1;
      oob = true;
    }
    
    if (oob) {
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      this._correctedWorld.copy(this._worldPos);
      mesh.parent.localToWorld(this._correctedWorld);
      body.setTranslation({ x: this._correctedWorld.x, y: this._correctedWorld.y, z: this._correctedWorld.z }, true);
    }
  }

  update() {
    if (!this.world) return;
    let dt = this.clock.getDelta();
    if (dt === 0) dt = 1 / 60;
    
    this._applyGrabVelocities(dt);
    this.world.step(this.eventQueue);
    this._processCollisionEvents();
    
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
          this._enforceGardenLimits(mesh, body);
        }
        
        mesh.position.copy(this._worldPos);
        mesh.quaternion.copy(this._worldQuat);
      } else if (body.bodyType() === RAPIER.RigidBodyType.KinematicPositionBased) {
        mesh.getWorldPosition(this._worldPos);
        mesh.getWorldQuaternion(this._worldQuat);
        body.setNextKinematicTranslation(this._worldPos);
        body.setNextKinematicRotation(this._worldQuat);
      }
    }
  }

  clear() {
    if (!this.world) return;
    this.world.forEachRigidBody((body) => {
      this.world.removeRigidBody(body);
    });
    this.meshBodyMap.clear();
    this.grabbedObjects.clear();
    this.gongPlateColliderHandle = null;
    this.onGongHitCallback = null;
    this.rakeMesh = null;
  }
}