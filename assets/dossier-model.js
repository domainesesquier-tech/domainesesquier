/**
 * =============================================================================
 * DOMAINE SESQUIER — DOSSIER MODEL (Source Unique de Vérité)
 * =============================================================================
 *
 * Ce fichier est le CERVEAU CENTRAL du système de facturation.
 * Il construit un objet "Dossier" complet à partir des données de réservation.
 *
 * RÈGLE D'OR : Aucun autre fichier ne doit recalculer des montants.
 *   - Le Configurateur appelle DossierModel.build() pour générer un dossier
 *   - Le Devis, la Facture d'Acompte et la Facture Finale LISENT ce dossier
 *   - Airtable stocke ce dossier dans un champ unique "Dossier JSON"
 *
 * Dépendances : assets/constants.js (SesquierConstants)
 * =============================================================================
 */

const DossierModel = {

    // =========================================================================
    // VERSION — Pour détecter les dossiers obsolètes
    // =========================================================================
    VERSION: '1.0.0',

    // =========================================================================
    // STATUTS possibles d'un dossier
    // =========================================================================
    STATUTS: {
        BROUILLON: 'brouillon',
        DEVIS_ENVOYE: 'devis_envoye',
        DEVIS_SIGNE: 'devis_signe',
        ACOMPTE_RECU: 'acompte_recu',
        CONFIRME: 'confirme',
        TERMINE: 'termine',
        ANNULE: 'annule'
    },

    // =========================================================================
    // TVA RATES
    // =========================================================================
    TVA: {
        HEBERGEMENT: 10,
        RESTAURATION: 10,
        SALLE: 20,
        OPTIONS: 20,
        COLLATION: 10,
        ACTIVITES: 20
    },

    // =========================================================================
    // BUILD — Point d'entrée principal
    // =========================================================================
    /**
     * Construit un objet Dossier complet à partir des données brutes.
     *
     * @param {object} params
     * @param {string} params.mode         — 'pro' ou 'perso'
     * @param {object} params.client       — { organisation, firstName, lastName, email, phone, message }
     * @param {object} params.dates        — { start: Date|string, end: Date|string }
     * @param {object} params.group        — { total, adult, child, baby }
     * @param {object} params.sleeping     — { mode, indiv, partage, couple, usedGites }
     * @param {object} params.meals        — { mode: 'pension'|'traiteur'|'libre', counts: [{day, petitDej, dejeuner, diner, collationMatin, collationAprem}] }
     * @param {object} params.options      — { draps, menage, lateArrival, salleReunion, kitSoiree, chambreIndiv, activities }
     * @param {object} params.pricingDB    — Tableau des tarifs chargés depuis Airtable (window.PRICING_DB)
     * @param {string} [params.airtableId] — ID Airtable si édition existante
     * @param {string} [params.statut]     — Statut du dossier
     * @param {Array}  [params.notes]      — Notes internes [{date, text}]
     *
     * @returns {object} Dossier complet prêt à stocker et afficher
     */
    build(params) {
        const {
            mode = 'pro',
            client = {},
            dates = {},
            group = {},
            sleeping = {},
            meals = {},
            options = {},
            pricingDB = [],
            airtableId = null,
            statut = this.STATUTS.BROUILLON,
            notes = []
        } = params;

        // --- Parse dates ---
        const dStart = this._parseDate(dates.start);
        const dEnd = this._parseDate(dates.end);
        const nights = (dStart && dEnd) ? Math.max(0, Math.ceil((dEnd - dStart) / 86400000)) : 0;
        const days = nights + 1;
        const totalPers = group.total || 0;

        // --- Pricing resolver ---
        const resolver = this._createPricingResolver(pricingDB, mode);

        // --- Build billing lines ---
        const lines = [];
        const subtotals = {};

        // A. HÉBERGEMENT
        const hebergementLines = this._buildHebergement(mode, sleeping, totalPers, nights, resolver);
        lines.push({ type: 'category', title: 'Hébergement' });
        hebergementLines.forEach(l => lines.push(l));
        subtotals.hebergement = hebergementLines.reduce((sum, l) => sum + l.totalHT, 0);
        lines.push({ type: 'subtotal', label: 'Hébergement', id: 'subtotal-hebergement', value: subtotals.hebergement });

        // B. RESTAURATION
        const restaurationResult = this._buildRestauration(mode, meals, totalPers, nights, resolver);
        lines.push({ type: 'category', title: 'Restauration' });
        restaurationResult.lines.forEach(l => lines.push(l));
        subtotals.restauration = restaurationResult.subtotal;
        lines.push({ type: 'subtotal', label: 'Restauration', id: 'subtotal-restauration', value: subtotals.restauration });

        // C. OPTIONS & SALLES
        const optionsLines = this._buildOptions(mode, options, totalPers, nights, resolver);
        lines.push({ type: 'category', title: 'Mise à disposition des espaces' });
        optionsLines.forEach(l => lines.push(l));
        subtotals.options = optionsLines.reduce((sum, l) => sum + l.totalHT, 0);
        lines.push({ type: 'subtotal', label: 'Options', id: 'subtotal-salles', value: subtotals.options });

        // D. ACTIVITÉS
        const activitesLines = this._buildActivites(options.activities || {});
        subtotals.activites = activitesLines.reduce((sum, l) => sum + l.totalHT, 0);

        // --- Compute totals ---
        const allBillingLines = lines.filter(l => l.type === 'pricing');
        const totalHT = allBillingLines.reduce((s, l) => s + l.totalHT, 0);

        // TVA : on calcule par ligne car les taux varient
        const totalTVA = allBillingLines.reduce((s, l) => {
            const rate = parseFloat(l.tvaRate) || 0;
            return s + (l.totalHT * rate / 100);
        }, 0);

        const totalTTC = totalHT + totalTVA;
        const acompte = Math.round(totalTTC * 0.3 * 100) / 100;
        const solde = Math.round((totalTTC - acompte) * 100) / 100;
        const prixParPersonne = totalPers > 0 ? Math.round(totalHT / totalPers) : 0;

        // --- Meal day-by-day data (for planning grid) ---
        const mealsPlanning = this._buildMealsPlanning(meals, dStart, days);

        // --- Assemble dossier ---
        const now = new Date().toISOString();

        return {
            version: this.VERSION,
            meta: {
                airtableId: airtableId,
                statut: statut,
                createdAt: now,
                updatedAt: now,
                mode: mode,
                typeLabel: mode === 'pro' ? 'Séminaire professionnel' : 'Séjour privé'
            },
            client: {
                organisation: client.organisation || '',
                firstName: client.firstName || '',
                lastName: client.lastName || '',
                fullName: `${client.firstName || ''} ${client.lastName || ''}`.trim() || 'Client',
                email: client.email || '',
                phone: client.phone || '',
                message: client.message || ''
            },
            sejour: {
                dateArrivee: dStart ? dStart.toISOString().split('T')[0] : null,
                dateDepart: dEnd ? dEnd.toISOString().split('T')[0] : null,
                dateArriveeFormatted: dStart ? dStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '?',
                dateDepartFormatted: dEnd ? dEnd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '?',
                nights: nights,
                days: days,
                participants: totalPers,
                adultes: group.adult || 0,
                enfants: group.child || 0,
                bebes: group.baby || 0,
                mealMode: meals.mode || 'libre',
                mealModeLabel: this._getMealModeLabel(meals.mode)
            },
            sleeping: {
                mode: sleeping.mode || 'auto',
                individuel: sleeping.indiv || 0,
                partage: sleeping.partage || 0,
                couple: sleeping.couple || 0,
                usedGites: sleeping.usedGites || []
            },
            financials: {
                lines: lines,
                activitesLines: activitesLines,
                subtotals: subtotals,
                totalHT: Math.round(totalHT * 100) / 100,
                totalTVA: Math.round(totalTVA * 100) / 100,
                totalTTC: Math.round(totalTTC * 100) / 100,
                acompte30: Math.round(acompte * 100) / 100,
                solde: Math.round(solde * 100) / 100,
                prixParPersonneHT: prixParPersonne,
                prixParPersonneParNuitHT: (totalPers > 0 && nights > 0) ? Math.round(totalHT / (totalPers * nights)) : 0,
                taxeSejour: Math.round(totalPers * nights * 4.31 * 100) / 100
            },
            mealsPlanning: mealsPlanning,
            options: {
                draps: options.draps || false,
                menage: options.menage || false,
                lateArrival: options.lateArrival || false,
                salleReunion: options.salleReunion || false,
                kitSoiree: options.kitSoiree || false,
                chambreIndiv: options.chambreIndiv || false,
                activities: options.activities || {}
            },
            notes: notes
        };
    },

    // =========================================================================
    // NARRATIVE — Génère la synthèse textuelle du séjour
    // =========================================================================
    /**
     * @param {object} dossier — Un dossier complet (retour de build())
     * @returns {string} Ex: "Séminaire de 33 personnes — 4 jours / 3 nuits — Pension Complète"
     */
    getSynthesis(dossier) {
        const s = dossier.sejour;
        const jourTxt = s.days > 1 ? 'jours' : 'jour';
        const nuitTxt = s.nights > 1 ? 'nuits' : 'nuit';
        return `${dossier.meta.typeLabel} de ${s.participants} personnes — ${s.days} ${jourTxt} / ${s.nights} ${nuitTxt} — ${s.mealModeLabel}`;
    },

    // =========================================================================
    // FORMAT — Helpers d'affichage
    // =========================================================================
    formatEuro(amount) {
        if (amount === null || amount === undefined || isNaN(amount)) return '0,00 €';
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 2
        }).format(amount);
    },

    // =========================================================================
    // PRIVATE — Construction des lignes d'hébergement
    // =========================================================================
    _buildHebergement(mode, sleeping, totalPers, nights, resolver) {
        const lines = [];
        if (totalPers <= 0 || nights <= 0) return lines;

        if (mode === 'pro') {
            const indiv = sleeping.indiv || 0;
            const partage = (sleeping.partage || 0) + (sleeping.couple || 0);

            if (indiv > 0) {
                const priceIndiv = resolver('HEBERGEMENT_SEMINAIRE_SINGLE', totalPers, nights, 100);
                lines.push(this._pricingLine(
                    'Hébergement chambre individuelle',
                    indiv * nights,
                    priceIndiv,
                    this.TVA.HEBERGEMENT,
                    'hebergement'
                ));
            }

            if (partage > 0) {
                const pricePartage = resolver('HEBERGEMENT_SEMINAIRE_TWIN', totalPers, nights, 70);
                lines.push(this._pricingLine(
                    'Hébergement chambre partagée (twin)',
                    partage * nights,
                    pricePartage,
                    this.TVA.HEBERGEMENT,
                    'hebergement'
                ));
            }

            // Si pas de répartition, ligne unique
            if (indiv === 0 && partage === 0) {
                const price = resolver('HEBERGEMENT_SEMINAIRE_TWIN', totalPers, nights, 70);
                lines.push(this._pricingLine(
                    'Hébergement en gîte tout confort',
                    totalPers * nights,
                    price,
                    this.TVA.HEBERGEMENT,
                    'hebergement'
                ));
            }
        } else {
            // PERSO — prix dégressif selon durée
            const price = resolver('HEBERGEMENT_PERSO_NUITEE', totalPers, nights,
                nights === 1 ? 60 : (nights === 2 ? 50 : 40)
            );
            const totalHeberg = Math.round(totalPers * price * nights);
            const unitPrice = totalPers > 0 ? totalHeberg / totalPers : 0;

            lines.push(this._pricingLine(
                'Hébergement en gîte tout confort<br><small style="color:#666; font-weight:400;">Draps, serviettes et ménage de fin de séjour inclus</small>',
                totalPers,
                unitPrice,
                this.TVA.HEBERGEMENT,
                'hebergement'
            ));
        }

        return lines;
    },

    // =========================================================================
    // PRIVATE — Construction des lignes de restauration
    // =========================================================================
    _buildRestauration(mode, meals, totalPers, nights, resolver) {
        const lines = [];
        let subtotal = 0;

        if (!meals || meals.mode === 'libre' || totalPers <= 0) {
            return { lines, subtotal };
        }

        const isPro = (mode === 'pro');
        const counts = meals.counts || [];

        // Aggregate totals across all days
        let totalPDJ = 0, totalColM = 0, totalDEJ = 0, totalColA = 0, totalDIN = 0;

        if (counts.length > 0) {
            counts.forEach(c => {
                totalPDJ += (c.petitDej || 0);
                totalColM += (c.collationMatin || 0);
                totalDEJ += (c.dejeuner || 0);
                totalColA += (c.collationAprem || 0);
                totalDIN += (c.diner || 0);
            });
        }

        // Prices
        const pPDJ = resolver(isPro ? 'REPAS_SEMINAIRE_PDJ' : 'REPAS_PERSO_PDJ', totalPers, nights, isPro ? 14 : 11);
        const pCollation = isPro ? 5 : 5;
        const pDEJ = resolver(isPro ? 'REPAS_SEMINAIRE_DEJ' : 'REPAS_PERSO_DEJ', totalPers, nights, isPro ? 26 : 24);
        const pDIN = resolver(isPro ? 'REPAS_SEMINAIRE_DINER' : 'REPAS_PERSO_DINER', totalPers, nights, isPro ? 30 : 27);

        // 5 standard lines
        if (totalPDJ > 0) {
            lines.push(this._pricingLine('Petits-déjeuners', totalPDJ, pPDJ, this.TVA.RESTAURATION, 'petitDej'));
        }
        if (totalColM > 0) {
            lines.push(this._pricingLine('Collations matin', totalColM, pCollation, this.TVA.COLLATION, 'collationMatin'));
        }
        if (totalDEJ > 0) {
            lines.push(this._pricingLine('Déjeuners', totalDEJ, pDEJ, this.TVA.RESTAURATION, 'dejeuner'));
        }
        if (totalColA > 0) {
            lines.push(this._pricingLine('Collations après-midi', totalColA, pCollation, this.TVA.COLLATION, 'collationAprem'));
        }
        if (totalDIN > 0) {
            lines.push(this._pricingLine('Dîners', totalDIN, pDIN, this.TVA.RESTAURATION, 'diner'));
        }

        // Pension complète discount (Pro only)
        if (isPro && meals.mode === 'pension' && counts.length > 0) {
            let totalDiscount = 0;
            counts.forEach(c => {
                const eligible = Math.min(c.petitDej || 0, c.dejeuner || 0, c.diner || 0);
                totalDiscount += eligible * 10; // 10€ discount per full-board person-day
            });
            if (totalDiscount > 0) {
                lines.push(this._pricingLine(
                    'Optimisation Forfait Pension Complète',
                    1,
                    -totalDiscount,
                    this.TVA.RESTAURATION,
                    null
                ));
            }
        }

        subtotal = lines.reduce((s, l) => s + l.totalHT, 0);
        return { lines, subtotal };
    },

    // =========================================================================
    // PRIVATE — Construction des lignes options & salles
    // =========================================================================
    _buildOptions(mode, options, totalPers, nights, resolver) {
        const lines = [];
        if (totalPers <= 0 || nights <= 0) return lines;

        const isPro = (mode === 'pro');

        // PERSO: Privatisation obligatoire
        if (!isPro) {
            const privPrice = resolver('PRIVATISATION_PERSO_LIEU', totalPers, nights, 650);
            lines.push(this._pricingLine(
                'Privatisation du Domaine<br><small style="color:#666; font-weight:400;">Accès exclusif aux espaces et jardins</small>',
                1,
                privPrice,
                this.TVA.OPTIONS,
                null
            ));
        }

        // Salle de réunion (Pro)
        if (isPro && options.salleReunion) {
            const sallePrice = resolver('SALLE_TRAVAIL_SEMINAIRE', totalPers, nights, 500);
            lines.push(this._pricingLine(
                'Location Salles & Coordination logistique<br><small style="color:#666; font-weight:400;">Coordination on-site, Salle équipée, Support technique</small>',
                nights,
                sallePrice,
                this.TVA.SALLE,
                null
            ));
        }

        // Kit soirée (Pro)
        if (isPro && options.kitSoiree) {
            const kitPrice = resolver('OPTION_PRO_KIT_SOIREE', totalPers, nights, 500);
            lines.push(this._pricingLine('Kit soirée (Son & Lumière)', 1, kitPrice, this.TVA.OPTIONS, null));
        }

        // Draps (Perso)
        if (!isPro && options.draps) {
            const drapsPrice = resolver('FORFAIT_DRAPS_PERSO_DRAPS', totalPers, nights, 7);
            lines.push(this._pricingLine('Forfait draps & linge de lit', totalPers, drapsPrice, this.TVA.OPTIONS, null));
        }

        // Ménage (Perso)
        if (!isPro && options.menage) {
            const menagePrice = resolver('OPTION_PERSO_MENAGE', totalPers, nights, 300);
            lines.push(this._pricingLine('Ménage de fin de séjour', 1, menagePrice, this.TVA.OPTIONS, null));
        }

        // Chambre individuelle supplément (Perso)
        if (!isPro && options.chambreIndiv) {
            const indivPrice = resolver('OPTION_PERSO_CHAMBRE_INDIV', totalPers, nights, 30);
            lines.push(this._pricingLine('Supplément chambre individuelle', 1, indivPrice, this.TVA.OPTIONS, null));
        }

        return lines;
    },

    // =========================================================================
    // PRIVATE — Construction des lignes d'activités
    // =========================================================================
    _buildActivites(activities) {
        const lines = [];
        if (!activities) return lines;

        const activityMap = {
            'huitres': 'Dégustation d\'huîtres & vin blanc',
            'bateau': 'Sortie en bateau sur l\'Étang',
            'velo': 'Location de vélos & Balade',
            'rallye': 'Rallye en 2CV',
            'yoga': 'Séance de Yoga',
            'culturel': 'Visite culturelle dédiée'
        };

        // Check for boolean activity keys (old format)
        const activeKeys = Object.keys(activities).filter(k =>
            activities[k] === true && k !== 'requested'
        );

        if (activeKeys.length > 0) {
            activeKeys.forEach(k => {
                lines.push(this._pricingLine(
                    activityMap[k] || k,
                    1,
                    0, // Sur devis
                    this.TVA.ACTIVITES,
                    null
                ));
            });
        } else if (activities.requested) {
            const label = `Activité prévue : ${activities.type || 'Sur mesure'}` +
                (activities.message ? `<br><small style="color:#666;">${activities.message}</small>` : '');
            lines.push(this._pricingLine(label, 1, 0, this.TVA.ACTIVITES, null));
        }

        return lines;
    },

    // =========================================================================
    // PRIVATE — Build meals planning grid data
    // =========================================================================
    _buildMealsPlanning(meals, dStart, days) {
        if (!meals || meals.mode === 'libre' || !meals.counts) return [];
        const planning = [];
        const mealKeys = ['petitDej', 'collationMatin', 'dejeuner', 'collationAprem', 'diner'];

        for (let i = 0; i < Math.min(days, meals.counts.length); i++) {
            const dayData = meals.counts[i] || {};
            let dayLabel;
            if (dStart) {
                const d = new Date(dStart);
                d.setDate(d.getDate() + i);
                dayLabel = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
                dayLabel = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);
            } else {
                dayLabel = `J${i + 1}`;
            }

            const dayPlan = { label: dayLabel, meals: {} };
            mealKeys.forEach(key => {
                dayPlan.meals[key] = dayData[key] || 0;
            });
            planning.push(dayPlan);
        }
        return planning;
    },

    // =========================================================================
    // PRIVATE — Create a pricing line object
    // =========================================================================
    _pricingLine(label, qty, unitPrice, tvaRate, mealKey) {
        const q = parseFloat(qty) || 0;
        const p = parseFloat(unitPrice) || 0;
        const totalHT = Math.round(q * p * 100) / 100;
        return {
            type: 'pricing',
            label: label,
            qty: q,
            unitPriceHT: p,
            tvaRate: tvaRate,
            totalHT: totalHT,
            mealKey: mealKey || null
        };
    },

    // =========================================================================
    // PRIVATE — Create a pricing resolver from the Airtable DB
    // =========================================================================
    /**
     * Returns a function: (code, nbPers, nbNights, fallback) => priceHT
     */
    _createPricingResolver(pricingDB, mode) {
        const backup = (typeof SesquierConstants !== 'undefined') ? SesquierConstants.PRICING_BACKUP : {};
        const targetType = (mode === 'pro') ? 'PROFESSIONNEL' : 'PERSONNEL';

        return (baseCode, nbPers = 1, nbNights = 1, fallback = 0) => {
            const normalizedBase = this._normalizeCode(baseCode);
            if (!normalizedBase) return fallback;

            // 1. Search in Airtable DB
            if (pricingDB && pricingDB.length > 0) {
                const matches = pricingDB.filter(item => {
                    const isCodeMatch = item.code === normalizedBase || item.code.startsWith(normalizedBase + '_');
                    const isPersoMatch = nbPers >= (item.minPers || 0) && nbPers <= (item.maxPers || 999);
                    const isNightMatch = nbNights >= (item.minNights || 0) && nbNights <= (item.maxNights || 999);

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
                    const best = matches.sort((a, b) =>
                        (a.maxPers - a.minPers) - (b.maxPers - b.minPers)
                    )[0];
                    return (best.priceHT !== null && best.priceHT !== undefined) ? best.priceHT : fallback;
                }
            }

            // 2. No backup fallback — Airtable is the only source of truth
            return fallback;
        };
    },

    // =========================================================================
    // PRIVATE — Normalize pricing code
    // =========================================================================
    _normalizeCode(value) {
        if (!value) return '';
        return String(value)
            .toUpperCase()
            .trim()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^A-Z0-9_]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
    },

    // =========================================================================
    // PRIVATE — Parse date safely
    // =========================================================================
    _parseDate(value) {
        if (!value) return null;
        if (value instanceof Date) {
            const d = new Date(value);
            d.setHours(12, 0, 0, 0);
            return d;
        }
        const d = new Date(value);
        if (isNaN(d.getTime())) return null;
        d.setHours(12, 0, 0, 0);
        return d;
    },

    // =========================================================================
    // PRIVATE — Meal mode label
    // =========================================================================
    _getMealModeLabel(mode) {
        switch (mode) {
            case 'pension': return 'Pension Complète';
            case 'demi': return 'Demi-pension';
            case 'traiteur':
            case 'custom': return 'Restauration à la carte';
            case 'libre': return 'Gestion libre';
            default: return 'Restauration à la carte';
        }
    },

    // =========================================================================
    // CONVERSION — Depuis un ancien format Airtable (rétrocompatibilité)
    // =========================================================================
    /**
     * Reconstruit un dossier à partir des champs Airtable legacy.
     * Utilisé pour les réservations existantes qui n'ont pas encore de "Dossier JSON".
     *
     * @param {object} fields — Record.fields depuis Airtable
     * @param {Array} pricingDB — window.PRICING_DB si disponible
     * @returns {object} Dossier complet
     */
    buildFromAirtableFields(fields, pricingDB = []) {
        const details = fields['Détails JSON'] ? JSON.parse(fields['Détails JSON']) : {};
        const typeRaw = Array.isArray(fields['Type']) ? fields['Type'][0] : (fields['Type'] || '');
        const mode = (typeRaw.toLowerCase().includes('séminaire') || typeRaw.toLowerCase().includes('professionnel')) ? 'pro' : 'perso';

        // Extract name parts
        const fullName = fields['Nom client'] || fields['Référent'] || '';
        const nameParts = fullName.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        // Build meals counts from details or flat fields
        let mealsCounts = [];
        if (details.meals && details.meals.counts && details.meals.counts.length > 0) {
            mealsCounts = details.meals.counts;
        }

        return this.build({
            mode: mode,
            client: {
                organisation: fields['Entreprise'] || fields['Organisation'] || '',
                firstName: firstName,
                lastName: lastName,
                email: fields['Email'] || '',
                phone: fields['Téléphone'] || '',
                message: fields['Message'] || ''
            },
            dates: {
                start: fields['Date arrivée'],
                end: fields['Date départ']
            },
            group: {
                total: fields['Nombre de personnes'] || 0,
                adult: details.group?.adult || 0,
                child: details.group?.child || 0,
                baby: details.group?.baby || 0
            },
            sleeping: {
                mode: details.sleeping?.mode || 'auto',
                indiv: details.sleeping?.indiv || 0,
                partage: details.sleeping?.partage || 0,
                couple: details.sleeping?.couple || 0,
                usedGites: details.sleeping?.usedGites || []
            },
            meals: {
                mode: details.meals?.mode || 'libre',
                counts: mealsCounts
            },
            options: {
                draps: fields['Option draps'] === 'Oui',
                menage: fields['Option ménage'] === 'Oui',
                lateArrival: details.options?.lateArrival || false,
                salleReunion: details.options?.salleReunion || false,
                kitSoiree: details.options?.kitSoiree || false,
                chambreIndiv: details.options?.chambreIndiv || false,
                activities: details.options?.activities || {}
            },
            pricingDB: pricingDB,
            airtableId: fields['ID Airtable'] || null
        });
    }
};

// Export for browser
window.DossierModel = DossierModel;
