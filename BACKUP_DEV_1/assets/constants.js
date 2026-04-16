/**
 * Domaine Sesquier - Global Constants & Pricing
 */

const SesquierConstants = {
    PRICES_LEGACY: {
        individuel: { 1: 90, 2: 80 },
        partage: { 1: 60, 2: 50, 3: 40 },
        petitDej: 12,
        dejeuner: 25,
        diner: 29,
        draps: 7,
        pauseCafe: 5,
        salle: 500,
        menage: 300,
        privatisation: 650,
        chambreIndiv: 30,
        kitSoiree: 500,
        accueilLogistique: 150
    },

    PRICING_BACKUP: {
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
    },

    GITES: [
        { name: "Acacia", cap: 6, beds: "1 lit double, 2 simples, 1 canapé 2p", remarks: "Canapé convertible 2 places" },
        { name: "Hibiscus", cap: 8, beds: "1 lit double, 6 simples", remarks: "Idéal pour grands groupes" },
        { name: "Pivoine", cap: 4, beds: "1 lit double, 2 simples", remarks: "Configuration classique" },
        { name: "Belle de nuit", cap: 6, beds: "1 lit double, 2 simples, 1 canapé 2p", remarks: "Canapé convertible 2 places" },
        { name: "Iris", cap: 4, beds: "1 lit double, 2 simples", remarks: "Configuration classique" },
        { name: "Rose", cap: 4, beds: "1 lit double, 1 canapé 2p", remarks: "Canapé convertible 2 places" },
        { name: "Figuier", cap: 2, beds: "1 lit double", remarks: "Gîte romantique pour 2" },
        { name: "Jasmin", cap: 4, beds: "1 lit double conv, 1 canapé 1p, 1 appoint", remarks: "Lit double convertible + lit d'appoint" }
    ]
};

window.SesquierConstants = SesquierConstants;
