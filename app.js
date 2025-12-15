// --- CONFIGURATION INITIALE ---
const ITEM_HEIGHT = 60; 
const BUFFER_SIZE = 1000; // Liste suffisamment longue
let currentLanguage = "FR";
let isDarkMode = true; // Sombre par défaut

// --- ETAT DE L'APPLICATION ---
const APP_STATE = {
    mode: "NORMAL", // NORMAL, FORCE, VRTX
    forceConfig: { target: "", count: 0, initialCount: 0 },
    vrtxConfig: { word: "", rank: 0, index: 0 },
    history: [],
    isScrolling: false,
    scrollTimeout: null,
    lastScrollTop: 0
};

// Références DOM
const wheel = document.getElementById('wheel');
const langBtn = document.getElementById('lang-toggle');
const themeBtn = document.getElementById('theme-toggle');

// --- INITIALISATION ---
function init() {
    setupTriggers();
    setupModals();
    setupWheelLogic();
    
    // Génération initiale
    renderWheel();
    
    // Centrage initial (loin dans la liste pour effet infini)
    setTimeout(() => {
        wheel.scrollTop = ITEM_HEIGHT * 500; 
    }, 50);
}

// --- GESTION DES DONNÉES & LANGUES ---
function getWordList() {
    // Si data.js ne contient que du français, on simule l'anglais pour la démo
    // ou on utilise une propriété data.js si elle existe.
    if (currentLanguage === "FR") {
        return window.WORDS || ["ERREUR"];
    } else {
        // Simulation d'une liste anglaise si window.WORDS_EN n'existe pas
        if (window.WORDS_EN) return window.WORDS_EN;
        
        // Fallback: On prend les mots FR et on ajoute "THE" devant pour simuler
        // Idéalement, ajoutez une liste WORDS_EN dans votre data.js
        return (window.WORDS || []).map(w => "THE " + w); 
    }
}

function toggleLanguage() {
    currentLanguage = currentLanguage === "FR" ? "EN" : "FR";
    langBtn.innerText = currentLanguage;
    
    // Sauvegarder la position relative pour ne pas perdre le fil visuel
    const currentIndex = Math.round(wheel.scrollTop / ITEM_HEIGHT);
    
    renderWheel();
    
    // Restaurer position
    wheel.scrollTop = currentIndex * ITEM_HEIGHT;
}

// --- RENDU DE LA ROUE ---
function renderWheel() {
    const words = getWordList();
    if(words.length === 0) return;

    // On génère une très longue liste HTML (Virtual DOM light)
    // 2000 items suffisent pour une session
    let html = "";
    for(let i=0; i<2000; i++) {
        const word = words[i % words.length];
        html += `<li>${word}</li>`;
    }
    wheel.innerHTML = html;
}

// --- COEUR DU SYSTÈME : SCROLL & ANTICIPATION ---

function setupWheelLogic() {
    
    // 1. Détection Visuelle (Opacité/Taille)
    wheel.addEventListener('scroll', () => {
        const center = wheel.scrollTop + (wheel.clientHeight / 2);
        const elements = wheel.children;
        
        // Optimisation : on ne boucle que sur les éléments visibles (+/- marge)
        const startIndex = Math.floor(wheel.scrollTop / ITEM_HEIGHT);
        const endIndex = startIndex + Math.ceil(wheel.clientHeight / ITEM_HEIGHT) + 1;

        for (let i = startIndex; i <= endIndex; i++) {
            const el = elements[i];
            if(!el) continue;

            const elCenter = el.offsetTop + (el.clientHeight / 2);
            const dist = Math.abs(center - elCenter);
            
            // Effet "Fish Eye" / Loupe
            if (dist < ITEM_HEIGHT) {
                // Centre exact
                const ratio = 1 - (dist / ITEM_HEIGHT);
                el.style.opacity = 0.5 + (ratio * 0.5); // 0.5 -> 1.0
                el.style.transform = `scale(${1 + (ratio * 0.2)})`; // 1.0 -> 1.2
                el.style.fontWeight = '700';
            } else {
                // En dehors
                el.style.opacity = 0.3;
                el.style.transform = "scale(0.95)";
                el.style.fontWeight = '400';
            }
        }
    });

    // 2. Gestion de l'arrêt (Snap logic)
    wheel.addEventListener('scroll', handleScrollEvents);
}

