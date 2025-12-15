// --- CONFIGURATION INITIALE ---
const ITEM_HEIGHT = 60; // Hauteur d'une ligne en px
const BUFFER_SIZE = 50; // Nombre de mots à rendre au dessus/dessous pour l'illusion infinie
let currentLanguage = "FR";
let isDarkMode = false;

// --- ETAT DE L'APPLICATION ---
const APP_STATE = {
    mode: "NORMAL", // NORMAL, FORCE, VRTX
    forceConfig: { target: "", count: 0, initialCount: 0 },
    vrtxConfig: { word: "", rank: 0, index: 0 },
    history: [], // { word: "MOT", type: "NORMAL"|"FORCE"|"VRTX" }
    isScrolling: false,
    scrollTimeout: null
};

// Référence au DOM
const wheel = document.getElementById('wheel');
const focusLens = document.querySelector('.focus-lens');

// --- INITIALISATION ---

function init() {
    setupTriggers();
    setupModals();
    setupWheel();
    renderWheel();
    
    // Centrer la roue au démarrage
    setTimeout(() => {
        wheel.scrollTop = ITEM_HEIGHT * 1000; // Aller loin pour l'effet infini
    }, 100);

    // Observer pour l'effet visuel (Opacité/Scale)
    wheel.addEventListener('scroll', handleScroll);
}

// --- LOGIQUE DE LA ROUE (INFINITE SCROLL & PHYSICS) ---

function renderWheel() {
    // Génère une longue liste pour simuler l'infini
    // On utilise les mots de data.js
    const words = window.WORDS || ["ERREUR", "DATA", "MANQUANT"];
    let html = "";
    // On répète la liste X fois pour avoir de la marge
    for(let i=0; i<2000; i++) {
        const word = words[i % words.length];
        html += `<li>${word}</li>`;
    }
    wheel.innerHTML = html;
}

function handleScroll() {
    clearTimeout(APP_STATE.scrollTimeout);
    APP_STATE.isScrolling = true;

    // Effet visuel immédiat (Centre Highlight)
    updateVisuals();

    // Détection de l'arrêt du scroll (Snap)
    APP_STATE.scrollTimeout = setTimeout(() => {
        APP_STATE.isScrolling = false;
        snapToGrid();
    }, 150); // Délai avant de considérer le scroll comme "fini"
}

function updateVisuals() {
    const center = wheel.scrollTop + (wheel.clientHeight / 2);
    const elements = wheel.children;
    
    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const elCenter = el.offsetTop + (el.clientHeight / 2);
        const dist = Math.abs(center - elCenter);
        
        // Calcul effet distance
        if (dist < ITEM_HEIGHT) {
            el.style.opacity = 1 - (dist / ITEM_HEIGHT * 0.5); // 1.0 -> 0.5
            el.style.transform = `scale(${1.2 - (dist / ITEM_HEIGHT * 0.3)})`;
            el.classList.add('active');
        } else if (dist < ITEM_HEIGHT * 3) {
            el.style.opacity = 0.4 - ((dist - ITEM_HEIGHT) / (ITEM_HEIGHT * 2) * 0.3);
            el.style.transform = "scale(0.9)";
            el.classList.remove('active');
        } else {
            el.style.opacity = 0.1;
            el.style.transform = "scale(0.8)";
            el.classList.remove('active');
        }
    }
}

function snapToGrid() {
    const currentScroll = wheel.scrollTop;
    const index = Math.round(currentScroll / ITEM_HEIGHT);
    const targetScroll = index * ITEM_HEIGHT;
    
    // Smooth scroll vers la position exacte
    wheel.scrollTo({
        top: targetScroll,
        behavior: 'smooth'
    });

    // Une fois stabilisé, on valide le mot
    setTimeout(() => {
        const finalIndex = Math.round(wheel.scrollTop / ITEM_HEIGHT);
        const elements = wheel.children;
        const selectedElement = elements[finalIndex + Math.floor(wheel.clientHeight/ITEM_HEIGHT/2)]; // Ajustement approximatif du centre
        
        if(selectedElement) {
            const word = selectedElement.innerText;
            processResult(word, selectedElement);
        }
    }, 300);
}

// --- CŒUR DU MENTALISME : INTERCEPTION DU RÉSULTAT ---

