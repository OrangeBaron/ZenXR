/**
 * ============================================================================
 * PhysicsManager.js
 * ============================================================================
 * Responsabilità unica (SRP): inizializzare e aggiornare il motore fisico
 * Rapier3D. Gestisce la creazione dei corpi rigidi (rocce, sabbia) e si
 * occupa della sincronizzazione bidirezionale tra il mondo WebGL e il
 * mondo fisico.
 * ============================================================================
 */
import * as THREE from 'three';
import RAPIER from 'rapier';
import { serializeGeometryPositions } from '../utils/GeometrySerializer.js';

export class PhysicsManager {
  constructor() {
    this.world = null;
    this.meshBodyMap = new Map(); // Mappa 1:1 tra THREE.Mesh e RAPIER.RigidBody
    
    // Variabili di appoggio pre-allocate per evitare garbage collection ad ogni frame
    this._worldPos = new THREE.Vector3();
    this._worldQuat = new THREE.Quaternion();
    this._parentQuat = new THREE.Quaternion();
  }

  async init() {
    await RAPIER.init();
    const gravity = { x: 0.0, y: -2.0, z: 0.0 }; // Gravità addolcita (VR comfort)
    this.world = new RAPIER.World(gravity);
    console.log('[ZenXR] Motore fisico (Rapier) inizializzato.');
  }

  /**
   * Crea il collisore di base per la vasca/sabbia e vi aggiunge 4 muri 
   * invisibili per creare un "acquario" fisico.
   * @param {THREE.Mesh} mesh La mesh della sabbia
   */
  addStaticFloor(mesh) {
    mesh.geometry.computeBoundingBox();
    const bbox = mesh.geometry.boundingBox;
    const hx = (bbox.max.x - bbox.min.x) / 2;
    const hy = (bbox.max.y - bbox.min.y) / 2;
    const hz = (bbox.max.z - bbox.min.z) / 2;

    mesh.getWorldPosition(this._worldPos);
    mesh.getWorldQuaternion(this._worldQuat);

    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(this._worldPos.x, this._worldPos.y, this._worldPos.z)
      .setRotation(this._worldQuat);
    
    const rigidBody = this.world.createRigidBody(bodyDesc);
    
    // 1. Pavimento solido (Sabbia)
    const floorCollider = RAPIER.ColliderDesc.cuboid(hx, hy, hz);
    this.world.createCollider(floorCollider, rigidBody);

    // 2. Muri invisibili (Acquario) per evitare che le rocce rotolino fuori
    const wallH = 1.0;  // Mezza altezza (1m = muro totale di 2 metri)
    const wallT = 0.05; // Mezzo spessore del muro

    // Muro Sinistro (-X)
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(wallT, wallH, hz).setTranslation(-hx - wallT, wallH, 0), 
      rigidBody
    );
    // Muro Destro (+X)
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(wallT, wallH, hz).setTranslation(hx + wallT, wallH, 0), 
      rigidBody
    );
    // Muro Posteriore (-Z)
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx + wallT * 2, wallH, wallT).setTranslation(0, wallH, -hz - wallT), 
      rigidBody
    );
    // Muro Anteriore (+Z)
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx + wallT * 2, wallH, wallT).setTranslation(0, wallH, hz + wallT), 
      rigidBody
    );

    this.meshBodyMap.set(mesh, rigidBody);
  }

  /**
   * Registra una roccia come corpo rigido dinamico nel motore fisico.
   * @param {THREE.Mesh} mesh La roccia (RockGenerator)
   */
  addRock(mesh) {
    mesh.getWorldPosition(this._worldPos);
    mesh.getWorldQuaternion(this._worldQuat);

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(this._worldPos.x, this._worldPos.y, this._worldPos.z)
      .setRotation(this._worldQuat)
      .setLinearDamping(0.3)  // Leggero attrito in aria
      .setAngularDamping(0.3); 
        
    const rigidBody = this.world.createRigidBody(bodyDesc);

    // ConvexHull usa l'involucro convesso dei vertici, perfetto per icosaedri deformati
    const positions = new Float32Array(serializeGeometryPositions(mesh.geometry));
    const colliderDesc = RAPIER.ColliderDesc.convexHull(positions)
      .setMass(1.0)
      .setFriction(0.8)       // Alto attrito per favorire lo stone balancing
      .setRestitution(0.1);   // Rimbalzo quasi nullo (sassi pesanti)

    // TODO: Audio - In futuro abiliteremo gli eventi qui per il suono di scontro ASMR:
    // colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

    this.world.createCollider(colliderDesc, rigidBody);
    this.meshBodyMap.set(mesh, rigidBody);
  }

  /**
   * Cambia lo stato fisico di una roccia per permetterne la manipolazione manuale.
   * @param {THREE.Mesh} mesh La roccia da afferrare o rilasciare
   * @param {boolean} isKinematic True se afferrata, False se rilasciata
   */
  setRockKinematic(mesh, isKinematic) {
    const body = this.meshBodyMap.get(mesh);
    if (!body) return;
    
    if (isKinematic) {
      body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    } else {
      body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      // Quando la rilasciamo, svegliamo il corpo nel caso il motore 
      // fisico lo avesse "addormentato" per inattività
      body.wakeUp();
    }
  }

  update() {
    if (!this.world) return;
    this.world.step();

    for (const [mesh, body] of this.meshBodyMap) {
      if (body.bodyType() === RAPIER.RigidBodyType.Dynamic) {
        // [Rocce] Sincronizza Rapier -> Three.js (Il motore fisico muove i render)
        const t = body.translation();
        const r = body.rotation();
        
        this._worldPos.set(t.x, t.y, t.z);
        this._worldQuat.set(r.x, r.y, r.z, r.w);

        // Poiché le rocce sono figlie del Garden Group, dobbiamo convertire le 
        // coordinate mondo restituite da Rapier in coordinate locali del parent.
        if (mesh.parent) {
          mesh.parent.worldToLocal(this._worldPos);
          mesh.parent.getWorldQuaternion(this._parentQuat);
          this._worldQuat.premultiply(this._parentQuat.invert());
        }

        mesh.position.copy(this._worldPos);
        mesh.quaternion.copy(this._worldQuat);

      } else if (body.bodyType() === RAPIER.RigidBodyType.KinematicPositionBased) {
        // [Sabbia] Sincronizza Three.js -> Rapier (L'hit-test XR sposta il collider statico)
        mesh.getWorldPosition(this._worldPos);
        mesh.getWorldQuaternion(this._worldQuat);
        body.setNextKinematicTranslation(this._worldPos);
        body.setNextKinematicRotation(this._worldQuat);
      }
    }
  }
}