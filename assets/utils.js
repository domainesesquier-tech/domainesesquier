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
                const errorText = await response.text();
                console.error(`[API] Erreur ${response.status}:`, errorText);
                let errorJson = {};
                try { errorJson = JSON.parse(errorText); } catch (e) { }
                throw new Error(errorJson.error?.message || `Erreur Serveur (${response.status})`);
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
    },

    // --- Document UI Helpers ---

    addCategoryRow(title, targetId = 'pricing-body') {
        const tbody = document.getElementById(targetId);
        if (!tbody) return;
        const tr = document.createElement('tr');
        tr.className = "category-row no-edit";
        tr.innerHTML = `<td colspan="6">${title}</td>`;
        tbody.appendChild(tr);
    },

    addPricingRow(label, qty, price, tva, mealKey = null, targetId = 'pricing-body') {
        const tbody = document.getElementById(targetId);
        if (!tbody) return;
        const tr = this.createPricingRow(label, qty, price, tva, mealKey);
        tbody.appendChild(tr);
    },

    createPricingRow(label, qty, price, tva, mealKey = null) {
        const tr = document.createElement('tr');
        if (mealKey) tr.dataset.mealKey = mealKey;
        tr.innerHTML = `
            <td contenteditable="true" class="col-detail">${label}</td>
            <td contenteditable="true" class="qty" style="text-align: center;">${qty}</td>
            <td contenteditable="true" class="price" style="text-align: right;">${parseFloat(price).toFixed(2)}</td>
            <td class="tva-rate" contenteditable="true" style="text-align: right;">${tva}</td>
            <td class="row-total" style="text-align: right; font-weight: 600;">0.00</td>
            <td class="no-print" style="text-align: center; vertical-align: middle;">
                <button onclick="SesquierUtils.removeRow(this, event)" style="background:none; border:none; color:#ff4d4d; cursor:pointer; font-size:16pt; padding:0 5px;">&times;</button>
            </td>
        `;
        return tr;
    },

    removeRow(btn, event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
            if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        }

        // Utiliser la fenêtre parente pour le confirm si on est dans une iframe
        // C'est beaucoup plus stable dans Chrome pour éviter que la fenêtre ne se ferme seule
        const context = window.top || window;

        try {
            if (context.confirm("Supprimer cette ligne ?")) {
                const tr = btn.closest('tr');
                if (tr) {
                    tr.remove();
                    if (typeof window.updateCalculations === 'function') {
                        window.updateCalculations();
                    }
                }
            }
        } catch (e) {
            // Fallback si l'accès au top window est bloqué par la sécurité (rare sur même domaine)
            if (confirm("Supprimer cette ligne ?")) {
                const tr = btn.closest('tr');
                if (tr) {
                    tr.remove();
                    if (typeof window.updateCalculations === 'function') {
                        window.updateCalculations();
                    }
                }
            }
        }
    },

    addSubtotalRow(label, id, targetId = 'pricing-body') {
        const tbody = document.getElementById(targetId);
        if (!tbody) return;
        const tr = document.createElement('tr');
        tr.className = "subtotal-row";
        tr.style.background = "#f9f9f9";
        tr.style.fontWeight = "600";
        tr.innerHTML = `
            <td colspan="4" style="padding: 6px 15px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <button class="no-print" onclick="SesquierUtils.addRowBefore(this)" style="background: white; border:1.5px solid var(--primary); color: var(--primary); border-radius:4px; padding:4px 12px; cursor:pointer; font-size:8pt; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">+ Ligne</button>
                    <span style="font-style: italic; color:#666; font-size:8.5pt;">Sous-total ${label} HT</span>
                </div>
            </td>
            <td class="subtotal-val" id="${id}" style="text-align: right; padding-right: 5px; font-size:9.5pt;">0.00</td>
            <td class="no-print"></td>
        `;
        tbody.appendChild(tr);
    },

    addRowBefore(btn) {
        const subRow = btn.closest('tr');
        const newRow = this.createPricingRow("Prestation manuelle...", 1, 0, "10%");
        subRow.parentNode.insertBefore(newRow, subRow);
        if (window.updateCalculations) window.updateCalculations();
    },

    /**
     * UNIFIED CALCULATION ENGINE
     * Used by Devis, Facture Acompte, and Facture Finale.
     * @returns {object} Calculated totals: { totalHT, totalTVA, ttc, subtotals }
     */
    runCommonCalculations() {
        let totalHT = 0, totalTVA = 0;
        let sHeberg = 0, sRestau = 0, sOpt = 0, sActiv = 0;

        const parseP = (val) => {
            if (!val) return 0;
            // On garde les chiffres, les points, les virgules et le signe MOINS
            const clean = val.toString().replace(/[^\d.,-]/g, '').replace(',', '.');
            return parseFloat(clean) || 0;
        };

        const processTable = (tbodyId) => {
            const tbody = document.getElementById(tbodyId);
            if (!tbody) return;
            tbody.querySelectorAll('tr').forEach(row => {
                if (row.classList.contains('category-row') || row.classList.contains('subtotal-row')) return;

                const qEl = row.querySelector('.qty');
                const pEl = row.querySelector('.price');
                if (!qEl || !pEl) return;

                const q = parseFloat(String(qEl.innerText).replace(',', '.')) || 0;
                const p = parseP(pEl.innerText);
                const line = Math.round(q * p * 100) / 100;

                const totalEl = row.querySelector('.row-total');
                if (totalEl) totalEl.innerText = line.toFixed(2);

                totalHT += line;

                if (tbodyId === 'pricing-body') {
                    const label = (row.cells[0]?.innerText || "").toLowerCase();
                    const isHeberg = label.includes("chambre") || label.includes("hébergement") || label.includes("héberg") || label.includes("twin");
                    
                    if (isHeberg) {
                        sHeberg += line;
                    } else {
                        sRestau += line;
                    }
                } else if (tbodyId === 'options-body') sOpt += line;
                else if (tbodyId === 'activities-body') sActiv += line;

                const tvaEl = row.querySelector('.tva-rate');
                let rate = 0.1;
                if (tvaEl) {
                    const rawTva = tvaEl.innerText.replace(/[^\d.,]/g, '').replace(',', '.');
                    rate = (parseFloat(rawTva) / 100) || 0.1;
                }
                totalTVA += (line * rate);
            });
        };

        processTable('pricing-body');
        processTable('options-body');
        processTable('activities-body');

        // Mise à jour forcé des sous-totaux dans le DOM
        const updateField = (id, value) => {
            const el = document.getElementById(id);
            if (el) {
                el.innerText = value.toFixed(2);
                el.classList.add('updated'); // Optionnel: pour debug visuel
            }
        };

        updateField('subtotal-hebergement', sHeberg);
        updateField('subtotal-restauration', sRestau);
        updateField('subtotal-salles', sOpt);
        updateField('subtotal-activities', sActiv);

        const ttc = totalHT + totalTVA;
        return { totalHT, totalTVA: Math.round(totalTVA * 100) / 100, ttc: Math.round(ttc * 100) / 100, subtotals: { sHeberg, sRestau, sOpt, sActiv } };
    },

    /**
     * UNIFIED PDF GENERATION
     * @param {string} elementId - ID container
     * @param {string} filename - Output name
     * @param {object} customOptions - Overrides (margin, orientation...)
     */
    async generatePDF(elementInput, filename = 'document.pdf', customOptions = {}) {
        const element = (typeof elementInput === 'string') ? document.getElementById(elementInput) : elementInput;
        if (!element) return console.error(`[PDF] Element not found`, elementInput);

        const defaultOptions = {
            margin: [10, 10, 10, 10],
            filename: filename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, letterRendering: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        const finalOptions = { ...defaultOptions, ...customOptions };

        try {
            if (typeof html2pdf === 'undefined') throw new Error("html2pdf.js missing");
            console.log(`[PDF] Exporting ${filename}...`);
            await html2pdf().set(finalOptions).from(element).save();
        } catch (err) {
            console.error(`[PDF] Error:`, err);
            alert("Erreur PDF: " + err.message);
        }
    }
};

window.SesquierUtils = SesquierUtils;
