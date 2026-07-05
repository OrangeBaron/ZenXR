/**
 * ============================================================================
 * GardenBase.js
 * ============================================================================
 * Responsabilità unica (SRP): costruire proceduralmente la base fisica del
 * giardino zen — vasca, zona sabbiosa, recinto di bambù stilizzato e
 * laghetto — e comporla con il bonsai (BonsaiGenerator.js), un primo set di
 * rocce (RockGenerator.js) e il laghetto (PondGenerator.js), tutti disposti
 * in posizione casuale ma sempre coerenti con la nuova topologia a due zone
 * introdotta in Fase 5 (GDD §4): laghetto e bonsai/rocce non si sovrappongono
 * mai, quindi nessun elemento "solido" finisce mai in acqua.
 *
 * Tutti gli elementi sono figli di `this.group`, così l'intero giardino può
 * essere spostato in blocco quando viene posizionato sulla superficie reale
 * (vedi XRInteractionManager.js). Il gruppo nasce nascosto: diventa visibile
 * solo dopo il primo posizionamento.
 *
 * NON gestisce: input, fisica (Fase 6) o hit-testing.
 * ============================================================================
 */
import * as THREE from 'three';
import { createRock, serializeRock, deserializeRock } from './RockGenerator.js';
import { createBonsai, serializeBonsai, deserializeBonsai } from './BonsaiGenerator.js';
import { createPond, serializePond, deserializePond, isInsidePond, POND_SURFACE_LIFT } from './PondGenerator.js';
import { createMatcapTexture } from '../utils/MatcapTextureFactory.js';
import {
  GARDEN_WIDTH,
  GARDEN_DEPTH,
  GARDEN_WALL_THICKNESS,
  GARDEN_TRAY_HEIGHT,
  POND_AREA_RATIO,
} from '../utils/GardenLayout.js';

// Distanza extra (metri) da tenere dalla riva del laghetto quando si scelgono
// punti "asciutti" per bonsai e rocce (Fase 5, GDD §4): evita che gli oggetti
// tocchino visivamente il bordo dell'acqua.
const POND_SHORE_MARGIN = 0.03;

