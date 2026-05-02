// --- State Management & Stepper Logic ---
let bookingDraft = {
    id: null, // ID Airtable si on édite un devis existant
    step: 'step-dates',
    type: 'perso',
    objective: 'strategy',
    dates: { start: null, end: null },
    group: { total: 0, adult: 0, child: 0, baby: 0 },
    sleeping: { mode: 'auto', indiv: 0, partage: 0, couple: 0 },
    meals: { type: 'libre', details: {}, checkedIndices: [] },
    options: { draps: false, menage: false, late: false, salle: false, kitSoiree: false, accueilLogistique: false },
    activities: { requested: false, type: '', budget: '', ambiance: '', message: '' },
    contact: { organisation: '', first: '', last: '', email: '', phone: '', msg: '' }
};

let isEditingMode = false;

function saveDraft() {
    const urlParams = new URLSearchParams(window.location.search);
    if (isEditingMode || urlParams.get('id') || urlParams.get('live') || document.body.dataset.loadingDraft === 'true') return;

    try {
        const draft = {};
        document.querySelectorAll('.workspace input, .workspace select, .workspace textarea').forEach(el => {
            if (el.id) {
                if (el.type === 'checkbox' || el.type === 'radio') draft[el.id] = el.checked;
                else draft[el.id] = el.value;
            }
        });
        
        draft['_currentMode'] = currentMode;
        if (startDate) draft['_startDate'] = startDate.toISOString();
        if (endDate) draft['_endDate'] = endDate.toISOString();

        draft['_savedAt'] = Date.now();
        localStorage.setItem('ds_expert_draft', JSON.stringify(draft));
    } catch(e) {}
}

function clearDraft() {
    localStorage.removeItem('ds_expert_draft');
    const banner = document.getElementById('draft-banner');
    if (banner) banner.style.display = 'none';
}

function restoreDraft() {
    const saved = localStorage.getItem('ds_expert_draft');
    if (!saved) return;
    
    document.body.dataset.loadingDraft = 'true';

    try {
        const draft = JSON.parse(saved);

        if (draft['_currentMode'] && draft['_currentMode'] !== currentMode) {
            setMode(draft['_currentMode']);
        }

        if (draft['_startDate'] && draft['_endDate']) {
            document.getElementById('nativeDateArrivee').value = draft['_startDate'].split('T')[0];
            document.getElementById('nativeDateDepart').value = draft['_endDate'].split('T')[0];
            handleNativeDateChange(); // Parses Dates, calls calculateNights -> calls renderMealsSchedule
        }

        setTimeout(() => {
            Object.keys(draft).forEach(id => {
                if (id.startsWith('_')) return;
                const el = document.getElementById(id);
                if (el) {
                    if (el.type === 'checkbox' || el.type === 'radio') el.checked = draft[id];
                    else el.value = draft[id];
                }
            });
            
            document.querySelectorAll('.gite-card input[type="checkbox"]').forEach(updateGiteSelection);
            
            // Masquer la bannière
            const banner = document.getElementById('draft-banner');
            if (banner) banner.style.display = 'none';

            updateCalculations();
            delete document.body.dataset.loadingDraft;
        }, 300);

    } catch (e) {
        console.error("Failed to restore draft", e);
        clearDraft();
        delete document.body.dataset.loadingDraft;
    }
}

function checkDraftBanner() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('id') || urlParams.get('live')) {
        localStorage.removeItem('ds_expert_draft');
        return;
    }
    const saved = localStorage.getItem('ds_expert_draft');
    if (saved) {
        const banner = document.getElementById('draft-banner');
        if (banner) banner.style.display = 'flex';
    }
}

async function loadFromAirtable(recordId) {
    console.log(`[EDIT] Chargement du devis ${recordId} depuis Airtable...`);
    try {
        // On utilise un cache-buster pour être sûr d'avoir la donnée fraîche
        const response = await fetch(`${API_RESERVATIONS_URL}?id=${recordId}&t=${Date.now()}`);
        if (!response.ok) throw new Error("Impossible de charger le devis");

        const data = await response.json();
        const record = data.records ? data.records[0] : data;
        if (!record || !record.fields) throw new Error("Devis introuvable");

        const fields = record.fields;
        isEditingMode = true;
        bookingDraft.id = recordId;

        // --- 1. Basic Fields Mapping ---
        if (fields["Date arrivée"]) {
            startDate = new Date(fields["Date arrivée"]);
            currentMonth = new Date(fields["Date arrivée"]);
        }
        if (fields["Date départ"]) endDate = new Date(fields["Date départ"]);

        const nbPers = fields["Nombre de personnes"] || fields["Nb personnes"] || 0;
        document.getElementById('nbTotal').value = nbPers;
        if (document.getElementById('nbAdult')) document.getElementById('nbAdult').value = nbPers;

        // Organisation / Société
        const orgVal = fields["Entreprise"] || fields["Organisation"] || fields["Société"] || '';
        document.getElementById('organisation').value = orgVal;

        // Parse Nom client (Format: "Entreprise (Prénom Nom)")
        const nomClient = fields["Nom client"] || "";
        if (nomClient.includes('(')) {
            const parts = nomClient.split(' (');
            if (!orgVal) document.getElementById('organisation').value = parts[0];
            const contact = parts[1].replace(')', '');
            document.getElementById('firstname').value = contact.split(' ')[0] || "";
            document.getElementById('lastname').value = contact.split(' ').slice(1).join(' ') || "";
        } else if (!orgVal) {
            document.getElementById('organisation').value = nomClient;
        }

        document.getElementById('email').value = fields["Email"] || '';
        
        // Parse Message for Phone
        const msg = fields["Message"] || "";
        const telMatch = msg.match(/Tél: (.*)\n/);
        if (telMatch) document.getElementById('phone').value = telMatch[1];
        document.getElementById('message').value = msg.replace(/Tél: .*\n?/, '').replace(/Source: .*\n?/, '').trim();

        // --- 2. Determine Mode (Pro/Perso) ---
        const typeRaw = Array.isArray(fields["Type"]) ? fields["Type"][0] : (fields["Type"] || "");
        if (typeRaw.toLowerCase().includes('séminaire') || typeRaw.toLowerCase().includes('professionnel')) {
            currentMode = 'pro';
        } else {
            currentMode = 'perso';
        }
        
        // Initialiser le flow sans écraser les données
        startFlow(currentMode, true);

        // --- 3. Dossier JSON (Preferred) ---
        if (fields["Dossier JSON"]) {
            try {
                const dossier = JSON.parse(fields["Dossier JSON"]);
                console.log("[EDIT] Chargement depuis Dossier JSON v" + (dossier.version || '1'));
                
                // Mode
                currentMode = dossier.meta.mode || 'perso';
                document.body.classList.toggle('is-expert', currentMode === 'pro');
                
                // Participants
                document.getElementById('nbTotal').value = dossier.sejour.participants || 0;
                document.getElementById('nbAdult').value = dossier.sejour.adultes || 0;
                document.getElementById('nbChild').value = dossier.sejour.enfants || 0;
                document.getElementById('nbBaby').value = dossier.sejour.bebes || 0;

                // Sleeping
                if (dossier.sleeping) {
                    setSleepingMode(dossier.sleeping.mode || 'auto');
                    document.getElementById('nbIndividuel').value = dossier.sleeping.individuel || 0;
                    document.getElementById('nbPartage').value = dossier.sleeping.partage || 0;
                    document.getElementById('nbCouple').value = dossier.sleeping.couple || 0;
                    usedGites = dossier.sleeping.usedGites || [];
                }

                // Meals
                if (dossier.sejour.mealMode) {
                    const mode = dossier.sejour.mealMode;
                    const radio = document.querySelector(`input[name="repasType"][value="${mode}"]`);
                    if (radio) {
                        radio.checked = true;
                        toggleMeals(mode);
                        // Restauration des counts si présents
                        if (dossier.mealsPlanning) {
                            renderMealsSchedule(); // Generate inputs first
                            dossier.mealsPlanning.forEach((day, i) => {
                                const m = day.meals;
                                if (document.getElementById(`meal-${i}-petitDej`)) {
                                    document.getElementById(`meal-${i}-petitDej`).value = m.petitDej || 0;
                                    document.getElementById(`meal-${i}-dejeuner`).value = m.dejeuner || 0;
                                    document.getElementById(`meal-${i}-diner`).value = m.diner || 0;
                                    document.getElementById(`meal-${i}-collationMatin`).value = m.collationMatin || 0;
                                    document.getElementById(`meal-${i}-collationAprem`).value = m.collationAprem || 0;
                                }
                            });
                        }
                    }
                }

                // Options
                if (dossier.options) {
                    if (document.getElementById('draps')) document.getElementById('draps').checked = !!dossier.options.draps;
                    if (document.getElementById('menage')) document.getElementById('menage').checked = !!dossier.options.menage;
                    if (document.getElementById('lateArrival')) document.getElementById('lateArrival').checked = !!dossier.options.lateArrival;
                    if (document.getElementById('salleReunion')) document.getElementById('salleReunion').checked = !!dossier.options.salleReunion;
                    if (document.getElementById('kitSoiree')) document.getElementById('kitSoiree').checked = !!dossier.options.kitSoiree;
                    if (document.getElementById('chambreIndiv')) document.getElementById('chambreIndiv').checked = !!dossier.options.chambreIndiv;
                    bookingDraft.activities = dossier.options.activities || {};
                }

            } catch (e) {
                console.warn("Erreur Dossier JSON:", e);
            }
        }
        // --- 4. Fallback: Détails JSON (Legacy) ---
        else if (fields["Détails JSON"]) {
            try {
                const details = JSON.parse(fields["Détails JSON"]);
                if (details.type) {
                    currentMode = details.type;
                    document.body.classList.toggle('mode-pro', currentMode === 'pro');
                }
                if (details.sleeping?.mode) setSleepingMode(details.sleeping.mode);
                if (document.getElementById('nbIndividuel')) document.getElementById('nbIndividuel').value = details.sleeping?.indiv || 0;
                if (document.getElementById('nbPartage')) document.getElementById('nbPartage').value = details.sleeping?.partage || 0;
                if (document.getElementById('nbCouple')) document.getElementById('nbCouple').value = details.sleeping?.couple || 0;

                if (details.meals) {
                    const radio = document.querySelector(`input[name="repasType"][value="${details.meals.mode}"]`);
                    if (radio) {
                        radio.checked = true;
                        toggleMeals(details.meals.mode);
                    }
                }

                if (details.options) {
                    if (details.options.draps && document.getElementById('draps')) document.getElementById('draps').checked = true;
                    if (details.options.menage && document.getElementById('menage')) document.getElementById('menage').checked = true;
                    if (details.options.lateArrival && document.getElementById('lateArrival')) document.getElementById('lateArrival').checked = true;
                    if (details.options.salleReunion && document.getElementById('salleReunion')) document.getElementById('salleReunion').checked = true;
                }
            } catch (e) {
                console.warn("Erreur parsing Détails JSON", e);
            }
        }

        updateDateDisplay();
        renderCalendar();
        updateCalculations();

        // On cache l'étape 0 et on montre le configurateur
        document.getElementById('step0').style.display = 'none';
        document.getElementById('main-configurator').style.display = 'block';

        console.log(`[EDIT] Devis ${recordId} chargé avec succès.`);
    } catch (err) {
        console.error("Erreur loadFromAirtable:", err);
        alert("Erreur lors du chargement du devis depuis Airtable. Nous chargeons votre dernier brouillon local.");
        restoreDraft();
    }
}

function confirmReset(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // On utilise un petit délai pour s'assurer que l'événement de clic est totalement traité
    // et éviter que le navigateur ne ferme la boîte de dialogue prématurément.
    setTimeout(() => {
        if (confirm("Voulez-vous vraiment réinitialiser tout le formulaire pour repartir à zéro ?")) {
            localStorage.removeItem('domaineBookingDraft');
            localStorage.clear();
            // Redirection forcée vers l'URL propre
            window.location.replace(window.location.origin + window.location.pathname);
        }
    }, 50);
}

function validateStep(stepId) {
    let isValid = true;
    let msg = "";
    const total = parseInt(document.getElementById('nbTotal').value) || 0;

    if (stepId === 'step-dates') {
        if (!startDate || !endDate) { isValid = false; msg = "Veuillez sélectionner vos dates."; }
    } else if (stepId === 'step-group') {
        if (total < 1) { isValid = false; msg = "Le groupe doit contenir au moins 1 personne."; }
    } else if (stepId === 'step-sleeping') {
        const housed = parseInt(document.getElementById('housed-count').innerText) || 0;
        if (housed !== total) {
            isValid = false;
            const label = currentMode === 'pro' ? 'participants' : 'voyageurs';
            msg = "Le nombre de couchages doit correspondre au nombre de " + label + " (" + total + ").";
        }
    }

    const msgEl = document.querySelector(`#${stepId} .validation-msg`);
    if (msgEl) {
        msgEl.innerHTML = isValid ? "" : '<i class="fas fa-exclamation-triangle"></i> ' + msg;
        msgEl.classList.toggle('visible', !isValid);
    }
    return isValid;
}

function scrollToStep(stepId) {
    const el = document.getElementById(stepId);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        updateStepperUI(stepId);
    }
}

function nextStep(currentId, nextId) {
    if (validateStep(currentId)) {
        scrollToStep(nextId);
    }
}

function handleSleepingNext() {
    if (validateStep('step-sleeping')) {
        scrollToStep('step-meals');
    }
}

function handleMealsNext() {
    if (validateStep('step-meals')) {
        if (currentMode === 'pro') {
            scrollToStep('step-workspace');
        } else {
            scrollToStep('step-options');
        }
    }
}

function updateStepperUI(activeId) {
    const steps = ['dates', 'group', 'sleeping', 'meals', 'workspace', 'options', 'contact'];
    const activeIndex = steps.indexOf(activeId.replace('step-', ''));

    steps.forEach((step, index) => {
        const el = document.getElementById('nav-' + step);
        if (el) {
            el.classList.remove('active', 'completed');
            if (index < activeIndex) el.classList.add('completed');
            else if (index === activeIndex) el.classList.add('active');
        }
    });
}

window.addEventListener('scroll', () => {
    const sections = ['step-dates', 'step-group', 'step-sleeping', 'step-meals', 'step-workspace', 'step-options', 'step-contact'];
    let current = '';
    let minDist = Infinity;

    sections.forEach(sec => {
        const el = document.getElementById(sec);
        if (el) {
            const rect = el.getBoundingClientRect();
            // Calculate distance to roughly the top third of screen
            const dist = Math.abs(rect.top - 100);
            if (dist < minDist) {
                minDist = dist;
                current = sec;
            }
        }
    });
    if (current) updateStepperUI(current);
});

