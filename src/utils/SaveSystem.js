/**
 * Responsabilità unica: leggere e scrivere lo stato del giardino su IndexedDB.
 * Utilizza IndexedDB al posto di LocalStorage per supportare salvataggi asincroni
 * (non bloccanti) e il salvataggio nativo di dati binari (Blob) per le texture.
 */
const DB_NAME = 'ZenXRDatabase';
const STORE_NAME = 'GardenState';
const DB_VERSION = 1;
const STATE_KEY = 'v1';

/**
 * Apre (o crea) il database IndexedDB.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Legge lo stato del giardino precedentemente salvato.
 * @returns {Promise<Object|null>} Lo stato salvato, o `null` se assente.
 */
export async function loadGardenState() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(STATE_KEY);
      
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[ZenXR] Errore nel caricamento da IndexedDB:', err);
    return null;
  }
}

/**
 * Salva lo stato del giardino su IndexedDB in modo asincrono.
 * @param {Object} state Stato del giardino prodotto da `GardenBase.getState()`.
 */
export async function saveGardenState(state) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(state, STATE_KEY);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[ZenXR] Impossibile salvare lo stato su IndexedDB:', err);
  }
}

/**
 * Cancella il salvataggio corrente.
 */
export async function clearGardenState() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(STATE_KEY);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[ZenXR] Impossibile cancellare lo stato:', err);
  }
}