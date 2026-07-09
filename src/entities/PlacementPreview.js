/**
 * Rappresenta visivamente, tramite un box semitrasparente delle stesse
 * dimensioni della vasca (vedi GardenLayout.js), dove e come verrà
 * posizionato il giardino sulla superficie reale rilevata dall'hit-test:
 * un'anteprima più leggibile del reale ingombro rispetto a un semplice
 * reticolo puntiforme.
 *
 * Non gestisce la logica di hit-test WebXR (XRManager.js) né il
 * posizionamento definitivo del gruppo giardino (XRInteractionManager.js).
 */
import * as THREE from 'three';
import {
  GARDEN_WIDTH,
  GARDEN_DEPTH,
  GARDEN_WALL_THICKNESS,
  GARDEN_TRAY_HEIGHT,
} from '../utils/GardenLayout.js';

/**
 * Anteprima 3D del punto di posizionamento del giardino, guidata dai
 * risultati dell'hit-test WebXR.
 */
export class PlacementPreview {
  constructor() {
    const width = GARDEN_WIDTH + GARDEN_WALL_THICKNESS * 2;
    const depth = GARDEN_DEPTH + GARDEN_WALL_THICKNESS * 2;
    const height = GARDEN_TRAY_HEIGHT;

    // Il box nasce centrato nell'origine: lo trasliamo così che la sua base
    // combaci col piano y=0, esattamente come farà la vasca reale una volta
    // posata (la posa dell'hit-test rappresenta il punto sulla superficie).
    const geometry = new THREE.BoxGeometry(width, height, depth);
    geometry.translate(0, height / 2, 0);

    const material = new THREE.MeshBasicMaterial({
      color: 0x9fd8b8,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.matrixAutoUpdate = false;
    this.mesh.visible = false;

    this.enabled = true;
  }

  /**
   * Abilita/disabilita l'anteprima. Da disattivare dopo che il giardino è
   * stato posizionato, così l'hit-test continuo non la rende più visibile.
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.mesh.visible = false;
  }

  /**
   * Aggiorna la posa dell'anteprima in base al risultato dell'hit-test corrente.
   * Nessun effetto se l'anteprima è stata disabilitata (vedi setEnabled).
   * @param {XRPose|null} pose Posa restituita da XRManager.getHitPose(frame).
   */
  update(pose) {
    if (!this.enabled) return;

    if (pose) {
      this.mesh.visible = true;
      this.mesh.matrix.fromArray(pose.transform.matrix);
    } else {
      this.mesh.visible = false;
    }
  }
}
