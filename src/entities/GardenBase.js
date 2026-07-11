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
   *   se presente, rocce e albero vengono ripristinati esattamente invece di essere rigenerati casualmente.
   */
  constructor({ width = GARDEN_WIDTH, depth = GARDEN_DEPTH, rockCount = 8, savedState = null } = {}) {
    this.width = width;
    this.depth = depth;
    this.rocks = [];

    this.group = new THREE.Group();
    this.group.visible = false;

    this._buildTray();
    this._buildSand();
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

  _buildSand() {
    const sandHeight = 0.015;
    const sandMaterial = new THREE.MeshMatcapMaterial({
      matcap: createMatcapTexture(0xd9c9a3),
      flatShading: true,
    });

    const sandGeometry = new THREE.BoxGeometry(this.width, sandHeight, this.depth);
    this.sand = new THREE.Mesh(sandGeometry, sandMaterial);
    this.sand.position.y = this.sandTopY + sandHeight / 2;
    this.sand.receiveShadow = true;
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

    // Numero di pali derivato dalla larghezza per mantenere una densità
    // costante anche se GARDEN_WIDTH cambia in futuro.
    const desiredSpacing = 0.08;
    const poleCount = Math.max(3, Math.round(this.width / desiredSpacing) + 1);
    const spacing = this.width / (poleCount - 1);

    // Recinto stilizzato sul lato posteriore della vasca (+Z: lato opposto
    // a quello rivolto verso l'utente al momento del posizionamento).
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

  /**
   * Decide la "zona" del laghetto: la vasca viene ancorata a un angolo
   * scelto a caso, così l'acqua tocca davvero il bordo della vasca (due lati
   * del laghetto corrono lungo le due pareti dell'angolo, vedi
   * `PondGenerator.js`) invece di restarne staccata al centro.
   *
   * Il laghetto è geometricamente un quarto di ellisse (raggi `radiusX`,
   * `radiusZ`, angolo=vertice sull'angolo della vasca) con bordo interno
   * irregolare: la sua area è `π · radiusX · radiusZ / 4`. Dimensioniamo i
   * raggi proporzionalmente a larghezza/profondità (stesso fattore `k` per
   * entrambi, per non deformare le proporzioni) così che quest'area risulti
   * circa `POND_AREA_RATIO` della superficie totale della vasca:
   *   π·(k·width)·(k·depth)/4 = POND_AREA_RATIO·width·depth
   *   ⇒ k = √(4·POND_AREA_RATIO / π)
   * @returns {THREE.Mesh}
   */
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

  /**
   * Campiona un punto casuale "asciutto" all'interno della vasca (fuori
   * dall'acqua e, opzionalmente, a debita distanza da un altro punto) per il
   * posizionamento di bonsai e rocce. Poiché il laghetto occupa al più
   * `POND_AREA_RATIO` della vasca, l'area asciutta è sempre ampiamente
   * maggioritaria: pochi tentativi bastano quasi sempre.
   *
   * @param {Object} [options]
   * @param {number} [options.wallMargin=0.05] Distanza minima dai bordi interni della vasca.
   * @param {{x:number, z:number}|null} [options.avoidPoint=null] Punto da evitare (es. il bonsai).
   * @param {number} [options.avoidRadius=0] Raggio di esclusione attorno ad `avoidPoint`.
   * @returns {{x:number, z:number}}
   */
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
    // Caso limite non previsto dalla geometria (laghetto entro la propria
    // zona di ~1/3): restituiamo l'ultimo tentativo invece di bloccare la
    // generazione del giardino.
    return point;
  }

  _addBonsai() {
    // Chioma ampia: più margine dai bordi rispetto alle rocce.
    this.bonsaiPosition = this._randomDryPoint({ wallMargin: 0.1 });
    this.bonsai = createBonsai();
    this.bonsai.position.set(this.bonsaiPosition.x, this.sandTopY, this.bonsaiPosition.z);
    this.group.add(this.bonsai);
  }

  _scatterRocks(count) {
    const margin = 0.05;
    const centerExclusionRadius = 0.16; // evita di sovrapporre il bonsai (ora in posizione variabile)

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

  /**
   * Ricostruisce le rocce da uno stato salvato, al posto della dispersione
   * casuale di `_scatterRocks`.
   * @param {Object[]} rocksState Array prodotto da `serializeRock` per ogni roccia.
   */
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