// --- Configuration & Constants ---
const PRICES = {
    individuel: { 1: 90, 2: 80 },
    partage: { 1: 60, 2: 50, 3: 40 },
    petitDej: 12,
    dejeuner: 25,
    diner: 29,
    draps: 7,
    pauseCafe: 5,
    salle: 500,
    menage: 300,
    privatisation: 650, // Forfait privatisation perso obligatoire
    chambreIndiv: 30, // Supplément perso
    kitSoiree: 500, // Forfait matériel son & lumière
    accueilLogistique: 150 // Référent sur place
};

const GITES = [
    { name: "Acacia", cap: 6, beds: "1 lit double, 2 simples, 1 canapé 2p", remarks: "Canapé convertible 2 places" },
    { name: "Hibiscus", cap: 8, beds: "1 lit double, 6 simples", remarks: "Idéal pour grands groupes" },
    { name: "Pivoine", cap: 4, beds: "1 lit double, 2 simples", remarks: "Configuration classique" },
    { name: "Belle de nuit", cap: 6, beds: "1 lit double, 2 simples, 1 canapé 2p", remarks: "Canapé convertible 2 places" },
    { name: "Iris", cap: 4, beds: "1 lit double, 2 simples", remarks: "Configuration classique" },
    { name: "Rose", cap: 4, beds: "1 lit double, 1 canapé 2p", remarks: "Canapé convertible 2 places" },
    { name: "Figuier", cap: 2, beds: "1 lit double", remarks: "Gîte romantique pour 2" },
    { name: "Jasmin", cap: 4, beds: "1 lit double conv, 1 canapé 1p, 1 appoint", remarks: "Lit double convertible + lit d'appoint" },
    { name: "Clos Josette", cap: 2, beds: "À définir", remarks: "Nouveau" },
    { name: "Le Grenier", cap: 6, beds: "À définir", remarks: "Nouveau" }
];

function renderGitesGrid() {
    const container = document.getElementById('gites-container');
    if (!container) return;
    
    container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(130px, 1fr))';
    container.style.gap = '12px';
    
    let html = '';
    GITES.forEach((gite, index) => {
        html += `
        <div class="gite-card" id="gite-card-${index}" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:12px; border:1px solid var(--border); border-radius:12px; gap:10px; cursor:pointer; background:#f8fafc; transition:all 0.2s;" onclick="toggleGite(${index})">
            <label class="switch" onclick="event.stopPropagation()" style="transform: scale(0.9);">
                <input type="checkbox" id="gite-cb-${index}" onchange="updateGiteSelection()">
                <span class="slider"></span>
            </label>
            <div style="text-align:center; pointer-events:none;">
                <strong style="color:var(--primary); font-size:13px; display:block; line-height:1.2;">${gite.name}</strong>
                <span style="font-size:10px; color:var(--text-muted); text-transform:uppercase; font-weight:600;">${gite.cap} max</span>
            </div>
            <div class="stepper-mini" onclick="event.stopPropagation()" style="display:flex; align-items:center; gap:4px;">
                <button type="button" class="stepper-mini-btn" onclick="adjustGiteOcc(${index}, -1)"><i class="fas fa-minus"></i></button>
                <input type="number" id="gite-occ-${index}" class="input-dense" value="0" min="0" max="${gite.cap}" 
                       style="width:36px; height:24px; font-weight:700; text-align:center; border:1px solid var(--border); border-radius:4px; padding:0; background:#fff; font-size:12px;" 
                       onchange="onGiteInputChange(${index})">
                <button type="button" class="stepper-mini-btn" onclick="adjustGiteOcc(${index}, 1)"><i class="fas fa-plus"></i></button>
            </div>
        </div>
        `;
    });
    container.innerHTML = html;
}

function adjustGiteOcc(index, delta) {
    const occ = document.getElementById(`gite-occ-${index}`);
    const cb = document.getElementById(`gite-cb-${index}`);
    if (!occ || !cb) return;
    
    let val = parseInt(occ.value) || 0;
    val += delta;
    
    const cap = GITES[index].cap;
    if (val < 0) val = 0;
    if (val > cap) val = cap;
    
    occ.value = val;
    cb.checked = (val > 0);
    updateGiteSelection();
}

function onGiteInputChange(index) {
    const occ = document.getElementById(`gite-occ-${index}`);
    const cb = document.getElementById(`gite-cb-${index}`);
    if (occ && cb) {
        cb.checked = (parseInt(occ.value) > 0);
    }
    updateGiteSelection();
}

function toggleGite(index) {
    const cb = document.getElementById(`gite-cb-${index}`);
    if (cb) {
        cb.checked = !cb.checked;
        if (cb.checked) {
             const occ = document.getElementById(`gite-occ-${index}`);
             if (occ && parseInt(occ.value) === 0) occ.value = GITES[index].cap;
        }
        updateGiteSelection();
    }
}

function updateGiteSelection() {
    let totalAssigned = 0;
    GITES.forEach((g, i) => {
        const cb = document.getElementById(`gite-cb-${i}`);
        const occ = document.getElementById(`gite-occ-${i}`);
        if (!cb || !occ) return;
        
        const card = document.getElementById(`gite-card-${i}`);
        if (cb.checked) {
            if (card) {
                card.style.borderColor = 'var(--accent)';
                card.style.background = 'rgba(185, 138, 77, 0.05)';
            }
            if (parseInt(occ.value) === 0) occ.value = g.cap;
            totalAssigned += parseInt(occ.value) || 0;
        } else {
            if (card) {
                card.style.borderColor = 'var(--border)';
                card.style.background = '#f8fafc';
            }
            occ.value = 0;
        }
    });

    const tb = document.getElementById('gites-assigned-count');
    if (tb) tb.innerText = totalAssigned;
    
    const coh = document.getElementById('coherence-check');
    const totalVisitors = parseInt(document.getElementById('nbTotal').value) || 0;
    if (coh) {
        coh.style.display = 'block';
        coh.classList.remove('warning', 'success');
        const msg = document.getElementById('sleeping-delta-msg');
        if (totalAssigned !== totalVisitors) {
            coh.classList.add('warning');
            if (msg) msg.innerText = "La répartition des gîtes ne correspond pas au nombre de participants.";
        } else {
            coh.classList.add('success');
            if (msg) msg.innerText = "Répartition terminée !";
        }
    }
}

// ===== API Proxy config (Cloudflare Worker) =====
const API_BASE = (window.CONFIGURATEUR_API_BASE || 'https://domainesesquier-api.domainesesquier.workers.dev').replace(/\/+$/, '');
const API_RESERVATIONS_URL = `${API_BASE}/api/reservations`;
const API_PRICING_URL = `${API_BASE}/api/pricing`;

// Dates indisponibles chargées depuis Airtable (format YYYY-MM-DD)
let UNAVAILABLE_DATES = [];
let reservationsFromAirtable = [];

// Tarifs chargés depuis Airtable (fallback local si code manquant)
window.PRICING = window.PRICING || {};
const PRICING_BACKUP = {
    PRIVATISATION_PERSO_LIEU: { priceHT: 650, unit: 'forfait' },
    HEBERGEMENT_PERSO_NUITEE_1NUIT: { priceHT: 60, unit: '/pers/nuit' },
    HEBERGEMENT_PERSO_NUITEE_2NUITS: { priceHT: 50, unit: '/pers/nuit' },
    HEBERGEMENT_PERSO_NUITEE_3PLUS: { priceHT: 40, unit: '/pers/nuit' },
    SALLE_TRAVAIL_SEMINAIRE: { priceHT: 500, unit: '/jour' },
    HEBERGEMENT_SEMINAIRE_TWIN: { priceHT: 70, unit: '/pers/nuit' },
    HEBERGEMENT_SEMINAIRE_SINGLE: { priceHT: 100, unit: '/pers/nuit' },
    FORFAIT_DRAPS_PERSO_DRAPS: { priceHT: 7, unit: '/pers (forfait)' },
    OPTION_PERSO_MENAGE: { priceHT: 300, unit: 'forfait' },
    OPTION_PERSO_CHAMBRE_INDIV: { priceHT: 30, unit: '/nuit' },
    OPTION_PRO_KIT_SOIREE: { priceHT: 500, unit: 'forfait' },
    REPAS_PERSO_PDJ: { priceHT: 11, unit: '/pers' },
    REPAS_PERSO_DEJ: { priceHT: 24, unit: '/pers' },
    REPAS_PERSO_DINER: { priceHT: 27, unit: '/pers' },
    REPAS_SEMINAIRE_PDJ: { priceHT: 14, unit: '/pers' },
    REPAS_SEMINAIRE_DEJ: { priceHT: 26, unit: '/pers' },
    REPAS_SEMINAIRE_DINER: { priceHT: 30, unit: '/pers' }
};

const toNumberOrNull = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
        const normalized = value.trim().replace(',', '.');
        if (!normalized) return null;
        const n = Number(normalized);
        return Number.isFinite(n) ? n : null;
    }
    return null;
};

const normalizeCode = (value) => {
    if (value == null) return null;

    // Si c'est un objet (cas des formules Airtable via API)
    if (typeof value === 'object' && !Array.isArray(value)) {
        if (value.value) return normalizeCode(value.value);
        return null;
    }

    if (typeof value === 'string' || typeof value === 'number') {
        // Normalisation avancée pour matcher Airtable (espaces -> underscores, accents, retours à la ligne)
        return value.toString()
            .replace(/[\r\n]+/g, ' ') // Remplacer retours ligne par espace
            .toUpperCase()
            .trim()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Supprimer accents
            .replace(/[^A-Z0-9_]/g, '_') // Remplacer tout le reste par _
            .replace(/__+/g, '_') // Éviter les doubles underscores
            .replace(/^_|_$/g, '') // Nettoyer début/fin
            || null;
    }

    return null;
};

const toDateKey = (date) => new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())).toISOString().slice(0, 10);

function parseDateOnly(value) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function fetchProxyJson(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || (data && data.error)) {
        throw new Error((data && data.error && data.error.message) || `Erreur API (${response.status})`);
    }
    return data;
}

async function fetchAllAirtableRecords(url, queryParams = '') {
    const sep = url.includes('?') ? '&' : '?';
    const fullUrl = queryParams ? `${url}${sep}${queryParams}` : url;
    const data = await fetchProxyJson(fullUrl);
    return data.records || [];
}

async function loadReservationsFromAirtable() {
    try {
        const records = await fetchAllAirtableRecords(
            API_RESERVATIONS_URL,
            'filterByFormula=AND({Date arrivée}, {Date départ})'
        );

        const blocked = new Set();
        reservationsFromAirtable = records;

        records.forEach((record) => {
            const fields = record.fields || {};
            const arrivalRaw = fields['Date arrivée'] || fields['Date arrivee'] || fields['Date d\'arrivée'];
            const departureRaw = fields['Date départ'] || fields['Date depart'] || fields['Date de départ'];
            const statusRaw = String(fields['Statut'] || '').toLowerCase();

            if (statusRaw !== 'confirmé' && statusRaw !== 'confirme') return;

            const arrival = parseDateOnly(arrivalRaw);
            const departure = parseDateOnly(departureRaw);

            if (!arrival || !departure || departure <= arrival) return;

            const cursor = new Date(arrival);
            while (cursor < departure) {
                blocked.add(cursor.toISOString().slice(0, 10));
                cursor.setUTCDate(cursor.getUTCDate() + 1);
            }
        });

        UNAVAILABLE_DATES = Array.from(blocked).sort();
        renderCalendar();
        updateDateDisplay();
        updateCalculations();
        console.log(`Reservations Airtable chargees: ${reservationsFromAirtable.length}, dates bloquees: ${UNAVAILABLE_DATES.length}`);
    } catch (error) {
        console.error('Erreur chargement reservations Airtable:', error);
        const calHeader = document.querySelector('.calendar-header');
        if (calHeader) {
            const errDisp = document.createElement('div');
            errDisp.style.cssText = "color: #e74c3c; font-size: 10px; margin-top: 5px;";
            errDisp.innerText = "⚠ Erreur de synchronisation calendrier";
            calHeader.appendChild(errDisp);
        }
    }
}

async function loadPricingFromAirtable() {
    try {
        const records = await fetchAllAirtableRecords(API_PRICING_URL);
        const pricing = [];

        records.forEach((record) => {
            const fields = record.fields;
            const rawCode = fields['Code'];
            const code = normalizeCode(rawCode);
            if (!code) return;

            pricing.push({
                code: code,
                priceHT: toNumberOrNull(fields['Prix unitaire']),
                tva: toNumberOrNull(fields['TVA % (auto)']),
                priceTTC: toNumberOrNull(fields['Prix TTC (calculé)']),
                unit: fields['Unité'],
                category: fields['Catégorie'],
                typeClient: normalizeCode(fields['Type client'] || fields['Type'] || fields['Type Client'] || fields['Cible']),
                title: fields['Intitulé'],
                minPers: toNumberOrNull(fields['Nb pers min'] || fields['Nb Pers Min']) || 0,
                maxPers: toNumberOrNull(fields['Nb pers max'] || fields['Nb Pers Max']) || 999,
                minNights: toNumberOrNull(fields['Durée min nuits'] || fields['Nuits Min']) || 0,
                maxNights: toNumberOrNull(fields['Durée max nuits'] || fields['Nuits Max']) || 999
            });
        });

        window.PRICING_DB = pricing; // On stocke la base complète
        console.log(`[AIRTABLE] ${pricing.length} tarifs chargés avec succès.`);
        updateCalculations();
    } catch (error) {
        console.error('Erreur chargement tarifs Airtable:', error);
    }
}

