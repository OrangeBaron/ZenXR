# Roadmap di Sviluppo per ZenXR

Questo documento definisce le fasi di sviluppo iterativo per il progetto ZenXR, rispettando l'approccio modulare, procedurale e "AI-Friendly" in Vanilla JS.

## ✅ **Fase 1: Setup dell'Infrastruttura di Base (Vanilla & Import Maps)**

**Obiettivo:** Creare l'architettura dei file e garantire che le dipendenze vengano caricate correttamente senza bundler.

**Task:**

* Creare `index.html` con `<script type="importmap">` per mappare `three`, `three/addons/`, `rapier` (o `cannon-es`), `@tweenjs/tween.js` e `lil-gui`.
* Strutturare le cartelle di progetto (`/src`, `/src/core`, `/src/entities`, `/src/utils`).
* Creare il file di entry point `<script type="module" src="./src/main.js">`.
* Testare l'avvio con un server locale (es. Live Server).

## ✅ **Fase 2: Core 3D e Setup Iniziale WebXR**

**Obiettivo:** Inizializzare la scena 3D di base e abilitare la modalità *Immersive-AR*.

**Task:**

* Creare `SceneManager.js` per gestire Scene, PerspectiveCamera e WebGLRenderer (con shadow map abilitate e ottimizzate).
* Creare `XRManager.js` per richiedere la sessione `immersive-ar`.
* Implementare l'Hit-Testing API per posizionare un reticolo temporaneo sul pavimento o sul tavolo reale.
* Inserire `lil-gui` nel browser per il debugging dei parametri procedurali (nascosto in visore, visibile su monitor).

## ✅ **Fase 3: Generazione Procedurale degli Asset (Ambiente Base)**

**Obiettivo:** Costruire gli elementi visivi usando solo le primitive di Three.js e materiali `MeshMatcapMaterial` a flat shading.

**Task:**

* Creare `GardenBase.js`: vasca di base, recinto di bambù stilizzato e zona sabbiosa (`BoxGeometry`).
* Creare `BonsaiGenerator.js`: implementare un L-System semplificato usando `CylinderGeometry` per i rami e `IcosahedronGeometry` per la chioma.
* Creare `RockGenerator.js`: generare rocce deformando i vertici di `DodecahedronGeometry` con una funzione di rumore.

## ✅ **Fase 4: Gestione dello Stato e Persistenza dei Dati**

**Obiettivo:** Garantire che il giardino possa evolvere e salvare i propri progressi.

**Task:**

* Creare `StateManager.js` (Pattern Singleton o Custom Events) per tracciare variabili globali (stato bonsai, posizione rocce, layout sabbia).
* Creare `SaveSystem.js` per leggere e scrivere questi dati su `LocalStorage`.
* Implementare la logica di ripristino al caricamento e la funzione "Reset" globale.

## **Fase 5: Hand-Tracking e Interazioni Base**

**Obiettivo:** Abbandonare i controller e mappare le mani dell'utente.
**Task:**

* Implementare `HandTrackingManager.js` per leggere gli input delle mani (Pinch, Grab).
* Gestire le collisioni visive (bounding box) dei polpastrelli per l'interazione con gli elementi del giardino.

## **Fase 6: Fisica, Stone Balancing e Suono Spaziale**

**Obiettivo:** Dare peso e presenza agli oggetti, stimolando i sensi.

**Task:**

* Integrare il motore fisico (es. `PhysicsManager.js` con Rapier) e mappare le rocce procedurali come corpi rigidi.
* Implementare l'interazione di "Grab & Drop" con le mani per impilare le rocce (Stone Balancing).
* Aggiungere `AudioManager.js`: integrare suoni spaziali (`PositionalAudio`) per gli urti fisici delle rocce e per un gong/Furin posizionato proceduralmente.

## **Fase 7: Vita, Shader e Meditazione**

**Obiettivo:** Inserire elementi dinamici e reattivi per animare il giardino.

**Task:**

* **La Sabbia:** Implementare `SandShader.js` (Frame Buffer Object) per tracciare linee dinamiche deformando le normali della texture al passaggio del rastrello virtuale.
* **Le Koi:** Creare `KoiBoids.js` per simulare il flocking di pesci stilizzati nel laghetto (`ConeGeometry` animate) e l'increspatura dell'acqua.
* **L'Incenso:** Creare un particellare leggero per il fumo e la logica temporale (il bastoncino che si accorcia) per il timer meditativo.
* **I Sakura:** Implementare il particellare per i petali di ciliegio deviati dalle mani dell'utente.

## **Fase 8: Estetica Adattiva, Illuminazione e Polish Finale**

**Obiettivo:** Ottimizzare le performance e far reagire il giardino al mondo reale.

**Task:**

* Implementare la `LightingEstimation API` di WebXR per far coincidere le luci virtuali con quelle della stanza reale.
* Creare il ciclo Giorno/Notte basato sull'orologio di sistema (accensione procedurali delle Tōrō - lanterne di pietra).
* Eseguire un refactoring globale seguendo rigorosamente il *Single Responsibility Principle*.
* Profilazione delle performance sul Quest 3 (mantenimento dei 72/90fps fissi).
