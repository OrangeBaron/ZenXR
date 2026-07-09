/**
 * Responsabilità unica: leggere e scrivere lo stato del giardino su
 * `LocalStorage`. Non conosce la struttura interna dello stato (rocce,
 * albero, ...): si limita a serializzare/deserializzare in JSON e a gestire
 * gli errori di I/O (storage pieno, non disponibile, salvataggio corrotto).
 * La costruzione dello stato stesso è responsabilità di
 * `GardenBase.getState()`.
 */
const STORAGE_KEY = 'zenxr:garden-state:v1';

/**
 * Legge lo stato del giardino precedentemente salvato su LocalStorage.
 *
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
 * Salva lo stato del giardino su LocalStorage.
 * NOTA: il limite di LocalStorage è tipicamente di 5MB. Le geometrie
 * procedurali serializzate (Float32Array convertiti) occupano attualmente
 * pochi KB; in caso di crescita significativa dei dati andrà valutato il
 * passaggio a IndexedDB.
 *
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
 * Cancella il salvataggio corrente. Al prossimo avvio il giardino verrà
 * rigenerato proceduralmente da zero.
 */
export function clearGardenState() {
  localStorage.removeItem(STORAGE_KEY);
}
