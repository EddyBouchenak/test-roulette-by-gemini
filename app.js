document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIG ---
    const ITEM_HEIGHT = 60;
    const DISPLAY_LIMIT = 300; // Nombre max d'éléments dans la liste pour éviter l'écran noir
    let currentLanguage = "FR";
    let isDarkMode = true;

    // Fallback si data.js plante ou est vide
    const FALLBACK_WORDS = ["ROUGE", "BLEU", "VERT", "JAUNE", "NOIR", "BLANC", "ORANGE", "VIOLET"];
    // Dictionnaire Anglais manuel (au cas où data.js n'en a pas)
    const WORDS_EN = [
        "APPLE", "BOOK", "CLOUD", "DOOR", "EAGLE", "FIRE", "GHOST", "HOUSE", "IRON", "JUNGLE", 
        "KNIFE", "LIGHT", "MAGIC", "NIGHT", "OCEAN", "PAPER", "QUEEN", "RIVER", "STORM", "TIGER", 
        "UMBRELLA", "VOICE", "WATER", "XRAY", "YELLOW", "ZEBRA", "GARDEN", "STREET", "MUSIC", "PHONE"
    ];

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

    // --- DOM ---
    const wheel = document.getElementById('wheel');
    const langBtn = document.getElementById('lang-toggle');
    const themeBtn = document.getElementById('theme-toggle');
    const modalOverlay = document.getElementById('modal-overlay');

    // --- INITIALISATION ---
    function init() {
        console.log("App Started");
        setupTriggers();
        setupModals();
        
        // Rendu initial
        renderWheel();

        // Centrage initial (avec petit délai pour le rendu)
        setTimeout(() => {
            // On se place au tiers de la liste
            wheel.scrollTop = ITEM_HEIGHT * 100;
            updateVisuals();
        }, 100);

        // Ecouteur de scroll optimisé
        wheel.addEventListener('scroll', handleScroll, { passive: true });
    }

    // --- RENDU INTELLIGENT ---
    function getWords() {
        if (currentLanguage === "EN") return WORDS_EN;
        // Vérifie si data.js est chargé
        return (window.WORDS && window.WORDS.length > 0) ? window.WORDS : FALLBACK_WORDS;
    }

    function renderWheel() {
        const sourceWords = getWords();
        let htmlParts = [];
        
        // On crée une liste de taille fixe (300 items) en bouclant sur les mots sources
        // Cela permet d'avoir un scroll fluide même si data.js contient 100,000 mots
        for(let i=0; i < DISPLAY_LIMIT; i++) {
            const word = sourceWords[i % sourceWords.length];
            htmlParts.push(`<li>${word}</li>`);
        }
        
        wheel.innerHTML = htmlParts.join('');
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
        // Si le scroll s'arrête pendant 60ms, on considère que c'est fini -> Snap
        APP_STATE.scrollTimeout = setTimeout(snapAndValidate, 60);
    }

    // Effet Loupe Visuel
    function updateVisuals() {
        const center = wheel.scrollTop + (wheel.clientHeight / 2);
        const centerIndex = Math.floor(center / ITEM_HEIGHT);
        const elements = wheel.children;

        // On ne boucle que sur les éléments visibles (+/- 6) pour la performance
        const start = Math.max(0, centerIndex - 6);
        const end = Math.min(elements.length - 1, centerIndex + 6);

        for (let i = start; i <= end; i++) {
            const el = elements[i];
            const elCenter = el.offsetTop + (el.clientHeight / 2);
            const dist = Math.abs(center - elCenter);

            if (dist < ITEM_HEIGHT) {
                const ratio = 1 - (dist / ITEM_HEIGHT);
                el.style.opacity = 0.4 + (ratio * 0.6); // 0.4 -> 1.0
                el.style.transform = `scale(${0.95 + (ratio * 0.25)}) translateZ(0)`;
                el.style.color = "var(--text-color)";
            } else {
                el.style.opacity = 0.3;
                el.style.transform = "scale(0.9) translateZ(0)";
                el.style.color = "var(--text-color)";
            }
        }
    }

    // Alignement et Injection du mot forcé
    function snapAndValidate() {
        const currentScroll = wheel.scrollTop;
        const targetIndex = Math.round(currentScroll / ITEM_HEIGHT);
        const targetScroll = targetIndex * ITEM_HEIGHT;

        // 1. ANTICIPATION (MAGIE)
        // On modifie le mot AVANT que le scroll ne soit visuellement calé
        applyMagic(targetIndex);

        // 2. SNAP
        if (Math.abs(currentScroll - targetScroll) > 1) {
            wheel.scrollTo({ top: targetScroll, behavior: 'smooth' });
        }

        // 3. VALIDATION (Après stabilisation)
        setTimeout(() => {
            // L'élément au centre physique correspond à l'index + offset du padding
            const centerOffset = Math.floor((wheel.clientHeight / ITEM_HEIGHT) / 2); // Devrait être 0 si padding calculé correctement, mais vérifions
            // Avec le padding CSS calc(50vh), le scrollTop 0 met l'index 0 au milieu.
            // Donc targetIndex est le bon.
            
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
        }, 250);
    }

    function applyMagic(targetIndex) {
        const el = wheel.children[targetIndex];
        if (!el) return;

        // FORCE MODE
        if (APP_STATE.mode === 'FORCE') {
            APP_STATE.forceConfig.count--;
            if (APP_STATE.forceConfig.count <= 0) {
                if (el.innerText !== APP_STATE.forceConfig.target) {
                    el.innerText = APP_STATE.forceConfig.target;
                }
                APP_STATE.lastMagicApplied = 'FORCE';
                APP_STATE.mode = 'NORMAL';
                APP_STATE.forceConfig.count = APP_STATE.forceConfig.initialCount;
            }
        }
        // VRTX MODE
        else if (APP_STATE.mode === 'VRTX') {
            const source = APP_STATE.vrtxConfig.word;
            const rank = APP_STATE.vrtxConfig.rank;
            const idx = APP_STATE.vrtxConfig.index;

            if (idx < source.length) {
                const letter = source[idx];
                let forcedWord = "X" + letter + "X";

                // Recherche dans data.js
                if (window.WORDS_BY_RANK && window.WORDS_BY_RANK[rank] && window.WORDS_BY_RANK[rank][letter]) {
                    const candidates = window.WORDS_BY_RANK[rank][letter];
                    const filtered = candidates.filter(w => w !== source);
                    if (filtered.length > 0) {
                        forcedWord = filtered[Math.floor(Math.random() * filtered.length)];
                    } else {
                        forcedWord = candidates[0];
                    }
                } else {
                    // Recherche basique si data.js n'a pas les rangs
                    const simpleList = getWords();
                    const matches = simpleList.filter(w => w.length >= rank && w[rank-1] === letter);
                    if(matches.length > 0) forcedWord = matches[Math.floor(Math.random() * matches.length)];
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

    // --- INTERACTION ---

    langBtn.onclick = () => {
        currentLanguage = currentLanguage === "FR" ? "EN" : "FR";
        langBtn.innerText = currentLanguage;
        // Sauvegarde position
        const ratio = wheel.scrollTop / wheel.scrollHeight;
        renderWheel();
        wheel.scrollTop = ratio * wheel.scrollHeight;
    };

    themeBtn.onclick = () => {
        isDarkMode = !isDarkMode;
        document.body.className = isDarkMode ? 'theme-dark' : 'theme-light';
        themeBtn.innerText = isDarkMode ? '☀️' : '🌙';
    };

    function setupTriggers() {
        const zones = {
            'trigger-left': () => openModal('force'),
            'trigger-center': () => openModal('history'),
            'trigger-right': () => openModal('vrtx')
        };

        for (const [id, action] of Object.entries(zones)) {
            const el = document.getElementById(id);
            let clicks = 0;
            let clickTimer;
            let pressTimer;

            // Triple Clic
            el.addEventListener('click', (e) => {
                clicks++;
                clearTimeout(clickTimer);
                clickTimer = setTimeout(() => clicks = 0, 400);
                if (clicks === 3) {
                    clicks = 0;
                    action();
                }
            });

            // Appui Long (Mobile)
            const start = () => {
                pressTimer = setTimeout(() => {
                    if(navigator.vibrate) navigator.vibrate(50);
                    action();
                }, 1000);
            };
            const end = () => clearTimeout(pressTimer);

            el.addEventListener('touchstart', start, {passive: true});
            el.addEventListener('touchend', end);
            el.addEventListener('mousedown', start);
            el.addEventListener('mouseup', end);
        }

        modalOverlay.addEventListener('click', (e) => {
            if(e.target === modalOverlay) closeModal();
        });
    }

    function openModal(id) {
        modalOverlay.classList.remove('hidden');
        document.querySelectorAll('.modal-content').forEach(c => c.classList.add('hidden'));
        document.getElementById('modal-' + id).classList.remove('hidden');
        
        // Focus sur l'input s'il y en a un
        const input = document.querySelector(`#modal-${id} input`);
        if(input) setTimeout(() => input.focus(), 100);

        if(id === 'history') renderHistory();
    }

    function closeModal() {
        modalOverlay.classList.add('hidden');
    }

    function setupModals() {
        // FORCE
        const forceGroup = document.getElementById('force-count-group');
        createRadios(forceGroup, 6, v => APP_STATE.forceConfig.initialCount = v);
        
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
        createRadios(vrtxGroup, 6, v => APP_STATE.vrtxConfig.rank = v);
        
        const vInput = document.getElementById('vrtx-word-input');
        vInput.oninput = (e) => document.getElementById('vrtx-counter').innerText = `(${e.target.value.length})`;

        document.getElementById('btn-vrtx-activate').onclick = () => {
            const val = vInput.value.toUpperCase().trim();
            if(val && APP_STATE.vrtxConfig.rank > 0) {
                APP_STATE.mode = 'VRTX';
                APP_STATE.vrtxConfig.word = val;
                APP_STATE.vrtxConfig.index = 0;
                closeModal();
            }
        };

        // History
        document.getElementById('btn-clear-history').onclick = () => {
            APP_STATE.history = [];
            renderHistory();
        };
    }

    function createRadios(container, count, cb) {
        container.innerHTML = "";
        for(let i=1; i<=count; i++) {
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
        const list = document.getElementById('history-list');
        list.innerHTML = "";
        [...APP_STATE.history].reverse().forEach(h => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${h.word}</span> <small style="opacity:0.5; font-size:0.8rem">${h.type}</small>`;
            if(h.type !== 'NORMAL') li.classList.add('forced');
            list.appendChild(li);
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
            } catch(e) {}
        }
    }

    init();
});