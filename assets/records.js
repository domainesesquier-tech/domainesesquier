/**
 * =============================================================================
 * DOMAINE SESQUIER — RECORDS & NORMALIZATION LAYER
 * =============================================================================
 * Source unique de vérité pour les noms de champs Airtable et les statuts.
 * Assure que le front-end manipule des objets propres et prévisibles.
 * =============================================================================
 */

const SesquierRecords = {

    // 1. CONTRAT DE DONNÉES (Noms de champs Airtable exacts)
    FIELDS: {
        ID: "id",
        NOM: "Nom client",
        ENTREPRISE: "Entreprise",
        EMAIL: "Email",
        PHONE: "Téléphone",
        TYPE: "Type",
        STATUT: "Statut",
        DATE_ARRIVEE: "Date arrivée",
        DATE_DEPART: "Date départ",
        NB_PERSONNES: "Nombre de personnes",
        MESSAGE: "Message",
        DOSSIER_JSON: "DOSSIER JSON",
        TIMELINE_JSON: "Timeline JSON",
        EST_ARCHIVE: "est_archive",
        
        // Financiers
        MONTANT_HEBERG: "Montant Hébergement HT",
        MONTANT_REPAS: "Montant Repas HT",
        MONTANT_OPTIONS: "Montant Options HT",

        // Commercial
        TEMPERATURE: "Température",
    },

    // 2. SYSTÈME DE STATUTS CENTRALISÉ
    // Doit être synchronisé avec DossierModel.STATUTS si possible.
    STATUS_MAP: {
        'demande': {
            label: 'DEMANDE',
            airtable: 'demande',
            color: '#6B7060',
            bg: 'rgba(107, 112, 96, 0.1)',
            icon: 'fa-envelope',
            class: 'badge-traiter'
        },
        'à traiter': {
            label: 'À TRAITER',
            airtable: 'à traiter',
            color: '#9E5D4C',
            bg: 'rgba(158, 93, 76, 0.1)',
            icon: 'fa-clock',
            class: 'badge-traiter'
        },
        'devis envoyé': {
            label: 'DEVIS ENVOYÉ',
            airtable: 'devis envoyé',
            color: '#7C3AED',
            bg: 'rgba(124, 58, 237, 0.1)',
            icon: 'fa-paper-plane',
            class: 'badge-devis'
        },
        'devis signé': {
            label: 'DEVIS SIGNÉ',
            airtable: 'devis signé',
            color: '#2563EB',
            bg: 'rgba(37, 99, 235, 0.1)',
            icon: 'fa-file-signature',
            class: 'badge-devis'
        },
        'acompte reçu': {
            label: 'ACOMPTE REÇU',
            airtable: 'acompte reçu',
            color: '#D4860A',
            bg: 'rgba(212, 134, 10, 0.1)',
            icon: 'fa-hand-holding-dollar',
            class: 'badge-devis'
        },
        'confirmé': {
            label: 'CONFIRMÉ',
            airtable: 'confirmé',
            color: '#2D8B56',
            bg: 'rgba(45, 139, 86, 0.1)',
            icon: 'fa-check-circle',
            class: 'badge-confirme'
        },
        'effectué': {
            label: 'EFFECTUÉ',
            airtable: 'effectué',
            color: '#2D8B56',
            bg: 'rgba(45, 139, 86, 0.08)',
            icon: 'fa-flag-checkered',
            class: 'badge-effectue'
        },
        'terminé': {
            label: 'TERMINÉ',
            airtable: 'terminé',
            color: '#6B7060',
            bg: 'rgba(107, 112, 96, 0.1)',
            icon: 'fa-archive',
            class: 'badge-effectue'
        },
        'annulé': {
            label: 'ANNULÉ',
            airtable: 'annulé',
            color: '#C53030',
            bg: 'rgba(197, 48, 48, 0.1)',
            icon: 'fa-times-circle',
            class: 'badge-annule'
        }
    },

    /**
     * NORMALISATION : Transforme un record brut en objet propre.
     */
    normalize(raw) {
        if (!raw || !raw.fields) return null;
        const f = raw.fields;
        const F = this.FIELDS;

        // Statut : Gestion robuste Array vs String + Lowercase
        let sRaw = f[F.STATUT];
        if (Array.isArray(sRaw)) sRaw = sRaw[0];
        const sKey = (sRaw || 'à traiter').toLowerCase().trim();
        const sInfo = this.STATUS_MAP[sKey] || this.STATUS_MAP['à traiter'];

        // Type
        let tRaw = f[F.TYPE];
        if (Array.isArray(tRaw)) tRaw = tRaw[0];
        const type = tRaw || '';
        const isPro = type.toLowerCase().includes('séminaire') || type.toLowerCase().includes('professionnel');

        // Financiers : Garantir des nombres
        const mH = parseFloat(f[F.MONTANT_HEBERG]) || 0;
        const mR = parseFloat(f[F.MONTANT_REPAS]) || 0;
        const mO = parseFloat(f[F.MONTANT_OPTIONS]) || 0;

        // Lire le DOSSIER JSON pour récupérer les financials les plus précis
        let _dossier = null;
        try { _dossier = f[F.DOSSIER_JSON] ? JSON.parse(f[F.DOSSIER_JSON]) : null; } catch (_) {}
        const _fin = _dossier?.financials;
        // Source de vérité : DOSSIER JSON si disponible, sinon champs plats
        const _totalHT   = (typeof _fin?.totalHT   === 'number' && _fin.totalHT   > 0) ? _fin.totalHT   : (mH + mR + mO);
        const _totalTVA  = (typeof _fin?.totalTVA  === 'number') ? _fin.totalTVA  : 0;
        const _totalTTC  = (typeof _fin?.totalTTC  === 'number') ? _fin.totalTTC  : _totalHT;
        const _sHeberg   = _fin?.subtotals?.hebergement   ?? mH;
        const _sRepas    = _fin?.subtotals?.restauration   ?? mR;
        const _sOptions  = (_fin?.subtotals?.options ?? 0) + (_fin?.subtotals?.activites ?? 0) || mO;

        // Mapping pour les classes CSS legacy (utilisées par le calendrier)
        const classMap = {
            'à traiter': 'traiter',
            'devis envoyé': 'devis',
            'devis signé': 'confirme',
            'acompte reçu': 'confirme',
            'confirmé': 'confirme',
            'terminé': 'effectue',
            'annulé': 'annule'
        };

        return {
            id: raw.id,
            nomClient: (f[F.NOM] || '').trim() || 'Client sans nom',
            entreprise: (f[F.ENTREPRISE] || '').trim(),
            email: (f[F.EMAIL] || '').trim(),
            phone: (f[F.PHONE] || '').trim(),
            dateArrivee: f[F.DATE_ARRIVEE] || null,
            dateDepart: f[F.DATE_DEPART] || null,
            nbPersonnes: parseInt(f[F.NB_PERSONNES] || f["Nb personnes"], 10) || 0,
            message: f[F.MESSAGE] || '',
            
            statut: sInfo.airtable,
            statutLabel: sInfo.label,
            statutColor: sInfo.color,
            statutBg: sInfo.bg,
            statutIcon: sInfo.icon,
            statutClass: classMap[sKey] || 'traiter',

            type: type,
            isPro: isPro,
            estArchive: !!f[F.EST_ARCHIVE],

            // JSON complexes
            dossier: f[F.DOSSIER_JSON] ? this._safeParse(f[F.DOSSIER_JSON]) : null,
            timeline: f[F.TIMELINE_JSON] ? this._safeParse(f[F.TIMELINE_JSON]) : [],

            // Financiers calculés (Source unique : DOSSIER JSON si présent, sinon champs plats)
            totalHT:  _totalHT,
            totalTVA: _totalTVA,
            totalTTC: _totalTTC,
            detailsHT: { hebergement: _sHeberg, repas: _sRepas, options: _sOptions },

            temperature: Math.min(5, Math.max(1, parseInt(f['Température'] ?? f['temperature']) || 1)),

            _raw: raw // Garder le brut au cas où
        };
    },

    /**
     * PRÉPARATION : Prépare le payload pour Airtable (PATCH)
     */
    prepareUpdate(field, value) {
        let finalVal = value;
        const F = this.FIELDS;

        // Supabase attend une string simple pour le statut
        if (field === F.STATUT) {
            const key = (Array.isArray(value) ? value[0] : value).toLowerCase().trim();
            finalVal = this.STATUS_MAP[key] ? this.STATUS_MAP[key].airtable : key;
        }

        if (field === F.NB_PERSONNES) {
            finalVal = parseInt(value, 10) || null;
        }

        if (field === F.TEMPERATURE) {
            finalVal = Math.min(5, Math.max(1, parseInt(value, 10) || 1));
        }

        return { [field]: finalVal };
    },

    _safeParse(str) {
        try { return JSON.parse(str); } catch (e) { return null; }
    }
};

