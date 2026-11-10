/**
 * Domaine Sesquier — Déroulé ↔ devis
 *
 * 1. genererEtapes(dossier, nbJours) : construit les étapes du déroulé à partir
 *    des lignes du devis (DOSSIER JSON → financials.lines, séparateurs JOUR N,
 *    mealsPlanning).
 * 2. fusionner(jours, generees, nouveauJour) : applique ces étapes au déroulé
 *    existant sans perdre les étapes ajoutées à la main.
 * 3. verifier(state, dossier, fields) : liste les écarts entre déroulé et devis,
 *    avec des règles fixes (aucune IA).
 *
 * Les réglages (horaires, saisons) sont en tête de fichier.
 */
(function () {
    'use strict';

    // ── Réglages ─────────────────────────────────────────────────────
    const HORAIRES = {
        petitDej: '08h00',
        accueil: '09h30',
        travailMatinJ1: '10h00',   // premier jour, après l'accueil
        travailMatin: '09h00',     // jours suivants
        collationMatin: '11h00',
        dejeuner: '12h30',
        travailAprem: '14h00',
        collationAprem: '16h00',
        activite: '16h30',
        installation: '18h00',
        aperitif: '18h30',         // brasucade, apéritif
        diner: '20h00'
    };
    const MOIS_HIVER = [11, 12, 1, 2, 3];   // pas d'activité en plein air sans repli
    const MOIS_PISCINE = [6, 7, 8, 9];      // piscine ouverte de juin à septembre

    const REPAS = ['accueil', 'petitDej', 'collationMatin', 'dejeuner', 'collationAprem', 'diner'];
    const RE_IGNORE = /taxe de sejour|remise|reduction|menage|draps|frais de dossier|caution|acompte/;
    const RE_PLEIN_AIR = /plein air|en exterieur|dehors|terrasse|parvis|sous les oliviers|brasucade|barbecue|plancha|pique-nique|guinguette|petanque|kayak|paddle|baignade|olympiades|chasse au tresor|rallye/;
    const RE_PISCINE = /piscine|baignade/;
    const MOTS_VIDES = new Set(['activite', 'activites', 'signature', 'atelier', 'ateliers', 'domaine',
        'saint', 'andre', 'ouverture', 'cloture', 'session', 'journee', 'groupe', 'equipe', 'sesquier',
        'supplement', 'option', 'personne', 'personnes', 'animation', 'animee', 'offert', 'inclus',
        'incluse', 'experience', 'moment', 'temps', 'convivial', 'conviviale', 'local', 'locale']);
    const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
        'septembre', 'octobre', 'novembre', 'décembre'];

    // ── Outils texte ─────────────────────────────────────────────────
    function decode(s) {
        return String(s == null ? '' : s)
            .replace(/&amp;/g, '&').replace(/&#0?39;|&apos;|&rsquo;/g, "'").replace(/&quot;/g, '"')
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
            .replace(/<[^>]+>/g, '');
    }
    function norm(s) {
        return decode(s).replace(/œ/gi, 'oe').normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[’`]/g, "'").toLowerCase();
    }
    function minutes(h) {
        const m = String(h || '').match(/(\d{1,2})\s*[h:]\s*(\d{2})?/i);
        return m ? (+m[1]) * 60 + (+(m[2] || 0)) : null;
    }
    function prix(n) {
        const v = Math.round(n * 100) / 100;
        return v.toLocaleString('fr-FR', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' €';
    }
    function motsCles(t) {
        return [...new Set(t.split(/[^a-z]+/).filter(w => w.length >= 5 && !MOTS_VIDES.has(w)))];
    }
    function uid() {
        return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    // Type d'une ligne ou d'une étape d'après son texte (déjà normalisé)
    function typeRepas(t, heure) {
        if (!t) return null;
        if (/petit[- ]?dej/.test(t)) return 'petitDej';
        if (/^(supplement\s+)?vins?\b|accord.{0,8}vins?\b|\bvins? (au|du|servi|a table)/.test(t)) return 'vin';
        if (/gouter|(collation|pause).{0,25}apres/.test(t)) return 'collationAprem';
        if (/(collation|pause).{0,25}mat/.test(t)) return 'collationMatin';
        if (/accueil.{0,25}(cafe|mignard|collation|rafraich)|(cafe|pot|collation).{0,25}(accueil|arrivee)|mignardise/.test(t)) return 'accueil';
        if (/collation|pause gourmande|pause cafe/.test(t)) {
            const m = minutes(heure);
            return m != null && m >= 720 ? 'collationAprem' : 'collationMatin';
        }
        if (/dejeuner/.test(t)) return 'dejeuner';
        if (/diner/.test(t)) return 'diner';
        return null;
    }
    function typeEtape(e) {
        const t = norm(e.titre);
        const k = typeRepas(t, e.heure);
        if (k) return k;
        if (/travail|seance|pleniere/.test(t)) return (minutes(e.heure) || 0) >= 720 ? 'travailAprem' : 'travailMatin';
        if (/^depart|depart du groupe|fin du sejour/.test(t)) return 'depart';
        if (/installation|remise des cles/.test(t)) return 'installation';
        return null;
    }

    // ── Lecture du devis ─────────────────────────────────────────────
    function analyserDevis(dossier) {
        const lines = dossier?.financials?.lines || [];
        const sej = dossier?.sejour || {};
        let items = [];
        let cat = '', jour = null, avecJours = false;
        lines.forEach((l, idx) => {
            if (l.type === 'category') { cat = norm(l.title || l.label); jour = null; return; }
            if (l.type === 'separator') {
                const m = norm(l.title || l.label).match(/jour\s*(\d+)/);
                if (m) { jour = +m[1] - 1; avecJours = true; }
                return;
            }
            if (l.type !== 'pricing') return;
            const label = decode(l.label).replace(/\s*—\s*:\s*/, ' : ').trim();
            const t = norm(label);
            const unit = Number(l.unitPriceHT) || 0;
            if (!label || unit <= 0) return;
            let kind;
            if (/heberg|gite/.test(t)) kind = 'hebergement';
            else if (/salle/.test(t) && /domaine/.test(cat)) kind = 'salle';
            else if (RE_IGNORE.test(t)) return;
            else kind = l.mealKey || typeRepas(t) || 'activite';
            items.push({
                idx, kind, label, cat,
                day: (REPAS.includes(kind) || kind === 'vin') ? jour : null,
                subtitle: decode(l.subtitle).trim(),
                unit, qty: Number(l.qty) || 0, tva: Number(l.tvaRate) || 0,
                option: !!l.option,
                mots: kind === 'activite' ? (motsCles(t).length ? motsCles(t) : t.split(/[^a-z]+/).filter(w => w.length >= 4)) : []
            });
        });
        // Devis sans séparateurs JOUR : on place les repas d'après la grille mealsPlanning
        const mp = dossier?.mealsPlanning || [];
        if (!avecJours && mp.length) {
            const out = [];
            items.forEach(it => {
                if (REPAS.includes(it.kind) && it.kind !== 'accueil') {
                    mp.forEach((d, i) => { if (d?.meals?.[it.kind] > 0) out.push({ ...it, day: i }); });
                } else out.push(it.kind === 'accueil' ? { ...it, day: 0 } : it);
            });
            items = out;
            avecJours = true;
        }
        const maxJour = items.reduce((m, it) => Math.max(m, it.day == null ? 0 : it.day), 0);
        const nbJours = Math.max(Number(sej.days) || ((Number(sej.nights) || 0) + 1), maxJour + 1, 1);
        return { items, avecJours, nbJours, sejour: sej, participants: Number(sej.participants) || 0 };
    }

    function parPersonne(it, A) {
        return it.qty > 1 || A.participants <= 1;
    }
    function texteOption(it, A) {
        return `En option : ${prix(it.unit)} HT ${parPersonne(it, A) ? 'par personne' : '(forfait)'}.`;
    }

    // ── 1. Génération ────────────────────────────────────────────────
    function genererEtapes(dossier) {
        const A = analyserDevis(dossier);
        const n = A.nbJours;
        const jours = Array.from({ length: n }, () => []);
        const a = (d, kind, heure, titre, description, tag, extra) => {
            d = Math.max(0, Math.min(d, n - 1));
            jours[d].push({
                etape: { id: uid(), heure, titre, description, tag, src: 'devis', srcKey: `${kind}:${d}${extra?.cle ? ':' + extra.cle : ''}` },
                kind, mots: extra?.mots || [], optionTexte: extra?.optionTexte || ''
            });
        };
        const desc = it => [it.subtitle, it.option ? texteOption(it, A) : ''].filter(Boolean).join('\n');
        const tag = it => it.option ? 'option' : 'essentiel';
        const opt = it => ({ optionTexte: it.option ? texteOption(it, A) : '' });
        const aLe = (d, kind) => A.items.some(it => it.kind === kind && it.day === d);

        // Repas, collations, accueil
        A.items.filter(it => REPAS.includes(it.kind)).forEach(it => {
            a(it.day == null ? 0 : it.day, it.kind, HORAIRES[it.kind], it.label, desc(it), tag(it), opt(it));
        });
        // Vin : avec le premier dîner (sinon le premier déjeuner)
        A.items.filter(it => it.kind === 'vin').forEach(it => {
            const repas = A.items.find(x => x.kind === 'diner') || A.items.find(x => x.kind === 'dejeuner');
            a(repas?.day || 0, 'vin', repas ? HORAIRES[repas.kind] : HORAIRES.diner, it.label, desc(it), tag(it), opt(it));
        });
        // Hébergement : installation le premier soir
        const heb = A.items.find(it => it.kind === 'hebergement');
        if (heb && n > 1) a(0, 'installation', HORAIRES.installation, 'Installation dans les gîtes', '', tag(heb));
        // Salle de travail : sessions du matin et de l'après-midi
        const salle = A.items.find(it => it.kind === 'salle');
        if (salle) {
            let premiere = true;
            const descSalle = () => {
                if (!premiere) return '';
                premiere = false;
                return (salle.subtitle.match(/^[^.]+\./) || [salle.subtitle])[0].trim();
            };
            for (let d = 0; d < n; d++) {
                const matin = d === 0
                    ? (aLe(0, 'accueil') || aLe(0, 'collationMatin'))
                    : (aLe(d, 'collationMatin') || aLe(d, 'dejeuner') || d < n - 1);
                if (matin) a(d, 'travailMatin', d === 0 ? HORAIRES.travailMatinJ1 : HORAIRES.travailMatin,
                    'Temps de travail en salle', descSalle(), tag(salle));
                if (aLe(d, 'dejeuner') || aLe(d, 'collationAprem'))
                    a(d, 'travailAprem', HORAIRES.travailAprem, 'Temps de travail en salle', descSalle(), tag(salle));
            }
        }
        // Activités et autres prestations
        A.items.filter(it => it.kind === 'activite').forEach(it => {
            const t = norm(it.label);
            let d = n >= 3 ? 1 : 0, h = HORAIRES.activite;
            if (/ouverture|lancement/.test(t)) { d = 0; h = HORAIRES.travailMatinJ1; }
            else if (/cloture|bilan/.test(t)) { d = n - 1; h = HORAIRES.travailAprem; }
            else if (/brasucade|aperitif|apero/.test(t)) h = HORAIRES.aperitif;
            a(d, 'activite', h, it.label, desc(it), tag(it),
                { cle: it.mots.slice(0, 2).join('-') || String(it.idx), mots: it.mots, ...opt(it) });
        });
        // Départ le dernier jour
        if (n > 1) {
            const d = n - 1;
            const h = (aLe(d, 'dejeuner') || aLe(d, 'collationAprem')) ? (salle ? '17h00' : '14h30') : '10h30';
            a(d, 'depart', h, 'Départ', '', null);
        }
        return { jours, nbJours: n };
    }

    // Retire une ancienne mention de prix d'option et remet la bonne
    function corrigerDescription(description, g) {
        let d = String(description || '')
            .replace(/\s*\(?\s*en option\s*:?[^\n.]*?\d[\d\s.,]*\s*€[^\n.]*\.?\)?/gi, '')
            .trim();
        if (!d) return g.etape.description;
        if (g.optionTexte) d += '\n' + g.optionTexte;
        return d;
    }

    function trierParHeure(etapes) {
        let prev = 0;
        return etapes
            .map((e, i) => { const m = minutes(e.heure); if (m != null) prev = m; return { e, k: m != null ? m : prev, i }; })
            .sort((x, y) => x.k - y.k || x.i - y.i)
            .map(x => x.e);
    }

    // ── 2. Fusion avec le déroulé existant ───────────────────────────
    function fusionner(jours, gen, nouveauJour) {
        const stats = { ajoutees: 0, misesAJour: 0, retirees: 0, conservees: 0 };
        while (jours.length < gen.jours.length) jours.push(nouveauJour(jours.length));
        jours.forEach((jour, d) => {
            const g = gen.jours[d] || [];
            const etapes = jour.etapes || [];
            const pris = new Map();
            const nouvelles = [];
            const correspond = (e, x) => {
                if (x.kind === 'activite') { const t = norm(e.titre); return x.mots.some(m => t.includes(m)); }
                return typeEtape(e) === x.kind;
            };
            g.forEach(x => {
                const libre = e => !pris.has(e.id);
                const e = etapes.find(e => libre(e) && e.srcKey === x.etape.srcKey)
                    || etapes.find(e => libre(e) && e.src !== 'devis' && correspond(e, x));
                if (e) pris.set(e.id, x); else nouvelles.push(x.etape);
            });
            const out = [];
            etapes.forEach(e => {
                const x = pris.get(e.id);
                if (x) {
                    const tagDevis = x.etape.tag;
                    const tag = tagDevis === 'option' ? 'option' : (e.tag && e.tag !== 'option' ? e.tag : tagDevis);
                    out.push({ ...e, titre: e.titre || x.etape.titre, heure: e.heure || x.etape.heure,
                        description: corrigerDescription(e.description, x), tag, src: 'devis', srcKey: x.etape.srcKey });
                    stats.misesAJour++;
                } else if (e.src === 'devis') {
                    stats.retirees++;           // la ligne a disparu du devis
                } else {
                    out.push(e); stats.conservees++;   // étape ajoutée à la main
                }
            });
            nouvelles.forEach(e => {
                // Le vin suit le repas auquel il est servi (même heure, juste après)
                const x = g.find(x => x.etape === e);
                if (x?.kind === 'vin') {
                    const repas = out.find(o => typeEtape(o) === 'diner') || out.find(o => typeEtape(o) === 'dejeuner');
                    if (repas?.heure) e.heure = repas.heure;
                }
                out.push(e); stats.ajoutees++;
            });
            jour.etapes = trierParHeure(out);
        });
        return stats;
    }

    // ── 3. Vérification de cohérence ─────────────────────────────────
    function dateDuJour(sej, d) {
        if (!sej?.dateArrivee) return null;
        const dt = new Date(sej.dateArrivee + 'T12:00:00');
        dt.setDate(dt.getDate() + d);
        return dt;
    }

    function verifier(state, dossier, fields) {
        const A = analyserDevis(dossier);
        const res = [];
        const erreur = texte => res.push({ niveau: 'erreur', texte });
        const attention = texte => res.push({ niveau: 'attention', texte });
        const J = d => `J${d + 1}`;
        const nom = e => `« ${decode(e.titre) || 'Sans titre'} »`;

        if (!A.items.length) {
            erreur("Le devis de ce dossier n'a aucune ligne : enregistrez d'abord le devis.");
            return res;
        }
        const ets = [];
        (state.jours || []).forEach((j, d) => (j.etapes || []).forEach(e => ets.push({
            e, d, kind: typeEtape(e), t: norm(e.titre), td: norm((e.titre || '') + ' ' + (e.description || ''))
        })));
        const tarife = it => it.kind !== 'hebergement' && it.kind !== 'salle';
        const memeJour = (it, d) => it.day == null || !A.avecJours || it.day === d;
        const vaAvec = (it, x) => it.kind === 'activite' ? it.mots.some(m => x.t.includes(m)) : it.kind === x.kind;
        const lignePour = x => {
            const its = A.items.filter(it => tarife(it) && vaAvec(it, x));
            return its.find(it => memeJour(it, x.d)) || its[0] || null;
        };

        // Étapes en option ↔ devis
        ets.filter(x => x.e.tag === 'option').forEach(x => {
            const it = lignePour(x);
            if (!it) erreur(`${nom(x.e)} (${J(x.d)}) est en option au déroulé mais n'apparaît pas au devis.`);
            else if (!it.option) erreur(`${nom(x.e)} (${J(x.d)}) est en option au déroulé mais inclus au devis.`);
        });

        // Lignes du devis ↔ déroulé
        const sansEtape = [];
        A.items.filter(tarife).forEach(it => {
            const xs = ets.filter(x => vaAvec(it, x) && memeJour(it, x.d));
            const ou = (it.day != null && A.avecJours) ? ` le ${J(it.day)}` : '';
            if (!xs.length) sansEtape.push(it);
            if (it.option) {
                if (!xs.length) {
                    const mention = it.kind === 'vin' && ets.some(x => /\bvins?\b/.test(x.td) && /option|supplement/.test(x.td));
                    if (!mention) erreur(`Le devis propose « ${it.label} » en option${ou} (${prix(it.unit)} HT), absent du déroulé.`);
                } else if (!xs.some(x => x.e.tag === 'option' || /option/.test(norm(x.e.description)))) {
                    erreur(`${nom(xs[0].e)} (${J(xs[0].d)}) est présenté comme inclus alors qu'il est en option au devis.`);
                }
            } else if (!xs.length && it.kind !== 'vin') {
                attention(`Le devis compte « ${it.label} »${ou}, absent du déroulé.`);
            }
        });

        // Repas du déroulé absents du devis
        ets.filter(x => REPAS.includes(x.kind) && x.e.tag !== 'option').forEach(x => {
            if (!A.items.some(it => it.kind === x.kind && memeJour(it, x.d)))
                erreur(`${nom(x.e)} (${J(x.d)}) figure au déroulé mais pas au devis.`);
        });

        // Prix cités dans le déroulé : chaque prix est rattaché à la prestation nommée
        // juste avant (« vin … 10 € »), sinon à l'étape elle-même si elle est en option
        const reP = /(\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*€\s*(HT|TTC)?/gi;
        ets.forEach(x => {
            const desc = String(x.e.description || '');
            for (const m of desc.matchAll(reP)) {
                const avant = norm(desc.slice(Math.max(0, m.index - 45), m.index));
                let it = null;
                if (/\bvins?\b/.test(avant)) it = A.items.find(i => i.kind === 'vin') || null;
                else it = A.items.find(i => i.kind === 'activite' && i.mots.some(w => avant.includes(w)) && !vaAvec(i, x)) || null;
                if (!it && (/option/.test(avant) || x.e.tag === 'option')) it = lignePour(x);
                if (!it) continue;
                const v = parseFloat(m[1].replace(/[ \u00a0\u202f]/g, '').replace(',', '.'));
                const ttc = /ttc/i.test(m[2] || '');
                const attendu = ttc ? it.unit * (1 + it.tva / 100) : it.unit;
                if (Math.abs(v - attendu) > 0.01) {
                    const quoi = vaAvec(it, x) ? '' : ` (« ${it.label} »)`;
                    erreur(`Prix différent pour ${nom(x.e)} (${J(x.d)})${quoi} : ${prix(v)}${ttc ? ' TTC' : ''} au déroulé, ${prix(attendu)}${ttc ? ' TTC' : ' HT'} au devis.`);
                }
            }
        });

        // Plein air entre novembre et mars
        const sej = A.sejour;
        ets.forEach(x => {
            const dt = dateDuJour(sej, x.d);
            if (dt && MOIS_HIVER.includes(dt.getMonth() + 1) && RE_PLEIN_AIR.test(x.td))
                attention(`${nom(x.e)} (${J(x.d)}, ${dt.getDate()} ${MOIS[dt.getMonth()]}) : activité en plein air entre novembre et mars, prévoir un repli à l'intérieur.`);
        });
        const dA = dateDuJour(sej, 0);
        if (dA && MOIS_HIVER.includes(dA.getMonth() + 1)) {
            sansEtape.filter(it => RE_PLEIN_AIR.test(norm(it.label + ' ' + it.subtitle))).forEach(it =>
                attention(`« ${it.label} » (devis) : activité en plein air en ${MOIS[dA.getMonth()]}, prévoir un repli à l'intérieur.`));
        }

        // Piscine hors saison
        if (dA) {
            const nb = A.nbJours;
            const mois = [...new Set(Array.from({ length: nb }, (_, d) => dateDuJour(sej, d).getMonth() + 1))];
            if (mois.some(m => !MOIS_PISCINE.includes(m))) {
                const lib = MOIS[mois.find(m => !MOIS_PISCINE.includes(m)) - 1];
                const sources = [];
                ets.filter(x => RE_PISCINE.test(x.td)).forEach(x => sources.push(`déroulé, ${nom(x.e)} ${J(x.d)}`));
                if (RE_PISCINE.test(norm(state.filConducteur))) sources.push('fil conducteur');
                A.items.filter(it => RE_PISCINE.test(norm(it.label + ' ' + it.subtitle))).forEach(it => sources.push(`devis, « ${it.label} »`));
                if (RE_PISCINE.test(norm(dossier?.motAccueil))) sources.push("mot d'accueil du devis");
                sources.forEach(s => erreur(`Piscine mentionnée (${s}) alors que le séjour est en ${lib} : piscine fermée hors saison (juin à septembre).`));
            }
        }

        // Référent
        const f = fields || {};
        const contact = [f['Prénom contact'], f['Nom contact']].filter(Boolean).join(' ').trim() || String(f['Référent'] || '').trim();
        const nomClient = String(dossier?.client?.fullName || f['Nom client'] || '').trim();
        const orgs = [dossier?.client?.organisation, f['Entreprise'], f['Organisation']].map(s => String(s || '').trim()).filter(Boolean);
        if (!contact && (!nomClient || orgs.includes(nomClient)))
            erreur('Référent manquant : renseigner le prénom et le nom du contact dans la fiche du dossier.');

        // Dédoublonnage
        const vus = new Set();
        return res.filter(r => !vus.has(r.texte) && vus.add(r.texte))
            .sort((a, b) => (a.niveau === b.niveau ? 0 : a.niveau === 'erreur' ? -1 : 1));
    }

    const api = { HORAIRES, analyserDevis, genererEtapes, fusionner, verifier, typeEtape, norm };
    if (typeof window !== 'undefined') window.DerouleDevis = api;
    if (typeof module !== 'undefined') module.exports = api;
})();
