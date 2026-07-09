/**
 * Responsabilità unica: convertire una BufferGeometry generata
 * proceduralmente (rocce, rami, foglie) in un array di posizioni "piatto"
 * (Array JSON-serializzabile) e viceversa, per la persistenza su LocalStorage.
 *
 * Le rocce e le foglie usano geometrie NON indicizzate (IcosahedronGeometry),
 * mentre i segmenti dei rami usano CylinderGeometry, che invece È indicizzata.
 * Per avere un formato di salvataggio unico e semplice, convertiamo sempre in
 * "triangle soup" non indicizzata prima di estrarre le posizioni: le normali
 * vengono ricalcolate al volo in fase di ripristino e, poiché tutti i
 * materiali del giardino usano `flatShading: true`, la resa visiva finale non
 * dipende dalla condivisione dei vertici tra facce adiacenti.
 */
import * as THREE from 'three';

/**
 * Serializza le posizioni dei vertici di una geometria in un array piatto
 * pronto per essere salvato come JSON.
 *
 * @param {THREE.BufferGeometry} geometry Geometria da serializzare.
 * @returns {number[]} Posizioni dei vertici in triangle-soup (x,y,z per ogni vertice).
 */
export function serializeGeometryPositions(geometry) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  return Array.from(flat.attributes.position.array);
}

/**
 * Ricostruisce una geometria renderizzabile a partire da un array di
 * posizioni prodotto da `serializeGeometryPositions`, usata per ripristinare
 * gli oggetti procedurali del giardino da un salvataggio.
 *
 * @param {number[]} positions Array piatto (x,y,z per ogni vertice) da serializeGeometryPositions.
 * @returns {THREE.BufferGeometry} Geometria non indicizzata pronta per il rendering flat-shaded.
 */
export function geometryFromPositions(positions) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