window.SesquierRecords = SesquierRecords;
window.FIELDS      = SesquierRecords.FIELDS;
window.STATUS_MAP  = SesquierRecords.STATUS_MAP;

// Retourne { id, fields } pour rétrocompatibilité avec tout le code existant.
// Expose aussi toutes les propriétés camelCase de SesquierRecords.normalize() au niveau racine
// pour que r.statut, r.estArchive, r.nomClient, etc. fonctionnent directement.
window.normalizeRecord = function(raw) {
    const n = SesquierRecords.normalize(raw);
    if (!n) return { id: raw.id, fields: raw.fields || {} };
    const f = n._raw.fields || {};
    return {
        ...n,
        id: n.id,
        _n: n,
        fields: {
            ...f,
            'Nom client':              n.nomClient,
            'Entreprise':              n.entreprise || '',
            'Email':                   n.email,
            'Date arrivée':            n.dateArrivee,
            'Date départ':             n.dateDepart,
            'Nb personnes':            n.nbPersonnes,
            'Nombre de personnes':     n.nbPersonnes,
            'Statut':                  n.statut,
            'est_archive':             n.estArchive,
            'Montant Hébergement HT':  n.detailsHT.hebergement,
            'Montant Repas HT':        n.detailsHT.repas,
            'Montant Options HT':      n.detailsHT.options,
            'Total HT':                n.totalHT,
            'Total TTC':               n.totalTTC,
            'DOSSIER JSON':            f['DOSSIER JSON'] || null,
            _total:                    n.totalHT,
        }
    };
};
