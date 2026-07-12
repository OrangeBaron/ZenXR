import * as THREE from 'three';
import { GARDEN_WIDTH, GARDEN_DEPTH } from '../utils/GardenLayout.js';

export class SandSurfaceManager {
  constructor(renderer, resolution = 1024) {
    this.renderer = renderer;
    this.resolution = resolution;
    this.baseColor = new THREE.Color(0xffffff);

    const options = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
    };
    
    this.targetA = new THREE.WebGLRenderTarget(resolution, resolution, options);
    this.targetB = new THREE.WebGLRenderTarget(resolution, resolution, options);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(
      -GARDEN_WIDTH / 2, GARDEN_WIDTH / 2,
      GARDEN_DEPTH / 2, -GARDEN_DEPTH / 2,
      0, 10
    );
    this.camera.position.z = 5;

    this._setupBackground();
    this._setupBrush();
    this.clear();
  }

  _setupBackground() {
    const bgGeometry = new THREE.PlaneGeometry(GARDEN_WIDTH, GARDEN_DEPTH);
    this.bgMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: this.targetA.texture,
      depthTest: false,
      depthWrite: false
    });
    this.bgMesh = new THREE.Mesh(bgGeometry, this.bgMaterial);
    this.bgMesh.position.z = -1;
    this.scene.add(this.bgMesh);
  }

  _setupBrush() {
    // La texture ora è un gradiente lineare verticale (1D)
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = 1; // La larghezza non serve più
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Gradiente lungo l'asse Y del rettangolo
    const gradient = ctx.createLinearGradient(0, 0, 0, size);
    
    gradient.addColorStop(0.0, 'rgba(255, 255, 255, 0.0)');
    gradient.addColorStop(0.25, 'rgba(255, 255, 255, 1.0)');
    gradient.addColorStop(0.5, 'rgba(0, 0, 0, 1.0)');
    gradient.addColorStop(0.75, 'rgba(255, 255, 255, 1.0)');
    gradient.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1, size);

    const brushTexture = new THREE.CanvasTexture(canvas);
    
    this.brushMaterial = new THREE.MeshBasicMaterial({
      map: brushTexture,
      transparent: true,
      blending: THREE.NormalBlending, // Sovrascrive i pixel sottostanti
      depthTest: false,
      depthWrite: false
    });

    // Creiamo un piano 1x1 base. Lo allungheremo dinamicamente per ogni segmento
    const brushGeometry = new THREE.PlaneGeometry(1, 1); 
    this.brush = new THREE.Mesh(brushGeometry, this.brushMaterial);
    this.brush.visible = false;
    this.scene.add(this.brush);
  }

  getTexture() {
    return this.targetA.texture;
  }

  clear() {
    const currentRenderTarget = this.renderer.getRenderTarget();
    const oldClearColor = new THREE.Color();
    const oldClearAlpha = this.renderer.getClearAlpha();
    this.renderer.getClearColor(oldClearColor);

    const xrEnabled = this.renderer.xr.enabled;
    this.renderer.xr.enabled = false;

    this.renderer.setClearColor(this.baseColor, 1.0);
    
    this.renderer.setRenderTarget(this.targetA);
    this.renderer.clear();
    this.renderer.setRenderTarget(this.targetB);
    this.renderer.clear();

    this.renderer.setRenderTarget(currentRenderTarget);
    this.renderer.setClearColor(oldClearColor, oldClearAlpha);

    this.renderer.xr.enabled = xrEnabled;
  }

  drawStrokes(segments) {
    if (!segments || segments.length === 0) return;

    const currentRenderTarget = this.renderer.getRenderTarget();
    const oldClearColor = new THREE.Color();
    const oldClearAlpha = this.renderer.getClearAlpha();
    this.renderer.getClearColor(oldClearColor);

    const xrEnabled = this.renderer.xr.enabled;
    this.renderer.xr.enabled = false;

    this.bgMaterial.map = this.targetA.texture;

    this.renderer.setRenderTarget(this.targetB);
    this.renderer.setClearColor(this.baseColor, 1.0);
    
    this.renderer.autoClear = false; 
    this.renderer.clear(); 
    
    // Disegna lo sfondo
    this.bgMesh.visible = true;
    this.brush.visible = false;
    this.renderer.render(this.scene, this.camera);
    
    // Disegna i nastri (Ribbon)
    this.bgMesh.visible = false;
    this.brush.visible = true;
    
    for (const seg of segments) {
      // 1. Calcola il vettore di spostamento nella scena FBO
      const dx = seg.end.x - seg.start.x;
      const dy = -(seg.end.z - seg.start.z); // Z in Three.js è invertito rispetto a Y
      
      const distance = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx); // Angolo del tracciato
      
      // 2. Trova il centro esatto tra il punto di partenza e arrivo
      const midX = seg.start.x + dx / 2;
      const midY = -seg.start.z + dy / 2;

      this.brush.position.set(midX, midY, 0);
      
      // 3. Ruota il rettangolo nella direzione del movimento
      this.brush.rotation.z = angle;
      
      // 4. Scala il rettangolo: Lungo come la distanza (+ margine)
      // e Largo abbastanza da chiudere i buchi tra i denti (~ 3.5 centimetri)
      this.brush.scale.set(distance + 0.001, 0.04, 1);
      
      this.brush.updateMatrixWorld(true);
      this.renderer.render(this.scene, this.camera);
    }

    this.renderer.autoClear = true;
    
    this.renderer.setRenderTarget(currentRenderTarget);
    this.renderer.setClearColor(oldClearColor, oldClearAlpha);
    this.renderer.xr.enabled = xrEnabled;

    const temp = this.targetA;
    this.targetA = this.targetB;
    this.targetB = temp;
  }

  /**
   * Legge i pixel della texture dalla GPU, li converte e restituisce
   * un Blob (PNG) tramite Promise, evitando di bloccare il thread principale.
   * @returns {Promise<Blob>} L'immagine della mappa in formato Blob binario.
   */
  exportBlob() {
    return new Promise((resolve) => {
      const width = this.resolution;
      const height = this.resolution;
      
      // 1. Prepariamo un buffer per ricevere i dati dalla scheda video
      const buffer = new Uint8Array(width * height * 4);
      this.renderer.readRenderTargetPixels(this.targetA, 0, 0, width, height, buffer);

      // 2. Spostiamo i pixel su un canvas per poterli esportare
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      const imgData = ctx.createImageData(width, height);

      // ATTENZIONE: WebGL legge i pixel dal basso verso l'alto, Canvas dall'alto verso il basso.
      for (let y = 0; y < height; y++) {
        const webglY = height - y - 1;
        const webglIndex = webglY * width * 4;
        const canvasIndex = y * width * 4;
        imgData.data.set(buffer.subarray(webglIndex, webglIndex + width * 4), canvasIndex);
      }
      
      ctx.putImageData(imgData, 0, 0);

      // 3. Esportazione asincrona in Blob (molto più leggera di toDataURL)
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/png');
    });
  }

  /**
   * Riceve un Blob salvato da IndexedDB e lo ri-stampa sull'FBO.
   * @param {Blob} blobData Il Blob binario dell'immagine.
   */
  restoreFromBlob(blobData) {
    if (!blobData) return;

    const img = new Image();
    // Creiamo un URL temporaneo per il file binario
    const objectUrl = URL.createObjectURL(blobData);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = this.resolution;
      canvas.height = this.resolution;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;

      // Disabilitiamo temporaneamente il WebXR come facciamo durante il disegno
      const xrEnabled = this.renderer.xr.enabled;
      this.renderer.xr.enabled = false;

      // Sostituiamo temporaneamente lo sfondo con la nostra texture caricata
      this.bgMaterial.map = texture;

      const currentRenderTarget = this.renderer.getRenderTarget();

      // Disegniamo la texture caricata sia sul targetA che sul targetB (per allinearli)
      this.renderer.setRenderTarget(this.targetA);
      this.renderer.clear();
      this.bgMesh.visible = true;
      this.brush.visible = false;
      this.renderer.render(this.scene, this.camera);

      this.renderer.setRenderTarget(this.targetB);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);

      // Ripristiniamo lo stato
      this.renderer.setRenderTarget(currentRenderTarget);
      this.renderer.xr.enabled = xrEnabled;
      
      this.bgMaterial.map = this.targetA.texture;
      texture.dispose();
      
      // Pulizia della memoria: eliminiamo l'URL temporaneo
      URL.revokeObjectURL(objectUrl);
    };
    
    img.src = objectUrl;
  }
}