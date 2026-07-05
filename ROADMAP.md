# Roadmap di Sviluppo per ZenXR (Aggiornata)

Questo documento definisce le fasi di sviluppo iterativo per il progetto ZenXR, rispettando l'approccio modulare, procedurale e "AI-Friendly" in Vanilla JS.

## Fase 1: Setup dell'Infrastruttura di Base (Vanilla & Import Maps)

**Obiettivo:** Creare l'architettura dei file e garantire che le dipendenze vengano caricate correttamente senza bundler.

**Task:**

* Creare `index.html` con `<script type="importmap">` per mappare `three`, `three/addons/`, `rapier`, `@tweenjs/tween.js` e `lil-gui`.
* Strutturare le cartelle di progetto e creare il file di entry point `main.js`.
* Testare l'avvio con un server locale.

## Fase 2: Core 3D e Setup Iniziale WebXR

**Obiettivo:** Inizializzare la scena 3D di base e abilitare la modalità *Immersive-AR*.

**Task:**

* Creare `SceneManager.js` per gestire la scena e il WebGLRenderer.
* Creare `XRManager.js` per la sessione `immersive-ar` e implementare l'Hit-Testing per posizionare il giardino sulle superfici reali.
* Utilizzare le API degli *Anchors* di WebXR per ancorare spazialmente il giardino.

## Fase 3: Generazione Procedurale degli Asset (Ambiente Base)

**Obiettivo:** Costruire gli elementi visivi usando le primitive di Three.js e `MeshMatcapMaterial` a flat shading.

**Task:**

* Creare `GardenBase.js` (vasca, recinto di bambù, zona sabbiosa).
* Creare `BonsaiGenerator.js` (L-System semplificato) e `RockGenerator.js` (deformazione tramite rumore).
* Utilizzare `MeshSurfaceSampler` per la dispersione organica di elementi di dettaglio.

## Fase 4: Gestione dello Stato e Persistenza dei Dati

**Obiettivo:** Garantire che il giardino possa evolvere e salvare i propri progressi nel tempo.

**Task:**

* Creare `StateManager.js` per tracciare le variabili globali (stato bonsai, posizione rocce, texture sabbia).
* Creare `SaveSystem.js` per leggere e scrivere questi dati su `LocalStorage` / `IndexedDB`.
* Implementare la logica di ripristino al caricamento dell'applicazione.

## Fase 5: Riorganizzazione Spaziale e Laghetto Procedurale

**Obiettivo:** Rompere la simmetria creando una divisione organica degli spazi all'interno della vasca.

**Task:**

* Creare `PondGenerator.js`: generare la geometria del laghetto (circa 1/3 dello spazio) a forma di "macchia" irregolare.
* Assicurarsi che rocce e bonsai vengano generati esclusivamente nella zona asciutta.

## Fase 6: Hand-Tracking e Interazioni Base

**Obiettivo:** Abbandonare i controller e mappare le mani dell'utente.

**Task:**

* Implementare l'occlusione visiva delle mani in MR tramite `HandOcclusionManager.js` (`XRHandMeshModel` / `XRHandPrimitiveModel`).
* Implementare `HandTrackingManager.js` per gestire i bounding box dei polpastrelli.
* Abilitare il "pinch" per pizzicare le foglie secche del bonsai e rimuoverle.

## Fase 7: Fisica e Stone Balancing

**Obiettivo:** Dare peso e presenza agli oggetti, stimolando i sensi.

**Task:**

* Integrare il motore fisico leggero (es. Rapier) e mappare le rocce come corpi rigidi.
* Implementare l'interazione manuale di "Grab & Drop" per lo Stone Balancing (impilare le rocce).
* Aggiungere `AudioManager.js`: suoni spaziali (`PositionalAudio`) per gli urti fisici tra le rocce (ASMR).
* *Nota:* Le foglie rimosse col pinch diventano corpi rigidi e cadono a terra prima di dissolversi.

## Fase 8: Strumenti del Giardino (Rastrello, Sabbia, Gong e Incenso)

**Obiettivo:** Introdurre gli strumenti interattivi complessi e le logiche di reset e timer basate sulla manipolazione degli oggetti.

**Task:**

* **Il Rastrello:** Costruire proceduralmente il rastrello assemblando primitive di base (`CylinderGeometry`, `BoxGeometry`) all'interno di un `THREE.Group`.
* **Manipolazione:** Sviluppare la logica avanzata di "Grab" per permettere all'utente di afferrare e maneggiare realisticamente il manico del rastrello nello spazio virtuale.
* **La Sabbia (Shader):** Implementare `SandShader.js` (Frame Buffer Object) per tracciare linee dinamiche deformando le normali della sabbia in tempo reale, attivato quando i denti del rastrello toccano la superficie.
* **Il Gong (Reset):** Generare proceduralmente un piccolo gong in metallo. Implementare la logica per rilevare le collisioni: l'utente dovrà usare il manico del rastrello per colpire il gong 3 volte, innescando così il reset del salvataggio (pulizia del giardino).
* **L'Incenso (Timer):** Generare l'incenso e il fiammifero virtuale. Sfruttando la logica di presa appena sviluppata, l'utente afferra il fiammifero per accendere l'incenso. Questo attiverà un sistema particellare per il fumo e avvierà il consumo visivo del bastoncino che funge da timer meditativo.

## Fase 9: L'Acqua e l'Ecosistema Koi (Interazioni Avanzate)

**Obiettivo:** Dare vita al laghetto introducendo dinamiche fluide e intelligenza artificiale per i pesci.

**Task:**

* **L'Acqua:** Integrare l'addon `Water` o `Water2` di Three.js per ottenere rapidamente riflessi, rifrazioni e increspature procedurali.
* **Shader Interattivo:** Fare in modo che la superficie dell'acqua reagisca all'immersione delle dita o degli oggetti, generando increspature dinamiche.
* **Intelligenza Boids:** Creare `KoiBoids.js` per simulare il flocking di pesci stilizzati (`ConeGeometry`) che nuotano fluidamente entro i confini irregolari del laghetto.
* **Interazione Koi:** Implementare la reattività dei pesci: se l'utente tiene la mano ferma a pelo d'acqua, le carpe si avvicinano curiose; movimenti bruschi le faranno disperdere.

## Fase 10: Estetica Adattiva, Atmosfera e Polish Finale

**Obiettivo:** Ottimizzare le performance, aggiungere vita aerea e far reagire il giardino all'illuminazione reale.

**Task:**

* **I Sakura:** Implementare il particellare per i petali di ciliegio che cadono. La scia d'aria (bounding box) delle mani o del rastrello devierà la loro traiettoria.
* **Mappa d'Ambiente e WebXR Lighting:** Utilizzare l'addon `RoomEnvironment` per una mappa d'ambiente procedurale e la `LightingEstimation API` di WebXR per far coincidere le luci e i riflessi virtuali con la stanza reale dell'utente.
* **Progressione Sussurrata e Dettagli:** Aggiungere eventi gratificanti legati al tempo trascorso (es. tartaruga che emerge o fioritura del loto). Integrare il ciclo Giorno/Notte (orologio di sistema) con accensione delle lanterne (Tōrō) e lucciole.
* **Ottimizzazione:** Abilitare le ombre dinamiche (Shadow Maps) *solo* per le mani dell'utente e il rastrello, usando il baking per le ombre statiche. Profilazione finale per fissare il framerate sul Quest 3.