export class GardenBase {
  /**
   * @param {Object} [options]
   * @param {number} [options.width=GARDEN_WIDTH] Larghezza della vasca in metri.
   * @param {number} [options.depth=GARDEN_DEPTH] Profondità della vasca in metri.
   * @param {number} [options.rockCount=8] Numero di rocce da disporre inizialmente (ignorato se `savedState` è presente).
   * @param {Object|null} [options.savedState=null] Stato prodotto da `getState()` e riletto da `SaveSystem` (Fase 3, GDD §2):
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
    this._addPondPebbles();

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
  }

  /**
   * Cattura lo stato corrente di laghetto, rocce e albero (forma, colore,
   * posizione e rotazione) in un oggetto JSON-serializzabile pronto per
   * `SaveSystem` (Fase 3/5, GDD §2).
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
   * Decide la "zona" del laghetto (Fase 5, GDD §4): la vasca viene ancorata
   * a un angolo scelto a caso, così l'acqua tocca davvero il bordo della
   * vasca (due lati del laghetto corrono lungo le due pareti dell'angolo,
   * vedi `PondGenerator.js`) invece di restarne staccata al centro.
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
   * Genera e posiziona i ciottoli lungo il confine irregolare del laghetto.
   * Sfrutta il contorno già calcolato e salvato dal PondGenerator, unendolo a una
   * funzione pseudo-casuale: in questo modo i ciottoli si riposizionano
   * in modo identico al caricamento del salvataggio senza gravare sul SaveSystem.
   */
  _addPondPebbles() {
    const contour = this.pond.userData.contour;
    if (!contour || contour.length < 2) return;

    // Funzione hash per ottenere una "casualità" riproducibile e sempre uguale
    const pseudoRandom = (seed) => {
      const x = Math.sin(seed * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };

    // 1. Geometria e Materiale (piccoli icosaedri low-poly)
    const pebbleGeometry = new THREE.IcosahedronGeometry(0.02, 0);
    const pebbleMaterial = new THREE.MeshMatcapMaterial({
      matcap: createMatcapTexture(0x6e6b66), // Grigio pietra di fiume
      flatShading: true,
    });

    // 2. Calcoliamo la lunghezza totale del perimetro frastagliato
    let totalLength = 0;
    const segmentLengths = [];
    for (let i = 0; i < contour.length - 1; i++) {
      const dist = Math.hypot(contour[i+1].x - contour[i].x, contour[i+1].z - contour[i].z);
      totalLength += dist;
      segmentLengths.push(dist);
    }

    // Vogliamo circa un ciottolo ogni 3 centimetri lungo il bordo
    const pebbleCount = Math.floor(totalLength / 0.03);
    const instancedPebbles = new THREE.InstancedMesh(pebbleGeometry, pebbleMaterial, pebbleCount);
    instancedPebbles.receiveShadow = true;
    instancedPebbles.castShadow = true;

    const dummy = new THREE.Object3D();
    
    // 3. Distribuiamo i ciottoli camminando lungo i segmenti del contorno
    for (let i = 0; i < pebbleCount; i++) {
      // Distanza ideale per questo ciottolo lungo la linea
      const targetDistance = (i / pebbleCount) * totalLength;
      
      // Troviamo il segmento specifico in cui cade la distanza
      let accumulated = 0;
      let segIdx = 0;
      while (segIdx < segmentLengths.length && accumulated + segmentLengths[segIdx] <= targetDistance) {
        accumulated += segmentLengths[segIdx];
        segIdx++;
      }
      if (segIdx >= contour.length - 1) segIdx = contour.length - 2;

      // Calcoliamo l'interpolazione (0.0 -> 1.0) sul segmento trovato
      const t = (targetDistance - accumulated) / segmentLengths[segIdx];
      const ptA = contour[segIdx];
      const ptB = contour[segIdx + 1];

      const baseX = THREE.MathUtils.lerp(ptA.x, ptB.x, t);
      const baseZ = THREE.MathUtils.lerp(ptA.z, ptB.z, t);

      // Aggiungiamo un leggero "disordine" deterministico
      const offsetDist = (pseudoRandom(i) - 0.5) * 0.025; // Sfalsamento radiale
      const randScale = 0.5 + pseudoRandom(i + 100) * 1.0;
      const randRotX = pseudoRandom(i + 200) * Math.PI;
      const randRotY = pseudoRandom(i + 300) * Math.PI;

      // Coordinate globali: il contorno è nello spazio locale del laghetto, 
      // quindi sommiamo this.pond.position
      dummy.position.set(
        this.pond.position.x + baseX + offsetDist,
        this.sandTopY + 0.001, // Appoggiati esattamente sulla sabbia
        this.pond.position.z + baseZ + offsetDist
      );
      
      dummy.rotation.set(randRotX, randRotY, 0);
      dummy.scale.setScalar(randScale);
      
      // Appiattiamo leggermente l'icosaedro per farlo sembrare levigato dall'acqua
      dummy.scale.y *= 0.4;
      
      dummy.updateMatrix();
      instancedPebbles.setMatrixAt(i, dummy.matrix);
    }

    this.group.add(instancedPebbles);
  }

  /**
   * Campiona un punto casuale "asciutto" all'interno della vasca (fuori
   * dall'acqua e, opzionalmente, a debita distanza da un altro punto) per il
   * posizionamento di bonsai e rocce (Fase 5, GDD §4). Poiché il laghetto
   * occupa al più `POND_AREA_RATIO` della vasca, l'area asciutta è sempre
   * ampiamente maggioritaria: pochi tentativi bastano quasi sempre.
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

      rock.position.set(x, this.sandTopY + radius * 0.6, z);
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
   * Ricostruisce le rocce da uno stato salvato (Fase 3, GDD §2), al posto
   * della dispersione casuale di `_scatterRocks`.
   * @param {Object[]} rocksState Array prodotto da `serializeRock` per ogni roccia.
   */
  _restoreRocks(rocksState) {
    for (const rockState of rocksState) {
      const rock = deserializeRock(rockState);
      this.group.add(rock);
      this.rocks.push(rock);
    }
  }
}
