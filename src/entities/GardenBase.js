/**
 * Costruisce proceduralmente la base fisica del giardino zen — vasca, zona
 * sabbiosa, recinto di bambù stilizzato e laghetto — e la compone con il
 * bonsai (BonsaiGenerator.js), un primo set di rocce (RockGenerator.js) e il
 * laghetto (PondGenerator.js), tutti disposti in posizione casuale ma sempre
 * coerenti con la topologia a due zone: laghetto e bonsai/rocce non si
 * sovrappongono mai, quindi nessun elemento "solido" finisce in acqua.
 *
 * Tutti gli elementi sono figli di `this.group`, così l'intero giardino può
 * essere spostato in blocco quando viene posizionato sulla superficie reale
 * (vedi XRInteractionManager.js). Il gruppo nasce nascosto: diventa visibile
 * solo dopo il primo posizionamento.
 *
 * Non gestisce input, fisica o hit-testing.
 */
import * as THREE from 'three';
import { createRock, serializeRock, deserializeRock } from './RockGenerator.js';
import { createBonsai, serializeBonsai, deserializeBonsai } from './BonsaiGenerator.js';
import { createPond, serializePond, deserializePond, isInsidePond, POND_SURFACE_LIFT, generatePondPebbles } from './PondGenerator.js';
import { createRake } from './RakeGenerator.js';
import { createMatcapTexture } from '../utils/MatcapTextureFactory.js';
import { sandBaseTexture } from '../utils/ProceduralTextureFactory.js';
import {
  GARDEN_WIDTH,
  GARDEN_DEPTH,
  GARDEN_WALL_THICKNESS,
  GARDEN_TRAY_HEIGHT,
  POND_AREA_RATIO,
} from '../utils/GardenLayout.js';

// Distanza extra (metri) da tenere dalla riva del laghetto quando si
// scelgono punti "asciutti" per bonsai e rocce: evita che gli oggetti
// tocchino visivamente il bordo dell'acqua.
const POND_SHORE_MARGIN = 0.03;

/**
 * Base fisica del giardino zen: gestisce costruzione, disposizione casuale
 * degli elementi e persistenza dello stato tramite `getState()`.
 */
export class GardenBase {
  /**
   * Costruisce la vasca con tutti i suoi elementi, generandoli casualmente
   * oppure ripristinandoli da uno stato salvato.
   * @param {Object} [options]
   * @param {number} [options.width=GARDEN_WIDTH] Larghezza della vasca in metri.
   * @param {number} [options.depth=GARDEN_DEPTH] Profondità della vasca in metri.
   * @param {number} [options.rockCount=8] Numero di rocce da disporre inizialmente (ignorato se `savedState` è presente).
   * @param {Object|null} [options.savedState=null] Stato prodotto da `getState()` e riletto da `SaveSystem`:
   * se presente, rocce e albero vengono ripristinati esattamente invece di essere rigenerati casualmente.
   * @param {THREE.Texture|null} [options.sandTexture=null] La mappa di bump dinamica fornita da SandSurfaceManager.
   */
  constructor({ width = GARDEN_WIDTH, depth = GARDEN_DEPTH, rockCount = 8, savedState = null, sandTexture = null } = {}) {
    this.width = width;
    this.depth = depth;
    this.rocks = [];

    this.group = new THREE.Group();
    this.group.visible = false;

    this._buildTray();
    this._buildSand(sandTexture); // Passiamo la texture dinamica
    this._buildBambooFence();

    if (savedState?.pond) {
      this.pond = deserializePond(savedState.pond);
    } else {
      this.pond = this._createPondLayout();
    }
    this.group.add(this.pond);

    const pebbles = generatePondPebbles(this.pond, this.sandTopY);
    if (pebbles) this.group.add(pebbles);

    if (savedState?.bonsai) {
      this.bonsai = deserializeBonsai(savedState.bonsai);
      this.bonsaiPosition = { x: this.bonsai.position.x, z: this.bonsai.position.z };
      this.group.add(this.bonsai);
    } else {
      this._addBonsai();
    }

    if (savedState?.rocks?.length) {
      this._restoreRocks(savedState.rocks);
    } else {
      this._scatterRocks(rockCount);
    }

    this._addRake();
  }

  /**
   * Cattura lo stato corrente di laghetto, rocce e albero (forma, colore,
   * posizione e rotazione) in un oggetto JSON-serializzabile pronto per
   * `SaveSystem`.
   * @returns {Object}
   */
  getState() {
    return {
      version: 2,
      pond: serializePond(this.pond),
      rocks: this.rocks.map(serializeRock),
      bonsai: serializeBonsai(this.bonsai),
    };
  }

  _buildTray() {
    const trayHeight = GARDEN_TRAY_HEIGHT;
    const wallThickness = GARDEN_WALL_THICKNESS;

    const trayMaterial = new THREE.MeshMatcapMaterial({
      matcap: createMatcapTexture(0x5b4632),
      flatShading: true,
    });

    const trayGeometry = new THREE.BoxGeometry(
      this.width + wallThickness * 2,
      trayHeight,
      this.depth + wallThickness * 2
    );
    const tray = new THREE.Mesh(trayGeometry, trayMaterial);
    tray.position.y = trayHeight / 2;
    tray.receiveShadow = true;
    this.group.add(tray);

    // Quota della superficie della sabbia: usata anche per bambù, bonsai e rocce.
    this.sandTopY = trayHeight;
  }