function updateDayTotals() {
    if (!startDate || !endDate) return;
    const diffDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    const modeIsPro = (currentMode === 'pro');
    const mealMode = getSelectedMealMode();
    const totalVisitors = parseInt(document.getElementById('nbTotal').value) || 0;

    for (let i = 0; i <= diffDays; i++) {
        const p = parseInt(document.getElementById(`meal-${i}-petitDej`)?.value) || 0;
        const d = parseInt(document.getElementById(`meal-${i}-dejeuner`)?.value) || 0;
        const dinEl = document.getElementById(`meal-${i}-diner`);
        const din = dinEl ? (parseInt(dinEl.value) || 0) : 0;

        const colM = parseInt(document.getElementById(`meal-${i}-collationMatin`)?.value) || 0;
        const colA = parseInt(document.getElementById(`meal-${i}-collationAprem`)?.value) || 0;

        const pPrice = getPriceHT('REPAS_SEMINAIRE_PDJ', totalVisitors, diffDays, 14);
        const dPrice = getPriceHT('REPAS_SEMINAIRE_DEJ', totalVisitors, diffDays, 26);
        const dinPrice = getPriceHT('REPAS_SEMINAIRE_DINER', totalVisitors, diffDays, 30);
        const colPrice = 5;

        let dayTotal = (p * pPrice) + (d * dPrice) + (din * dinPrice) + (colM * colPrice) + (colA * colPrice);

        const tagM = document.getElementById(`day-${i}-colM-price-tag`);
        const tagA = document.getElementById(`day-${i}-colA-price-tag`);
        [tagM, tagA].forEach(tag => {
            if (tag) {
                tag.innerText = `(${colPrice}€ ${modeIsPro ? 'HT' : ''})`;
                tag.style.color = "";
                tag.style.fontWeight = "400";
                tag.style.opacity = "0.6";
            }
        });

        if (modeIsPro && mealMode === 'pension') {
            const eligible = Math.min(p, d, din);
            if (eligible > 0) {
                dayTotal -= (eligible * 10);
            }
        }

        const display = document.getElementById(`day-${i}-total-val`);
        if (display) display.innerText = `${Math.round(dayTotal)} €${modeIsPro ? ' HT' : ''}`;
    }
}

function getPricing(baseCode, nbPers = 1, nbNights = 1) {
    const normalizedBase = normalizeCode(baseCode);
    if (!normalizedBase || !window.PRICING_DB) return null;

    const targetType = (currentMode === 'pro') ? 'PROFESSIONNEL' : 'PERSONNEL';

    // On cherche dans la DB Airtable avec filtres de paliers + type client
    const matches = window.PRICING_DB.filter(item => {
        const isCodeMatch = item.code === normalizedBase || item.code.startsWith(normalizedBase + '_');
        const isPersoMatch = nbPers >= item.minPers && nbPers <= item.maxPers;
        const isNightMatch = nbNights >= item.minNights && nbNights <= item.maxNights;

        // Normalisation du type pour comparaison robuste
        const normType = (item.typeClient || "").toString().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        let isTypeMatch = !item.typeClient;
        if (item.typeClient) {
            if (targetType === 'PROFESSIONNEL') {
                isTypeMatch = ['PROFESSIONNEL', 'PRO', 'SEMINAIRE'].includes(normType);
            } else {
                isTypeMatch = (normType === 'PERSONNEL');
            }
        }

        const ok = isCodeMatch && isPersoMatch && isNightMatch && isTypeMatch;
        
        // Log détaillé seulement si le code match mais que le reste échoue (pour debug)
        if (isCodeMatch && !ok) {
            console.log(`[PRICING DEBUG] ${item.code} rejeté car: ` + 
                (!isPersoMatch ? `Pers(${nbPers} vs ${item.minPers}-${item.maxPers}) ` : "") +
                (!isNightMatch ? `Nuits(${nbNights} vs ${item.minNights}-${item.maxNights}) ` : "") +
                (!isTypeMatch ? `Type(${normType} vs ${targetType})` : "")
            );
        }

        return ok;
    });

    if (matches.length > 0) {
        // S'il y a plusieurs correspondances, on prend la plus spécifique 
        // (celle avec le palier de personnes le plus restreint)
        const best = matches.sort((a, b) => (a.maxPers - a.minPers) - (b.maxPers - b.minPers))[0];
        console.log(`[PRICING] Match trouvé pour ${normalizedBase} (${nbPers} pers, ${nbNights} nuits): ${best.priceHT}€ (Source: Airtable)`);
        return best;
    }

    console.warn(`[PRICING] Aucun match Airtable pour ${normalizedBase} (${nbPers} pers, ${nbNights} nuits).`);
    return null;
}

function getPriceHT(code, nbPers = 1, nbNights = 1, fallback = null) {
    const item = getPricing(code, nbPers, nbNights);
    if (!item) return fallback;
    const n = toNumberOrNull(item.priceHT);
    return n === null ? fallback : n;
}

// --- Global State ---
let currentMode = 'perso';
let sleepingMode = 'auto'; // 'auto' or 'manu'
let currentMonth = new Date();
let startDate = null;
let endDate = null;
let usedGites = [];

function isDateAvailable(date) {
    if (!date) return false;
    return !UNAVAILABLE_DATES.includes(toDateKey(date));
}

function isRangeAvailable(start, end) {
    if (!start || !end) return isDateAvailable(start || end);
    let current = new Date(start);
    while (current < end) {
        if (!isDateAvailable(current)) return false;
        current.setDate(current.getDate() + 1);
    }
    return true;
}

function renderCalendar() {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    // Update headers
    const monthStr = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(currentMonth);
    const capitalizedMonth = monthStr.charAt(0).toUpperCase() + monthStr.slice(1);
    
    const mHead = document.getElementById('modal-calendar-month-year');
    if (mHead) mHead.innerText = capitalizedMonth;
    const miniHead = document.getElementById('calendarMonthMini');
    if (miniHead) miniHead.innerText = capitalizedMonth;
    const cHead = document.getElementById('calendarMonth');
    if (cHead) cHead.innerText = capitalizedMonth;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Refresh all potential views
    const targetIDs = ['modal-calendar-grid', 'calendarDays', 'calendarDaysMini'];
    
    targetIDs.forEach(id => {
        const container = document.getElementById(id);
        if (!container) return;
        container.innerHTML = '';

        // Offset for Monday start (0=Sunday in JS, we want 0=Monday)
        let offset = (firstDay === 0) ? 6 : firstDay - 1;
        for (let j = 0; j < offset; j++) {
            const empty = document.createElement('div');
            empty.className = 'calendar-day other-month';
            container.appendChild(empty);
        }

        for (let i = 1; i <= daysInMonth; i++) {
            const date = new Date(year, month, i);
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day';
            dayEl.innerText = i;

            const available = isDateAvailable(date);
            dayEl.classList.add(available ? 'is-available' : 'is-unavailable');

            const isStart = startDate && date.toDateString() === startDate.toDateString();
            const isEnd = endDate && date.toDateString() === endDate.toDateString();
            const inBetween = startDate && endDate && date > startDate && date < endDate;

            if (isStart || isEnd || inBetween) {
                dayEl.classList.add('range-selected');
                if (isStart) dayEl.classList.add('range-start');
                if (isEnd) dayEl.classList.add('range-end');
            }

            if (available) {
                dayEl.onclick = (e) => {
                    e.stopPropagation();
                    selectDate(date);
                };
            }
            container.appendChild(dayEl);
        }
    });
}

function openDateModal() {
    document.getElementById('date-modal-overlay').style.display = 'flex';
    renderCalendar();
}

function closeDateModal() {
    document.getElementById('date-modal-overlay').style.display = 'none';
}

function resetSelection() {
    startDate = null;
    endDate = null;
    document.getElementById('nativeDateArrivee').value = '';
    document.getElementById('nativeDateDepart').value = '';
    updateDateDisplay();
    renderCalendar();
}

function selectDate(date) {
    if (!startDate || (startDate && endDate)) {
        startDate = date; 
        endDate = null;
    } else if (date < startDate) {
        startDate = date;
    } else if (date.toDateString() === startDate.toDateString()) {
        startDate = null; // Unselect if same
    } else {
        endDate = date;
    }
    updateDateDisplay();
    renderCalendar();

    // After selection, if we have a range, wait a bit then maybe highlight footer?
    // No, keep it open for confirmation.

    // Sync with native inputs
    if (startDate) document.getElementById('nativeDateArrivee').value = startDate.toISOString().split('T')[0];
    else document.getElementById('nativeDateArrivee').value = '';
    
    if (endDate) document.getElementById('nativeDateDepart').value = endDate.toISOString().split('T')[0];
    else document.getElementById('nativeDateDepart').value = '';

    // Refresh meals if range is complete
    if (startDate && endDate) {
        document.getElementById('meals-schedule-container').innerHTML = '';
        renderMealsSchedule();
    }
    
    updateCalculations();
}

function handleNativeDateChange() {
    const natArr = document.getElementById('nativeDateArrivee').value;
    const natDep = document.getElementById('nativeDateDepart').value;
    startDate = natArr ? new Date(natArr) : null;
    endDate = natDep ? new Date(natDep) : null;
    
    // Refresh meal schedule if dates change
    const cont = document.getElementById('meals-schedule-container');
    if (cont) cont.innerHTML = '';
    const mealSel = document.getElementById('mealSelection');
    if (mealSel && mealSel.style.display === 'block') {
        if (typeof renderMealsSchedule === 'function') renderMealsSchedule();
    }
    
    updateDateDisplay();
    updateCalculations();
}

function updateDateDisplay() {
    const rangeDisplay = document.getElementById('range-display');
    const modalArr = document.getElementById('modal-display-arrivee');
    const modalDep = document.getElementById('modal-display-depart');
    const statusBadge = document.getElementById('availabilityStatus');
    const miniArr = document.getElementById('displayArriveeMini');
    const miniDep = document.getElementById('displayDepartMini');
    const miniNights = document.getElementById('displayNightsMini');
    
    const natArr = document.getElementById('nativeDateArrivee');
    const natDep = document.getElementById('nativeDateDepart');

    const fmt = (d) => d ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '--/--/----';

    const sStr = fmt(startDate);
    const eStr = fmt(endDate);

    if (modalArr) modalArr.innerText = sStr;
    if (modalDep) modalDep.innerText = eStr;
    if (miniArr) miniArr.innerText = startDate ? startDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '--/--';
    if (miniDep) miniDep.innerText = endDate ? endDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '--/--';

    // SYNC NATIVE INPUTS (Hidden)
    if (natArr) {
        if (startDate) {
            const offset = startDate.getTimezoneOffset() * 60000;
            natArr.value = new Date(startDate.getTime() - offset).toISOString().split('T')[0];
        } else {
            natArr.value = '';
        }
    }
    if (natDep) {
        if (endDate) {
            const offset = endDate.getTimezoneOffset() * 60000;
            natDep.value = new Date(endDate.getTime() - offset).toISOString().split('T')[0];
        } else {
            natDep.value = '';
        }
    }

    // UPDATE RANGE DISPLAY TRIGGER
    if (rangeDisplay) {
        if (startDate && endDate) {
            rangeDisplay.innerText = `${sStr} au ${eStr}`;
            rangeDisplay.style.color = 'var(--primary)';
        } else if (startDate) {
            rangeDisplay.innerText = `Arrivée le ${sStr}...`;
            rangeDisplay.style.color = 'var(--accent)';
        } else {
            rangeDisplay.innerText = "Sélectionner les dates...";
            rangeDisplay.style.color = 'var(--text-muted)';
        }
    }

    if (startDate && endDate) {
        const nights = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
        if (miniNights) miniNights.innerText = nights;

        if (statusBadge) {
            const isAvail = isRangeAvailable(startDate, endDate);
            statusBadge.classList.remove('avail-ok', 'avail-ko');
            statusBadge.classList.add(isAvail ? 'avail-ok' : 'avail-ko');
            statusBadge.innerHTML = isAvail ? "Dates disponibles ✓" : "Indisponible sur cette période ✗";
            statusBadge.style.display = 'block';
        }
    } else {
        if (miniNights) miniNights.innerText = '0';
        if (statusBadge) statusBadge.style.display = 'none';
    }
}

function changeMonth(delta) {
    currentMonth.setMonth(currentMonth.getMonth() + delta);
    renderCalendar();
}