// Cette fonction est appelée AVANT que le scroll ne s'arrête complètement
// pour injecter le mot forcé si nécessaire.
// Note: Pour une fiabilité web, on triche : on détecte le ralentissement 
// et on remplace le texte de l'élément qui VA atterrir au centre.

wheel.addEventListener('scroll', () => {
    // Logique de modification à la volée pendant le scroll
    if (APP_STATE.mode === 'NORMAL') return;

    // Si on est en mode FORCE ou VRTX, on surveille la vitesse
    // Si la vitesse est basse (fin de scroll), on prépare l'injection
    // Simplification pour ce prototype : on compte les "arrêts" (snaps).
});

function processResult(word, elementDom) {
    // C'est ici qu'on gère le compteur de scrolls
    
    if (APP_STATE.mode === 'FORCE') {
        APP_STATE.forceConfig.count--;
        console.log("Force Count:", APP_STATE.forceConfig.count);

        if (APP_STATE.forceConfig.count <= 0) {
            // C'EST LE MOMENT !
            // On remplace le mot visuellement s'il n'est pas bon
            if (elementDom.innerText !== APP_STATE.forceConfig.target) {
                elementDom.innerText = APP_STATE.forceConfig.target;
                // Petit effet visuel pour masquer le changement si l'oeil est vif
                elementDom.style.transition = "none";
                elementDom.style.color = "var(--text-color)"; // Refresh
            }
            
            saveToHistory(APP_STATE.forceConfig.target, 'FORCE');
            sendToFirebase(APP_STATE.forceConfig.target, 'FORCE');
            
            // Reset mode
            APP_STATE.mode = 'NORMAL';
            APP_STATE.forceConfig.count = APP_STATE.forceConfig.initialCount; // Ou reset total ? "L'appli calcule...". Reset total plus logique.
        } else {
             // Scroll "dummy", on ne fait rien, c'est un mot aléatoire
             saveToHistory(word, 'NORMAL'); // On log les faux essais ? Non, on log que le final généralement.
        }
    } 
    else if (APP_STATE.mode === 'VRTX') {
        // VRTX Mode : On doit forcer une lettre spécifique
        // On récupère le mot source et l'index actuel
        const sourceWord = APP_STATE.vrtxConfig.word;
        const targetRank = APP_STATE.vrtxConfig.rank; // 1-based (ex: 4)
        const charIndex = APP_STATE.vrtxConfig.index; // 0-based
        
        if (charIndex < sourceWord.length) {
            const targetLetter = sourceWord[charIndex];
            
            // On cherche un mot qui a 'targetLetter' à la position 'targetRank'
            // Et qui n'est PAS le mot source lui-même
            const potentialWords = window.WORDS_BY_RANK[targetRank][targetLetter];
            
            if (potentialWords && potentialWords.length > 0) {
                // Filtrer le mot source pour ne pas qu'il apparaisse
                const filtered = potentialWords.filter(w => w !== sourceWord);
                const randomWord = filtered[Math.floor(Math.random() * filtered.length)];
                
                // INJECTION
                elementDom.innerText = randomWord;
                
                // Incrémenter pour le prochain scroll
                APP_STATE.vrtxConfig.index++;
                
                saveToHistory(randomWord, 'VRTX');
                sendToFirebase(randomWord, 'VRTX');
            } else {
                console.error("Pas de mot trouvé pour VRTX", targetLetter, targetRank);
                // Fallback
                saveToHistory(word, 'NORMAL');
                sendToFirebase(word, 'NORMAL');
            }
            
            // Si on a fini le mot
            if (APP_STATE.vrtxConfig.index >= sourceWord.length) {
                 APP_STATE.mode = 'NORMAL';
            }
        }
    } 
    else {
        // Mode Normal
        saveToHistory(word, 'NORMAL');
        sendToFirebase(word, 'NORMAL');
    }
}


// --- GESTION DES TRIGGERS ET MODALES ---

