/**
 * Responsabilità unica (SRP): liberare in modo ricorsivo la memoria (VRAM) 
 * occupata da geometrie e materiali di un intero albero di oggetti Three.js.
 * Nota: le texture condivise (singleton) non vengono distrutte qui per 
 * poter essere riutilizzate dal sistema.
 */
export function disposeGraph(object) {
  if (!object) return;

  object.traverse((child) => {
    if (child.isMesh) {
      // 1. Libera la memoria della Geometria
      if (child.geometry) {
        child.geometry.dispose();
      }

      // 2. Libera la memoria dei Materiali
      if (child.material) {
        // Gestiamo sia il caso di un materiale singolo che di un array di materiali
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        
        materials.forEach(mat => {
          mat.dispose();
          // Niente mat.map.dispose() o simili: le texture di ZenXR sono condivise!
        });
      }
    }
  });
}