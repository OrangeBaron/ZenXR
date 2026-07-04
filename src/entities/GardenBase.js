/**
 * ============================================================================
 * GardenBase.js
 * ============================================================================
 * Responsabilità unica (SRP): costruire proceduralmente la base fisica del
 * giardino zen — vasca, zona sabbiosa e recinto di bambù stilizzato — e
 * comporla con il bonsai centrale (BonsaiGenerator.js) e un primo set di
 * rocce (RockGenerator.js) disposte in posizione casuale sulla sabbia
 * (GDD §4, §6, Fase 5).
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
import { createRock } from './RockGenerator.js';
import { createBonsai } from './BonsaiGenerator.js';
import { createMatcapTexture } from '../utils/MatcapTextureFactory.js';
import {
  GARDEN_WIDTH,
  GARDEN_DEPTH,
  GARDEN_WALL_THICKNESS,
  GARDEN_TRAY_HEIGHT,
} from '../utils/GardenLayout.js';

export class GardenBase {
  /**
   * @param {Object} [options]
   * @param {number} [options.width=GARDEN_WIDTH] Larghezza della vasca in metri.
   * @param {number} [options.depth=GARDEN_DEPTH] Profondità della vasca in metri.
   * @param {number} [options.rockCount=8] Numero di rocce da disporre inizialmente.
   */
  constructor({ width = GARDEN_WIDTH, depth = GARDEN_DEPTH, rockCount = 8 } = {}) {
    this.width = width;
    this.depth = depth;
    this.rocks = [];

    this.group = new THREE.Group();
    this.group.visible = false;

    this._buildTray();
    this._buildSand();
    this._buildBambooFence();
    this._addBonsai();
    this._scatterRocks(rockCount);
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

  _addBonsai() {
    this.bonsai = createBonsai();
    this.bonsai.position.set(0, this.sandTopY, 0);
    this.group.add(this.bonsai);
  }

  _scatterRocks(count) {
    const margin = 0.05;
    const centerExclusionRadius = 0.22; // evita di sovrapporre il bonsai centrale (ora più grande)
    const maxAttempts = count * 20;

    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < maxAttempts) {
      attempts++;

      const x = (Math.random() - 0.5) * (this.width - margin * 2);
      const z = (Math.random() - 0.5) * (this.depth - margin * 2);
      if (Math.hypot(x, z) < centerExclusionRadius) continue;

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
      placed++;
    }
  }
}
