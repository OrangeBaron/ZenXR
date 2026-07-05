# ZenXR - Documento di Design Tecnico (GDD)

## Concept e Presentazione

Un'esperienza creativa, rilassante e meditativa in Mixed Reality. Ci ritroviamo in un giardino zen giapponese. Possiamo disegnare pattern nella sabbia con il rastrello, potare alberi di bonsai che crescono proceduralmente, posizionare e impilare rocce lisce, e interagire con le carpe Koi nel laghetto. Il suono dell'acqua e dei bambù ci circonda (grazie all'audio spaziale).

## 1. Setup, Posizionamento MR e Ancoraggio

Poiché l'esperienza si svolge nello spazio fisico dell'utente, il sistema deve essere flessibile.

* **Hit-Testing:** All'avvio in modalità `immersive-ar`, usiamo le *WebXR Hit Test API* per rilevare superfici reali (un tavolo, la scrivania o il pavimento). Un reticolo (reticle) indicherà dove posizionare la base del giardino.
* **WebXR Anchors:** Utilizzare le API degli *Anchors* per far sì che il giardino "ricordi" la sua esatta posizione fisica nella stanza anche se il tracciamento del visore viene temporaneamente perso.

## 2. Persistenza dei Dati (Save & Load)

Il giardino deve essere un rifugio personale che evolve nel tempo.

* **LocalStorage / IndexedDB:** I progressi devono essere salvati localmente nel browser.
* **Stato da salvare:** Dobbiamo salvare le coordinate (posizione e rotazione) delle rocce impilate, il livello di crescita e i rami tagliati del bonsai, e lo stato della texture della sabbia rastrellata.
* **Ripristino e Reset:** Al caricamento, il gioco legge il database locale per ripristinare la scena. Deve essere presente un elemento interattivo (es. colpire un piccolo gong specifico 3 volte) per "Ripulire il giardino", cancellando il salvataggio e ricominciando da capo con la sabbia intonsa.

## 3. Interazioni Tattili e Hand-Tracking (Niente Controller!)

Abbandonare i controller a favore delle proprie mani aumenta l'immersione a dismisura.

* **Rappresentazione Visiva delle Mani:** Per occludere correttamente il giardino virtuale con le mani reali in MR, è approvato l'utilizzo di estensioni tecniche di Three.js come `XRHandMeshModel` (per una mesh continua) o `XRHandPrimitiveModel` (per uno stile low-poly a blocchi), senza che questo violi la regola "zero-asset".
* **La meditazione del rastrello:** Usando un piccolo rastrello virtuale, possiamo tracciare linee curve e concentriche attorno alle rocce. In Three.js, questo si realizza modificando dinamicamente una texture (usata come *displacement map*) per deformare la sabbia in tempo reale sotto i denti del rastrello.
* **Stone Balancing (Equilibrio delle rocce):** Possiamo afferrare rocce di fiume levigate e cercare di impilarle in torri precarie. Usando un motore fisico leggero (come Rapier.js), possiamo applicare una gravità "addolcita" e suoni di sfregamento pietroso (ASMR) quando le rocce si toccano.
* **Campane Tibetane e Gong:** Posizioniamo delle campane di metallo o piccoli gong. Sfiorandoli con le dita o colpendoli delicatamente con un batacchio, emetteranno vibrazioni lunghe e rilassanti.
* **L'Incenso come Timer Meditativo:** Invece di usare menu e interfacce utente per i timer di meditazione, l'utente può afferrare un fiammifero virtuale e accendere un bastoncino d'incenso. Questo si consuma lentamente (es. in 5, 10 o 15 minuti), generando un leggero effetto fumo (tramite shader o particelle leggere), fungendo da timer visivo, diegetico e silenzioso per la sessione.

## 4. Natura Dinamica e Procedurale

Il giardino non deve essere statico, ma deve reagire lentamente e dolcemente alla nostra presenza e al mondo reale.

* **Il Laghetto delle Carpe Koi:** Un piccolo specchio d'acqua. Invece di scrivere uno shader GLSL complesso da zero, si consiglia l'uso dell'addon `Water` o `Water2` di Three.js per ottenere rapidamente riflessi, rifrazioni e increspature procedurali. Se immergiamo un dito, l'acqua reagisce. Le carpe Koi nuotano usando un algoritmo *Boids* (flocking) e, se tieniamo la mano a pelo d'acqua, si avvicineranno curiose.
* **Potatura e Crescita del Bonsai:** Al centro del giardino c'è un bonsai. Nel corso dell'esperienza, i rami crescono impercettibilmente. Unendo pollice e indice (gesto di *pinch* rilevato dal Quest 3), possiamo "pizzicare" via le foglie secche o i rametti in eccesso per dare forma all'albero.
* **Petali di Sakura nel vento:** Un sistema particellare leggerissimo che fa cadere lenti petali di ciliegio rosa. Se muoviamo la mano velocemente vicino a un petalo che cade, lo spostamento d'aria (la bounding box della nostra mano) ne devia la traiettoria.
* **Sincronizzazione Temporale (Giorno/Notte):** Il sistema legge l'orologio locale del browser dell'utente. Se si accede al giardino di sera o di notte, l'ambiente appare immerso nella penombra e si accendono dolcemente piccole lanterne di pietra giapponesi (Tōrō), accompagnate da lucciole dinamiche.
* **Progressione Sussurrata:** Il giardino premia la pazienza. Dopo un certo tempo cumulativo trascorso nel giardino o dopo aver compiuto azioni rilassanti (es. impilato 5 rocce in equilibrio), avvengono piccoli eventi gratificanti ma non invasivi, come una piccola tartaruga che emerge dal laghetto a prendere il sole o un raro fiore di loto che sboccia sull'acqua.

## 5. Sfruttare i Superpoteri del Quest 3

* **Il Giardino in Salotto (Mixed Reality):** Usando le API di WebXR per l'AR (Modalità "immersive-ar"), possiamo far scomparire i confini della scatola del gioco. Il pavimento del nostro salotto reale diventa il fondale su cui si appoggia la vasca di sabbia, le rocce e il bonsai. È un effetto magico e azzera il rischio di motion sickness.
* **Furin (Scacciapensieri) e Audio Spaziale:** Il suono è fondamentale in VR. Possiamo appendere un *Furin* (il tipico campanello a vento giapponese in vetro o ghisa) a una lanterna. Grazie al `PositionalAudio` di Three.js, se giriamo la testa o ci spostiamo, il tintinnio arriverà esattamente dalla sua posizione tridimensionale, aumentando il realismo percettivo.
* **Illuminazione e Mappe d'Ambiente:** Si utilizzerà l'addon `RoomEnvironment` per generare proceduralmente una mappa d'ambiente in tempo reale. Questo fornirà un'illuminazione di base fotorealistica e riflessi credibili senza l'uso di texture HDRI pesanti.
* **Lighting Estimation API:** Successivamente, integrare le API per la stima dell'illuminazione reale. Se l'utente gioca in una stanza buia, il giardino rifletterà quell'illuminazione; se è in una stanza luminosa, i modelli 3D riceveranno una luce coerente con l'ambiente reale, fondendosi perfettamente.

## 6. Generazione Procedurale degli Asset in Three.js (Ottimizzazione)

Per mantenere l'applicazione ultraleggera (zero tempi di caricamento) e aderente allo stile visivo "Low-Poly", **nessun asset esterno (.gltf, .obj) dovrà essere importato**. Tutti i modelli 3D dovranno essere costruiti programmaticamente tramite le primitive di Three.js.

* **Stile Visivo e Materiali:** Utilizzare sempre `flatShading: true` nei materiali per marcare le sfaccettature poligonali. Preferiamo i `MeshMatcapMaterial` (molto economici in termini di calcolo ma bellissimi per effetti opachi/vellutati) rispetto ai `MeshStandardMaterial` fisicamente accurati.
* **Rocce:** Utilizzare `IcosahedronGeometry` o `DodecahedronGeometry` (dettaglio 0 o 1), applicando una randomizzazione spaziale ai vertici per creare forme organiche e uniche.
* **Bonsai:** Costruire l'albero proceduralmente usando un sistema di ramificazione (L-System semplificato) fatto di `CylinderGeometry` a bassi segmenti, sormontati da icosaedri per la chioma.
* **Oggetti d'uso (Rastrello, Lanterne, Gong):** Assemblare primitive di base (`BoxGeometry`, `CylinderGeometry`, `ConeGeometry`, `TorusGeometry`) all'interno di un `THREE.Group`.
* **Dispersione Organica:** Per il posizionamento procedurale aderente alle superfici (es. muschio sulle rocce o foglie di Sakura cadute sulla sabbia), utilizzare l'addon `MeshSurfaceSampler` per un piazzamento istanziato e realistico anziché un semplice ciclo casuale.
* **Geometrie a Basso Costo:** Usiamo asset Low-Poly o stilizzati (es. stile Studio Ghibli o cel-shading morbido). Evitiamo modelli fotorealistici con milioni di poligoni.
* **Ombre:** Usiamo il *Baking* delle luci per le ombre statiche e abilita le ombre dinamiche (Shadow Maps) **solo** per le mani dell'utente e il rastrello.
* **Sabbia:** Invece di modificare la geometria della sabbia (troppo pesante), usiamo il rendering su texture (Frame Buffer Objects) per aggiornare la mappa delle normali della sabbia.

## 7. Linee Guida per l'Architettura del Codice (AI-Friendly & Vanilla JS)

Poiché lo sviluppo sarà guidato e gestito iterativamente da un'Intelligenza Artificiale, il codice sorgente deve rispettare rigorosi standard di pulizia per evitare allucinazioni e blocchi logici (spaghetti code).

* **Puro Vanilla JavaScript (No Frameworks UI):** L'applicazione deve essere scritta in Vanilla JS moderno (ES6+). È severamente vietato l'uso di framework UI (React, Vue, Svelte) o wrapper 3D astratti (come React Three Fiber).
* **Gestione Moduli e Server (No Bundler):** Non è richiesto l'uso di bundler (come Vite o Webpack). L'architettura deve basarsi sull'utilizzo nativo degli **Import Maps** nell'HTML (`<script type="importmap">`) combinato con moduli ES6 locali (`<script type="module">`). Questo garantisce compatibilità immediata con server locali semplici (es. estensione Live Server di VS Code) e facilita il futuro deployment su GitHub Pages.
* **Dipendenze e Addons Ammessi:** Il core grafico si basa su `three.js`. L'utilizzo di estensioni presenti in `three/addons/` (es. `RoomEnvironment`, `Water`, `XRHandMeshModel`, `MeshSurfaceSampler` e `HTMLMesh` per interfacce in VR) è **espressamente autorizzato** e considerato parte del framework di rendering, rispettando il vincolo di zero caricamenti esterni. Per la fisica è ammesso `rapier.js` (o `cannon-es` se valutato più leggero e idoneo dall'IA). Per facilitare le animazioni via codice è consentito l'uso di `@tweenjs/tween.js`. Durante le fasi di sviluppo, è raccomandato l'uso di `lil-gui` per esporre e calibrare le variabili procedurali in un pannello visivo.
* **Modularità Estrema (ES6 Modules):** Il codice NON deve risiedere in un unico file `main.js`. Deve essere suddiviso in moduli logici e indipendenti (es. `BonsaiGenerator.js`, `XRInteractionManager.js`, `KoiBoids.js`, `SaveSystem.js`, `SandShader.js`).
* **Single Responsibility Principle (SRP):** Ogni classe o funzione deve avere un solo scopo ben definito. Se una funzione per inizializzare il WebXR inizia a gestire anche la logica di crescita del bonsai, va eseguito un refactoring immediato.
* **Gestione Centralizzata dello Stato:** Utilizzare un pattern chiaro in Vanilla JS (es. uno `StateManager` basato su eventi Custom o un modulo singleton) per raccogliere le variabili globali (progresso bonsai, posizione rocce) in modo che il `SaveSystem` vi acceda facilmente e in sicurezza.
* **Refactoring Proattivo:** Durante i passaggi di generazione del codice, se l'implementazione di una nuova feature rende un modulo troppo lungo o complesso, procedere prima a un refactoring mirato per semplificare la base di codice, per poi aggiungere la novità.
* **Documentazione e Commenti:** Ogni file e funzione principale deve includere commenti descrittivi chiari in testa. Questo aiuterà l'IA a mantenere stabile il contesto durante le future sessioni di prompt.
