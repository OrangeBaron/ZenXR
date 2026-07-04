/**
 * ============================================================================
 * SaveSystem.js
 * ============================================================================
 * Responsabilità unica (SRP): leggere e scrivere lo stato del giardino su
 * `LocalStorage` (Fase 3, GDD §2). Non conosce la struttura interna dello
 * stato (rocce, albero, ...): si limita a serializzare/deserializzare in
 * JSON e a gestire gli errori di I/O (storage pieno, non disponibile,
 * salvataggio corrotto). La costruzione dello stato stesso è responsabilità
 * di `GardenBase.getState()`.
 * ============================================================================
 */
const STORAGE_KEY = 'zenxr:garden-state:v1';

/**
 * @returns {Object|null} Lo stato salvato, o `null` se assente o corrotto.
 */
export function loadGardenState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[ZenXR] Salvataggio del giardino corrotto, verrà ignorato:', err);
    return null;
  }
}

/**
 * @param {Object} state Stato del giardino prodotto da `GardenBase.getState()`.
 */
export function saveGardenState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('[ZenXR] Impossibile salvare lo stato del giardino:', err);
  }
}

/**
 * Cancella il salvataggio corrente (funzione "Reset" del GDD §2). Al
 * prossimo avvio il giardino verrà rigenerato proceduralmente da zero.
 */
export function clearGardenState() {
  localStorage.removeItem(STORAGE_KEY);
}
