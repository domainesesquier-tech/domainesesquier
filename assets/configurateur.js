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
    if (!document.getElementById('main-configurator') || document.getElementById('main-configurator').style.display === 'none') return;

    bookingDraft.type = currentMode;
    bookingDraft.objective = currentMode === 'pro' ? bookingDraft.objective : 'strategy';
    bookingDraft.dates.start = startDate ? startDate.getTime() : null;
    bookingDraft.dates.end = endDate ? endDate.getTime() : null;

    bookingDraft.group.total = parseInt(document.getElementById('nbTotal').value) || 0;
    bookingDraft.group.adult = parseInt(document.getElementById('nbAdult').value) || 0;
    bookingDraft.group.child = parseInt(document.getElementById('nbChild').value) || 0;
    bookingDraft.group.baby = parseInt(document.getElementById('nbBaby').value) || 0;

    bookingDraft.sleeping.mode = sleepingMode;
    bookingDraft.sleeping.indiv = parseInt(document.getElementById('nbIndividuel').value) || 0;
    bookingDraft.sleeping.partage = parseInt(document.getElementById('nbPartage').value) || 0;
    bookingDraft.sleeping.couple = parseInt(document.getElementById('nbCouple').value) || 0;

    const mealRadio = document.querySelector('input[name="repasType"]:checked');
    if (mealRadio) bookingDraft.meals.type = mealRadio.value;

    let checkedMeals = [];
    document.querySelectorAll('.meal-check:checked').forEach((el, index) => {
        checkedMeals.push(index);
    });
    bookingDraft.meals.checkedIndices = checkedMeals;

    const dietary = document.getElementById('dietary');
    if (dietary) bookingDraft.meals.dietary = dietary.value;

    const opts = ['draps', 'menage', 'lateArrival', 'salleReunion', 'kitSoiree'];
    opts.forEach(id => {
        const el = document.getElementById(id);
        if (el) bookingDraft.options[id] = el.checked;
    });

    bookingDraft.contact.organisation = document.getElementById('organisation').value;
    bookingDraft.contact.first = document.getElementById('firstname').value;
    bookingDraft.contact.last = document.getElementById('lastname').value;
    bookingDraft.contact.email = document.getElementById('email').value;
    bookingDraft.contact.phone = document.getElementById('phone').value;
    bookingDraft.contact.msg = document.getElementById('message').value;

    localStorage.setItem('domaineBookingDraft', JSON.stringify(bookingDraft));
}

