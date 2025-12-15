// --- CONFIGURATION INITIALE ---
const ITEM_HEIGHT = 60; 
let currentLanguage = "FR";
let isDarkMode = true;

// LISTE ANGLAISE DE SECOURS (Pour affichage propre sans "THE")
const WORDS_EN = [
    "APPLE", "BRIDGE", "CLOUD", "DREAM", "EAGLE", "FIRE", "GHOST", "HOUSE", 
    "ISLAND", "JUNGLE", "KNIFE", "LEMON", "MAGIC", "NIGHT", "OCEAN", "PIANO", 
    "QUEEN", "RIVER", "SNAKE", "TIGER", "UMBRELLA", "VOICE", "WATER", "XRAY", 
    "YELLOW", "ZEBRA", "BOOK", "CHAIR", "TABLE", "PHONE", "MUSIC", "LIGHT",
    "SHADOW", "STORM", "WINTER", "SUMMER", "SPRING", "AUTUMN", "PAPER", "PEN",
    "GLASS", "DOOR", "WINDOW", "FLOOR", "ROOF", "GARDEN", "STREET", "CITY"
];

// --- ETAT DE L'APPLICATION ---
const APP_STATE = {
    mode: "NORMAL", // NORMAL, FORCE, VRTX
    forceConfig: { target: "", count: 0, initialCount: 0 },
    vrtxConfig: { word: "", rank: 0, index: 0 },
    history: [],
    isScrolling: false,
    scrollTimeout: null,
    // Pour l'optimisation du scroll (Debounce visual updates)
    ticking: false 
};

// Références DOM
const wheel = document.getElementById('wheel');
const langBtn = document.getElementById('lang-toggle');
const themeBtn = document.getElementById('theme-toggle');

// --- INITIALISATION ---
function init() {
    setupTriggers();
    setupModals();
    
    // Génération initiale
    renderWheel();
    
    // Centrage initial
    // On attend un tick pour que le DOM soit prêt
    requestAnimationFrame(() => {
        // Scroll initial au milieu de la liste virtuelle
        wheel.scrollTop = ITEM_HEIGHT * 50; 
        updateVisuals(); // Force le premier rendu visuel
    });

    setupScrollLogic();
}

// --- GESTION DES DONNÉES & LANGUES ---
function getWordList() {
    if (currentLanguage === "FR") {
        return window.WORDS || ["ERREUR_DATA"];
    } else {
        // Utilisation de la liste propre définie en haut
        return WORDS_EN; 
    }
}

function toggleLanguage() {
    currentLanguage = currentLanguage === "FR" ? "EN" : "FR";
    langBtn.innerText = currentLanguage;
    
    // On garde la position relative
    const currentScroll = wheel.scrollTop;
    
    renderWheel();
    
    // On remet le scroll
    wheel.scrollTop = currentScroll;
}

// --- RENDU DE LA ROUE ---
function renderWheel() {
    const words = getWordList();
    if(!words || words.length === 0) return;

    // On répète la liste pour créer l'illusion d'infini
    // 200 répétitions de la liste de base
    let html = "";
    const repeatCount = 200; 
    
    for(let i=0; i<repeatCount; i++) {
        // On mélange un peu l'ordre visuel global ou on répète juste la liste
        // Pour la performance, concaténation de string simple
        for(let w of words) {
            html += `<li>${w}</li>`;
        }
    }
    wheel.innerHTML = html;
}

// --- COEUR DU SYSTÈME : SCROLL OPTIMISÉ ---

function setupScrollLogic() {
    
    // 1. OPTIMISATION DU RENDU (requestAnimationFrame)
    wheel.addEventListener('scroll', () => {
        if (!APP_STATE.ticking) {
            window.requestAnimationFrame(() => {
                updateVisuals();
                APP_STATE.ticking = false;
            });
            APP_STATE.ticking = true;
        }
        
        // Gestion de l'état "en scroll"
        clearTimeout(APP_STATE.scrollTimeout);
        APP_STATE.isScrolling = true;
        
        // Détection fin de scroll (Snap)
        APP_STATE.scrollTimeout = setTimeout(() => {
            APP_STATE.isScrolling = false;
            snapAndValidate();
        }, 80); // 80ms sans mouvement = arrêt
    }, { passive: true }); // Passive true améliore les perfs sur mobile
}