  /**
   * Costruisce il blocco di sabbia e applica la texture di bump se presente.
   * @param {THREE.Texture|null} sandTexture
   */
  _buildSand(sandTexture) {
    const sandHeight = 0.015;
    
    const matProperties = {
      map: sandBaseTexture, // Usiamo la texture granulosa condivisa
      color: 0xffffff,      
      roughness: 1.0,       
      metalness: 0.0,
    };

    if (sandTexture) {
      // 1. DISPLACEMENT
      matProperties.displacementMap = sandTexture;
      matProperties.displacementScale = 0.006; 
      matProperties.displacementBias = -0.006; 

      // 2. BUMP
      matProperties.bumpMap = sandTexture;
      matProperties.bumpScale = 0.004; 
      
      // 3. AMBIENT OCCLUSION
      matProperties.aoMap = sandTexture;
      matProperties.aoMapIntensity = 0.6;
    }

    const sandMaterial = new THREE.MeshStandardMaterial(matProperties);

    const sandGeometry = new THREE.BoxGeometry(this.width, sandHeight, this.depth, 200, 1, 200);
    
    // TRUCCO OBBLIGATORIO PER THREE.JS: Copiamo le UV nel canale uv2 per far funzionare l'aoMap
    sandGeometry.setAttribute('uv2', new THREE.BufferAttribute(sandGeometry.attributes.uv.array, 2));
    
    this.sand = new THREE.Mesh(sandGeometry, sandMaterial);
    this.sand.position.y = this.sandTopY + sandHeight / 2;
    this.sand.receiveShadow = true;
    this.sand.castShadow = true; 
    this.group.add(this.sand);

    this.sandTopY += sandHeight;
  }

  _buildBambooFence() {
    const poleRadius = 0.008;
    const poleHeight = 0.12;
    const poleMaterial = new THREE.MeshMatcapMaterial({
      matcap: createMatcapTexture(0xc2b280),
      flatShading: true,
    });
    const poleGeometry = new THREE.CylinderGeometry(poleRadius, poleRadius, poleHeight, 6);

    const desiredSpacing = 0.08;
    const poleCount = Math.max(3, Math.round(this.width / desiredSpacing) + 1);
    const spacing = this.width / (poleCount - 1);

    for (let i = 0; i < poleCount; i++) {
      const pole = new THREE.Mesh(poleGeometry, poleMaterial);
      pole.position.set(
        -this.width / 2 + i * spacing,
        this.sandTopY + poleHeight / 2 - 0.01,
        this.depth / 2 + 0.015
      );
      pole.castShadow = true;
      this.group.add(pole);
    }
  }

  _createPondLayout() {
    const cornerX = Math.random() < 0.5 ? -1 : 1;
    const cornerZ = Math.random() < 0.5 ? -1 : 1;

    const k = Math.sqrt((4 * POND_AREA_RATIO) / Math.PI);
    const radiusX = this.width * k;
    const radiusZ = this.depth * k;

    const pond = createPond({ cornerX, cornerZ, radiusX, radiusZ });
    pond.position.set(
      cornerX * (this.width / 2),
      this.sandTopY + POND_SURFACE_LIFT,
      cornerZ * (this.depth / 2)
    );
    return pond;
  }

  _randomDryPoint({ wallMargin = 0.05, avoidPoint = null, avoidRadius = 0 } = {}) {
    const halfWidth = this.width / 2 - wallMargin;
    const halfDepth = this.depth / 2 - wallMargin;

    let point = { x: 0, z: 0 };
    for (let attempt = 0; attempt < 200; attempt++) {
      const x = (Math.random() * 2 - 1) * halfWidth;
      const z = (Math.random() * 2 - 1) * halfDepth;
      point = { x, z };

      if (isInsidePond(this.pond, x, z, POND_SHORE_MARGIN)) continue;
      if (avoidPoint && Math.hypot(x - avoidPoint.x, z - avoidPoint.z) < avoidRadius) continue;

      return point;
    }
    return point;
  }

  _addBonsai() {
    this.bonsaiPosition = this._randomDryPoint({ wallMargin: 0.1 });
    this.bonsai = createBonsai();
    this.bonsai.position.set(this.bonsaiPosition.x, this.sandTopY, this.bonsaiPosition.z);
    this.group.add(this.bonsai);
  }

  _scatterRocks(count) {
    const margin = 0.05;
    const centerExclusionRadius = 0.16;

    for (let i = 0; i < count; i++) {
      const { x, z } = this._randomDryPoint({
        wallMargin: margin,
        avoidPoint: this.bonsaiPosition,
        avoidRadius: centerExclusionRadius,
      });

      const radius = 0.02 + Math.random() * 0.025;
      const rock = createRock({
        radius,
        detail: Math.random() > 0.5 ? 1 : 0,
        color: 0x8d8d86,
      });

      rock.position.set(x, this.sandTopY + radius * 1.5, z);
      rock.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      rock.castShadow = true;

      this.group.add(rock);
      this.rocks.push(rock);
    }
  }

  _restoreRocks(rocksState) {
    for (const rockState of rocksState) {
      const rock = deserializeRock(rockState);
      this.group.add(rock);
      this.rocks.push(rock);
    }
  }

  _addRake() {
    this.rake = createRake();
    
    const offsetX = -(this.width / 2 + 0.15); 
    const liftY = this.sandTopY + 0.1;
    
    this.rake.position.set(offsetX, liftY, 0);
    this.rake.rotation.set(0, Math.PI - Math.PI / 6, 0); 
    
    this.group.add(this.rake);
  }
}