function setupTriggers() {
    const zones = ['left', 'center', 'right'];
    const actions = {
        'left': () => openModal('force'),
        'center': () => openModal('history'),
        'right': () => openModal('vrtx')
    };

    zones.forEach(zone => {
        const el = document.getElementById(`trigger-${zone}`);
        let clickCount = 0;
        let clickTimer = null;
        let longPressTimer = null;

        // Triple Click Logic
        el.addEventListener('click', () => {
            clickCount++;
            clearTimeout(clickTimer);
            clickTimer = setTimeout(() => clickCount = 0, 400);
            if (clickCount === 3) {
                actions[zone]();
                clickCount = 0;
            }
        });

        // Long Press Logic
        el.addEventListener('mousedown', () => {
            longPressTimer = setTimeout(() => actions[zone](), 1500);
        });
        el.addEventListener('mouseup', () => clearTimeout(longPressTimer));
        el.addEventListener('touchstart', () => {
            longPressTimer = setTimeout(() => actions[zone](), 1500);
        });
        el.addEventListener('touchend', () => clearTimeout(longPressTimer));
    });

    // Close Modal Overlay
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'modal-overlay') {
            closeModals();
        }
    });
}

function openModal(type) {
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.querySelectorAll('.modal-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(`modal-${type}`).classList.remove('hidden');
    
    if(type === 'history') updateHistoryUI();
}

function closeModals() {
    document.getElementById('modal-overlay').classList.add('hidden');
}

function setupModals() {
    // --- FORCE SETUP ---
    const forceCountContainer = document.getElementById('force-count-group');
    for(let i=1; i<=6; i++) {
        const btn = document.createElement('div');
        btn.className = 'radio-btn';
        btn.innerText = i;
        btn.onclick = () => {
            document.querySelectorAll('#force-count-group .radio-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            APP_STATE.forceConfig.initialCount = i;
        };
        forceCountContainer.appendChild(btn);
    }

    document.getElementById('btn-force-activate').addEventListener('click', () => {
        const word = document.getElementById('force-word-input').value.toUpperCase().trim();
        if(word && APP_STATE.forceConfig.initialCount > 0) {
            APP_STATE.mode = 'FORCE';
            APP_STATE.forceConfig.target = word;
            APP_STATE.forceConfig.count = APP_STATE.forceConfig.initialCount;
            closeModals();
            alert("FORCE MODE ACTIVATED"); // Feedback subtil possible (vibration)
        }
    });

    // --- VRTX SETUP ---
    const vrtxInput = document.getElementById('vrtx-word-input');
    vrtxInput.addEventListener('input', (e) => {
        const len = e.target.value.length;
        document.getElementById('vrtx-counter').innerText = `(${len})`;
    });

    const vrtxRankContainer = document.getElementById('vrtx-rank-group');
    for(let i=1; i<=6; i++) {
        const btn = document.createElement('div');
        btn.className = 'radio-btn';
        btn.innerText = i;
        btn.onclick = () => {
            document.querySelectorAll('#vrtx-rank-group .radio-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            APP_STATE.vrtxConfig.rank = i;
        };
        vrtxRankContainer.appendChild(btn);
    }

    document.getElementById('btn-vrtx-activate').addEventListener('click', () => {
        const word = vrtxInput.value.toUpperCase().trim();
        if(word && APP_STATE.vrtxConfig.rank > 0) {
            APP_STATE.mode = 'VRTX';
            APP_STATE.vrtxConfig.word = word;
            APP_STATE.vrtxConfig.index = 0;
            closeModals();
            alert("VRTX MODE ACTIVATED");
        }
    });

    // --- HISTORY SETUP ---
    document.getElementById('btn-clear-history').addEventListener('click', () => {
        APP_STATE.history = [];
        updateHistoryUI();
    });

    // Theme Toggle
    document.getElementById('theme-toggle').addEventListener('click', () => {
        isDarkMode = !isDarkMode;
        document.body.className = isDarkMode ? 'theme-dark' : 'theme-light';
    });
}

function updateHistoryUI() {
    const list = document.getElementById('history-list');
    list.innerHTML = '';
    APP_STATE.history.slice().reverse().forEach(item => {
        const li = document.createElement('li');
        li.innerText = item.word;
        if(item.type !== 'NORMAL') li.classList.add('forced');
        list.appendChild(li);
    });
}

function saveToHistory(word, type) {
    APP_STATE.history.push({ word, type });
    if(APP_STATE.history.length > 10) APP_STATE.history.shift();
}

// --- FIREBASE INTEGRATION ---

async function sendToFirebase(word, type) {
    if (!window.db) return;
    
    try {
        await window.addDoc(window.collection(window.db, "history"), {
            word: word,
            type: type,
            timestamp: window.serverTimestamp()
        });
    } catch (e) {
        console.error("Error adding document: ", e);
    }
}

function setupWheel() {
    // Basic setup already handled in render
}

// Lancement
init();