import * as THREE from 'three';
import { createMatcapTexture } from '../utils/MatcapTextureFactory.js';

// --- TEXTURE PROCEDURALI ---
function createGradientTexture(stops) {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 128);
    for (const [pos, color] of stops) {
        gradient.addColorStop(pos, color);
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 16, 128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace; 
    return tex;
}

const litWoodTexture = createGradientTexture([
    [0, '#ffcc00'], [0.05, '#ff3300'], [0.15, '#111111'], [0.4, '#c49a6c'], [1, '#c49a6c']
]);

// NUOVA TEXTURE: Legno completamente spento (carbonizzato in cima, sano alla base)
const burntWoodTexture = createGradientTexture([
    [0, '#222222'], [0.15, '#222222'], [0.4, '#c49a6c'], [1, '#c49a6c']
]);

export function createMatchbox() {
    const matchboxGroup = new THREE.Group();
    
    // Materiali in stile ZenXR (Matcap + flatShading)
    const boxCoverMat = new THREE.MeshMatcapMaterial({ matcap: createMatcapTexture(0x1c3144), flatShading: true });
    const boxStrikeMat = new THREE.MeshMatcapMaterial({ matcap: createMatcapTexture(0x3d1c1c), flatShading: true });
    const boxInnerMat = new THREE.MeshMatcapMaterial({ matcap: createMatcapTexture(0xdddddd), flatShading: true });
    const woodMat = new THREE.MeshMatcapMaterial({ matcap: createMatcapTexture(0xc49a6c), flatShading: true });
    const matchTipMat = new THREE.MeshMatcapMaterial({ matcap: createMatcapTexture(0xaa2222), flatShading: true });

    // Cover
    const cover = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.002, 0.08), boxCoverMat);
    top.position.y = 0.016;
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.002, 0.08), boxCoverMat);
    bottom.position.y = -0.016;
    const strike1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.002), boxStrikeMat);
    strike1.position.z = 0.039;
    const strike2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.002), boxStrikeMat);
    strike2.position.z = -0.039;
    
    [top, bottom, strike1, strike2].forEach(m => m.castShadow = true);
    cover.add(top, bottom, strike1, strike2);
    matchboxGroup.add(cover);

    // Tray (leggermente aperto verso X)
    const tray = new THREE.Group();
    tray.position.x = 0.04; 
    const tBase = new THREE.Mesh(new THREE.BoxGeometry(0.118, 0.002, 0.076), boxInnerMat);
    tBase.position.y = -0.014;
    const tBack = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.028, 0.076), boxInnerMat);
    tBack.position.x = -0.058;
    const tFront = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.028, 0.076), boxInnerMat);
    tFront.position.x = 0.058;
    const tSide1 = new THREE.Mesh(new THREE.BoxGeometry(0.118, 0.028, 0.002), boxInnerMat);
    tSide1.position.z = 0.037;
    const tSide2 = new THREE.Mesh(new THREE.BoxGeometry(0.118, 0.028, 0.002), boxInnerMat);
    tSide2.position.z = -0.037;
    
    [tBase, tBack, tFront, tSide1, tSide2].forEach(m => m.castShadow = true);
    tray.add(tBase, tBack, tFront, tSide1, tSide2);

    // Fiammiferi sparsi nel vassoio
    const matchWoodGeo = new THREE.CylinderGeometry(0.0015, 0.0015, 0.06, 6);
    matchWoodGeo.rotateZ(Math.PI / 2);
    const matchTipGeo = new THREE.IcosahedronGeometry(0.0025, 0);

    for(let i = 0; i < 6; i++) {
        const mGroup = new THREE.Group();
        const mWood = new THREE.Mesh(matchWoodGeo, woodMat);
        const mTip = new THREE.Mesh(matchTipGeo, matchTipMat);
        mTip.position.x = 0.03;
        mWood.castShadow = true; mTip.castShadow = true;
        
        mGroup.add(mWood, mTip);
        mGroup.position.set((Math.random() - 0.5) * 0.04, -0.012, (Math.random() - 0.5) * 0.05);
        mGroup.rotation.y = (Math.random() - 0.5) * 0.3;
        tray.add(mGroup);
    }
    matchboxGroup.add(tray);
    
    const rootGroup = new THREE.Group();
    matchboxGroup.position.y = 0.017;
    rootGroup.add(matchboxGroup);
    rootGroup.userData.kind = 'matchbox';
    
    return rootGroup;
}

