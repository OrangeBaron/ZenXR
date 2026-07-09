/**
 * Responsabilità unica (SRP): canale di eventi centrale per segnalare che lo
 * stato del giardino è cambiato e potrebbe richiedere persistenza.
 *
 * Non conosce la natura del cambiamento, non dipende da THREE.js e non
 * gestisce la lettura/scrittura su LocalStorage: quello è compito di
 * `GardenBase.getState()` (costruzione dello stato) e
 * `/src/utils/SaveSystem.js` (I/O). Si limita a distribuire un evento
 * `change` a chiunque sia in ascolto.
 *
 * I sistemi di interazione (spostamento rocce, potatura del bonsai,
 * hand-tracking, ...) chiamano `notifyChange()` ogni volta che modificano un
 * oggetto del giardino; `main.js` ascolta questi eventi e decide quando/come
 * salvare (tipicamente con un debounce).
 */
export class StateManager extends EventTarget {
  /**
   * Segnala che lo stato del giardino è cambiato ed è potenzialmente da
   * salvare. Va chiamato dai sistemi che modificano oggetti del giardino
   * (es. spostamento rocce, potatura bonsai), non da chi salva.
   *
   * @param {Object} [detail] Informazioni opzionali sul cambiamento (es. tipo
   *   di interazione), utili a chi ascolta per decidere come reagire.
   */
  notifyChange(detail = {}) {
    this.dispatchEvent(new CustomEvent('change', { detail }));
  }

  /**
   * Registra un listener per gli eventi di cambiamento.
   *
   * @param {(event: CustomEvent) => void} callback
   */
  onChange(callback) {
    this.addEventListener('change', callback);
  }
}