function restoreDraft() {
    const saved = localStorage.getItem('domaineBookingDraft');
    if (!saved) return;

    try {
        const draft = JSON.parse(saved);

        // Data restoration only, do NOT trigger startFlow automatically
        if (!draft.type) return;

        if (draft.dates.start) {
            startDate = new Date(draft.dates.start);
            currentMonth = new Date(draft.dates.start);
        }
        if (draft.dates.end) endDate = new Date(draft.dates.end);

        updateDateDisplay();
        renderCalendar();

        document.getElementById('nbTotal').value = draft.group.total || 0;
        document.getElementById('nbAdult').value = draft.group.adult || 0;
        document.getElementById('nbChild').value = draft.group.child || 0;
        document.getElementById('nbBaby').value = draft.group.baby || 0;

        if (draft.sleeping.mode) setSleepingMode(draft.sleeping.mode);
        document.getElementById('nbIndividuel').value = draft.sleeping.indiv || 0;
        document.getElementById('nbPartage').value = draft.sleeping.partage || 0;
        document.getElementById('nbCouple').value = draft.sleeping.couple || 0;

        if (draft.meals.type) {
            const radio = document.querySelector(`input[name="repasType"][value="${draft.meals.type}"]`);
            if (radio) {
                radio.checked = true;
                toggleMeals(draft.meals.type === 'traiteur');
            }
        }

        if (draft.meals.type === 'traiteur' && draft.meals.checkedIndices) {
            setTimeout(() => {
                const checks = document.querySelectorAll('.meal-check');
                draft.meals.checkedIndices.forEach(idx => {
                    if (checks[idx]) checks[idx].checked = true;
                });
                updateCalculations();
            }, 500);
        }
        if (draft.meals.dietary) document.getElementById('dietary').value = draft.meals.dietary;

        if (draft.options.draps) document.getElementById('draps').checked = true;
        if (draft.options.menage) document.getElementById('menage').checked = true;
        if (draft.options.lateArrival) document.getElementById('lateArrival').checked = true;
        if (draft.options.salleReunion && document.getElementById('salleReunion')) document.getElementById('salleReunion').checked = true;

        document.getElementById('organisation').value = draft.contact.organisation || '';
        document.getElementById('firstname').value = draft.contact.first || '';
        document.getElementById('lastname').value = draft.contact.last || '';
        document.getElementById('email').value = draft.contact.email || '';
        document.getElementById('phone').value = draft.contact.phone || '';
        document.getElementById('message').value = draft.contact.msg || '';

        if (draft.contact.first || draft.contact.last || draft.contact.email) {
            document.getElementById('step-contact').style.display = 'block';
            document.getElementById('pill-contact').style.display = 'flex';
        }

        updateCalculations();
    } catch (e) {
        console.error("Failed to restore draft", e);
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

        // On priorité les données brutes d'Airtable, puis le JSON technique si présent
        if (fields["Date arrivée"]) {
            startDate = new Date(fields["Date arrivée"]);
            currentMonth = new Date(fields["Date arrivée"]);
        }
        if (fields["Date départ"]) endDate = new Date(fields["Date départ"]);

        document.getElementById('nbTotal').value = fields["Nombre de personnes"] || 0;
        document.getElementById('organisation').value = fields["Entreprise"] || fields["Organisation"] || fields["Société"] || '';
        document.getElementById('firstname').value = fields["Prénom"] || fields["Nom client"]?.split(' ')[0] || '';
        document.getElementById('lastname').value = fields["Nom"] || fields["Nom client"]?.split(' ').slice(1).join(' ') || '';
        document.getElementById('email').value = fields["Email"] || '';
        document.getElementById('phone').value = fields["Téléphone"] || '';
        document.getElementById('message').value = fields["Message"] || '';

        // Chargement du JSON technique s'il existe
        if (fields["Détails JSON"]) {
            try {
                const details = JSON.parse(fields["Détails JSON"]);
                if (details.type) {
                    currentMode = details.type;
                    document.body.classList.toggle('mode-pro', currentMode === 'pro');
                }
                if (details.sleeping?.mode) setSleepingMode(details.sleeping.mode);
                document.getElementById('nbIndividuel').value = details.sleeping?.indiv || 0;
                document.getElementById('nbPartage').value = details.sleeping?.partage || 0;
                document.getElementById('nbCouple').value = details.sleeping?.couple || 0;

                if (details.meals) {
                    const radio = document.querySelector(`input[name="repasType"][value="${details.meals.mode}"]`);
                    if (radio) {
                        radio.checked = true;
                        toggleMeals(details.meals.mode);
                    }
                }

                if (details.options) {
                    if (details.options.draps) document.getElementById('draps').checked = true;
                    if (details.options.menage) document.getElementById('menage').checked = true;
                    if (details.options.lateArrival) document.getElementById('lateArrival').checked = true;
                    if (details.options.salleReunion) document.getElementById('salleReunion').checked = true;
                }
            } catch (e) {
                console.warn("Erreur parsing Détails JSON, utilisation des champs standards", e);
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
    { name: "Jasmin", cap: 4, beds: "1 lit double conv, 1 canapé 1p, 1 appoint", remarks: "Lit double convertible + lit d'appoint" }
];

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

    if (typeof value === 'string') {
        // On nettoie les espaces, les retours à la ligne (\n) et on passe en majuscules
        const out = value.replace(/[\n\r]/g, '').trim().toUpperCase();
        return out || null;
    }

    if (Array.isArray(value) && value.length > 0) {
        return normalizeCode(value[0]);
    }

    const out = String(value).trim().toUpperCase();
    return out || null;
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
            const fields = record.fields || {};
            const code = normalizeCode(fields['Code']);
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

        // Si le type client est défini en base, il doit correspondre
        // On accepte 'SEMINAIRE' ou 'PRO' comme synonymes de 'PROFESSIONNEL'
        let isTypeMatch = !item.typeClient;
        if (item.typeClient) {
            if (targetType === 'PROFESSIONNEL') {
                isTypeMatch = ['PROFESSIONNEL', 'PRO', 'SEMINAIRE'].includes(item.typeClient);
            } else {
                isTypeMatch = (item.typeClient === 'PERSONNEL');
            }
        }

        return isCodeMatch && isPersoMatch && isNightMatch && isTypeMatch;
    });

    if (matches.length > 0) {
        // S'il y a plusieurs correspondances, on prend la plus spécifique 
        // (celle avec le palier de personnes le plus restreint)
        const best = matches.sort((a, b) => (a.maxPers - a.minPers) - (b.maxPers - b.minPers))[0];
        console.log(`[PRICING] Match trouvé pour ${normalizedBase} (${nbPers} pers, ${nbNights} nuits): ${best.priceHT}€ (Source: Airtable)`);
        return best;
    }

    console.warn(`[PRICING] Aucun match Airtable pour ${normalizedBase} (${nbPers} pers, ${nbNights} nuits). Tentative backup...`);

    // 2. Si pas trouvé dans Airtable, on regarde dans le backup (ancien système)
    // On essaie d'abord un match par palier dans le backup pour la salle
    if (normalizedBase === 'SALLE_TRAVAIL_SEMINAIRE' || normalizedBase === 'SALLE_SEMINAIRE_TRAVAIL') {
        if (nbPers >= 30 && PRICING_BACKUP['SALLE_TRAVAIL_SEMINAIRE_UP']) {
            return { ...PRICING_BACKUP['SALLE_TRAVAIL_SEMINAIRE_UP'], source: 'backup' };
        }
        if (nbPers >= 20 && PRICING_BACKUP['SALLE_TRAVAIL_SEMINAIRE_BASE']) {
            return { ...PRICING_BACKUP['SALLE_TRAVAIL_SEMINAIRE_BASE'], source: 'backup' };
        }
    }

    const backup = PRICING_BACKUP[normalizedBase];
    return backup ? { ...backup, source: 'backup' } : null;
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

    const monthName = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(currentMonth);
    document.getElementById('calendarMonth').innerText = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const calendarContainer = document.getElementById('calendarDays');
    calendarContainer.innerHTML = '';

    let offset = (firstDay === 0) ? 6 : firstDay - 1;
    for (let i = 0; i < offset; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-day other-month';
        calendarContainer.appendChild(empty);
    }

    for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(year, month, i);
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';
        dayEl.innerText = i;

        const dot = document.createElement('span');
        dot.className = 'avail-dot ' + (isDateAvailable(date) ? 'dot-available' : 'dot-unavailable');
        dayEl.appendChild(dot);

        const isStart = startDate && date.getTime() === startDate.getTime();
        const isEnd = endDate && date.getTime() === endDate.getTime();
        const inBetween = startDate && endDate && date > startDate && date < endDate;

        const available = isDateAvailable(date);
        dayEl.classList.add(available ? 'is-available' : 'is-unavailable');

        if (isStart || isEnd || inBetween) {
            dayEl.classList.add('range-selected');
            if (isStart) dayEl.classList.add('range-start');
            if (isEnd) dayEl.classList.add('range-end');
        }

        dayEl.onclick = () => selectDate(date);
        calendarContainer.appendChild(dayEl);
    }
}

