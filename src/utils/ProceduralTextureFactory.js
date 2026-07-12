/**
 * Responsabilità unica: generare proceduralmente le texture 2D (diffuse/bump)
 * su canvas per i vari elementi del giardino, evitando il caricamento di
 * asset esterni.
 * Le texture vengono istanziate una sola volta (pattern singleton) al
 * caricamento del modulo, così tutti gli oggetti condividono la stessa
 * memoria sulla GPU.
 */
import * as THREE from 'three';

// ============================================================================
// SABBIA
// ============================================================================
function createSandNoiseTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#d9c9a3';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 100000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const isDark = Math.random() > 0.5;
    ctx.fillStyle = isDark ? 'rgba(180, 160, 120, 0.4)' : 'rgba(240, 230, 200, 0.5)';
    ctx.fillRect(x, y, 1, 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4); 
  texture.anisotropy = 4; 
  return texture;
}
export const sandBaseTexture = createSandNoiseTexture();

// ============================================================================
// ROCCE
// ============================================================================
function createRockNoiseTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#d4d4d4';
  ctx.fillRect(0, 0, size, size);

  ctx.filter = 'blur(10px)';
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * size, -50);
    ctx.bezierCurveTo(
      Math.random() * size, size * 0.3,
      Math.random() * size, size * 0.6,
      Math.random() * size, size + 50
    );
    ctx.lineWidth = 20 + Math.random() * 30;
    ctx.strokeStyle = 'rgba(50, 50, 50, 0.4)'; 
    ctx.stroke();
  }
  ctx.filter = 'none';

  for (let i = 0; i < 150000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const isDark = Math.random() > 0.5;
    ctx.fillStyle = isDark ? 'rgba(30, 30, 30, 0.4)' : 'rgba(255, 255, 255, 0.6)';
    ctx.fillRect(x, y, 1, 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2); 
  texture.anisotropy = 4;
  return texture;
}
export const rockBaseTexture = createRockNoiseTexture();

// ============================================================================
// CORTECCIA BONSAI
// ============================================================================
function createBarkNoiseTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#b8a08c';
  ctx.fillRect(0, 0, size, size);

  ctx.filter = 'blur(4px)';
  for (let i = 0; i < 40; i++) {
    ctx.beginPath();
    const xOffset = Math.random() * size;
    ctx.moveTo(xOffset, -50);
    ctx.bezierCurveTo(
      xOffset + (Math.random() - 0.5) * 40, size * 0.33,
      xOffset + (Math.random() - 0.5) * 40, size * 0.66,
      xOffset + (Math.random() - 0.5) * 40, size + 50
    );
    ctx.lineWidth = 4 + Math.random() * 8;
    ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(60, 40, 20, 0.4)' : 'rgba(100, 70, 50, 0.3)';
    ctx.stroke();
  }
  
  ctx.filter = 'blur(1px)';
  for (let i = 0; i < 20; i++) {
    ctx.beginPath();
    const xOffset = Math.random() * size;
    ctx.moveTo(xOffset, -50);
    ctx.lineTo(xOffset + (Math.random() - 0.5) * 20, size + 50);
    ctx.lineWidth = 1 + Math.random() * 3;
    ctx.strokeStyle = 'rgba(30, 15, 5, 0.6)';
    ctx.stroke();
  }
  ctx.filter = 'none';

  for (let i = 0; i < 150000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const isDark = Math.random() > 0.5;
    ctx.fillStyle = isDark ? 'rgba(40, 25, 15, 0.3)' : 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(x, y, 1, Math.random() * 4 + 1); 
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 4); 
  texture.anisotropy = 4;
  return texture;
}
export const barkBaseTexture = createBarkNoiseTexture();

// ============================================================================
// FOGLIE BONSAI
// ============================================================================
function createLeafTexture() {
  const size = 256; // Risoluzione leggermente più alta per le venature
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Colore base
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Rete di venature morbide (invece di una riga singola che l'Icosaedro deforma)
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
  
  for(let i = 0; i < 15; i++) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * size, 0);
    ctx.bezierCurveTo(
      Math.random() * size, size * 0.33,
      Math.random() * size, size * 0.66,
      Math.random() * size, size
    );
    ctx.stroke();
  }

  // Puntinatura un po' più marcata per simulare la porosità della foglia
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const isDark = Math.random() > 0.5;
    ctx.fillStyle = isDark ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(x, y, 2, 2); // Pixel un po' più grandi
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // Ripetiamo la texture in modo che appaia fitta anche sui triangoli deformati
  texture.repeat.set(2, 2);
  return texture;
}
export const leafBaseTexture = createLeafTexture();

// ============================================================================
// PIATTO DEL GONG
// ============================================================================
function createGongTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const center = size / 2;

  // 1. Colore di base (Bronzo medio per l'anello spazzolato)
  ctx.fillStyle = '#b58d4b';
  ctx.fillRect(0, 0, size, size);

  // 2. Spazzolatura radiale (micro-graffi circolari per simulare il tornio)
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3000; i++) {
    const radius = Math.random() * (size / 2);
    const startAngle = Math.random() * Math.PI * 2;
    // Archi corti per dare l'idea del graffio
    const arcLength = 0.1 + Math.random() * 0.4; 
    
    ctx.beginPath();
    ctx.arc(center, center, radius, startAngle, startAngle + arcLength);
    // Alterniamo graffi leggermente più chiari e più scuri per dare volume
    ctx.strokeStyle = Math.random() > 0.5 
      ? 'rgba(255, 230, 180, 0.08)' 
      : 'rgba(90, 60, 20, 0.12)';
    ctx.stroke();
  }

  // 3. Bullseye centrale (Bronzo scuro/ossidato)
  ctx.beginPath();
  ctx.arc(center, center, size * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = '#5c401e';
  ctx.fill();

  // 4. Anello esterno (Bronzo scuro/ossidato)
  ctx.beginPath();
  // Raggio leggermente minore della metà per non sbordare
  ctx.arc(center, center, size * 0.46, 0, Math.PI * 2);
  ctx.lineWidth = size * 0.08; // Spessore del bordo
  ctx.strokeStyle = '#4a3316';
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}
export const gongBaseTexture = createGongTexture();