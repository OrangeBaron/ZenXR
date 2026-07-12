/**
 * Genera proceduralmente una singola roccia low-poly deformando i vertici
 * di un IcosahedronGeometry con rumore casuale, ed espone la sua
 * serializzazione/deserializzazione per la persistenza dello stato. Nessuna
 * geometria o materiale viene caricata da file esterni.
 */
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { createMatcapTexture } from '../utils/MatcapTextureFactory.js';
import { serializeGeometryPositions, geometryFromPositions } from '../utils/GeometrySerializer.js';

/**
 * Genera proceduralmente una texture per simulare le venature e la grana dei ciottoli.
 */
function createRockNoiseTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Colore di base neutro chiaro
  ctx.fillStyle = '#d4d4d4';
  ctx.fillRect(0, 0, size, size);

  // Sfumature / Venature morbide (Ora più scure e marcate)
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
    ctx.strokeStyle = 'rgba(50, 50, 50, 0.4)'; // Aumentata l'opacità
    ctx.stroke();
  }
  ctx.filter = 'none';

  // Granulosità (Ora con contrasto maggiore)
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

export function createRock({
  radius = 0.05,
  detail = 1,
  noiseStrength = 0.5,
  color = 0x8d8d86,
} = {}) {
  const geometry = new THREE.IcosahedronGeometry(radius, detail);
  const position = geometry.attributes.position;
  const vertex = new THREE.Vector3();

  const displacementByKey = new Map();
  const keyOf = (x, y, z) => `${x.toFixed(4)}|${y.toFixed(4)}|${z.toFixed(4)}`;
  const maxOffset = radius * noiseStrength;

  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);
    const key = keyOf(vertex.x, vertex.y, vertex.z);

    let offset = displacementByKey.get(key);
    if (!offset) {
      offset = new THREE.Vector3(
        (Math.random() - 0.5) * maxOffset,
        (Math.random() - 0.5) * maxOffset,
        (Math.random() - 0.5) * maxOffset
      );
      displacementByKey.set(key, offset);
    }

    vertex.add(offset);
    position.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  geometry.scale(
    0.8 + Math.random() * 0.5,
    0.6 + Math.random() * 0.4,
    0.8 + Math.random() * 0.5
  );

  geometry.computeVertexNormals();

  const material = new THREE.MeshMatcapMaterial({
    matcap: createMatcapTexture(color),
    map: rockBaseTexture,
    bumpMap: rockBaseTexture,
    bumpScale: 0.008, // Aumentato il rilievo
    flatShading: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.userData.color = color;

  const mossCount = Math.floor(radius * 800);

  if (mossCount > 0) {
    const mossGeometry = new THREE.IcosahedronGeometry(0.004, 0);
    const mossMaterial = new THREE.MeshMatcapMaterial({
      matcap: createMatcapTexture(0x4a5d23),
      flatShading: true,
    });

    const instancedMoss = new THREE.InstancedMesh(mossGeometry, mossMaterial, mossCount);
    instancedMoss.receiveShadow = true;
    instancedMoss.castShadow = true;

    const sampler = new MeshSurfaceSampler(mesh).build();
    const position = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const dummy = new THREE.Object3D();

    for (let i = 0; i < mossCount; i++) {
      sampler.sample(position, normal);
      dummy.position.copy(position);
      dummy.lookAt(position.clone().add(normal));
      dummy.rotateZ(Math.random() * Math.PI);
      dummy.scale.setScalar(0.4 + Math.random() * 0.8);
      dummy.updateMatrix();
      instancedMoss.setMatrixAt(i, dummy.matrix);
    }
    mesh.add(instancedMoss);
  }

  return mesh;
}

export function serializeRock(rock) {
  // Estraiamo la geometria in versione non indicizzata per prendere le UV
  const flat = rock.geometry.index ? rock.geometry.toNonIndexed() : rock.geometry;
  
  const data = {
    positions: serializeGeometryPositions(rock.geometry),
    uvs: Array.from(flat.attributes.uv.array), // SALVIAMO LE UV
    color: rock.userData.color,
    position: rock.position.toArray(),
    rotation: rock.rotation.toArray().slice(0, 3),
  };

  const moss = rock.children.find((child) => child.isInstancedMesh);
  if (moss) {
    data.mossCount = moss.count;
    data.mossMatrix = Array.from(moss.instanceMatrix.array);
  }

  return data;
}

export function deserializeRock(data) {
  const geometry = geometryFromPositions(data.positions);
  
  // RIPRISTINIAMO LE UV
  if (data.uvs) {
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
  } else {
    // Fallback di base per i vecchi salvataggi: spalma la texture dall'alto
    const uvs = [];
    for(let i=0; i<data.positions.length; i+=3) {
      uvs.push(data.positions[i] * 15, data.positions[i+2] * 15);
    }
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  }

  const material = new THREE.MeshMatcapMaterial({
    matcap: createMatcapTexture(data.color),
    map: rockBaseTexture,
    bumpMap: rockBaseTexture,
    bumpScale: 0.008,
    flatShading: true,
  });
  
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.fromArray(data.position);
  mesh.rotation.set(data.rotation[0], data.rotation[1], data.rotation[2]);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.userData.color = data.color;

  if (data.mossCount && data.mossMatrix) {
    const mossGeometry = new THREE.IcosahedronGeometry(0.004, 0);
    const mossMaterial = new THREE.MeshMatcapMaterial({
      matcap: createMatcapTexture(0x4a5d23),
      flatShading: true,
    });

    const instancedMoss = new THREE.InstancedMesh(mossGeometry, mossMaterial, data.mossCount);
    instancedMoss.instanceMatrix.array.set(data.mossMatrix);
    instancedMoss.instanceMatrix.needsUpdate = true;
    instancedMoss.receiveShadow = true;
    instancedMoss.castShadow = true;
    mesh.add(instancedMoss);
  }

  return mesh;
}