function updateVisuals() {
    const center = wheel.scrollTop + (wheel.clientHeight / 2);
    // On ne sélectionne que les éléments visibles pour iterer (grossièrement)
    // Astuce perf: on n'interroge pas le DOM pour TOUS les éléments.
    // On calcule l'index théorique visible.
    
    const elements = wheel.children;
    const totalElements = elements.length;
    
    // Index approximatif au centre
    const centerIndex = Math.floor(center / ITEM_HEIGHT);
    
    // On boucle seulement sur les voisins (+/- 5 items)
    const range = 6;
    const start = Math.max(0, centerIndex - range);
    const end = Math.min(totalElements - 1, centerIndex + range);

    for (let i = start; i <= end; i++) {
        const el = elements[i];
        const elCenter = el.offsetTop + (el.clientHeight / 2);
        const dist = Math.abs(center - elCenter);
        
        // Formule mathématique pour l'effet loupe
        if (dist < ITEM_HEIGHT) {
            const ratio = 1 - (dist / ITEM_HEIGHT);
            // Easing pour rendre ça moins linéaire
            const smoothRatio = ratio * ratio; 
            el.style.opacity = 0.4 + (smoothRatio * 0.6); // 0.4 -> 1.0
            el.style.transform = `scale(${0.9 + (smoothRatio * 0.3)}) translateZ(0)`; // 0.9 -> 1.2
            el.style.color = "var(--text-color)";
        } else {
            el.style.opacity = 0.3;
            el.style.transform = "scale(0.9) translateZ(0)";
            el.style.color = "var(--text-color)";
        }
    }
}

function snapAndValidate() {
    const itemH = ITEM_HEIGHT;
    const currentScroll = wheel.scrollTop;
    
    // Calcul de l'index le plus proche
    const targetIndex = Math.round(currentScroll / itemH);
    const targetScroll = targetIndex * itemH;

    // 1. ANTICIPATION MAGIQUE
    // On modifie le mot AVANT le snap visuel
    applyMagicLogic(targetIndex);

    // 2. SNAP DOUX
    // Si on est déjà très proche (<2px), pas besoin de scroller (évite micro-saut)
    if (Math.abs(currentScroll - targetScroll) > 1) {
        wheel.scrollTo({
            top: targetScroll,
            behavior: 'smooth'
        });
    }

    // 3. VALIDATION
    // On attend la fin du smooth scroll (environ 300ms)
    setTimeout(() => {
        // Calcul de l'élément réellement au centre (ajusté avec le padding)
        // Le padding CSS est de 50vh - 30px.
        // Donc le scrollTop 0 met le premier élément au centre.
        // targetIndex correspond directement à l'élément `li` indexé.
        const elements = wheel.children;
        const selectedElement = elements[targetIndex];
        
        if(selectedElement) {
            const word = selectedElement.innerText;
            const type = APP_STATE.lastMagicApplied || 'NORMAL';
            
            if(APP_STATE.lastLoggedWord !== word) {
                saveToHistory(word, type);
                sendToFirebase(word, type);
                APP_STATE.lastLoggedWord = word;
                APP_STATE.lastMagicApplied = null;
            }
        }
    }, 350);
}

function applyMagicLogic(targetIndex) {
    // targetIndex est l'index du LI qui sera au centre
    const elements = wheel.children;
    // Sécurité débordement
    if (targetIndex < 0 || targetIndex >= elements.length) return;
    
    const elementToChange = elements[targetIndex];

    // LOGIQUE FORCE
    if (APP_STATE.mode === 'FORCE') {
        APP_STATE.forceConfig.count--;
        
        if (APP_STATE.forceConfig.count <= 0) {
            if (elementToChange.innerText !== APP_STATE.forceConfig.target) {
                elementToChange.innerText = APP_STATE.forceConfig.target;
            }
            APP_STATE.lastMagicApplied = 'FORCE';
            APP_STATE.mode = 'NORMAL';
            APP_STATE.forceConfig.count = APP_STATE.forceConfig.initialCount; 
        }
    } 
    // LOGIQUE VRTX
    else if (APP_STATE.mode === 'VRTX') {
        const sourceWord = APP_STATE.vrtxConfig.word;
        const targetRank = APP_STATE.vrtxConfig.rank; 
        const charIndex = APP_STATE.vrtxConfig.index;

        if (charIndex < sourceWord.length) {
            const targetLetter = sourceWord[charIndex];
            
            let forcedWord = "ERREUR";
            
            // Recherche du mot
            if (window.WORDS_BY_RANK && window.WORDS_BY_RANK[targetRank] && window.WORDS_BY_RANK[targetRank][targetLetter]) {
                const candidates = window.WORDS_BY_RANK[targetRank][targetLetter];
                const filtered = candidates.filter(w => w !== sourceWord);
                if (filtered.length > 0) {
                    forcedWord = filtered[Math.floor(Math.random() * filtered.length)];
                } else {
                    forcedWord = candidates[0];
                }
            } else {
                // Fallback "intelligent" si pas de dico chargé: on prend un mot au pif et on hack l'affichage?
                // Non, on affiche juste un mot qui contient la lettre si possible, sinon fallback
                forcedWord = findWordWithLetterAt(targetLetter, targetRank);
            }

            elementToChange.innerText = forcedWord;
            APP_STATE.lastMagicApplied = 'VRTX';
            APP_STATE.vrtxConfig.index++;

            if (APP_STATE.vrtxConfig.index >= sourceWord.length) {
                APP_STATE.mode = 'NORMAL';
            }
        }
    }
}