function handleScrollEvents() {
    clearTimeout(APP_STATE.scrollTimeout);
    APP_STATE.isScrolling = true;
    
    // Détection de la fin du scroll
    APP_STATE.scrollTimeout = setTimeout(() => {
        APP_STATE.isScrolling = false;
        snapAndValidate();
    }, 100); // Détection rapide
}

// Cette fonction aligne la roue ET gère la logique de magie
function snapAndValidate() {
    const currentScroll = wheel.scrollTop;
    const rawIndex = Math.round(currentScroll / ITEM_HEIGHT);
    const targetScroll = rawIndex * ITEM_HEIGHT;

    // 1. ANTICIPATION (Magie)
    // On modifie le mot AVANT que le scroll ne soit visuellement terminé/fixé
    applyMagicLogic(rawIndex);

    // 2. SNAP PHYSIQUE
    wheel.scrollTo({
        top: targetScroll,
        behavior: 'smooth'
    });

    // 3. VALIDATION FINALE (Après le snap)
    setTimeout(() => {
        // On récupère l'élément qui est physiquement au centre maintenant
        const elements = wheel.children;
        // L'index visuel au centre dépend de la hauteur du conteneur
        // Container ~5 items de haut. Le centre est à index + 2 environ.
        const centerOffset = Math.floor((wheel.clientHeight / ITEM_HEIGHT) / 2);
        const finalIndex = Math.round(wheel.scrollTop / ITEM_HEIGHT) + centerOffset;
        
        const selectedElement = elements[finalIndex];
        
        if(selectedElement) {
            // Envoi Firebase et Historique
            const word = selectedElement.innerText;
            // On vérifie si c'était un mot forcé pour le log
            const type = (APP_STATE.lastMagicApplied) ? APP_STATE.lastMagicApplied : 'NORMAL';
            
            // Éviter les doublons de logs si on bouge à peine
            if(APP_STATE.lastLoggedWord !== word) {
                saveToHistory(word, type);
                sendToFirebase(word, type);
                APP_STATE.lastLoggedWord = word;
                APP_STATE.lastMagicApplied = null; // Reset flag
            }
        }
    }, 350); // Attendre que le smooth scroll finisse
}