function startFlow(mode, isInit = false) {
    currentMode = mode;
    const configContainer = document.getElementById('main-configurator');
    document.getElementById('step0').style.display = 'none';
    configContainer.style.display = 'block';
    document.getElementById('main-stepper').classList.add('visible');

    // Reset classes
    configContainer.classList.remove('mode-pro', 'mode-perso');

    const title = document.getElementById('main-title');
    const subtitle = document.getElementById('main-subtitle');

    if (mode === 'pro') {
        configContainer.classList.add('mode-pro');
        document.body.classList.add('is-expert'); // Mode interne — skip validation legacy client
        if (title) title.innerText = "Votre Séminaire Pro";
        if (subtitle) subtitle.innerText = "Un cadre inspirant pour vos équipes";
        
        if (!isInit) {
            setSleepingMode('pro-double'); // Default to shared rooms for Pro
            document.getElementById('salleReunion').checked = true;
            document.getElementById('repasPension').checked = true;
            toggleMeals('pension');
        }
    } else {
        configContainer.classList.add('mode-perso');
        document.body.classList.remove('is-expert');
        if (title) title.innerText = "Votre Séjour Personnel";
        if (subtitle) subtitle.innerText = "Des moments précieux en famille et entre amis";
        
        if (!isInit) {
            setSleepingMode('auto'); // Default for Perso
            document.getElementById('repasLibre').checked = true;
            toggleMeals('libre');
        }
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    updateCalculations();
}

function goToStep0() {
    const configContainer = document.getElementById('main-configurator');
    document.getElementById('step0').style.display = 'block';
    configContainer.style.display = 'none';
    document.getElementById('main-stepper').classList.remove('visible');
    const title = document.getElementById('main-title');
    const subtitle = document.getElementById('main-subtitle');
    if (title) title.innerText = "Estimez votre séjour";
    if (subtitle) subtitle.innerText = "Domaine Sesquier — Esprit de famille & Art de vivre";
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleMeals(mode) {
    const container = document.getElementById('mealSelection');
    const quickActions = document.getElementById('mealQuickActions');
    const pensionInfo = document.getElementById('pensionInfo');
    const libreInfo = document.getElementById('libreInfo');
    const customInfo = document.getElementById('customInfo');

    // Reset visibility
    if (pensionInfo) pensionInfo.style.display = 'none';
    if (libreInfo) libreInfo.style.display = 'none';
    if (customInfo) customInfo.style.display = 'none';
    if (quickActions) quickActions.style.display = 'none';
    if (container) container.style.display = 'none';

    if (mode === 'pension') {
        if (pensionInfo) pensionInfo.style.display = 'block';
        if (container) container.style.display = 'block';
        applyPensionComplete();
    } else if (mode === 'libre') {
        if (libreInfo) libreInfo.style.display = 'block';
        // Reset all meal inputs to 0
        document.querySelectorAll('[class^="meal-input-"]').forEach(el => el.value = 0);
    } else if (mode === 'custom' || mode === 'traiteur') {
        if (customInfo) customInfo.style.display = 'block';
        if (quickActions) quickActions.style.display = 'block';
        if (container) container.style.display = 'block';
        renderMealsSchedule();
    }
    updateCalculations();
}

function getSelectedMealMode() {
    const radio = document.querySelector('input[name="repasType"]:checked');
    return radio ? radio.value : 'libre';
}

function applyPensionComplete(andUpdate = true) {
    if (!startDate || !endDate) return;
    renderMealsSchedule(); // Ensure inputs exist

    const diffDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    const n = parseInt(document.getElementById('nbTotal').value) || 0;

    for (let i = 0; i <= diffDays; i++) {
        const p = document.getElementById(`meal-${i}-petitDej`);
        const d = document.getElementById(`meal-${i}-dejeuner`);
        const din = document.getElementById(`meal-${i}-diner`);
        const colM = document.getElementById(`meal-${i}-collationMatin`);
        const colA = document.getElementById(`meal-${i}-collationAprem`);

        // Reset
        if (p) p.value = 0;
        if (d) d.value = 0;
        if (din) din.value = 0;
        if (colM) colM.value = 0;
        if (colA) colA.value = 0;

        // Logic 
        // Jour d'arrivée (0) : dîner (+ déjeuner par défaut car séminaire)
        if (i === 0) {
            if (d) d.value = n;
            if (din) din.value = n;
        }
        // Jour de départ (diffDays) : petit-déjeuner + déjeuner
        else if (i === diffDays) {
            if (p) p.value = n;
            if (d) d.value = n;
        }
        // Jours pleins
        else {
            if (p) p.value = n;
            if (d) d.value = n;
            if (din) din.value = n;
        }

        // 2 collations par jour inclus dans la pension (matin et après-midi pour tous)
        if (colM) colM.value = n;
        if (colA) colA.value = n;
    }
    if (andUpdate) updateCalculations();
}


function renderMealsSchedule() {
    const container = document.getElementById('meals-schedule-container');
    const totalVisitors = parseInt(document.getElementById('nbTotal').value) || 0;
    if (!startDate || !endDate) {
        container.innerHTML = '<div class="info-banner">Veuillez d\'abord sélectionner vos dates à l\'étape 1.</div>';
        return;
    }

    // Force re-render to avoid stale data (banner or old dates)
    container.innerHTML = '';

    const mode = getSelectedMealMode();
    const modeIsPro = currentMode === 'pro';
    const diffDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    let html = '';

    for (let i = 0; i <= diffDays; i++) {
        let d = new Date(startDate);
        d.setDate(d.getDate() + i);

        const dayName = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
        const isLastDay = (i === diffDays);
        const isPension = (mode === 'pension');

        const pPrice = getPriceHT(modeIsPro ? 'REPAS_SEMINAIRE_PDJ' : 'REPAS_PERSO_PDJ', totalVisitors, diffDays, modeIsPro ? 14 : 11);
        const dPrice = getPriceHT(modeIsPro ? 'REPAS_SEMINAIRE_DEJ' : 'REPAS_PERSO_DEJ', totalVisitors, diffDays, modeIsPro ? 26 : 24);
        const dinPrice = getPriceHT(modeIsPro ? 'REPAS_SEMINAIRE_DINER' : 'REPAS_PERSO_DINER', totalVisitors, diffDays, modeIsPro ? 30 : 27);
        const colPrice = 5;

        html += `
                    <div class="meal-day-card" style="background: white; border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; margin-bottom: 1.25rem; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; border-bottom: 1px solid #f0f0f0; padding-bottom: 10px;">
                            <div class="meal-day-header" style="margin-bottom: 0; border-bottom: none; padding-bottom: 0;">${dayName}</div>
                            ${!isPension ? `
                            <button type="button" class="meal-action-btn" style="font-size: 0.7rem; padding: 4px 10px; opacity: 0.8; height: 26px; display: flex; align-items: center; gap: 4px;" onclick="setDayMeals(${i})">
                                <i class="fas fa-plus-circle"></i> Tout pour ce jour
                            </button>` : `<span style="font-size: 0.75rem; color: var(--primary); font-weight: 700;"><i class="fas fa-check-circle"></i> Pension complète</span>`}
                        </div>
                        
                        <div class="meal-option-row" style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; flex-direction: column;">
                                <span style="font-weight: 600; color: var(--primary); font-size: 0.95rem;">Petit-déjeuner <span style="font-weight: 400; opacity: 0.6; font-size: 0.8rem;">(${pPrice}€ ${currentMode === 'pro' ? 'HT' : ''})</span></span>
                            </div>
                            <div class="stepper" style="transform: scale(0.9); transform-origin: right;">
                                 <button type="button" class="stepper-btn" onclick="modifyMeal(${i}, 'petitDej', -1)"><i class="fas fa-minus"></i></button>
                                 <input type="number" class="stepper-input meal-input-petitDej" id="meal-${i}-petitDej" value="0" min="0" onchange="updateCalculations()">
                                 <button type="button" class="stepper-btn" onclick="modifyMeal(${i}, 'petitDej', 1)"><i class="fas fa-plus"></i></button>
                            </div>
                        </div>

                        <!-- Collation Matin (PRO ONLY) -->
                        ${currentMode === 'pro' ? `
                        <div class="meal-option-row" style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px dashed #eee;">
                            <div style="display: flex; flex-direction: column;">
                                <span style="font-weight: 600; color: var(--primary); font-size: 0.95rem;">Collation matin <span id="day-${i}-colM-price-tag" style="font-weight: 400; opacity: 0.6; font-size: 0.8rem;">(${colPrice}€ HT)</span></span>
                            </div>
                            <div class="stepper" style="transform: scale(0.9); transform-origin: right;">
                                 <button type="button" class="stepper-btn" onclick="modifyMeal(${i}, 'collationMatin', -1)"><i class="fas fa-minus"></i></button>
                                 <input type="number" class="stepper-input meal-input-collationMatin" id="meal-${i}-collationMatin" value="0" min="0" onchange="updateCalculations()">
                                 <button type="button" class="stepper-btn" onclick="modifyMeal(${i}, 'collationMatin', 1)"><i class="fas fa-plus"></i></button>
                            </div>
                        </div>` : ''}

                        <div class="meal-option-row" style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; flex-direction: column;">
                                <span style="font-weight: 600; color: var(--primary); font-size: 0.95rem;">Déjeuner <span style="font-weight: 400; opacity: 0.6; font-size: 0.8rem;">(${dPrice}€ ${currentMode === 'pro' ? 'HT' : ''})</span></span>
                            </div>
                            <div class="stepper" style="transform: scale(0.9); transform-origin: right;">
                                 <button type="button" class="stepper-btn" onclick="modifyMeal(${i}, 'dejeuner', -1)"><i class="fas fa-minus"></i></button>
                                 <input type="number" class="stepper-input meal-input-dejeuner" id="meal-${i}-dejeuner" value="0" min="0" onchange="updateCalculations()">
                                 <button type="button" class="stepper-btn" onclick="modifyMeal(${i}, 'dejeuner', 1)"><i class="fas fa-plus"></i></button>
                            </div>
                        </div>

                        <!-- Collation Après-midi (PRO ONLY) -->
                        ${currentMode === 'pro' ? `
                        <div class="meal-option-row" style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px dashed #eee;">
                            <div style="display: flex; flex-direction: column;">
                                <span style="font-weight: 600; color: var(--primary); font-size: 0.95rem;">Collation après-midi <span id="day-${i}-colA-price-tag" style="font-weight: 400; opacity: 0.6; font-size: 0.8rem;">(${colPrice}€ HT)</span></span>
                            </div>
                            <div class="stepper" style="transform: scale(0.9); transform-origin: right;">
                                 <button type="button" class="stepper-btn" onclick="modifyMeal(${i}, 'collationAprem', -1)"><i class="fas fa-minus"></i></button>
                                 <input type="number" class="stepper-input meal-input-collationAprem" id="meal-${i}-collationAprem" value="0" min="0" onchange="updateCalculations()">
                                 <button type="button" class="stepper-btn" onclick="modifyMeal(${i}, 'collationAprem', 1)"><i class="fas fa-plus"></i></button>
                            </div>
                        </div>` : ''}

                        ${(!isLastDay || isPension) ? `
                        <div class="meal-option-row" style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; flex-direction: column;">
                                <span style="font-weight: 600; color: var(--primary); font-size: 0.95rem;">Dîner <span style="font-weight: 400; opacity: 0.6; font-size: 0.8rem;">(${dinPrice}€ ${currentMode === 'pro' ? 'HT' : ''})</span></span>
                            </div>
                            <div class="stepper" style="transform: scale(0.9); transform-origin: right;">
                                <button type="button" class="stepper-btn" onclick="modifyMeal(${i}, 'diner', -1)"><i class="fas fa-minus"></i></button>
                                <input type="number" class="stepper-input meal-input-diner" id="meal-${i}-diner" value="0" min="0" onchange="updateCalculations()">
                                <button type="button" class="stepper-btn" onclick="modifyMeal(${i}, 'diner', 1)"><i class="fas fa-plus"></i></button>
                            </div>
                        </div>` : ''}

                        <div id="day-${i}-total" style="margin-top: 15px; padding-top: 12px; border-top: 2px solid #f8f8f8; display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Total du jour</span>
                            <span id="day-${i}-total-val" style="font-weight: 800; color: var(--primary); font-size: 1.1rem;">0 € ${modeIsPro ? 'HT' : ''}</span>
                        </div>
                    </div>`;
    }
    container.innerHTML = html;
}

function resetMealsToParticipants() {
    const n = parseInt(document.getElementById('nbTotal').value) || 0;
    const mealInputs = document.querySelectorAll('[class^="meal-input-"]');
    mealInputs.forEach(input => {
        input.value = n;
    });
    // Specific logic for first and last day if in pension mode
    if (getSelectedMealMode() === 'pension') {
        applyPensionComplete(true);
    } else {
        updateCalculations();
    }
}

function modifyMeal(dayIdx, type, delta) {
    const input = document.getElementById(`meal-${dayIdx}-${type}`);
    if (input) {
        let current = parseInt(input.value) || 0;
        const n = parseInt(document.getElementById('nbTotal').value) || 0;

        if (current === 0 && delta > 0) {
            input.value = n;
        } else {
            let next = current + delta;
            if (next < 0) next = 0;
            if (next > n) next = n; // Sécurité
            input.value = next;
        }
        updateCalculations();
    }
}

function setDayMeals(dayIdx) {
    const n = parseInt(document.getElementById('nbTotal').value) || 0;
    const p = document.getElementById(`meal-${dayIdx}-petitDej`);
    const d = document.getElementById(`meal-${dayIdx}-dejeuner`);
    const din = document.getElementById(`meal-${dayIdx}-diner`);
    const colM = document.getElementById(`meal-${dayIdx}-collationMatin`);
    const colA = document.getElementById(`meal-${dayIdx}-collationAprem`);

    if (p) p.value = n;
    if (d) d.value = n;
    if (din) din.value = n;
    if (colM) colM.value = n;
    if (colA) colA.value = n;

    updateCalculations();
}

function modifyCoffeeCovers(delta) {
    const input = document.getElementById('nbCoffeeCovers');
    if (input) {
        input.dataset.auto = 'false';
        let current = parseInt(input.value) || 0;
        const n = parseInt(document.getElementById('nbTotal').value) || 0;
        if (current === 0 && delta > 0) {
            input.value = n;
        } else {
            input.value = Math.max(0, current + delta);
        }
        updateCalculations();
    }
}

function toggleCoffeeInfo() {
    const coffeeEl = document.getElementById('enableCoffee');
    const enabled = coffeeEl ? coffeeEl.checked : false;
    const details = document.getElementById('coffee-details');
    if (details) details.style.opacity = enabled ? '1' : '0.3';
    if (details) details.style.pointerEvents = enabled ? 'auto' : 'none';
    updateCalculations();
}

function changeCount(id, delta) {
    const input = document.getElementById('nb' + id);
    if (input) {
        input.value = Math.max(0, parseInt(input.value) + delta);
        updateCalculations();
    }
}

function toggleOption(id) {
    const inp = document.getElementById(id);
    if (inp) {
        inp.checked = !inp.checked;
        updateCalculations();
    }
}

function changeSleeping(id, delta) {
    if (sleepingMode === 'auto') return;
    const input = document.getElementById('nb' + id.charAt(0).toUpperCase() + id.slice(1));
    input.value = Math.max(0, parseInt(input.value) + delta);
    updateCalculations();
}

function showAllSleepingRows() {
    document.getElementById('row-individuel').style.display = 'grid';
    document.getElementById('row-partage').style.display = 'grid';
    if (document.getElementById('row-couple')) document.getElementById('row-couple').style.display = 'grid';
    document.getElementById('advanced-options-link').style.display = 'none';
}

function setSleepingMode(mode) {
    sleepingMode = mode;
    const totalVisitors = parseInt(document.getElementById('nbTotal').value) || 0;

    // Perso UI Pills
    const pillAuto = document.getElementById('mode-auto');
    const pillManu = document.getElementById('mode-manu');
    if (pillAuto) pillAuto.classList.toggle('active', mode === 'auto');
    if (pillManu) pillManu.classList.toggle('active', mode === 'manu');

    // Pro UI Cards
    const cardIndiv = document.getElementById('pro-mode-indiv');
    const cardDouble = document.getElementById('pro-mode-double');
    const cardManu = document.getElementById('pro-mode-manu');
    if (cardIndiv) cardIndiv.classList.toggle('active', mode === 'pro-indiv');
    if (cardDouble) cardDouble.classList.toggle('active', mode === 'pro-double');
    if (cardManu) cardManu.classList.toggle('active', mode === 'manu');

    // Pro Validation Logic (Initial check)
    const errorMsg = document.getElementById('pro-sleeping-error');
    const nextBtn = document.getElementById('btn-next-sleeping');
    if (currentMode === 'pro') {
        if (!mode) {
            if (errorMsg) errorMsg.style.display = 'block';
            if (nextBtn) {
                nextBtn.disabled = true;
                nextBtn.style.opacity = '0.3';
                nextBtn.style.cursor = 'not-allowed';
            }
        } else {
            if (errorMsg) errorMsg.style.display = 'none';
            // Re-enabled by updateCalculations if coherence is OK
        }
    }

    const isAuto = mode === 'auto' || mode === 'pro-indiv' || mode === 'pro-double';
    const isPro = currentMode === 'pro';

    // UI Visibility Logic for Rows
    const grid = document.getElementById('accommodation-grid');
    const rowIndiv = document.getElementById('row-individuel');
    const rowPartage = document.getElementById('row-partage');
    const rowCouple = document.getElementById('row-couple');
    const advLink = document.getElementById('advanced-options-link');
    const autoMsg = document.getElementById('sleeping-auto-msg');
    const proHelp = document.getElementById('pro-sleeping-help');

    if (isPro && (mode === 'pro-indiv' || mode === 'pro-double')) {
        // Hide grid for automatic Pro policies
        if (grid) grid.style.display = 'none';
        if (advLink) advLink.style.display = 'none';
        if (autoMsg) autoMsg.style.display = 'block';
        if (proHelp) proHelp.style.display = 'none';

        let summary = "";
        if (mode === 'pro-indiv') {
            summary = `<strong>${totalVisitors} participant${totalVisitors > 1 ? 's' : ''}</strong> en chambres individuelles.`;
            document.getElementById('nbIndividuel').value = totalVisitors;
            document.getElementById('nbPartage').value = 0;
        } else if (mode === 'pro-double') {
            summary = `<strong>${totalVisitors} participant${totalVisitors > 1 ? 's' : ''}</strong> en chambres partagées (2 lits simples).`;
            document.getElementById('nbPartage').value = totalVisitors;
            document.getElementById('nbIndividuel').value = 0;
        }

        const proAutoText = autoMsg ? autoMsg.querySelector('.pro-only') : null;
        if (proAutoText) proAutoText.innerHTML = summary;
    } else {
        // Show grid for manual or Perso modes
        if (grid) grid.style.display = (isPro || mode === 'manu' || mode === 'auto') ? 'grid' : 'none';
        if (autoMsg) autoMsg.style.display = isAuto ? 'block' : 'none';
        if (advLink) advLink.style.display = 'none';
        if (proHelp) proHelp.style.display = isPro ? 'block' : 'none';

        // Reset text for Perso/Manual
        const proAutoText = autoMsg ? autoMsg.querySelector('.pro-only') : null;
        if (proAutoText && isAuto) proAutoText.innerHTML = "Votre équipe sera répartie de façon optimale sur les meilleures unités de vie.";
    }

    if (document.getElementById('coherence-check')) {
        document.getElementById('coherence-check').style.display = (isPro || mode === 'manu') ? 'flex' : 'none';
    }

    // Default row visibility (when shown)
    if (rowIndiv) rowIndiv.style.display = 'grid';
    if (rowPartage) rowPartage.style.display = 'grid';
    if (rowCouple) rowCouple.style.display = 'grid';

    if (mode === 'manu') {
        document.getElementById('nbIndividuel').value = 0;
        document.getElementById('nbPartage').value = 0;
        if (document.getElementById('nbCouple')) document.getElementById('nbCouple').value = 0;

        if (isPro) {
            const deltaMsg = document.getElementById('sleeping-delta-msg');
            deltaMsg.innerText = "Répartissez vos " + totalVisitors + " participants.";
            deltaMsg.style.color = 'var(--primary)';
        }
    }

    const inputs = document.querySelectorAll('.sleeping-manu-btn');
    inputs.forEach(btn => btn.disabled = isAuto);
    document.querySelectorAll('#step-sleeping input').forEach(inp => inp.readOnly = isAuto);

    updateCalculations();
}


function autoDistribute() {
    const n = parseInt(document.getElementById('nbTotal').value) || 0;
    let remaining = n;

    usedGites = [];
    let totalHoused = 0;

    for (let gite of GITES) {
        if (remaining <= 0) break;

        let taking = Math.min(remaining, gite.cap);
        remaining -= taking;
        totalHoused += taking;
        usedGites.push({
            name: gite.name,
            count: taking,
            cap: gite.cap,
            beds: gite.beds
        });
    }

    const inputIndiv = document.getElementById('nbIndividuel');
    const inputPartage = document.getElementById('nbPartage');
    const inputCouple = document.getElementById('nbCouple');

    // Distribution strategy based on mode
    if (currentMode === 'pro' && sleepingMode === 'pro-indiv') {
        if (inputIndiv) inputIndiv.value = n;
        if (inputCouple) inputCouple.value = 0;
        if (inputPartage) inputPartage.value = 0;
    } else if (currentMode === 'pro' && sleepingMode === 'pro-double') {
        if (inputPartage) inputPartage.value = n;
        if (inputIndiv) inputIndiv.value = 0;
        if (inputCouple) inputCouple.value = 0;
    } else {
        // Classic Perso or Pro Fallback
        if (inputCouple) inputCouple.value = n;
        if (inputIndiv) inputIndiv.value = 0;
        if (inputPartage) inputPartage.value = 0;
    }
}

function updateCalculations() {
    const totalVisitors = parseInt(document.getElementById('nbTotal').value) || 0;
    const nbBaby = document.getElementById('nbBaby') ? parseInt(document.getElementById('nbBaby').value) : 0;
    const nbChild = document.getElementById('nbChild') ? parseInt(document.getElementById('nbChild').value) : 0;
    const nbAdult = document.getElementById('nbAdult') ? parseInt(document.getElementById('nbAdult').value) : 0;

    // Update help text in Step 3 Pro
    const helpNb = document.getElementById('help-nb-total');
    if (helpNb) helpNb.innerText = totalVisitors;

    // Sync Coffee Covers default
    const coffeeInput = document.getElementById('nbCoffeeCovers');
    if (coffeeInput && (parseInt(coffeeInput.value) === 0 || coffeeInput.dataset.auto === 'true')) {
        coffeeInput.value = totalVisitors;
        coffeeInput.dataset.auto = 'true';
    }

    // Mise à jour de la jauge de capacité
    const capacityCurrent = document.getElementById('capacity-current');
    const capacityFill = document.getElementById('capacity-fill');
    if (capacityCurrent && capacityFill) {
        capacityCurrent.innerText = totalVisitors;
        const percentage = Math.min(100, (totalVisitors / 38) * 100);
        capacityFill.style.width = percentage + '%';
        capacityFill.style.background = totalVisitors > 38 ? 'var(--accent)' : 'var(--primary)';
    }

    if (sleepingMode === 'auto' || sleepingMode === 'pro-indiv' || sleepingMode === 'pro-double') {
        autoDistribute();

        // Sync the auto-message text with current participants count
        if (currentMode === 'pro' && (sleepingMode === 'pro-indiv' || sleepingMode === 'pro-double')) {
            const autoMsg = document.getElementById('sleeping-auto-msg');
            const proAutoText = autoMsg ? autoMsg.querySelector('.pro-only') : null;
            if (proAutoText) {
                let summary = "";
                if (sleepingMode === 'pro-indiv') {
                    summary = `<strong>${totalVisitors} participant${totalVisitors > 1 ? 's' : ''}</strong> en chambres individuelles.`;
                } else if (sleepingMode === 'pro-double') {
                    summary = `<strong>${totalVisitors} participant${totalVisitors > 1 ? 's' : ''}</strong> en chambres partagées (2 lits simples).`;
                }
                proAutoText.innerHTML = summary;
            }
        }
    }

    const pIndiv = parseInt(document.getElementById('nbIndividuel').value) || 0;
    const pPartage = parseInt(document.getElementById('nbPartage').value) || 0;
    const pCoupleInput = document.getElementById('nbCouple');
    const pCouple = pCoupleInput ? (parseInt(pCoupleInput.value) || 0) : 0;
    const housedCount = pIndiv + pPartage + pCouple;

    // Update dynamic info spans
    const personWord = currentMode === 'pro' ? 'participant' : 'voyageur';

    const infoIndivText = `${pIndiv} ${personWord}${pIndiv > 1 ? 's' : ''} → ${pIndiv} chambre${pIndiv > 1 ? 's' : ''}`;
    const infoPartageText = `${pPartage} ${personWord}${pPartage > 1 ? 's' : ''} → ${pPartage / 2} chambre${pPartage / 2 > 1 ? 's' : ''}`;

    if (currentMode === 'pro') {
        if (document.getElementById('info-individuel-pro')) document.getElementById('info-individuel-pro').innerText = infoIndivText;
        if (document.getElementById('info-partage-pro')) document.getElementById('info-partage-pro').innerText = infoPartageText;
    } else {
        if (document.getElementById('info-individuel')) document.getElementById('info-individuel').innerText = infoIndivText;
        if (document.getElementById('info-partage')) document.getElementById('info-partage').innerText = infoPartageText;
    }

    // Delta checking for Pro
    const isPro = currentMode === 'pro';
    const deltaMsg = document.getElementById('sleeping-delta-msg');
    const nextBtn = document.getElementById('btn-next-sleeping');

    if (isPro) {
        const delta = totalVisitors - housedCount;
        if (delta > 0) {
            deltaMsg.innerText = ` — Il reste ${delta} participant${delta > 1 ? 's' : ''} à attribuer.`;
            deltaMsg.style.color = 'var(--accent)';
        } else if (delta < 0) {
            deltaMsg.innerText = ` — ${Math.abs(delta)} participant${Math.abs(delta) > 1 ? 's' : ''} en trop !`;
            deltaMsg.style.color = '#e74c3c';
        } else if (totalVisitors > 0) {
            deltaMsg.innerText = " — Répartition parfaite !";
            deltaMsg.style.color = '#27ae60';
        } else {
            deltaMsg.innerText = "Sélectionnez une option pour continuer.";
            deltaMsg.style.color = 'var(--primary)';
        }

        if (nextBtn) {
            const isComplete = (housedCount === totalVisitors && totalVisitors > 0 && sleepingMode !== null);
            nextBtn.disabled = !isComplete;
            nextBtn.style.opacity = isComplete ? '1' : '0.3';
            nextBtn.style.cursor = isComplete ? 'pointer' : 'not-allowed';
        }
    } else {
        if (nextBtn) {
            nextBtn.disabled = false;
            nextBtn.style.opacity = '1';
            nextBtn.style.cursor = 'pointer';
        }
    }

    document.getElementById('housed-count').innerText = housedCount;
    document.getElementById('total-v-count').innerText = totalVisitors;

    const coh = document.getElementById('coherence-check');
    if (sleepingMode === 'manu') {
        coh.style.color = housedCount === totalVisitors ? 'var(--primary)' : 'var(--accent)';
        coh.style.background = housedCount === totalVisitors ? 'rgba(44, 95, 45, 0.08)' : 'rgba(173, 102, 84, 0.1)';
    }

    let nights = 0;
    if (startDate && endDate) {
        nights = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    }

    const toggleList = [
        { id: 'draps', cardId: 'card-draps' },
        { id: 'menage', cardId: 'card-menage' },
        { id: 'chambreIndiv', cardId: 'card-chambre-indiv' },
        { id: 'lateArrival', cardId: 'card-late' },
        { id: 'salleReunion', cardId: 'card-salle' },
        { id: 'sallePro', cardId: 'card-salle-pro' },
        { id: 'supportTech', cardId: 'card-tech' },
        { id: 'accueilLogistique', cardId: 'card-accueil' }
    ];

    toggleList.forEach(item => {
        const inp = document.getElementById(item.id);
        const card = document.getElementById(item.cardId);
        if (inp && card) {
            if (inp.checked) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        }
    });

    let total = 0;
    let hebergementCost = 0;
    let repasCost = 0;
    let optionsCost = 0;
    let html = '';
    const available = isRangeAvailable(startDate, endDate);

    // MISE À JOUR DYNAMIQUE DES BADGES DE PRIX (AVANT LE BLOC DE CALCUL TOTAL)
    if (currentMode === 'pro') {
        const indicativeNights = Math.max(1, nights);
        const pricing = getPricing('SALLE_TRAVAIL_SEMINAIRE', totalVisitors, indicativeNights);
        const price = (pricing && pricing.priceHT) ? pricing.priceHT : 500;

        const badge = document.getElementById('salle-price-badge');
        if (badge) {
            const oldText = badge.innerText;
            badge.innerText = `${price}€ HT / jour`;
            if (oldText !== badge.innerText) {
                console.log(`[UI] Mise à jour prix salle: ${price}€ (NbPers: ${totalVisitors}, Nights: ${indicativeNights})`);
            }
        }
    }

    if (totalVisitors > 0 && nights >= 1) {
        const missingPrices = [];
        const getHT = (code, p = null, n = null, fallback = 0) => {
            const price = getPriceHT(code, p, n);
            if (price === null || Number.isNaN(price)) {
                missingPrices.push(code);
                return fallback;
            }
            return price;
        };
        const modeIsPro = currentMode === 'pro';

        let priceIndiv = 0;
        let pricePartage = 0;
        if (modeIsPro) {
            // Price Twin (Base) - Match Airtable: HEBERGEMENT_SEMINAIRE_NUITEE_CHAMBREPARTAGEE_TWIN
            pricePartage = getHT('HEBERGEMENT_SEMINAIRE_NUITEE_CHAMBREPARTAGEE_TWIN', totalVisitors, nights, 0);
            
            // Price Single = Twin + Supplement - Match Airtable: HEBERGEMENT_SEMINAIRE_SUPPL_SINGLE
            const supplementSingle = getHT('HEBERGEMENT_SEMINAIRE_SUPPL_SINGLE', totalVisitors, nights, 0);
            priceIndiv = pricePartage + supplementSingle;
            
            hebergementCost = Math.round((pIndiv * priceIndiv * nights) + ((pPartage + pCouple) * pricePartage * nights));
        } else {
            const hebergementCode = 'HEBERGEMENT_PERSO_NUITEE';
            const pricePerso = getHT(
                hebergementCode,
                totalVisitors,
                nights,
                0
            );
            priceIndiv = pricePerso;
            pricePartage = pricePerso;
            hebergementCost = Math.round(totalVisitors * pricePerso * nights);
        }

        total += hebergementCost;

        // Count meals from covers inputs
        let countPtDej = 0;
        let countDejeuner = 0;
        let countDiner = 0;
        let countCollation = 0;

        const mealMode = getSelectedMealMode();
        if (mealMode === 'pension') {
            applyPensionComplete(false);
        }

        if (mealMode !== 'libre') {
            // Toujours compter les repas pour le résumé visuel, peu importe le mode de calcul
            document.querySelectorAll('.meal-input-petitDej').forEach(inp => countPtDej += parseInt(inp.value) || 0);
            document.querySelectorAll('.meal-input-dejeuner').forEach(inp => countDejeuner += parseInt(inp.value) || 0);
            document.querySelectorAll('.meal-input-diner').forEach(inp => countDiner += parseInt(inp.value) || 0);
            document.querySelectorAll('.meal-input-collationMatin').forEach(inp => countCollation += parseInt(inp.value) || 0);
            document.querySelectorAll('.meal-input-collationAprem').forEach(inp => countCollation += parseInt(inp.value) || 0);

            // Calcul spécifique PRO Pension complète (Forfait Packé avec remise déduite)
            if (modeIsPro && mealMode === 'pension') {
                repasCost = 0;
                const totalDays = nights + 1;
                const pPrice = getHT('REPAS_SEMINAIRE_PDJ', totalVisitors, nights, 0);
                const dPrice = getHT('REPAS_SEMINAIRE_DEJ', totalVisitors, nights, 0);
                const dinPrice = getHT('REPAS_SEMINAIRE_DINER', totalVisitors, nights, 0);
                const colPrice = 5;

                for (let i = 0; i < totalDays; i++) {
                    const pVal = parseInt(document.getElementById(`meal-${i}-petitDej`)?.value) || 0;
                    const dVal = parseInt(document.getElementById(`meal-${i}-dejeuner`)?.value) || 0;
                    const dinEl = document.getElementById(`meal-${i}-diner`);
                    const dinVal = dinEl ? (parseInt(dinEl.value) || 0) : 0;
                    const colMVal = parseInt(document.getElementById(`meal-${i}-collationMatin`)?.value) || 0;
                    const colAVal = parseInt(document.getElementById(`meal-${i}-collationAprem`)?.value) || 0;

                    const eligible = Math.min(pVal, dVal, dinVal);
                    let dayCost = (pVal * pPrice) + (dVal * dPrice) + (dinVal * dinPrice) + (colMVal * colPrice) + (colAVal * colPrice);
                    dayCost -= (eligible * 10);

                    repasCost += dayCost;
                }
            } else {
                // Mode classique : Somme simple des repas + collations
                const pPrice = getHT(modeIsPro ? 'REPAS_SEMINAIRE_PDJ' : 'REPAS_PERSO_PDJ', totalVisitors, nights, 0);
                const dPrice = getHT(modeIsPro ? 'REPAS_SEMINAIRE_DEJEUNER' : 'REPAS_PERSO_DEJ', totalVisitors, nights, 0);
                const dinPrice = getHT(modeIsPro ? 'REPAS_SEMINAIRE_DINER' : 'REPAS_PERSO_DINER', totalVisitors, nights, 0);
                const colPrice = getHT('REPAS_SEMINAIRE_COLLATION', totalVisitors, nights, 5);
                repasCost = (countPtDej * pPrice) + (countDejeuner * dPrice) + (countDiner * dinPrice) + (countCollation * colPrice);
            }
        }
        total += repasCost;

        // On met à jour les totaux par jour visuels
        updateDayTotals();

        html += `<div style="margin-bottom:15px; display:flex; gap:10px; align-items:center;"><i class="fas fa-users" style="color:var(--primary);"></i> <strong>Participants :</strong> ${totalVisitors} personne${totalVisitors > 1 ? 's' : ''}</div>`;

        // Update Meal Summary Text
        if (mealMode !== 'libre') {
            const mealSum = mealMode === 'pension' ? 'Pension complète' : 'Sur mesure';
            html += `<div style="margin-bottom:15px;"><i class="fas fa-utensils" style="color:var(--primary);"></i> <strong>Restauration :</strong> Traiteur (${mealSum} : ${countPtDej} Pt-dej, ${countDejeuner} Déj, ${countDiner} Dîner + ${countCollation} pauses)</div>`;
        }

        let roomSummary = '';
        const autoDetail = document.getElementById('sleeping-auto-detail');

        if (sleepingMode === 'auto' || sleepingMode === 'pro-indiv' || sleepingMode === 'pro-double') {
            if (usedGites.length > 0) {
                // --- Logic Separation: PRO vs PERSO ---
                if (currentMode === 'pro') {
                    // --- RENDER PRO (Seminar Strategy) - Simplified ---
                    let innerDetail = '';

                    if (totalVisitors > 38) {
                        innerDetail += `<div style="color:var(--accent); font-weight:700; font-size:0.85rem; margin-top:10px; padding:10px; background:rgba(173, 102, 84, 0.05); border-radius:8px;"><i class="fas fa-exclamation-triangle"></i> Note : La capacité standard (38 couchages) est atteinte. Nous activerons des lits d'appoint pour votre séminaire.</div>`;
                    }
                    autoDetail.innerHTML = innerDetail;
                    if (innerDetail === '') autoDetail.style.display = 'none';

                } else {
                    // --- RENDER PERSO (Classic Grid) ---
                    let innerDetail = '<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap:18px; margin-top:10px;">';
                    usedGites.forEach((g, idx) => {
                        const bedIcons = g.beds
                            .replace(/lit double/g, '<i class="fas fa-bed"></i> lit double')
                            .replace(/simples/g, '<i class="fas fa-bed"></i> simples')
                            .replace(/canapé/g, '<i class="fas fa-couch"></i> canapé')
                            .replace(/appoint/g, '<i class="fas fa-plus-circle"></i> appoint');

                        const giteData = GITES.find(gt => gt.name === g.name);
                        const detailsId = `gite-details-${idx}`;

                        const block = `
                                    <div style="margin-bottom:8px;">
                                        <strong style="font-size:1.05rem;">${g.name}</strong> (${g.count} pers.)
                                        <br>
                                        <span style="font-size:0.85rem; opacity:0.8; line-height:1.8;">${bedIcons}</span>
                                        <br>
                                        <button class="gite-details-btn" onclick="toggleGiteDetails('${detailsId}')">Détails</button>
                                        <div id="${detailsId}" class="gite-details-content">
                                            <div class="gite-details-inner">
                                                <div style="margin-bottom:6px;"><strong>Composition :</strong> ${giteData.beds}</div>
                                                <div style="margin-bottom:6px;"><strong>Remarques :</strong> ${giteData.remarks}</div>
                                                <div><strong>Capacité max :</strong> ${giteData.cap} personnes</div>
                                            </div>
                                        </div>
                                    </div>`;
                        innerDetail += `<div style="background:white; padding:16px; border-radius:14px; border:1px solid rgba(0,0,0,0.05); box-shadow: 0 2px 8px rgba(0,0,0,0.04);">${block}</div>`;
                    });
                    innerDetail += '</div>';

                    if (totalVisitors > 38) {
                        const warn = `<div style="color:var(--accent); font-weight:600; font-size:0.8rem; margin-top:5px;"><i class="fas fa-exclamation-triangle"></i> Capacité Domaine Sesquier (38) dépassée</div>`;
                        innerDetail += warn;
                    }
                    autoDetail.innerHTML = innerDetail;
                }

                autoDetail.style.display = 'block';

                // --- Simplified Summary for the RIGHT COLUMN ---
                roomSummary = `<div style="color:#4CAF50;"><i class="fas fa-magic"></i> Optimisation automatique appliquée</div>`;
            }
            else {
                roomSummary = '<p style="font-style:italic; opacity:0.6;">En attente des dates et du groupe...</p>';
                autoDetail.style.display = 'none';
            }
        } else {
            autoDetail.style.display = 'none';
            if (housedCount === totalVisitors) {
                roomSummary = `<div style="color:#4CAF50;"><i class="fas fa-check-circle"></i> Répartition validée (${housedCount}/${totalVisitors})</div>`;
            } else {
                const diff = totalVisitors - housedCount;
                roomSummary = `<div style="color:var(--accent); font-weight:600;">${diff > 0 ? 'Il manque ' + diff + ' lit(s)' : 'Trop de lits (' + Math.abs(diff) + ')'}</div>`;
                roomSummary += `<button onclick="fixAccommodation()" style="background:none; border:none; color:var(--primary); text-decoration:underline; cursor:pointer; font-size:0.85rem; padding:0; margin-top:4px;">Corriger automatiquement</button>`;
            }
        }
        html += `<div style="margin-bottom:15px;"><i class="fas fa-home" style="color:var(--primary);"></i> <strong>Hébergement :</strong><br>${roomSummary}</div>`;

        let selectedOptions = [];

        // PRO MODE: Inclusions (Draps, Ménage, Accueil)
        if (currentMode === 'pro') {
            selectedOptions.push("Lits préparés & Ménage (Inclus)");
            selectedOptions.push("Accueil & Logistique (Inclus)");
        } else {
            // Forfait Privatisation Obligatoire
            const privPrice = getHT('PRIVATISATION_PERSO_LIEU', totalVisitors, nights, 650);
            optionsCost += privPrice;
            total += privPrice;
            // On l'ajoute en premier pour qu'il soit bien visible
            selectedOptions.push(`Privatisation & Espaces (${privPrice}€)`);

            const drapsEl = document.getElementById('draps');
            if (drapsEl && drapsEl.checked) {
                const drapsPrice = getHT('FORFAIT_DRAPS_PERSO_DRAPS', totalVisitors, nights, 7);
                const c = Math.round(totalVisitors * drapsPrice);
                optionsCost += c; total += c;
                selectedOptions.push("Draps & linge");
            }
            const menageEl = document.getElementById('menage');
            if (menageEl && menageEl.checked) {
                const menagePrice = getHT('OPTION_PERSO_MENAGE', totalVisitors, nights, 300);
                optionsCost += menagePrice; total += menagePrice;
                selectedOptions.push("Ménage");
            }
            const indivEl = document.getElementById('chambreIndiv');
            if (indivEl && indivEl.checked) {
                const indivPrice = getHT('OPTION_PERSO_CHAMBRE_INDIV', totalVisitors, nights, 30);
                optionsCost += indivPrice; total += indivPrice;
                selectedOptions.push("Chambre individuelle");
            }
        }

        // Update Price Badges in UI
        const updateBadge = (id, price, unit = '€') => {
            const el = document.getElementById(id);
            if (el) el.innerText = price !== null ? `${price}${unit}` : 'Sur demande';
        };

        updateBadge('draps-badge', getHT('FORFAIT_DRAPS_PERSO_DRAPS', totalVisitors, nights, 7), '€ / pers');
        updateBadge('menage-badge', getHT('OPTION_PERSO_MENAGE', totalVisitors, nights, 300), '€');
        updateBadge('pro-indiv-card-badge', `+${getHT('OPTION_PERSO_CHAMBRE_INDIV', totalVisitors, nights, 30)}`, '€ HT / pers');
        updateBadge('perso-indiv-row-badge', `+${getHT('OPTION_PERSO_CHAMBRE_INDIV', totalVisitors, nights, 30)}`, '€ / nuit / pers');
        updateBadge('pro-indiv-row-badge', `(+ ${getHT('OPTION_PERSO_CHAMBRE_INDIV', totalVisitors, nights, 30)}€ HT)`, '');

        const soireePrice = getHT('OPTION_PRO_KIT_SOIREE', totalVisitors, nights, 500);
        updateBadge('soiree-badge', soireePrice, '€');

        const pPrice = getPriceHT('REPAS_SEMINAIRE_PDJ', totalVisitors, nights, 14);
        const dPrice = getPriceHT('REPAS_SEMINAIRE_DEJ', totalVisitors, nights, 26);
        const dinPrice = getPriceHT('REPAS_SEMINAIRE_DINER', totalVisitors, nights, 30);
        const packPrice = (pPrice + dPrice + dinPrice + 10) - 10; // Remise de 10 incluse fictivement pour l'affichage
        updateBadge('pension-badge', packPrice, '€ HT / pers / jour');

        let roomDisplayHtml = '';
        // On récupère le prix dynamique pour l'afficher dans le badge, même si non coché
        // La logique de badge est maintenant centralisée dans le bloc 'pro' ci-dessous.

        if (currentMode === 'pro') {
            const realPrice = getHT('SALLE_TRAVAIL_SEMINAIRE', totalVisitors, nights, 0);
            
            // On s'assure que le badge est aussi à jour ici
            const badge = document.getElementById('salle-price-badge');
            if (badge) {
                if (missingPrices.includes('SALLE_TRAVAIL_SEMINAIRE')) {
                    badge.innerHTML = '<span style="color:#e74c3c;">⚠️ CONFIG AIRTABLE</span>';
                } else {
                    badge.innerText = `${realPrice}€ HT / jour`;
                }
            }

            const salleEl = document.getElementById('salleReunion');
            if (salleEl && salleEl.checked) {
                const billDays = nights;
                const salleCost = Math.round(realPrice * billDays);
                optionsCost += salleCost; total += salleCost;
                const roomLabel = `Salle équipée (${billDays} jours)`;
                roomDisplayHtml = `<div style="margin-bottom:15px;"><strong>Location :</strong> ${roomLabel}</div>`;
            }
        }

        const lateEl = document.getElementById('lateArrival');
        if (lateEl && lateEl.checked) {
            selectedOptions.push("Arrivée/Départ flex");
        }
        if (currentMode === 'pro' && document.getElementById('kitSoiree') && document.getElementById('kitSoiree').checked) {
            const kitPrice = getHT('OPTION_PRO_KIT_SOIREE', totalVisitors, nights, 500);
            optionsCost += kitPrice; total += kitPrice;
            selectedOptions.push("Kit soirée");
        }
        if (currentMode === 'pro' && bookingDraft.activities && bookingDraft.activities.requested) {
            selectedOptions.push("Activités");
        }

        if (roomDisplayHtml) html += roomDisplayHtml;

        if (selectedOptions.length > 0) {
            html += `<div style="margin-bottom:15px;"><i class="fas fa-sparkles" style="color:var(--primary);"></i> <strong>Options :</strong> ${selectedOptions.join(', ')}</div>`;
        }

        const cta = document.getElementById('cta-quote');
        if (cta) {
            if (available) {
                cta.style.display = 'block';
                const contactSection = document.getElementById('step-contact');
                const contactIsVisible = contactSection ? contactSection.style.display !== 'none' : true;
                const emailVal = document.getElementById('email').value;
                const isFormFilled = emailVal.includes('@') && emailVal.length > 5;

                if (!contactIsVisible) {
                    cta.innerText = "Enregistrer les modifications";
                    cta.style.background = "var(--primary)";
                } else if (isFormFilled) {
                    cta.innerHTML = '<i class="fas fa-save"></i> Enregistrer';
                    cta.style.background = "var(--primary)";
                } else {
                    cta.innerHTML = '<i class="fas fa-check"></i> Valider les choix';
                    cta.style.background = "#D48D6C";
                }
            } else {
                cta.style.display = 'none';
            }
        }

        const htSuffix = currentMode === 'pro' ? ' HT' : '';
        const minPrice = Math.floor((total * 0.95) / 10) * 10;
        const maxPrice = Math.ceil((total * 1.05) / 10) * 10;
        const rangeText = `${minPrice}€ - ${maxPrice}€${htSuffix}`;
        const perPersText = nights > 0 ? `Env. ${Math.round(total / (totalVisitors * nights))}€${htSuffix} / pers / nuit` : "N/A";

        const totalTTCEl = document.getElementById('totalTTC');
        if (totalTTCEl) totalTTCEl.innerText = rangeText;

        const perPersonDisplayEl = document.getElementById('perPersonDisplay');
        if (perPersonDisplayEl) perPersonDisplayEl.innerText = `Équivalent ${perPersText}`;

        // === NOUVELLE CARTE RÉSUMÉ ===

        // Type de séjour
        const typeCompact = document.getElementById('summary-type-compact');
        if (typeCompact) {
            const typeValEl = document.getElementById('summary-type-val');
            if (typeValEl) typeValEl.innerText = currentMode === 'pro' ? 'Professionnel' : 'Personnel';
            typeCompact.style.display = 'block';
        }

        // Badge "Disponible ✓"
        const availableBadge = document.getElementById('availability-badge');
        if (availableBadge) {
            availableBadge.style.display = available ? 'inline-block' : 'none';
        }

        // Détails séjour compacts
        const datesCompact = document.getElementById('summary-dates-compact');
        const nightsCompact = document.getElementById('summary-nights-compact');
        const participantsCompact = document.getElementById('summary-participants-compact');
        const sleepingCompact = document.getElementById('summary-sleeping-compact');
        const mealsCompact = document.getElementById('summary-meals-compact');

        if (datesCompact && startDate && endDate) {
            const startStr = startDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
            const endStr = endDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
            const datesValEl = document.getElementById('summary-dates-val');
            if (datesValEl) datesValEl.innerText = `${startStr} → ${endStr}`;
            datesCompact.style.display = 'block';
        }

        if (nightsCompact && nights > 0) {
            const nightsValEl = document.getElementById('summary-nights-val-compact');
            if (nightsValEl) nightsValEl.innerText = nights;
            nightsCompact.style.display = 'block';
        }

        if (participantsCompact && totalVisitors > 0) {
            const participantsValEl = document.getElementById('summary-participants-val');
            if (participantsValEl) participantsValEl.innerText = totalVisitors;
            participantsCompact.style.display = 'block';
        }

        if (sleepingCompact && totalVisitors > 0) {
            sleepingCompact.style.display = 'block';
        }

        if (mealsCompact) {
            const mealType = getSelectedMealMode();
            let mealStatus = "Libre";
            if (mealType === 'pension') {
                mealStatus = "Pension complète";
            } else if (mealType === 'traiteur' || mealType === 'custom') {
                const mCount = document.querySelectorAll('[class^="meal-input-"]');
                let totalM = 0;
                mCount.forEach(i => totalM += parseInt(i.value) || 0);
                mealStatus = totalM > 0 ? `Traiteur (${totalM} repas)` : "Traiteur (0 repas)";
            }
            const mealsValEl = document.getElementById('summary-meals-val');
            if (mealsValEl) mealsValEl.innerText = mealStatus;
            mealsCompact.style.display = 'block';
        }

        // Alerte micro si repas/options = 0
        const microAlert = document.getElementById('summary-micro-alert');
        if (microAlert) {
            const showAlert = (repasCost === 0 || optionsCost === 0);
            microAlert.style.display = showAlert ? 'block' : 'none';
        }

        // Bloc budget
        const budgetBlock = document.getElementById('summary-budget-block');
        const ctaBlock = document.getElementById('summary-cta-block');

        if (budgetBlock) {
            const heroEl = document.getElementById('summary-total-hero');
            if (heroEl) {
                if (currentMode === 'pro') {
                    heroEl.innerHTML = `${minPrice}€ - ${maxPrice}€ <span style="font-size: 0.85rem; font-family: sans-serif; opacity: 0.8; font-weight: 600;">HT</span>`;
                } else {
                    heroEl.innerText = rangeText;
                }
            }
            const pNuitLine = (totalVisitors > 0 && nights > 0) ? `≈ ${Math.round(total / (totalVisitors * nights))}€${htSuffix} / pers / nuit` : "";
            const perPersonLineEl = document.getElementById('summary-per-person-line');
            if (perPersonLineEl) perPersonLineEl.innerText = pNuitLine;
            budgetBlock.style.display = 'block';

            // Breakdown avec gestion intelligente
            const breakdownH = document.getElementById('breakdown-hebergement-new');
            if (breakdownH) {
                if (missingPrices.some(c => c.includes('HEBERGEMENT'))) {
                    breakdownH.innerHTML = '<span style="color:#e74c3c; font-weight:bold;">⚠️ CONFIG AIRTABLE</span>';
                } else {
                    breakdownH.innerText = `${hebergementCost}€${htSuffix}`;
                }
            }

            const breakdownR = document.getElementById('breakdown-repas-new');
            if (breakdownR) {
                if (missingPrices.some(c => c.includes('REPAS'))) {
                    breakdownR.innerHTML = '<span style="color:#e74c3c; font-weight:bold;">⚠️ CONFIG AIRTABLE</span>';
                } else {
                    breakdownR.innerText = repasCost > 0 ? `${repasCost}€${htSuffix}` : "Non sélectionné";
                }
            }

            const breakdownO = document.getElementById('breakdown-options-new');
            if (breakdownO) {
                if (missingPrices.some(c => c.includes('OPTION') || c.includes('SALLE'))) {
                    breakdownO.innerHTML = '<span style="color:#e74c3c; font-weight:bold;">⚠️ CONFIG AIRTABLE</span>';
                } else {
                    breakdownO.innerText = optionsCost > 0 ? `${optionsCost}€${htSuffix}` : "Aucune";
                }
            }

            const breakdownLinesEl = document.getElementById('budget-breakdown-lines');
            if (breakdownLinesEl) breakdownLinesEl.style.display = 'block';
        }

        if (ctaBlock) {
            ctaBlock.style.display = 'block';
            const pdfBtn = document.getElementById('cta-pdf');
            if (pdfBtn) pdfBtn.style.display = available ? 'flex' : 'none';
        }

        // Animation "Mis à jour ✓"
        showUpdateIndicator();
    } else {
        // Masquer les blocs si pas de données complètes
        const budgetBlock = document.getElementById('summary-budget-block');
        const ctaBlock = document.getElementById('summary-cta-block');
        if (budgetBlock) budgetBlock.style.display = 'none';
        if (ctaBlock) ctaBlock.style.display = 'none';

        const ctaQuoteEl = document.getElementById('cta-quote');
        if (ctaQuoteEl) {
            ctaQuoteEl.innerText = "Veuillez compléter vos choix";
            ctaQuoteEl.style.background = "#ccc";
        }
    }

    saveDraft();
    debouncedSyncToAirtable();
}

function handleMainCTA() {
    const total = parseInt(document.getElementById('nbTotal').value) || 0;
    const email = document.getElementById('email')?.value || '';
    const isValid = (startDate && endDate && total > 0);
    const emailVal = document.getElementById('email')?.value || '';
    const isFormFilled = emailVal.includes('@') && emailVal.length > 5;

    // En mode Expert/Editing, on sauvegarde directement si les fondamentaux sont là
    if (isEditingMode || document.body.classList.contains('is-expert')) {
        if (!startDate || !endDate) {
            scrollToStep('step-dates');
            return alert("Veuillez sélectionner des dates.");
        }
        if (total < 1) {
            scrollToStep('step-group');
            return alert("Le groupe doit contenir au moins 1 personne.");
        }
        sendQuoteRequest();
    } else {
        // Logique habituelle pour le client (legacy)
        if (isValid && isFormFilled) {
            saveDraft();
            const contactSection = document.getElementById('step-contact');
            if (contactSection) {
                contactSection.style.display = 'block';
                setTimeout(() => scrollToStep('step-contact'), 50);
            }
        } else if (!isValid) {
            scrollToStep('step-dates');
        } else if (total < 1) {
            scrollToStep('step-group');
            updateCalculations();
        } else {
            sendQuoteRequest();
        }
    }
}

function fixAccommodation() {
    setSleepingMode('auto');
    // Petit feedback visuel
    const banner = document.getElementById('sleeping-auto-msg');
    banner.style.boxShadow = '0 0 15px var(--primary)';
    setTimeout(() => banner.style.boxShadow = 'none', 1000);
}

function showUpdateIndicator() {
    const indicator = document.getElementById('update-indicator');
    if (!indicator) return;

    indicator.style.display = 'block';
    // Force reflow pour que la transition fonctionne
    indicator.offsetHeight;
    indicator.style.opacity = '1';

    setTimeout(() => {
        indicator.style.opacity = '0';
        setTimeout(() => {
            indicator.style.display = 'none';
        }, 300);
    }, 1200);
}

function toggleGiteDetails(detailsId) {
    const detailsEl = document.getElementById(detailsId);
    if (!detailsEl) return;

    detailsEl.classList.toggle('open');
}

function selectAllMeals() {
    const n = parseInt(document.getElementById('nbTotal').value) || 0;
    document.querySelectorAll('.meal-input-petitDej, .meal-input-dejeuner, .meal-input-diner, .meal-input-collationMatin, .meal-input-collationAprem').forEach(inp => {
        inp.value = n;
    });
    updateCalculations();
}

let autoSyncTimer = null;
function debouncedSyncToAirtable() {
    if (!bookingDraft.id || !isEditingMode) return;
    if (autoSyncTimer) clearTimeout(autoSyncTimer);
    autoSyncTimer = setTimeout(() => {
        sendQuoteRequest(true);
    }, 2000);
}

async function sendQuoteRequest(silent = false) {
    const btn = document.getElementById('cta-quote');
    const originalText = btn ? btn.innerText : "Créer le dossier";
    const totalEl = document.getElementById('totalTTC');
    const email = document.getElementById('email')?.value || '';
    const organisation = document.getElementById('organisation')?.value || '';
    const firstName = document.getElementById('firstname')?.value || '';
    const lastName = document.getElementById('lastname')?.value || '';
    const phone = document.getElementById('phone')?.value || '';
    const message = document.getElementById('message')?.value || '';
    const nbTotal = parseInt(document.getElementById('nbTotal')?.value) || 0;

    const isExpert = document.body.classList.contains('is-expert') || isEditingMode;

    const mealMode = getSelectedMealMode();
    if (mealMode === 'pension') {
        applyPensionComplete(false);
    }
    
    let totalPtDej = 0, totalDejeuner = 0, totalDiner = 0, totalPauses = 0;
    let mealInfo = "";
    let activitiesInfo = "";

    if (bookingDraft.activities && bookingDraft.activities.requested) {
        activitiesInfo = `\n\nActivités: ${bookingDraft.activities.type} (Budget: ${bookingDraft.activities.budget}€, Ambiance: ${bookingDraft.activities.ambiance})\nNotes: ${bookingDraft.activities.message}`;
    }

    if (mealMode === 'libre') {
        mealInfo = "\nRestauration: Gestion Libre";
    } else {
        document.querySelectorAll('.meal-input-petitDej').forEach(inp => totalPtDej += parseInt(inp.value) || 0);
        document.querySelectorAll('.meal-input-dejeuner').forEach(inp => totalDejeuner += parseInt(inp.value) || 0);
        document.querySelectorAll('.meal-input-diner').forEach(inp => totalDiner += parseInt(inp.value) || 0);
        let pausesMatin = 0, pausesAprem = 0;
        document.querySelectorAll('.meal-input-collationMatin').forEach(inp => pausesMatin += parseInt(inp.value) || 0);
        document.querySelectorAll('.meal-input-collationAprem').forEach(inp => pausesAprem += parseInt(inp.value) || 0);
        totalPauses = pausesMatin + pausesAprem;
        const label = mealMode === 'pension' ? 'Pension Complète' : 'Traiteur / À la carte';
        mealInfo = `\nRestauration: ${label}\n- Petits-déjeuners: ${totalPtDej}\n- Déjeuners: ${totalDejeuner}\n- Dîners: ${totalDiner}\n- Pauses/Collations: ${totalPauses}`;
        const diet = document.getElementById('dietary');
        if (diet && diet.value) mealInfo += `\nRégimes/Allergies: ${diet.value}`;
    }

    const mealCounts = [];
    if (mealMode !== 'libre' && startDate && endDate) {
        const diffDays = Math.ceil((endDate - startDate) / 86400000);
        for (let i = 0; i <= diffDays; i++) {
            mealCounts.push({
                day: i,
                petitDej: parseInt(document.getElementById(`meal-${i}-petitDej`)?.value) || 0,
                dejeuner: parseInt(document.getElementById(`meal-${i}-dejeuner`)?.value) || 0,
                diner: parseInt(document.getElementById(`meal-${i}-diner`)?.value) || 0,
                collationMatin: parseInt(document.getElementById(`meal-${i}-collationMatin`)?.value) || 0,
                collationAprem: parseInt(document.getElementById(`meal-${i}-collationAprem`)?.value) || 0
            });
        }
    }

    const dossier = DossierModel.build({
        mode: currentMode,
        client: { organisation, firstName, lastName, email, phone, message },
        dates: { start: startDate, end: endDate },
        group: {
            total: nbTotal,
            adult: document.getElementById('nbAdult') ? parseInt(document.getElementById('nbAdult').value) || 0 : nbTotal,
            child: document.getElementById('nbChild') ? parseInt(document.getElementById('nbChild').value) || 0 : 0,
            baby: document.getElementById('nbBaby') ? parseInt(document.getElementById('nbBaby').value) || 0 : 0
        },
        sleeping: {
            mode: sleepingMode,
            indiv: parseInt(document.getElementById('nbIndividuel')?.value) || 0,
            partage: parseInt(document.getElementById('nbPartage')?.value) || 0,
            couple: parseInt(document.getElementById('nbCouple')?.value) || 0,
            usedGites: usedGites
        },
        meals: { mode: mealMode, counts: mealCounts },
        options: {
            draps: document.getElementById('draps')?.checked || false,
            menage: document.getElementById('menage')?.checked || false,
            lateArrival: document.getElementById('lateArrival')?.checked || false,
            salleReunion: document.getElementById('salleReunion')?.checked || false,
            kitSoiree: document.getElementById('kitSoiree')?.checked || false,
            chambreIndiv: document.getElementById('chambreIndiv')?.checked || false,
            activities: bookingDraft.activities || {}
        },
        pricingDB: window.PRICING_DB || []
    });

    let typeSejour = currentMode === 'pro' ? "séminaire professionnel" : (nbTotal > 15 ? "séjour de groupe" : "séjour personnel");

    const payload = {
        fields: {
            "Nom client": dossier.client.fullName,
            "Email": dossier.client.email,
            "Date arrivée": dossier.sejour.dateArrivee,
            "Date départ": dossier.sejour.dateDepart,
            "Nb personnes": dossier.sejour.participants,
            "Nombre de personnes": dossier.sejour.participants,
            "Nuits": dossier.sejour.nights,
            "Type": [typeSejour],
            "Statut": ["à traiter"],
            "Budget estimé": dossier.financials.totalTTC.toFixed(0) + "€",
            "Message": ((dossier.client.organisation ? `Société: ${dossier.client.organisation}\n` : '') + (dossier.client.phone ? `Tél: ${dossier.client.phone}\n` : '') + message + mealInfo + activitiesInfo).trim(),
            "Option draps": dossier.options.draps ? "Oui" : "Non",
            "Option ménage": dossier.options.menage ? "Oui" : "Non",
            "Montant Hébergement HT": dossier.financials.subtotals.hebergement,
            "Montant Repas HT": dossier.financials.subtotals.restauration,
            "Montant Options HT": dossier.financials.subtotals.options,
            "Total HT": dossier.financials.totalHT,
            "Total TTC": dossier.financials.totalTTC,
            "Repas déjeuner": totalDejeuner,
            "Repas dîner": totalDiner,
            "Qté Collation": totalPauses,
            "Détails JSON": JSON.stringify({
                group: dossier.sejour,
                dates: { start: dossier.sejour.dateArrivee, end: dossier.sejour.dateDepart, nights: dossier.sejour.nights },
                sleeping: dossier.sleeping,
                meals: { mode: mealMode, counts: mealCounts },
                options: dossier.options
            }, null, 2),
            "Dossier JSON": JSON.stringify(dossier, null, 2)
        }
    };

    try {
        if (btn && !silent) {
            btn.disabled = true;
            btn.innerText = "Envoi en cours...";
            btn.style.opacity = "0.7";
        }

        const method = isEditingMode ? 'PATCH' : 'POST';
        const endpoint = API_RESERVATIONS_URL;

        if (isEditingMode) payload.id = bookingDraft.id;

        const response = await fetch(endpoint, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            if (silent) return; // Ignore errors in silent mode
            let errorMsg = `Échec de l'envoi (${response.status})`;
            try {
                const errData = await response.json();
                if (errData && errData.error && errData.error.message) {
                    errorMsg = errData.error.message;
                }
            } catch(e) {}
            throw new Error(errorMsg);
        }

        const result = await response.json();
        console.log('Réponse Airtable (auto-sync=' + silent + '):', result);

        if (btn && !silent) {
            btn.style.background = "#27ae60";
            btn.innerText = "Dossier enregistré ! ✓";
            setTimeout(() => {
                btn.disabled = false;
                btn.innerText = originalText;
                btn.style.background = "";
                btn.style.opacity = "1";
            }, 3000);
        }

        // Notify global dashboard
        SesquierUtils.broadcast('RECORD_UPDATED', { id: isEditingMode ? bookingDraft.id : result.id, fields: payload.fields });
        if (silent) showUpdateIndicator();

    } catch (error) {
        console.error("Erreur envoi devis:", error);
        if (btn) {
            btn.disabled = false;
            btn.innerText = "Erreur - Réessayer";
            btn.style.background = "#e74c3c";
        }
        alert("Une erreur est survenue lors de l'envoi : " + error.message);
    }
}

// --- Activities Modal Functions ---
function openActivitiesModal() {
    document.getElementById('modal-activities').style.display = 'flex';
    // Pre-fill if draft exists
    if (bookingDraft.activities) {
        document.getElementById('act-type').value = bookingDraft.activities.type || '';
        document.getElementById('act-budget').value = bookingDraft.activities.budget || '';
        document.getElementById('act-ambiance').value = bookingDraft.activities.ambiance || '';
        document.getElementById('act-msg').value = bookingDraft.activities.message || '';
    }
}

function closeActivitiesModal() {
    document.getElementById('modal-activities').style.display = 'none';
}

function saveActivities() {
    bookingDraft.activities = {
        requested: true,
        type: document.getElementById('act-type').value,
        budget: document.getElementById('act-budget').value,
        ambiance: document.getElementById('act-ambiance').value,
        message: document.getElementById('act-msg').value
    };

    // Visual feedback
    const badge = document.getElementById('activities-badge-added');
    if (badge) {
        badge.style.display = 'flex';
        // Scroll slightly
        badge.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    closeActivitiesModal();
    updateCalculations();
}

// Auto-restore + synchro Airtable au chargement
window.addEventListener('load', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const recordId = urlParams.get('id');

    const modeParam = urlParams.get('mode');

    if (recordId) {
        await loadFromAirtable(recordId);
    } else {
        restoreDraft();
    }

    if (modeParam === 'pro' || modeParam === 'perso') {
        startFlow(modeParam);
    }

    renderCalendar();

    await Promise.all([
        loadReservationsFromAirtable(),
        loadPricingFromAirtable()
    ]);
});

async function generatePDF() {
    const btn = document.getElementById('cta-pdf');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Génération...';
    btn.disabled = true;

    try {
        const totalVisitors = document.getElementById('nbTotal').value || 0;
        const arrivee = document.getElementById('displayArrivee').innerText;
        const depart = document.getElementById('displayDepart').innerText;
        const totalStr = document.getElementById('summary-total-hero').innerText;
        const perPersStr = document.getElementById('summary-per-person-line').innerText;
        const modeStr = currentMode === 'pro' ? 'Professionnel (Séminaire)' : 'Personnel (Famille/Amis)';

        const hCost = document.getElementById('breakdown-hebergement-new').innerText;
        const rCost = document.getElementById('breakdown-repas-new').innerText;
        const oCost = document.getElementById('breakdown-options-new').innerText;

        // Création d'un élément temporaire pour le rendu - On le met hors écran (off-screen)
        const tempDiv = document.createElement('div');
        tempDiv.id = 'temp-pdf-content';
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.top = '0';
        tempDiv.style.width = '700px';
        tempDiv.style.zIndex = '9999'; // Ensure it's on top of everything nicely
        tempDiv.style.background = '#ffffff';

        tempDiv.innerHTML = `
                    <div style="padding: 40px; background-color: #ffffff; color: #2D302A; font-family: Arial, sans-serif;">
                        <table style="width: 100%; margin-bottom: 40px;">
                            <tr>
                                <td>
                                    <h1 style="color: #3A5538; font-size: 28px; margin: 0;">Domaine Sesquier</h1>
                                    <p style="font-size: 12px; color: #9E5D4C; text-transform: uppercase; margin-top: 5px;">Esprit de famille & Art de vivre</p>
                                </td>
                                <td style="text-align: right; font-size: 12px; color: #666;">
                                    Édité le ${new Date().toLocaleDateString('fr-FR')}
                                </td>
                            </tr>
                        </table>

                        <h2 style="font-size: 18px; border-bottom: 2px solid #3A5538; padding-bottom: 8px; color: #3A5538;">Votre Projet de Séjour</h2>
                        <table style="width: 100%; margin-bottom: 30px; font-size: 14px;">
                            <tr><td style="padding: 5px 0;"><strong>Client :</strong> ${document.getElementById('firstname').value || 'Non renseigné'} ${document.getElementById('lastname').value || ''}</td></tr>
                            <tr><td style="padding: 5px 0;"><strong>Type de séjour :</strong> ${modeStr}</td></tr>
                            <tr><td style="padding: 5px 0;"><strong>Dates :</strong> Du ${arrivee} au ${depart}</td></tr>
                            <tr><td style="padding: 5px 0;"><strong>Participants :</strong> ${totalVisitors} personnes</td></tr>
                        </table>

                        <h2 style="font-size: 18px; border-bottom: 2px solid #3A5538; padding-bottom: 8px; color: #3A5538;">Estimation Budgétaire</h2>
                        <div style="background-color: #F7F3EB; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
                            <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
                                <tr style="border-bottom: 1px solid rgba(0,0,0,0.05);">
                                    <td style="padding: 10px 0;">Hébergement (Gîtes)</td>
                                    <td style="text-align: right; font-weight: bold;">${hCost || '0€'}</td>
                                </tr>
                                <tr style="border-bottom: 1px solid rgba(0,0,0,0.05);">
                                    <td style="padding: 10px 0;">Restauration</td>
                                    <td style="text-align: right; font-weight: bold;">${rCost || 'Non sélectionné'}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px 0;">Options & Services</td>
                                    <td style="text-align: right; font-weight: bold;">${oCost || 'Aucune'}</td>
                                </tr>
                            </table>
                        </div>

                        <div style="background-color: #3A5538; color: #ffffff; padding: 30px; border-radius: 12px; text-align: center;">
                            <p style="font-size: 12px; text-transform: uppercase; margin-bottom: 5px;">Total Estimé (TTC)</p>
                            <div style="font-size: 36px; font-weight: bold; margin-bottom: 5px;">${totalStr}</div>
                            <p style="font-size: 14px; opacity: 0.8;">${perPersStr}</p>
                        </div>

                        <div style="margin-top: 50px; border-top: 1px solid #E2DDD5; padding-top: 15px; font-size: 11px; color: #777;">
                            <p><strong>DOMAINE SESQUIER</strong> - Route de Montagnac, 34560 Villeveyrac</p>
                            <p style="margin-top: 10px; font-style: italic;">* Ce document est une estimation indicative. Le devis contractuel sera établi après confirmation de la disponibilité.</p>
                        </div>
                    </div>
                `;

        document.body.appendChild(tempDiv);

        // Check library
        if (typeof html2pdf === 'undefined') {
            alert("La librairie PDF n'est pas chargée. Vérifiez votre connexion internet.");
            throw new Error("html2pdf not found");
        }

        // Wait for rendering
        await new Promise(resolve => setTimeout(resolve, 500));

        const opt = {
            margin: 10,
            filename: `Estimation_Sesquier_${new Date().toISOString().slice(0, 10)}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                scrollY: 0
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        await html2pdf().set(opt).from(tempDiv).save();

        document.body.removeChild(tempDiv);

    } catch (err) {
        console.error("Erreur PDF:", err);
        alert("Erreur lors de la génération. Veuillez réessayer.");
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
}
// --- EXPERT MODE FUNCTIONS ---

async function applyExpertPreset(type) {
    console.log(`[EXPERT] Application du preset: ${type}`);

    // 1. Dates par défaut (si non saisies : +2 jours dans 15 jours)
    if (!startDate) {
        const soon = new Date();
        soon.setDate(soon.getDate() + 14);
        startDate = new Date(soon);
        endDate = new Date(soon);
        endDate.setDate(endDate.getDate() + 2);
        updateDateDisplay();
        renderCalendar();
    }

    // 2. Groupe (15 personnes par défaut)
    document.getElementById('nbTotal').value = 15;
    document.getElementById('nbAdult').value = 15;

    // 3. Hébergement (Mode Auto par défaut)
    setSleepingMode('auto');

    // 4. Repas & Options selon le preset
    if (type === 'residentiel' || type === 'pension') {
        const radio = document.querySelector('input[name="repasType"][value="pension"]');
        if (radio) { radio.checked = true; toggleMeals('pension'); }
        // On attend que le planning soit généré pour tout cocher
        setTimeout(() => toggleAllMeals(true), 300);

        document.getElementById('draps').checked = true;
        document.getElementById('menage').checked = true;
        if (document.getElementById('salleReunion')) document.getElementById('salleReunion').checked = true;
    }
    else if (type === 'journee') {
        const radio = document.querySelector('input[name="repasType"][value="libre"]');
        if (radio) { radio.checked = true; toggleMeals('libre'); }
        endDate = new Date(startDate); // Même jour
        updateDateDisplay();
        renderCalendar();

        document.getElementById('draps').checked = false;
        document.getElementById('menage').checked = true;
        if (document.getElementById('salleReunion')) document.getElementById('salleReunion').checked = true;
    }
    else if (type === 'libre') {
        const radio = document.querySelector('input[name="repasType"][value="libre"]');
        if (radio) { radio.checked = true; toggleMeals('libre'); }
        document.getElementById('draps').checked = false;
        document.getElementById('menage').checked = true;
    }

    // 5. Update & Feedback
    updateCalculations();
    showSyncBanner("Configuration '" + type + "' appliquée !");
}

function toggleAllMeals(checked) {
    document.querySelectorAll('.meal-check').forEach(cb => {
        cb.checked = checked;
    });
    updateCalculations();
}

// Helper pour afficher le bandeau de synchro si l'élément n'existe pas dans le contexte local
function showSyncBanner(msg) {
    let banner = document.getElementById('sync-indicator');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'sync-indicator';
        banner.style = "position:fixed; top:20px; left:50%; transform:translateX(-50%); background:var(--primary); color:white; padding:10px 20px; border-radius:30px; font-size:0.85rem; font-weight:600; z-index:9999; box-shadow:0 10px 30px rgba(0,0,0,0.2); animation: fadeInUp 0.4s ease;";
        document.body.appendChild(banner);
    }
    banner.innerHTML = `<i class="fas fa-check-circle"></i> ${msg}`;
    banner.style.display = 'block';
    setTimeout(() => banner.style.display = 'none', 3000);
}

// Export pour le mode expert global
window.applyExpertPreset = applyExpertPreset;
window.toggleAllMeals = toggleAllMeals;

// --- Cross-Component Sync ---
window.addEventListener('message', async (event) => {
    if (event.data.type === 'RECORD_UPDATED' && event.data.id === bookingDraft.id) {
        console.log("🔄 Configurator: Syncing data for", event.data.id);
        // Avoid reloading if we are currently interacting with an input
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
            console.log("⚠️ Skip sync: user is typing");
            return;
        }
        await loadFromAirtable(bookingDraft.id);
    }
});

// Update the save functions to broadcast updates
// (I will check if there's a main save function to wrap or update)