// Fonction de secours si le dictionnaire complexe n'est pas là
function findWordWithLetterAt(letter, rank) {
    // Essaye de trouver dans la liste courante un mot qui matche
    const list = getWordList();
    const matches = list.filter(w => w.length >= rank && w[rank-1] === letter);
    if(matches.length > 0) return matches[Math.floor(Math.random()*matches.length)];
    return "X" + letter + "X"; // Erreur visuelle mais fonctionnelle
}


// --- TRIGGERS & UI ---

function setupTriggers() {
    // Boutons Header
    themeBtn.onclick = () => {
        isDarkMode = !isDarkMode;
        document.body.className = isDarkMode ? 'theme-dark' : 'theme-light';
        themeBtn.innerText = isDarkMode ? '☀️' : '🌙';
    };

    langBtn.onclick = toggleLanguage;

    // Zones Secrètes - LOGIQUE CORRIGÉE POUR MOBILE
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

        // Gestionnaire unifié pour Click (Desktop) et Touch (Mobile)
        // On utilise 'pointerdown' si disponible, sinon fallback
        
        el.addEventListener('click', (e) => {
            // Triple click logic
            clickCount++;
            clearTimeout(clickTimer);
            clickTimer = setTimeout(() => clickCount = 0, 500); // 500ms délai
            
            if (clickCount === 3) {
                clickCount = 0;
                actions[zone]();
            }
        });

        // Long Press Logic
        const start = () => {
            longPressTimer = setTimeout(() => {
                actions[zone]();
                if(navigator.vibrate) navigator.vibrate(50);
            }, 1000);
        };
        const cancel = () => clearTimeout(longPressTimer);

        el.addEventListener('mousedown', start);
        el.addEventListener('mouseup', cancel);
        el.addEventListener('mouseleave', cancel);
        el.addEventListener('touchstart', start, { passive: true });
        el.addEventListener('touchend', cancel);
    });

    // Close Modal
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'modal-overlay') closeModals();
    });
}

function openModal(type) {
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.querySelectorAll('.modal-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(`modal-${type}`).classList.remove('hidden');
    
    // Focus input
    setTimeout(() => {
        const input = document.querySelector(`#modal-${type} input`);
        if(input) input.focus();
    }, 100);

    if(type === 'history') updateHistoryUI();
}

function closeModals() {
    document.getElementById('modal-overlay').classList.add('hidden');
}

function setupModals() {
    // Génération boutons radio FORCE
    const forceGroup = document.getElementById('force-count-group');
    createRadioButtons(forceGroup, 6, (val) => APP_STATE.forceConfig.initialCount = val);

    document.getElementById('btn-force-activate').addEventListener('click', () => {
        const val = document.getElementById('force-word-input').value.trim().toUpperCase();
        if(val && APP_STATE.forceConfig.initialCount > 0) {
            APP_STATE.mode = 'FORCE';
            APP_STATE.forceConfig.target = val;
            APP_STATE.forceConfig.count = APP_STATE.forceConfig.initialCount;
            closeModals();
        }
    });

    // Génération boutons radio VRTX
    const vrtxInput = document.getElementById('vrtx-word-input');
    vrtxInput.addEventListener('input', (e) => {
        document.getElementById('vrtx-counter').innerText = `(${e.target.value.length})`;
    });

    const vrtxGroup = document.getElementById('vrtx-rank-group');
    createRadioButtons(vrtxGroup, 6, (val) => APP_STATE.vrtxConfig.rank = val);

    document.getElementById('btn-vrtx-activate').addEventListener('click', () => {
        const val = vrtxInput.value.trim().toUpperCase();
        if(val && APP_STATE.vrtxConfig.rank > 0) {
            APP_STATE.mode = 'VRTX';
            APP_STATE.vrtxConfig.word = val;
            APP_STATE.vrtxConfig.index = 0;
            closeModals();
        }
    });

    document.getElementById('btn-clear-history').addEventListener('click', () => {
        APP_STATE.history = [];
        updateHistoryUI();
    });
}

function createRadioButtons(container, count, callback) {
    container.innerHTML = '';
    for(let i=1; i<=count; i++) {
        const btn = document.createElement('div');
        btn.className = 'radio-btn';
        btn.innerText = i;
        btn.onclick = () => {
            Array.from(container.children).forEach(c => c.classList.remove('selected'));
            btn.classList.add('selected');
            callback(i);
        };
        container.appendChild(btn);
    }
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
    if(APP_STATE.history.length > 20) APP_STATE.history.shift();
}

// --- FIREBASE ---
async function sendToFirebase(word, type) {
    if (!window.db) return;
    try {
        await window.addDoc(window.collection(window.db, "history"), {
            word: word,
            type: type,
            timestamp: window.serverTimestamp()
        });
    } catch (e) { console.error(e); }
}

init();