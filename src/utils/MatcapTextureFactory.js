/**
 * ============================================================================
 * MatcapTextureFactory.js
 * ============================================================================
 * Responsabilità unica (SRP): generare proceduralmente texture "matcap"
 * (Material Capture) opache e vellutate a partire da un colore base, senza
 * caricare alcun file esterno — coerente col vincolo "zero asset esterni /
 * zero tempi di caricamento" del GDD (§6). Disegniamo un gradiente radiale
 * su un canvas offscreen che simula l'occlusione ambientale di una sfera
 * illuminata dall'alto: economico e sufficiente per lo stile low-poly.
 * ============================================================================
 */
import * as THREE from 'three';

/**
 * @param {number} baseColorHex Colore base in esadecimale (es. 0x8d8d86).
 * @param {number} [size=128] Lato in pixel della texture quadrata generata.
 * @returns {THREE.CanvasTexture}
 */
export function createMatcapTexture(baseColorHex, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const base = new THREE.Color(baseColorHex);
  const highlight = base.clone().lerp(new THREE.Color(0xffffff), 0.55);
  const shadow = base.clone().lerp(new THREE.Color(0x000000), 0.45);

  ctx.fillStyle = `#${shadow.getHexString()}`;
  ctx.fillRect(0, 0, size, size);

  const gradient = ctx.createRadialGradient(
    size * 0.35, size * 0.32, size * 0.02,
    size * 0.5, size * 0.5, size * 0.62
  );
  gradient.addColorStop(0, `#${highlight.getHexString()}`);
  gradient.addColorStop(0.5, `#${base.getHexString()}`);
  gradient.addColorStop(1, `#${shadow.getHexString()}`);

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
