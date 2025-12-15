document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const ITEM_HEIGHT = 60;
    let currentLanguage = "FR";
    let isDarkMode = true; // Sombre par défaut

    // Liste de secours si data.js échoue
    const FALLBACK_WORDS = ["ROUGE", "BLEU", "VERT", "JAUNE", "NOIR", "BLANC", "ORANGE", "VIOLET"];
    const WORDS_EN = ["APPLE", "BOOK", "CAT", "DOG", "EAGLE", "FIRE", "GHOST", "HOUSE", "IRON", "JUNGLE", "KING", "LION", "MAGIC", "NIGHT", "OCEAN", "PAPER", "QUEEN", "RIVER", "STORM", "TIGER", "UMBRELLA", "VOICE", "WATER", "XRAY", "YELLOW", "ZEBRA"];

    // --- ETAT ---
    const APP_STATE = {
        mode: "NORMAL",
        forceConfig: { target: "", count: 0, initialCount: 0 },
        vrtxConfig: { word: "", rank: 0, index: 0 },
        history: [],
        lastLoggedWord: "",
        lastMagicApplied: null,
        scrollTimeout: null,
        ticking: false
    };

    // --- ELEMENTS DOM ---
    const wheel = document.getElementById('wheel');
    const langBtn = document.getElementById('lang-toggle');
    const themeBtn = document.getElementById('theme-toggle');
    const modalOverlay = document.getElementById('modal-overlay');

    // --- INITIALISATION ---
    function init() {
        console.log("App initialized");
        setupTriggers();
        setupModals();
        
        // Rendu initial
        renderWheel();

        // Scroll initial au milieu
        setTimeout(() => {
            wheel.scrollTop = ITEM_HEIGHT * 50; 
            updateVisuals();
        }, 100);

        // Ecouteurs de scroll
        wheel.addEventListener('scroll', handleScroll, { passive: true });
    }

    function getWords() {
        if (currentLanguage === "EN") return WORDS_EN;
        // Vérifie si data.js a bien chargé window.WORDS
        return (window.WORDS && window.WORDS.length > 0) ? window.WORDS : FALLBACK_WORDS;
    }

    function renderWheel() {
    const words = getWords();
    if(!words || words.length === 0) return;

    // OPTIMISATION ANTI-CRASH
    // Si la liste est énorme (> 500 mots), on ne la répète que 5 fois.
    // Si la liste est petite, on la répète plus souvent pour l'illusion.
    const repeatCount = words.length > 500 ? 5 : 40;
    
    // Utilisation d'un tableau pour joindre les chaines (plus rapide que +=)
    let htmlParts = [];
    
    for(let i=0; i<repeatCount; i++) { 
        for(let w of words) {
            htmlParts.push(`<li>${w}</li>`);
        }
    }
    
    // Injection en une seule fois
    wheel.innerHTML = htmlParts.join('');
    
    console.log(`Roue chargée : ${words.length} mots répétés ${repeatCount} fois.`);
}

    // --- LOGIQUE SCROLL & MAGIE ---

    function handleScroll() {
        if (!APP_STATE.ticking) {
            window.requestAnimationFrame(() => {
                updateVisuals();
                APP_STATE.ticking = false;
            });
            APP_STATE.ticking = true;
        }

        clearTimeout(APP_STATE.scrollTimeout);
        
        // Détection arrêt du scroll (80ms sans mouvement)
        APP_STATE.scrollTimeout = setTimeout(snapAndValidate, 80);
    }

    function updateVisuals() {
        const center = wheel.scrollTop + (wheel.clientHeight / 2);
        const elements = wheel.children;
        const centerIndex = Math.floor(center / ITEM_HEIGHT);
        
        // Optimisation : boucle seulement sur les éléments visibles (+/- 6)
        const start = Math.max(0, centerIndex - 6);
        const end = Math.min(elements.length - 1, centerIndex + 6);

        for (let i = start; i <= end; i++) {
            const el = elements[i];
            const elCenter = el.offsetTop + (el.clientHeight / 2);
            const dist = Math.abs(center - elCenter);

            if (dist < ITEM_HEIGHT) {
                // Centre : Gros et opaque
                const ratio = 1 - (dist / ITEM_HEIGHT);
                el.style.opacity = 0.5 + (ratio * 0.5);
                el.style.transform = `scale(${1 + (ratio * 0.2)}) translateZ(0)`;
                el.style.color = "var(--text-color)";
            } else {
                // Bords : Petit et transparent
                el.style.opacity = 0.3;
                el.style.transform = "scale(0.9) translateZ(0)";
                el.style.color = "var(--text-color)";
            }
        }
    }

    function snapAndValidate() {
        const currentScroll = wheel.scrollTop;
        const targetIndex = Math.round(currentScroll / ITEM_HEIGHT);
        const targetScroll = targetIndex * ITEM_HEIGHT;

        // 1. ANTICIPATION (Changer le mot AVANT le snap visuel)
        applyMagic(targetIndex);

        // 2. SNAP (Alignement fluide)
        if (Math.abs(currentScroll - targetScroll) > 1) {
            wheel.scrollTo({ top: targetScroll, behavior: 'smooth' });
        }

        // 3. VALIDATION (Après stabilisation)
        setTimeout(() => {
            // Index réel au centre (dépend du padding CSS)
            // Padding top = 50vh - 30px. 
            // Donc l'élément à 'targetIndex' EST celui au centre.
            const el = wheel.children[targetIndex];
            if (el) {
                const word = el.innerText;
                const type = APP_STATE.lastMagicApplied || 'NORMAL';
                
                if (APP_STATE.lastLoggedWord !== word) {
                    saveToHistory(word, type);
                    sendFirebase(word, type);
                    APP_STATE.lastLoggedWord = word;
                    APP_STATE.lastMagicApplied = null;
                }
            }
        }, 300);
    }

    function applyMagic(targetIndex) {
        const el = wheel.children[targetIndex];
        if (!el) return;

        // MODE FORCE
        if (APP_STATE.mode === 'FORCE') {
            APP_STATE.forceConfig.count--;
            if (APP_STATE.forceConfig.count <= 0) {
                // Changement discret
                if (el.innerText !== APP_STATE.forceConfig.target) {
                    el.innerText = APP_STATE.forceConfig.target;
                }
                APP_STATE.lastMagicApplied = 'FORCE';
                APP_STATE.mode = 'NORMAL'; // Reset
                APP_STATE.forceConfig.count = APP_STATE.forceConfig.initialCount;
            }
        }
        // MODE VRTX
        else if (APP_STATE.mode === 'VRTX') {
            const source = APP_STATE.vrtxConfig.word;
            const rank = APP_STATE.vrtxConfig.rank;
            const idx = APP_STATE.vrtxConfig.index;

            if (idx < source.length) {
                const letter = source[idx];
                let forcedWord = "X" + letter + "X"; // Fallback

                // Recherche dans data.js
                if (window.WORDS_BY_RANK && window.WORDS_BY_RANK[rank] && window.WORDS_BY_RANK[rank][letter]) {
                    const candidates = window.WORDS_BY_RANK[rank][letter];
                    // Eviter le mot source
                    const filtered = candidates.filter(w => w !== source);
                    if (filtered.length > 0) {
                        forcedWord = filtered[Math.floor(Math.random() * filtered.length)];
                    } else {
                        forcedWord = candidates[0];
                    }
                }

                el.innerText = forcedWord;
                APP_STATE.lastMagicApplied = 'VRTX';
                APP_STATE.vrtxConfig.index++;

                if (APP_STATE.vrtxConfig.index >= source.length) {
                    APP_STATE.mode = 'NORMAL';
                }
            }
        }
    }

    // --- UI & TRIGGERS ---

    langBtn.onclick = () => {
        currentLanguage = currentLanguage === "FR" ? "EN" : "FR";
        langBtn.innerText = currentLanguage;
        // Garder la position
        const scrollRatio = wheel.scrollTop / wheel.scrollHeight;
        renderWheel();
        wheel.scrollTop = scrollRatio * wheel.scrollHeight;
    };

    themeBtn.onclick = () => {
        isDarkMode = !isDarkMode;
        document.body.className = isDarkMode ? 'theme-dark' : 'theme-light';
        themeBtn.innerText = isDarkMode ? '☀️' : '🌙';
    };

    function setupTriggers() {
        const setupZone = (id, callback) => {
            const el = document.getElementById(id);
            let clicks = 0;
            let timer;

            // Triple Clic Desktop
            el.addEventListener('click', () => {
                clicks++;
                clearTimeout(timer);
                timer = setTimeout(() => clicks = 0, 400);
                if (clicks === 3) {
                    callback();
                    clicks = 0;
                }
            });

            // Long Press Mobile
            let pressTimer;
            const start = (e) => {
               // e.preventDefault(); // Attention: empêche le scroll si mal placé
               pressTimer = setTimeout(() => {
                   callback();
                   if(navigator.vibrate) navigator.vibrate(50);
               }, 1000);
            };
            const cancel = () => clearTimeout(pressTimer);

            el.addEventListener('touchstart', start, {passive: true});
            el.addEventListener('touchend', cancel);
            el.addEventListener('mousedown', start);
            el.addEventListener('mouseup', cancel);
        };

        setupZone('trigger-left', () => openModal('force'));
        setupZone('trigger-center', () => openModal('history'));
        setupZone('trigger-right', () => openModal('vrtx'));

        modalOverlay.addEventListener('click', (e) => {
            if(e.target === modalOverlay) closeModal();
        });
    }

    function openModal(id) {
        modalOverlay.classList.remove('hidden');
        document.querySelectorAll('.modal-content').forEach(d => d.classList.add('hidden'));
        document.getElementById('modal-' + id).classList.remove('hidden');
        if(id === 'history') renderHistory();
    }

    function closeModal() {
        modalOverlay.classList.add('hidden');
    }

    function setupModals() {
        // FORCE
        const forceGroup = document.getElementById('force-count-group');
        createRadios(forceGroup, 6, val => APP_STATE.forceConfig.initialCount = val);
        document.getElementById('btn-force-activate').onclick = () => {
            const val = document.getElementById('force-word-input').value.toUpperCase().trim();
            if(val && APP_STATE.forceConfig.initialCount > 0) {
                APP_STATE.mode = 'FORCE';
                APP_STATE.forceConfig.target = val;
                APP_STATE.forceConfig.count = APP_STATE.forceConfig.initialCount;
                closeModal();
            }
        };

        // VRTX
        const vrtxGroup = document.getElementById('vrtx-rank-group');
        createRadios(vrtxGroup, 6, val => APP_STATE.vrtxConfig.rank = val);
        const vrtxInput = document.getElementById('vrtx-word-input');
        vrtxInput.oninput = (e) => document.getElementById('vrtx-counter').innerText = `(${e.target.value.length})`;
        
        document.getElementById('btn-vrtx-activate').onclick = () => {
            const val = vrtxInput.value.toUpperCase().trim();
            if(val && APP_STATE.vrtxConfig.rank > 0) {
                APP_STATE.mode = 'VRTX';
                APP_STATE.vrtxConfig.word = val;
                APP_STATE.vrtxConfig.index = 0;
                closeModal();
            }
        };

        // HISTORY
        document.getElementById('btn-clear-history').onclick = () => {
            APP_STATE.history = [];
            renderHistory();
        };
    }

    function createRadios(container, n, cb) {
        container.innerHTML = "";
        for(let i=1; i<=n; i++) {
            const d = document.createElement('div');
            d.className = 'radio-btn';
            d.innerText = i;
            d.onclick = () => {
                container.querySelectorAll('.radio-btn').forEach(b => b.classList.remove('selected'));
                d.classList.add('selected');
                cb(i);
            };
            container.appendChild(d);
        }
    }

    function renderHistory() {
        const ul = document.getElementById('history-list');
        ul.innerHTML = "";
        [...APP_STATE.history].reverse().forEach(h => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${h.word}</span> <small>${h.type}</small>`;
            if(h.type !== 'NORMAL') li.classList.add('forced');
            ul.appendChild(li);
        });
    }

    function saveToHistory(word, type) {
        APP_STATE.history.push({word, type});
        if(APP_STATE.history.length > 20) APP_STATE.history.shift();
    }

    async function sendFirebase(word, type) {
        if(window.addDoc && window.db) {
            try {
                await window.addDoc(window.collection(window.db, "history"), {
                    word: word, type: type, timestamp: window.serverTimestamp()
                });
            } catch(e) { console.log("Firebase inactive"); }
        }
    }

    // Start
    init();
});