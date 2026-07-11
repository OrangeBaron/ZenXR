/**
 * Responsabilità unica (SRP): inizializzare e aggiornare il motore fisico
 * Rapier3D. Gestisce la creazione dei corpi rigidi, la presa basata sulla
 * velocità (velocity-based grab) per evitare compenetrazioni durante
 * l'interazione a mano, e il controllo dei limiti (OOB, out-of-bounds) per
 * impedire la fuga di oggetti dalla vasca del giardino.
 */
import * as THREE from 'three';
import RAPIER from 'rapier';
import { serializeGeometryPositions } from '../utils/GeometrySerializer.js';

export class PhysicsManager {
  /**
   * Inizializza le strutture di stato del manager. Il mondo fisico Rapier
   * viene creato in modo asincrono da `init()`, da chiamare prima di
   * registrare qualsiasi corpo.
   */
  constructor() {
    this.world = null;
    this.meshBodyMap = new Map();
    this.grabbedObjects = new Map();
    this.gardenLimits = null;

    this._worldPos = new THREE.Vector3();
    this._worldQuat = new THREE.Quaternion();
    this._parentQuat = new THREE.Quaternion();
    this._correctedWorld = new THREE.Vector3();
    this.clock = new THREE.Clock();
  }

  /**
   * Carica il modulo WASM di Rapier e crea il mondo fisico con gravità
   * verticale ridotta, adatta alla scala miniaturizzata del giardino.
   * @returns {Promise<void>}
   */
  async init() {
    await RAPIER.init();
    const gravity = { x: 0.0, y: -2.0, z: 0.0 };
    this.world = new RAPIER.World(gravity);
    console.log('[ZenXR] Motore fisico (Rapier) inizializzato.');
  }