function selectDate(date) {
    if (!startDate || (startDate && endDate)) {
        startDate = date; endDate = null;
    } else if (date < startDate) {
        startDate = date;
    } else {
        endDate = date;
    }
    updateDateDisplay();
    renderCalendar();

    // Refresh meal schedule if dates change
    document.getElementById('meals-schedule-container').innerHTML = '';
    if (document.getElementById('mealSelection').style.display === 'block') {
        renderMealsSchedule();
    }

    updateCalculations();
}

function updateDateDisplay() {
    const arr = document.getElementById('displayArrivee');
    const dep = document.getElementById('displayDepart');
    const statusBadge = document.getElementById('availabilityStatus');

    if (arr) arr.innerText = startDate ? startDate.toLocaleDateString('fr-FR') : '--/--/----';
    if (dep) dep.innerText = endDate ? endDate.toLocaleDateString('fr-FR') : '--/--/----';

    if (startDate && endDate) {
        const nights = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
        const isAvailable = isRangeAvailable(startDate, endDate);

        if (statusBadge) {
            statusBadge.style.display = 'inline-flex';

            if (!isAvailable) {
                statusBadge.innerHTML = 'Indisponible <i class="fas fa-times"></i>';
                statusBadge.style.background = 'rgba(244, 67, 54, 0.1)';
                statusBadge.style.color = '#F44336';
            } else {
                statusBadge.innerHTML = 'Dates disponibles <i class="fas fa-check"></i>';
                statusBadge.style.background = 'rgba(76, 175, 80, 0.1)';
                statusBadge.style.color = '#4CAF50';
            }
        }
    } else {
        if (statusBadge) statusBadge.style.display = 'none';
    }
}

