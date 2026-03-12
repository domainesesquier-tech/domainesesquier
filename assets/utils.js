/**
 * Domaine Sesquier - Shared Utilities & Configuration
 */

const SesquierUtils = {
    // API Configuration
    API_BASE: 'https://domainesesquier-api.domainesesquier.workers.dev',

    get API_RESERVATIONS_URL() {
        return `${this.API_BASE}/api/reservations`;
    },

    get API_PRICING_URL() {
        return `${this.API_BASE}/api/pricing`;
    },

    /**
     * Format numbers to Euro currency string
     * @param {number} amount 
     * @returns {string}
     */
    formatEuro(amount) {
        if (typeof amount !== 'number') return '0,00 €';
        return amount.toLocaleString('fr-FR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }) + " €";
    },

    /**
     * Standardized fetch helper
     * @param {string} url 
     * @param {object} options 
     */
    async fetchJson(url, options = {}) {
        console.log(`[API] Appel : ${url}`, options);
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                console.error(`[API] Erreur ${response.status}:`, error);
                throw new Error(error.message || `Erreur Serveur (${response.status})`);
            }
            const data = await response.json();
            console.log(`[API] Succès :`, data);
            return data;
        } catch (err) {
            console.error(`[API] Échec critique pour ${url}:`, err);
            throw err;
        }
    },

    /**
     * Sync state between iframes via message
     * @param {string} type 
     * @param {object} data 
     */
    broadcast(type, data = {}) {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type, ...data }, '*');
        }
    },

    /**
     * Clean and normalize code strings for matching
     */
    normalizeCode(value) {
        if (value == null) return null;
        if (typeof value === 'object' && !Array.isArray(value)) {
            if (value.value) return this.normalizeCode(value.value);
            return null;
        }
        if (typeof value === 'string') {
            const out = value.replace(/[\n\r]/g, '').trim().toUpperCase();
            return out || null;
        }
        if (Array.isArray(value) && value.length > 0) {
            return this.normalizeCode(value[0]);
        }
        const out = String(value).trim().toUpperCase();
        return out || null;
    },

    /**
     * Safe number conversion
     */
    toNumber(value) {
        if (typeof value === 'number') return Number.isFinite(value) ? value : null;
        if (typeof value === 'string') {
            const normalized = value.trim().replace(',', '.');
            if (!normalized) return null;
            const n = Number(normalized);
            return Number.isFinite(n) ? n : null;
        }
        return null;
    },

    /**
     * Parse date without time component
     */
    parseDateOnly(value) {
        if (!value) return null;
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return null;
        return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    },

    /**
     * Convert date to YYYY-MM-DD key
     */
    toDateKey(date) {
        if (!date) return null;
        return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())).toISOString().slice(0, 10);
    }
};

window.SesquierUtils = SesquierUtils;
