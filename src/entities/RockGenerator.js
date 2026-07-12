/**
 * Genera proceduralmente una singola roccia low-poly deformando i vertici
 * di un IcosahedronGeometry con rumore casuale, ed espone la sua
 * serializzazione/deserializzazione per la persistenza dello stato. 
 * Responsabilità limitata esclusivamente alla logica geometrica 3D.
 */
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { createMatcapTexture } from '../utils/MatcapTextureFactory.js';
import { serializeGeometryPositions, geometryFromPositions } from '../utils/GeometrySerializer.js';
import { rockBaseTexture } from '../utils/ProceduralTextureFactory.js';

/**
 * Crea una roccia procedurale deformata.
 */
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
    bumpScale: 0.008, 
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

/**
 * Salva lo stato della roccia.
 */
export function serializeRock(rock) {
  const flat = rock.geometry.index ? rock.geometry.toNonIndexed() : rock.geometry;
  
  const data = {
    positions: serializeGeometryPositions(rock.geometry),
    uvs: Array.from(flat.attributes.uv.array),
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

/**
 * Ripristina una roccia dallo stato salvato.
 */
export function deserializeRock(data) {
  const geometry = geometryFromPositions(data.positions);
  
  if (data.uvs) {
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
  } else {
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