function changeMonth(delta) {
    currentMonth.setMonth(currentMonth.getMonth() + delta);
    renderCalendar();
}

function startFlow(mode) {
    currentMode = mode;
    const configContainer = document.getElementById('main-configurator');
    document.getElementById('step0').style.display = 'none';
    configContainer.style.display = 'block';
    document.getElementById('main-stepper').classList.add('visible');

    // Reset classes
    configContainer.classList.remove('is-pro-mode', 'is-perso-mode');

    const title = document.getElementById('main-title');
    const subtitle = document.getElementById('main-subtitle');

    if (mode === 'pro') {
        configContainer.classList.add('is-pro-mode');
        if (title) title.innerText = "Votre Séminaire Pro";
        if (subtitle) subtitle.innerText = "Un cadre inspirant pour vos équipes";
        setSleepingMode('pro-double'); // Default to shared rooms for Pro
        document.getElementById('salleReunion').checked = true;

        // Set default meal mode for Pro (default to Libre instead of Pension)
        document.getElementById('repasLibre').checked = true;
        toggleMeals('libre');
    } else {
        configContainer.classList.add('is-perso-mode');
        if (title) title.innerText = "Votre Séjour Personnel";
        if (subtitle) subtitle.innerText = "Des moments précieux en famille et entre amis";
        setSleepingMode('auto'); // Default for Perso

        // Set default meal mode for Perso
        document.getElementById('repasLibre').checked = true;
        toggleMeals('libre');
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
                            <div class="number-input-wrapper" style="padding: 2px 4px;">
                                 <button type="button" class="number-btn" style="width: 28px; height: 28px;" onclick="modifyMeal(${i}, 'petitDej', -1)"><i class="fas fa-minus" style="font-size: 0.7rem;"></i></button>
                                 <input type="number" class="meal-input-petitDej" id="meal-${i}-petitDej" value="0" min="0" onchange="updateCalculations()" style="width: 35px; font-size: 0.95rem;">
                                 <button type="button" class="number-btn" style="width: 28px; height: 28px;" onclick="modifyMeal(${i}, 'petitDej', 1)"><i class="fas fa-plus" style="font-size: 0.7rem;"></i></button>
                            </div>
                        </div>

                        <!-- Collation Matin (PRO ONLY) -->
                        ${currentMode === 'pro' ? `
                        <div class="meal-option-row" style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px dashed #eee;">
                            <div style="display: flex; flex-direction: column;">
                                <span style="font-weight: 600; color: var(--primary); font-size: 0.95rem;">Collation matin <span id="day-${i}-colM-price-tag" style="font-weight: 400; opacity: 0.6; font-size: 0.8rem;">(${colPrice}€ HT)</span></span>
                            </div>
                            <div class="number-input-wrapper" style="padding: 2px 4px;">
                                 <button type="button" class="number-btn" style="width: 28px; height: 28px;" onclick="modifyMeal(${i}, 'collationMatin', -1)"><i class="fas fa-minus" style="font-size: 0.7rem;"></i></button>
                                 <input type="number" class="meal-input-collationMatin" id="meal-${i}-collationMatin" value="0" min="0" onchange="updateCalculations()" style="width: 35px; font-size: 0.95rem;">
                                 <button type="button" class="number-btn" style="width: 28px; height: 28px;" onclick="modifyMeal(${i}, 'collationMatin', 1)"><i class="fas fa-plus" style="font-size: 0.7rem;"></i></button>
                            </div>
                        </div>` : ''}

                        <div class="meal-option-row" style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; flex-direction: column;">
                                <span style="font-weight: 600; color: var(--primary); font-size: 0.95rem;">Déjeuner <span style="font-weight: 400; opacity: 0.6; font-size: 0.8rem;">(${dPrice}€ ${currentMode === 'pro' ? 'HT' : ''})</span></span>
                            </div>
                            <div class="number-input-wrapper" style="padding: 2px 4px;">
                                 <button type="button" class="number-btn" style="width: 28px; height: 28px;" onclick="modifyMeal(${i}, 'dejeuner', -1)"><i class="fas fa-minus" style="font-size: 0.7rem;"></i></button>
                                 <input type="number" class="meal-input-dejeuner" id="meal-${i}-dejeuner" value="0" min="0" onchange="updateCalculations()" style="width: 35px; font-size: 0.95rem;">
                                 <button type="button" class="number-btn" style="width: 28px; height: 28px;" onclick="modifyMeal(${i}, 'dejeuner', 1)"><i class="fas fa-plus" style="font-size: 0.7rem;"></i></button>
                            </div>
                        </div>

                        <!-- Collation Après-midi (PRO ONLY) -->
                        ${currentMode === 'pro' ? `
                        <div class="meal-option-row" style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px dashed #eee;">
                            <div style="display: flex; flex-direction: column;">
                                <span style="font-weight: 600; color: var(--primary); font-size: 0.95rem;">Collation après-midi <span id="day-${i}-colA-price-tag" style="font-weight: 400; opacity: 0.6; font-size: 0.8rem;">(${colPrice}€ HT)</span></span>
                            </div>
                            <div class="number-input-wrapper" style="padding: 2px 4px;">
                                 <button type="button" class="number-btn" style="width: 28px; height: 28px;" onclick="modifyMeal(${i}, 'collationAprem', -1)"><i class="fas fa-minus" style="font-size: 0.7rem;"></i></button>
                                 <input type="number" class="meal-input-collationAprem" id="meal-${i}-collationAprem" value="0" min="0" onchange="updateCalculations()" style="width: 35px; font-size: 0.95rem;">
                                 <button type="button" class="number-btn" style="width: 28px; height: 28px;" onclick="modifyMeal(${i}, 'collationAprem', 1)"><i class="fas fa-plus" style="font-size: 0.7rem;"></i></button>
                            </div>
                        </div>` : ''}

                        ${(!isLastDay || isPension) ? `
                        <div class="meal-option-row" style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; flex-direction: column;">
                                <span style="font-weight: 600; color: var(--primary); font-size: 0.95rem;">Dîner <span style="font-weight: 400; opacity: 0.6; font-size: 0.8rem;">(${dinPrice}€ ${currentMode === 'pro' ? 'HT' : ''})</span></span>
                            </div>
                            <div class="number-input-wrapper" style="padding: 2px 4px;">
                                <button type="button" class="number-btn" style="width: 28px; height: 28px;" onclick="modifyMeal(${i}, 'diner', -1)"><i class="fas fa-minus" style="font-size: 0.7rem;"></i></button>
                                <input type="number" class="meal-input-diner" id="meal-${i}-diner" value="0" min="0" onchange="updateCalculations()" style="width: 35px; font-size: 0.95rem;">
                                <button type="button" class="number-btn" style="width: 28px; height: 28px;" onclick="modifyMeal(${i}, 'diner', 1)"><i class="fas fa-plus" style="font-size: 0.7rem;"></i></button>
                            </div>
                        </div>` : ''}

                        <div id="day-${i}-total" style="margin-top: 15px; padding-top: 12px; border-top: 2px solid #f8f8f8; display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-size: 0.85rem; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 0.05em;">Total du jour</span>
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
    const nbBaby = parseInt(document.getElementById('nbBaby').value) || 0;
    const nbChild = parseInt(document.getElementById('nbChild').value) || 0;
    const nbAdult = parseInt(document.getElementById('nbAdult').value) || 0;

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
            deltaMsg.innerText = `Il reste ${delta} participant${delta > 1 ? 's' : ''} à attribuer.`;
            deltaMsg.style.color = 'var(--accent)';
        } else if (delta < 0) {
            deltaMsg.innerText = `${Math.abs(delta)} participant${Math.abs(delta) > 1 ? 's' : ''} en trop !`;
            deltaMsg.style.color = '#e74c3c';
        } else if (totalVisitors > 0) {
            deltaMsg.innerText = "Répartition parfaite !";
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
        const getHT = (code, p = null, n = null, fallback = 0) => {
            const price = getPriceHT(code, p, n);
            return (price === null || Number.isNaN(price)) ? fallback : price;
        };
        const modeIsPro = currentMode === 'pro';

        let priceIndiv = 0;
        let pricePartage = 0;
        if (modeIsPro) {
            priceIndiv = getHT('HEBERGEMENT_SEMINAIRE_SINGLE', totalVisitors, nights, 100);
            pricePartage = getHT('HEBERGEMENT_SEMINAIRE_TWIN', totalVisitors, nights, 70);
            hebergementCost = Math.round((pIndiv * priceIndiv * nights) + ((pPartage + pCouple) * pricePartage * nights));
        } else {
            const hebergementCode = 'HEBERGEMENT_PERSO_NUITEE';
            const pricePerso = getHT(
                hebergementCode,
                totalVisitors,
                nights,
                nights === 1 ? 60 : (nights === 2 ? 50 : 40)
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
        if (mealMode === 'pension' && !modeIsPro) {
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
                const pPrice = getPriceHT('REPAS_SEMINAIRE_PDJ', totalVisitors, nights, 14);
                const dPrice = getPriceHT('REPAS_SEMINAIRE_DEJ', totalVisitors, nights, 26);
                const dinPrice = getPriceHT('REPAS_SEMINAIRE_DINER', totalVisitors, nights, 30);
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
                const pPrice = getPriceHT(modeIsPro ? 'REPAS_SEMINAIRE_PDJ' : 'REPAS_PERSO_PDJ', totalVisitors, nights, modeIsPro ? 14 : 11);
                const dPrice = getPriceHT(modeIsPro ? 'REPAS_SEMINAIRE_DEJ' : 'REPAS_PERSO_DEJ', totalVisitors, nights, modeIsPro ? 26 : 24);
                const dinPrice = getPriceHT(modeIsPro ? 'REPAS_SEMINAIRE_DINER' : 'REPAS_PERSO_DINER', totalVisitors, nights, modeIsPro ? 30 : 27);
                const colPrice = 5;
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
            // On récupère le prix dynamique pour le calcul réel
            let pricing = getPricing('SALLE_TRAVAIL_SEMINAIRE', totalVisitors, nights);
            if (!pricing || pricing.source === 'backup') {
                const legacy = getPricing('SALLE_SEMINAIRE_TRAVAIL', totalVisitors, nights);
                if (legacy && legacy.source !== 'backup') pricing = legacy;
            }
            const realPrice = (pricing && pricing.priceHT) ? pricing.priceHT : 500;
            console.log(`[DEBUG] Salle de réunion - Prix réel calculé: ${realPrice}€ HT`);

            // On s'assure que le badge est aussi à jour ici (sécurité)
            const badge = document.getElementById('salle-price-badge');
            if (badge) badge.innerText = `${realPrice}€ HT / jour`;

            const salleEl = document.getElementById('salleReunion');
            if (salleEl && salleEl.checked) {
                const isForfait = pricing && typeof pricing.unit === 'string' && pricing.unit.toLowerCase().includes('forfait');
                const billDays = nights;
                const salleCost = Math.round(isForfait ? realPrice : realPrice * billDays);

                optionsCost += salleCost; total += salleCost;
                const roomLabel = isForfait ? "Salle équipée (Forfait)" : `Salle équipée (${billDays} jours)`;
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

        const emailVal = document.getElementById('email').value;
        const isFormFilled = emailVal.includes('@') && emailVal.length > 5;
        const cta = document.getElementById('cta-quote');

        if (available) {
            cta.style.display = 'block';
            const contactIsVisible = document.getElementById('step-contact').style.display !== 'none';

            if (!contactIsVisible) {
                cta.innerText = "Demander un devis";
                cta.style.background = "var(--primary)";
            } else if (isFormFilled) {
                cta.innerText = "Recevoir mon devis";
                cta.style.background = "var(--primary)";
            } else {
                cta.innerText = "Compléter mes coordonnées";
                cta.style.background = "#D48D6C";
            }
        } else {
            cta.style.display = 'none';
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
            if (breakdownH) breakdownH.innerText = `${hebergementCost}€${htSuffix}`;

            const breakdownR = document.getElementById('breakdown-repas-new');
            if (breakdownR) breakdownR.innerText = repasCost > 0 ? `${repasCost}€${htSuffix}` : "Non sélectionné";

            const breakdownO = document.getElementById('breakdown-options-new');
            if (breakdownO) breakdownO.innerText = optionsCost > 0 ? `${optionsCost}€${htSuffix}` : "Aucune";

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
}

function handleMainCTA() {
    const total = parseInt(document.getElementById('nbTotal').value) || 0;
    const email = document.getElementById('email').value;
    const contactSection = document.getElementById('step-contact');

    if (!startDate || !endDate) {
        scrollToStep('step-dates');
        validateStep('step-dates');
    } else if (total < 1) {
        scrollToStep('step-group');
        validateStep('step-group');
    } else if (contactSection.style.display === 'none') {
        // Afficher le formulaire de contact
        contactSection.style.display = 'block';
        const pillContact = document.getElementById('pill-contact');
        if (pillContact) pillContact.style.display = 'flex';

        // Petit délai pour que le layout soit calculé avant le scroll
        setTimeout(() => {
            scrollToStep('step-contact');
        }, 50);

        updateCalculations(); // Pour mettre à jour le texte du bouton
    } else if (!email.includes('@')) {
        scrollToStep('step-contact');
        document.getElementById('email').focus();
    } else {
        sendQuoteRequest();
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

async function sendQuoteRequest() {
    const btn = document.getElementById('cta-quote');
    const originalText = btn ? btn.innerText : "Demander un devis";
    const totalEl = document.getElementById('totalTTC');
    const total = totalEl ? totalEl.innerText : "0€";
    const email = document.getElementById('email').value;
    const organisation = document.getElementById('organisation').value;
    const firstName = document.getElementById('firstname').value;
    const lastName = document.getElementById('lastname').value;
    const phone = document.getElementById('phone').value;
    const message = document.getElementById('message').value;
    const nbTotal = parseInt(document.getElementById('nbTotal').value) || 0;

    if (!email) return alert('Veuillez renseigner votre email pour recevoir l\'estimation.');

    // Préparation des données pour Airtable
    let activitiesInfo = "";
    if (bookingDraft.activities && bookingDraft.activities.requested) {
        activitiesInfo = `\n\nActivités: ${bookingDraft.activities.type} (Budget: ${bookingDraft.activities.budget}€, Ambiance: ${bookingDraft.activities.ambiance})\nNotes: ${bookingDraft.activities.message}`;
    }

    // --- Capture Meal Details ---
    let mealInfo = "";
    const mealMode = getSelectedMealMode();

    let totalPtDej = 0;
    let totalDejeuner = 0;
    let totalDiner = 0;
    let totalPauses = 0;

    if (mealMode === 'libre') {
        mealInfo = "\nRestauration: Gestion Libre";
    } else {
        document.querySelectorAll('.meal-input-petitDej').forEach(inp => totalPtDej += parseInt(inp.value) || 0);
        document.querySelectorAll('.meal-input-dejeuner').forEach(inp => totalDejeuner += parseInt(inp.value) || 0);
        document.querySelectorAll('.meal-input-diner').forEach(inp => totalDiner += parseInt(inp.value) || 0);

        let pausesMatin = 0;
        let pausesAprem = 0;
        document.querySelectorAll('.meal-input-collationMatin').forEach(inp => pausesMatin += parseInt(inp.value) || 0);
        document.querySelectorAll('.meal-input-collationAprem').forEach(inp => pausesAprem += parseInt(inp.value) || 0);
        totalPauses = pausesMatin + pausesAprem;

        const label = mealMode === 'pension' ? 'Pension Complète' : 'Traiteur / À la carte';
        mealInfo = `\nRestauration: ${label}\n- Petits-déjeuners: ${totalPtDej}\n- Déjeuners: ${totalDejeuner}\n- Dîners: ${totalDiner}\n- Pauses/Collations: ${totalPauses}`;

        const diet = document.getElementById('dietary');
        if (diet && diet.value) mealInfo += `\nRégimes/Allergies: ${diet.value}`;
    }

    // --- Récupération des Coûts Détaillés depuis le DOM ---
    const parseAmount = (id) => {
        const el = document.getElementById(id);
        if (!el || !el.innerText || el.innerText.includes('Non') || el.innerText.includes('Aucun')) return 0;
        // On extrait juste les chiffres pour avoir un nombre pur
        const matches = el.innerText.match(/[\d.]+/);
        return matches ? parseFloat(matches[0]) : 0;
    };

    const amountHebergement = parseAmount('breakdown-hebergement-new');
    const amountRepas = parseAmount('breakdown-repas-new');
    const amountOptions = parseAmount('breakdown-options-new');

    // On calcule un total numérique propre pour Airtable
    const estimatedTotalNumeric = amountHebergement + amountRepas + amountOptions;

    // --- Construction de l'objet Technique JSON complet ---
    const bookingDetails = {
        group: {
            total: nbTotal,
            adult: parseInt(document.getElementById('nbAdult').value) || 0,
            child: parseInt(document.getElementById('nbChild').value) || 0,
            baby: parseInt(document.getElementById('nbBaby').value) || 0
        },
        dates: {
            start: startDate ? startDate.toISOString().split('T')[0] : null,
            end: endDate ? endDate.toISOString().split('T')[0] : null,
            nights: startDate && endDate ? Math.ceil((endDate - startDate) / (86400000)) : 0
        },
        sleeping: {
            mode: sleepingMode,
            indiv: parseInt(document.getElementById('nbIndividuel').value) || 0,
            partage: parseInt(document.getElementById('nbPartage').value) || 0,
            couple: parseInt(document.getElementById('nbCouple').value) || 0,
            usedGites: usedGites
        },
        meals: {
            mode: mealMode,
            counts: []
        },
        options: {
            draps: document.getElementById('draps')?.checked || false,
            menage: document.getElementById('menage')?.checked || false,
            lateArrival: document.getElementById('lateArrival')?.checked || false,
            salleReunion: document.getElementById('salleReunion')?.checked || false,
            kitSoiree: document.getElementById('kitSoiree')?.checked || false,
            activities: bookingDraft.activities || {}
        }
    };

    // Capture détaillée des repas jour par jour
    if (mealMode !== 'libre' && startDate && endDate) {
        const diffDays = Math.ceil((endDate - startDate) / (86400000));
        for (let i = 0; i <= diffDays; i++) {
            bookingDetails.meals.counts.push({
                day: i,
                petitDej: parseInt(document.getElementById(`meal-${i}-petitDej`)?.value) || 0,
                dejeuner: parseInt(document.getElementById(`meal-${i}-dejeuner`)?.value) || 0,
                diner: parseInt(document.getElementById(`meal-${i}-diner`)?.value) || 0,
                collationMatin: parseInt(document.getElementById(`meal-${i}-collationMatin`)?.value) || 0,
                collationAprem: parseInt(document.getElementById(`meal-${i}-collationAprem`)?.value) || 0
            });
        }
    }

    // Récupération de la fourchette de budget en texte pour Airtable (Type: Texte court)
    const budgetRangeText = totalEl ? totalEl.innerText : "0€";

    // Détermination du Type exact (Sélection multiple)
    let typeSejour = "séjour personnel";
    if (currentMode === 'pro') {
        typeSejour = "séminaire professionnel";
    } else if (nbTotal > 15) {
        typeSejour = "séjour de groupe";
    }

    const payload = {
        fields: {
            "Nom client": `${firstName} ${lastName}`.trim() || "Client Web",
            "Entreprise": organisation,
            "Email": email,
            "Téléphone": phone,
            "Date arrivée": startDate.toISOString().split('T')[0],
            "Date départ": endDate.toISOString().split('T')[0],
            "Nombre de personnes": nbTotal,

            // Détails du Séjour
            "Type": [typeSejour],
            "Statut": ["à traiter"],
            "Budget estimé": budgetRangeText,
            "Message": (message + mealInfo + activitiesInfo).trim(),

            // Hébergement & Options
            "Option draps": document.getElementById('draps')?.checked ? "Oui" : "Non",
            "Option ménage": document.getElementById('menage')?.checked ? "Oui" : "Non",

            // Montants Financiers (Devise)
            "Montant Hébergement HT": amountHebergement,
            "Montant Repas HT": amountRepas,
            "Montant Options HT": amountOptions,

            // Quantités Repas (Entier)
            "Repas petit-déj": totalPtDej,
            "Repas déjeuner": totalDejeuner,
            "Repas dîner": totalDiner,
            "Qté Collation": totalPauses,

            "Détails JSON": JSON.stringify(bookingDetails, null, 2)
        }
    };

    try {
        if (btn) {
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

        if (!response.ok) throw new Error(`Échec de l'envoi (${method})`);

        const result = await response.json();
        const recordId = result.id;

        // Succès
        if (btn) {
            btn.style.background = "#27ae60";
            btn.innerText = "Demande envoyée ! ✓";
        }

        // --- Synchronisation avec le Tableau de Bord (Parent) ---
        if (recordId && window.parent !== window) {
            window.parent.postMessage({
                type: 'devis_created',
                id: recordId
            }, '*');
        }

        // On affiche une proposition de voir le devis éditable
        if (recordId) {
            // Succès simple pour le client
            alert("Merci ! Votre demande a bien été reçue. Nous reviendrons vers vous sous 24h.");
        } else {
            alert("Merci ! Votre demande d'estimation a bien été reçue.");
        }

        // Optionnel: Reset ou redirection après 3s
        setTimeout(() => {
            btn.disabled = false;
            btn.innerText = originalText;
            btn.style.background = "var(--primary)";
            btn.style.opacity = "1";
        }, 5000);

    } catch (error) {
        console.error("Erreur envoi devis:", error);
        if (btn) {
            btn.disabled = false;
            btn.innerText = "Erreur - Réessayer";
            btn.style.background = "#e74c3c";
        }
        alert("Une erreur est survenue lors de l'envoi. Veuillez réessayer ou nous contacter directement.");
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