// Fonction qui remplace le mot à la volée
function applyMagicLogic(scrollIndex) {
    // L'élément qui SERA au centre après le snap
    const centerOffset = Math.floor((wheel.clientHeight / ITEM_HEIGHT) / 2);
    const targetIndex = scrollIndex + centerOffset;
    const elementToChange = wheel.children[targetIndex];

    if (!elementToChange) return;

    // --- LOGIQUE FORCE ---
    if (APP_STATE.mode === 'FORCE') {
        APP_STATE.forceConfig.count--;
        
        if (APP_STATE.forceConfig.count <= 0) {
            // C'est le moment ! On remplace le texte discrètement
            // Le mot n'est pas encore parfaitement au centre, c'est le moment idéal
            if (elementToChange.innerText !== APP_STATE.forceConfig.target) {
                elementToChange.innerText = APP_STATE.forceConfig.target;
            }
            APP_STATE.lastMagicApplied = 'FORCE';
            
            // Reset du mode après succès
            APP_STATE.mode = 'NORMAL';
            APP_STATE.forceConfig.count = APP_STATE.forceConfig.initialCount; 
        }
    } 
    // --- LOGIQUE VRTX ---
    else if (APP_STATE.mode === 'VRTX') {
        const sourceWord = APP_STATE.vrtxConfig.word;
        const targetRank = APP_STATE.vrtxConfig.rank; 
        const charIndex = APP_STATE.vrtxConfig.index;

        if (charIndex < sourceWord.length) {
            const targetLetter = sourceWord[charIndex];
            
            // Trouver un mot valide dans data.js
            let forcedWord = "ERREUR";
            
            // Vérifions si WORDS_BY_RANK existe (data.js)
            if (window.WORDS_BY_RANK && window.WORDS_BY_RANK[targetRank] && window.WORDS_BY_RANK[targetRank][targetLetter]) {
                const candidates = window.WORDS_BY_RANK[targetRank][targetLetter];
                // Filtrer pour ne pas tomber sur le mot source lui-même (trop évident)
                const filtered = candidates.filter(w => w !== sourceWord);
                if (filtered.length > 0) {
                    forcedWord = filtered[Math.floor(Math.random() * filtered.length)];
                } else {
                    forcedWord = candidates[0];
                }
            } else {
                // Fallback si pas de mot trouvé (pour éviter le crash)
                forcedWord = "X" + targetLetter + "X"; 
            }

            // Injection
            elementToChange.innerText = forcedWord;
            
            APP_STATE.lastMagicApplied = 'VRTX';
            APP_STATE.vrtxConfig.index++;

            // Fin du mot ?
            if (APP_STATE.vrtxConfig.index >= sourceWord.length) {
                APP_STATE.mode = 'NORMAL';
            }
        }
    }
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

    // Zones Secrètes
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

        // Triple Click
        el.addEventListener('click', () => {
            clickCount++;
            clearTimeout(clickTimer);
            clickTimer = setTimeout(() => clickCount = 0, 400);
            if (clickCount === 3) {
                actions[zone]();
                clickCount = 0;
            }
        });

        // Long Press (Mobile)
        const startPress = (e) => {
            // e.preventDefault(); // Optionnel, peut bloquer le scroll si mal placé
            longPressTimer = setTimeout(() => {
                actions[zone]();
                // Vibration feedback si supporté
                if(navigator.vibrate) navigator.vibrate(50);
            }, 1000); // 1 seconde
        };
        const endPress = () => clearTimeout(longPressTimer);

        el.addEventListener('mousedown', startPress);
        el.addEventListener('mouseup', endPress);
        el.addEventListener('mouseleave', endPress);
        el.addEventListener('touchstart', startPress, {passive: true});
        el.addEventListener('touchend', endPress);
    });

    // Fermeture Modale
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'modal-overlay') closeModals();
    });
}

function openModal(type) {
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.querySelectorAll('.modal-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(`modal-${type}`).classList.remove('hidden');
    
    // Focus auto sur l'input si présent
    const input = document.querySelector(`#modal-${type} input`);
    if(input) input.focus();

    if(type === 'history') updateHistoryUI();
}

function closeModals() {
    document.getElementById('modal-overlay').classList.add('hidden');
}

function setupModals() {
    // FORCE MODE UI
    const forceGroup = document.getElementById('force-count-group');
    createRadioButtons(forceGroup, 6, (val) => APP_STATE.forceConfig.initialCount = val);

    document.getElementById('btn-force-activate').addEventListener('click', () => {
        const val = document.getElementById('force-word-input').value.trim().toUpperCase();
        if(val && APP_STATE.forceConfig.initialCount > 0) {
            APP_STATE.mode = 'FORCE';
            APP_STATE.forceConfig.target = val;
            APP_STATE.forceConfig.count = APP_STATE.forceConfig.initialCount;
            closeModals();
            // Pas d'alerte, c'est secret !
        }
    });

    // VRTX MODE UI
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

    // HISTORY UI
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
        li.innerText = `${item.word}`;
        if(item.type !== 'NORMAL') {
            li.classList.add('forced');
            li.innerHTML += ` <small>(${item.type})</small>`;
        }
        list.appendChild(li);
    });
}

function saveToHistory(word, type) {
    APP_STATE.history.push({ word, type, time: new Date() });
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
    } catch (e) { console.error("Firebase Error", e); }
}

// Start
init();
