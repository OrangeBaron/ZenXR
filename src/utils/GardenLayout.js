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

/**
 * Quota di superficie della vasca destinata al laghetto (Fase 5, GDD §4):
 * circa un terzo al laghetto, i restanti due terzi alla zona sabbiosa.
 * Usata da `GardenBase._createPondLayout()` per dimensionare la "zona" del
 * laghetto prima di generarne la forma organica (vedi `PondGenerator.js`).
 */
export const POND_AREA_RATIO = 1 / 3;
