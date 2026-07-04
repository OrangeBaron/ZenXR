/**
 * ============================================================================
 * GardenLayout.js
 * ============================================================================
 * Costanti geometriche condivise della vasca del giardino. Centralizzate qui
 * per evitare duplicazioni tra GardenBase.js (che costruisce la vasca reale)
 * e PlacementPreview.js (che ne mostra un'anteprima semitrasparente delle
 * stesse dimensioni durante l'hit-test), garantendo che restino sempre
 * sincronizzate.
 * ============================================================================
 */
export const GARDEN_WIDTH = 1.0;
export const GARDEN_DEPTH = 0.7;
export const GARDEN_WALL_THICKNESS = 0.02;
export const GARDEN_TRAY_HEIGHT = 0.04;