  /**
   * Registra come corpo rigido statico (kinematic) il fondo della vasca e le
   * quattro pareti perimetrali derivate dalla sua bounding box, e calcola i
   * limiti locali usati da `update()` per il controllo OOB.
   * @param {THREE.Mesh} mesh Mesh del fondo/vasca da cui derivare dimensioni e posa.
   */
  addStaticFloor(mesh) {
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
    
    // Il pavimento usa i gruppi di default (collide con tutto)
    const floorCollider = RAPIER.ColliderDesc.cuboid(hx, hy, hz);
    this.world.createCollider(floorCollider, rigidBody);

    // Pareti: Appartenenza = Gruppo 2 (0x0002), Filtro = Solo Gruppo 1 (0x0001)
    // (Le rocce hanno di default appartenenza a tutti i gruppi, quindi sbatteranno sui muri)
    const wallGroups = 0x00020001;
    
    const wallH = 1.0; 
    const wallT = 0.05; 
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(wallT, wallH, hz).setTranslation(-hx - wallT, wallH, 0).setCollisionGroups(wallGroups), rigidBody);
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(wallT, wallH, hz).setTranslation(hx + wallT, wallH, 0).setCollisionGroups(wallGroups), rigidBody);
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx + wallT * 2, wallH, wallT).setTranslation(0, wallH, -hz - wallT).setCollisionGroups(wallGroups), rigidBody);
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx + wallT * 2, wallH, wallT).setTranslation(0, wallH, hz + wallT).setCollisionGroups(wallGroups), rigidBody);

    this.meshBodyMap.set(mesh, rigidBody);
  }

  /**
   * Registra come corpi rigidi statici (kinematic) tutti i rami del bonsai,
   * con un collider a guscio convesso (convex hull) derivato dalla geometria
   * di ciascun ramo, così che rocce e altri oggetti dinamici possano
   * collidervi correttamente.
   * @param {THREE.Group} bonsaiGroup Gruppo radice del bonsai.
   */
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

  /**
   * Registra una roccia come corpo rigido dinamico, con collider a guscio
   * convesso derivato dalla sua geometria e parametri di massa, attrito e
   * rimbalzo calibrati per un comportamento credibile quando viene rilasciata
   * o urta altri oggetti.
   * @param {THREE.Mesh} mesh Mesh della roccia.
   */
  addRock(mesh) {
    mesh.getWorldPosition(this._worldPos);
    mesh.getWorldQuaternion(this._worldQuat);

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(this._worldPos.x, this._worldPos.y, this._worldPos.z)
      .setRotation(this._worldQuat)
      .setLinearDamping(0.3)
      .setAngularDamping(0.1);
        
    const rigidBody = this.world.createRigidBody(bodyDesc);
    const positions = new Float32Array(serializeGeometryPositions(mesh.geometry));
    const colliderDesc = RAPIER.ColliderDesc.convexHull(positions)
      .setDensity(3000.0)
      .setFriction(0.8)
      .setRestitution(0.1);

    this.world.createCollider(colliderDesc, rigidBody);
    this.meshBodyMap.set(mesh, rigidBody);
  }

  /**
   * Avvia o ferma la presa di una roccia. Non la rende cinematica: azzera
   * invece la sua scala di gravità, così che possa muoversi verso la mano
   * generando collisioni reali con il resto del mondo fisico (velocity-based grab).
   * @param {THREE.Mesh} mesh Mesh della roccia.
   * @param {boolean} isGrabbed `true` per avviare la presa, `false` per rilasciarla.
   */
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

  /**
   * Aggiorna il punto bersaglio mondiale verso cui la roccia afferrata deve
   * viaggiare. Il movimento effettivo avviene in `update()`.
   * @param {THREE.Mesh} mesh Mesh della roccia afferrata.
   * @param {THREE.Vector3} targetWorldPos Nuovo punto bersaglio, in coordinate mondo.
   */
  moveGrabbedObject(mesh, targetWorldPos, targetWorldQuat = null) {
    if (this.grabbedObjects.has(mesh)) {
      const data = this.grabbedObjects.get(mesh);
      data.pos.copy(targetWorldPos);
      if (targetWorldQuat) {
        data.quat.copy(targetWorldQuat);
      }
    }
  }
  
  /**
   * Crea un corpo rigido dinamico per il rastrello con un collider composto.
   * Ogni parte (manico, traversa, denti) diventa un collider attaccato allo stesso corpo,
   * garantendo collisioni dure ed esatte con sabbia e oggetti.
   */
  addRake(rakeGroup) {
    rakeGroup.getWorldPosition(this._worldPos);
    rakeGroup.getWorldQuaternion(this._worldQuat);

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(this._worldPos.x, this._worldPos.y, this._worldPos.z)
      .setRotation(this._worldQuat)
      .setLinearDamping(0.8)
      .setAngularDamping(0.8)
      .setGravityScale(0.0)
      .setCcdEnabled(true);
        
    const rigidBody = this.world.createRigidBody(bodyDesc);
    
    rigidBody.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);

    rakeGroup.traverse((child) => {
      if (child.isMesh) {
        const positions = new Float32Array(serializeGeometryPositions(child.geometry));
        const rakeGroups = 0x0004FFFD;
        
        const colliderDesc = RAPIER.ColliderDesc.convexHull(positions)
          .setTranslation(child.position.x, child.position.y, child.position.z)
          .setRotation(child.quaternion)
          .setDensity(800.0) 
          .setFriction(0.8)
          .setRestitution(0.0)
          .setCollisionGroups(rakeGroups);

        this.world.createCollider(colliderDesc, rigidBody);
      }
    });

    this.meshBodyMap.set(rakeGroup, rigidBody);
    this.rakeMesh = rakeGroup; 
  }

  /**
   * Avanza la simulazione fisica di un passo. Applica la velocità verso il
   * punto di presa alle rocce afferrate, esegue lo step del mondo Rapier,
   * riporta la posa dei corpi dinamici sulle mesh corrispondenti applicando
   * il controllo OOB, e sincronizza i corpi cinematici (sabbia, bonsai)
   * sulla posa corrente delle rispettive mesh. Da chiamare ad ogni frame.
   */
  update() {
    if (!this.world) return;

    let dt = this.clock.getDelta();
    if (dt === 0) dt = 1 / 60; // Fallback di sicurezza contro un delta nullo (es. primo frame).

    // Applica velocità e rotazione a TUTTI gli oggetti afferrati (Velocity-based grab)
    for (const [mesh, targetData] of this.grabbedObjects) {
      const body = this.meshBodyMap.get(mesh);
      if (!body) continue;

      const currentPos = body.translation();
      const smooth = 0.4; 

      const vx = ((targetData.pos.x - currentPos.x) / dt) * smooth;
      const vy = ((targetData.pos.y - currentPos.y) / dt) * smooth;
      const vz = ((targetData.pos.z - currentPos.z) / dt) * smooth;

      body.setLinvel({ x: vx, y: vy, z: vz }, true);

      // Applica la rotazione fisica
      if (targetData.quat) {
        const currentQuat = body.rotation();
        const q0 = new THREE.Quaternion(currentQuat.x, currentQuat.y, currentQuat.z, currentQuat.w);
        
        // Moltiplica la rotazione della mano per l'offset calcolato alla presa
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

    this.world.step();

    // Sincronizza Rapier -> Three.js per i corpi dinamici, applicando il
    // controllo OOB sui limiti della vasca.
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

          // --- CONTROLLO OOB: Solo per le ROCCE (esclude il rastrello) ---
          if (this.gardenLimits && mesh !== this.rakeMesh) {
            let oob = false;
            if (this._worldPos.x < -this.gardenLimits.hx) { this._worldPos.x = -this.gardenLimits.hx; oob = true; }
            if (this._worldPos.x > this.gardenLimits.hx) { this._worldPos.x = this.gardenLimits.hx; oob = true; }
            if (this._worldPos.z < -this.gardenLimits.hz) { this._worldPos.z = -this.gardenLimits.hz; oob = true; }
            if (this._worldPos.z > this.gardenLimits.hz) { this._worldPos.z = this.gardenLimits.hz; oob = true; }

            // Sprofondamento estremo sotto la sabbia (caduto fuori dal mondo)
            if (this._worldPos.y < this.gardenLimits.minY - 0.2) {
              this._worldPos.y = this.gardenLimits.minY + 0.1; // Lo salva riportandolo 10cm sopra la sabbia.
              oob = true;
            }

            if (oob) {
              // Azzera la velocità residua per evitare che l'oggetto "rimbalzi" fuori di nuovo.
              body.setLinvel({ x: 0, y: 0, z: 0 }, true);
              body.setAngvel({ x: 0, y: 0, z: 0 }, true);

              // Riconverte la posizione corretta in coordinate mondo, richieste da Rapier per il riposizionamento.
              this._correctedWorld.copy(this._worldPos);
              mesh.parent.localToWorld(this._correctedWorld);
              body.setTranslation({ x: this._correctedWorld.x, y: this._correctedWorld.y, z: this._correctedWorld.z }, true);
            }
          }
        }

        mesh.position.copy(this._worldPos);
        mesh.quaternion.copy(this._worldQuat);

      } else if (body.bodyType() === RAPIER.RigidBodyType.KinematicPositionBased) {
        // Corpi cinematici (sabbia, bonsai): sincronizza Three.js -> Rapier, direzione inversa rispetto ai corpi dinamici.
        mesh.getWorldPosition(this._worldPos);
        mesh.getWorldQuaternion(this._worldQuat);
        body.setNextKinematicTranslation(this._worldPos);
        body.setNextKinematicRotation(this._worldQuat);
      }
    }
  }
}