export function createIncense() {
    const incenseSet = new THREE.Group();
    
    const baseMat = new THREE.MeshMatcapMaterial({ matcap: createMatcapTexture(0x4a3219), flatShading: true });
    const ashMat = new THREE.MeshMatcapMaterial({ matcap: createMatcapTexture(0x3d3530), flatShading: true });
    const stickMat = new THREE.MeshMatcapMaterial({ matcap: createMatcapTexture(0xd9b382), flatShading: true });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });

    // Tavoletta di base (scala 0.1)
    const baseBoard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.008, 0.04), baseMat);
    baseBoard.position.y = -0.046;

    // Rialzo forato per l'incenso
    const baseHole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 8), baseMat);
    baseHole.position.set(0.12, -0.04, 0);
    
    const stick = new THREE.Group();

    // Parte in bambù (legno grezzo)
    const bambooPart = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.05, 5), stickMat);
    bambooPart.position.y = 0.025;
    
    // Parte incenso/cenere (grigio/bruno)
    const burnGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.2, 5);
    burnGeo.translate(0, 0.1, 0); 
    const burnPart = new THREE.Mesh(burnGeo, ashMat);
    burnPart.position.y = 0.05;

    // Braci (glow acceso)
    const incenseGlow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.002, 0), glowMat);
    incenseGlow.scale.set(0.7, 1.5, 0.7); // Questa deformazione relativa va mantenuta per dare la forma ovale alla brace
    incenseGlow.position.y = 0.05 + 0.20;
    incenseGlow.visible = false;
    
    [baseBoard, baseHole, bambooPart, burnPart].forEach(m => m.castShadow = true);
    
    stick.add(bambooPart, burnPart, incenseGlow);
    stick.position.set(0.12, -0.038, 0);
    stick.rotation.z = Math.PI / 3.5; 
    
    incenseSet.add(baseBoard, baseHole, stick);
    
    const rootGroup = new THREE.Group();
    incenseSet.position.y = 0.05;
    rootGroup.add(incenseSet);
    
    rootGroup.userData = {
        kind: 'incense_set',
        burnPart: burnPart,
        glowPart: incenseGlow
    };
    
    return rootGroup;
}

export function createSingleMatch() {
    const singleMatch = new THREE.Group();

    // Materiali STATO ACCESO (Emettono luce virtuale)
    const activeWoodMat = new THREE.MeshBasicMaterial({ map: litWoodTexture });
    const activeTipMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });

    // Materiali STATO SPENTO (Tornano a usare il matcap per avere le ombre)
    const burntWoodMat = new THREE.MeshMatcapMaterial({ 
        matcap: createMatcapTexture(0xffffff), 
        map: burntWoodTexture 
    });
    const burntTipMat = new THREE.MeshMatcapMaterial({ 
        matcap: createMatcapTexture(0x222222) 
    });

    const woodGeo = new THREE.CylinderGeometry(0.0015, 0.0015, 0.06, 6);
    woodGeo.translate(0, 0.03, 0); 
    const sWood = new THREE.Mesh(woodGeo, activeWoodMat);

    const sTip = new THREE.Mesh(new THREE.IcosahedronGeometry(0.0025, 0), activeTipMat);
    sTip.position.y = 0.06; 
    
    const matchFireGroup = new THREE.Group();
    matchFireGroup.position.y = 0.062; 
    
    const fireCoreMat = new THREE.MeshBasicMaterial({ color: 0xffff88, blending: THREE.AdditiveBlending });
    const fireCoreGeo = new THREE.IcosahedronGeometry(0.0025, 0);
    fireCoreGeo.translate(0, 0.0025, 0); 
    const fireCore = new THREE.Mesh(fireCoreGeo, fireCoreMat);

    const fireOuterMat = new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending });
    const fireOuterGeo = new THREE.IcosahedronGeometry(0.005, 0);
    fireOuterGeo.translate(0, 0.005, 0); 
    const fireOuter = new THREE.Mesh(fireOuterGeo, fireOuterMat);

    matchFireGroup.add(fireOuter, fireCore);

    singleMatch.add(sWood, sTip, matchFireGroup);

    // Salviamo tutti i riferimenti per poterli swappare
    singleMatch.userData = {
        kind: 'active_match',
        isLit: true,
        fireGroup: matchFireGroup,
        fireCore: fireCore,
        fireOuter: fireOuter,
        woodMesh: sWood, 
        tipMesh: sTip,   
        burntWoodMat: burntWoodMat,
        burntTipMat: burntTipMat
    };

    return singleMatch;
}