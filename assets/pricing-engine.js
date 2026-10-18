/**
 * =============================================================================
 * DOMAINE SESQUIER — MOTEUR DE CALCUL 2027 (source unique des prix)
 * =============================================================================
 * Lit assets/grille_2027.json et produit les lignes d'un devis pour les trois
 * segments : 'seminaire' (prix HT), 'groupe' et 'mariage' (prix TTC).
 * Aucune autre page ne doit recalculer de prix : elles appellent compute().
 *
 * demande = {
 *   segment: 'seminaire' | 'groupe' | 'mariage',
 *   dateArrivee: 'YYYY-MM-DD', nuits: 2, personnes: 30, agence: false,
 *   prestations: [{ code: 'diner', qte: 30 }],      // catalogue du segment
 *   joursAnimation: 1,                              // séminaire : jours avec activité
 *   journeesCompletes: true,                        // séminaire : arrivée matin + départ soir → salle aussi le dernier jour
 *   options: { draps: 35, archipel: true, cuisine_pro: false },   // groupe
 *   mariage: { vinHonneur: 100, diner: 80, pack: 'archipel',
 *              secondeSoiree: false, traiteurExterieur: false, nuitsSup: 0 }
 * }
 * =============================================================================
 */
(function (root) {
    const r2 = n => Math.round(n * 100) / 100;

    function estBasseSaison(g, segment, dateStr) {
        const bs = g.basse_saison;
        if (!dateStr || !bs.segments.includes(segment)) return false;
        const md = dateStr.slice(5, 10);                       // 'MM-DD'
        const dansFetes = md >= bs.exclusion_debut || md <= bs.exclusion_fin;
        const dansSaison = md >= bs.debut || md <= bs.fin;
        return dansSaison && !dansFetes;
    }

    function tranche(liste, n) {
        return liste.find(t => n >= t.min && n <= t.max) || liste[liste.length - 1];
    }

    // Une ligne garde le prix unitaire dans la base du segment (HT ou TTC)
    // et expose toujours ht / tva / ttc pour les totaux et la facture.
    function ligne(base, label, qte, pu, tva, cat) {
        const montant = r2(qte * pu);
        const ht  = base === 'HT' ? montant : r2(montant / (1 + tva / 100));
        const ttc = base === 'HT' ? r2(montant * (1 + tva / 100)) : montant;
        return { label, qte, pu: r2(pu), tva, cat, total: montant, ht, ttc };
    }

    function catalogue(g, seg, demande, base, lignes) {
        const cat = g[seg].catalogue || {};
        (demande.prestations || []).forEach(p => {
            const item = cat[p.code];
            if (!item) throw new Error(`Prestation inconnue pour ${seg} : ${p.code}`);
            lignes.push(Object.assign(ligne(base, item.label, p.qte, item.pu, item.tva, item.cat), { code: p.code }));
        });
    }

    function seminaire(g, d, out) {
        const s = g.seminaire, base = 'HT', L = out.lignes;
        const n = Math.max(d.personnes, s.min_facturable);
        if (d.personnes > s.max_auto) out.manuel.push(`Plus de ${s.max_auto} personnes`);
        if (d.personnes < s.min_facturable) out.notes.push(`Facturé sur la base de ${s.min_facturable} personnes`);
        const nuits = d.nuits, jours = nuits + 1;

        if (nuits > 0) {
            if (s.hebergement_formule) {
                // Prix continu, sans palier : fixe + prix par personne, chaque nuit (couchages plafonnés à 35)
                const f = s.hebergement_formule, pu = f.fixe + f.par_pers * Math.min(n, 35);
                L.push(ligne(base, `${s.hebergement_label} — ${nuits} nuit${nuits > 1 ? 's' : ''}`, nuits, pu, s.hebergement_tva, 'hebergement'));
            } else {
                const h = tranche(s.hebergement, Math.min(n, 35));
                L.push(ligne(base, `${s.hebergement_label} — 1re nuit`, 1, h.premiere, s.hebergement_tva, 'hebergement'));
                if (nuits > 1) L.push(ligne(base, `${s.hebergement_label} — nuits suivantes`, nuits - 1, h.suivante, s.hebergement_tva, 'hebergement'));
            }
            if (n > 35) L.push(ligne(base, s.lit_appoint.label, (Math.min(n, 40) - 35) * nuits, s.lit_appoint.pu, s.lit_appoint.tva, 'hebergement'));
        }
        if (s.lieu_formule) {
            // Salle équipée + privatisation : prix minimum puis par personne, sans palier ; jours suivants à un % du 1er jour
            // Coordinateur sur place inclus chaque jour de travail, jamais remisé
            const f = s.lieu_formule, j1 = Math.round(f.fixe + f.par_pers * Math.max(0, n - f.inclus)), co = f.coordinateur_jour || 0;
            L.push(ligne(base, `${s.lieu_label} — 1er jour`, 1, j1 + co, s.lieu_tva, 'lieu'));
            // Facturé par jour de travail (jours du séjour - 1, au moins 1) : 2j/1n = 1 jour, 3j/2n = 2 jours
            const travail = Math.max(1, jours - 1 + (d.journeesCompletes && jours > 1 ? 1 : 0));
            if (travail > 1) L.push(ligne(base, `${s.lieu_label} — jours de travail suivants`, travail - 1, Math.round(j1 * f.jour_suivant) + co, s.lieu_tva, 'lieu'));
        } else {
            const l = tranche(s.lieu, n);
            L.push(ligne(base, `${s.lieu_label} — 1er jour`, 1, l.premier, s.lieu_tva, 'lieu'));
            if (jours > 1) L.push(ligne(base, `${s.lieu_label} — jours suivants`, jours - 1, l.suivant, s.lieu_tva, 'lieu'));
        }
        if (n > s.archipel.seuil) L.push(ligne(base, s.archipel.label, 1, s.archipel.pu, s.archipel.tva, 'lieu'));

        catalogue(g, 'seminaire', d, base, L);

        const aActivite = (d.prestations || []).some(p => (s.catalogue[p.code] || {}).cat === 'activite');
        const joursAnim = d.joursAnimation != null ? d.joursAnimation : (aActivite ? 1 : 0);
        if (joursAnim > 0) L.push(ligne(base, s.coordination.label, joursAnim, s.coordination.pu, s.coordination.tva, 'service'));

        if (d.agence) {
            const a = g.agence;
            L.forEach(x => {
                if (!a.categories.includes(x.cat)) return;
                Object.assign(x, ligne(base, `${x.label} (tarif agence −${a.remise * 100} %)`, x.qte, x.pu * (1 - a.remise), x.tva, x.cat));
            });
        }
        out.acompte_taux = s.acompte;
    }

    function groupe(g, d, out) {
        const s = g.groupe, base = 'TTC', L = out.lignes;
        if (d.nuits < s.nuits_min) out.manuel.push(`Moins de ${s.nuits_min} nuits`);
        if (d.personnes > 40) out.manuel.push('Plus de 40 personnes');
        const pu = out.basse_saison ? s.nuit_basse_saison : s.nuit.pu;
        L.push(ligne(base, s.nuit.label + (out.basse_saison ? ' — basse saison' : ''), d.nuits, pu, s.nuit.tva, s.nuit.cat));
        L.push(ligne(base, s.menage.label, 1, s.menage.pu, s.menage.tva, s.menage.cat));
        if (d.personnes > s.capacite_base) {
            const o = s.options.lit_appoint;
            L.push(ligne(base, o.label, (Math.min(d.personnes, 40) - s.capacite_base) * d.nuits, o.pu, o.tva, o.cat));
        }
        const opt = d.options || {};
        if (opt.draps) { const o = s.options.draps; L.push(ligne(base, o.label, opt.draps, o.pu, o.tva, o.cat)); }
        if (opt.archipel) { const o = s.options.archipel; L.push(ligne(base, o.label, 1, o.pu, o.tva, o.cat)); }
        if (opt.cuisine_pro) { const o = s.options.cuisine_pro; L.push(ligne(base, o.label, 1, o.pu, o.tva, o.cat)); }
        out.acompte_taux = s.acompte;
        out.caution = s.caution;
    }

    function mariage(g, d, out) {
        const s = g.mariage, base = 'TTC', L = out.lignes, m = d.mariage || {};
        const convives = Math.max(m.vinHonneur || 0, m.diner || 0, d.personnes || 0);
        const forfait = [];
        s.base.forEach(b => forfait.push(ligne(base, b.label, 1, b.pu, b.tva, b.cat)));

        let packKey = m.pack || (convives <= s.packs.champs_olivier.max ? 'champs_olivier' : 'archipel');
        if (packKey === 'champs_olivier' && convives > s.packs.champs_olivier.max) {
            packKey = 'archipel';
            out.notes.push(`Plus de ${s.packs.champs_olivier.max} convives : pack Archipel obligatoire`);
        }
        const pack = s.packs[packKey];
        forfait.push(ligne(base, pack.label, 1, pack.pu, pack.tva, 'lieu'));
        if (m.secondeSoiree) forfait.push(ligne(base, 'Seconde soirée en salle Archipel', 1, s.seconde_soiree_archipel, 20, 'lieu'));
        if (convives > s.convive_sup.seuil) {
            forfait.push(ligne(base, s.convive_sup.label, convives - s.convive_sup.seuil, s.convive_sup.pu, s.convive_sup.tva, 'lieu'));
        }
        if (m.nuitsSup) forfait.push(ligne(base, 'Nuit supplémentaire', m.nuitsSup, s.nuit_sup, 10, 'hebergement'));

        if (out.basse_saison) {
            const r = g.basse_saison.remise;
            forfait.forEach(x => Object.assign(x, ligne(base, `${x.label} (basse saison −${r * 100} %)`, x.qte, x.pu * (1 - r), x.tva, x.cat)));
        }
        L.push(...forfait);
        if (m.traiteurExterieur) { const t = s.traiteur_exterieur; L.push(ligne(base, t.label, 1, t.pu, t.tva, 'lieu')); }
        catalogue(g, 'mariage', d, base, L);
        out.acompte_taux = s.acompte;
        out.caution = s.caution;
        out.convives_retenus = convives;
    }

    function compute(grille, demande) {
        const seg = demande.segment;
        if (!['seminaire', 'groupe', 'mariage'].includes(seg)) throw new Error(`Segment inconnu : ${seg}`);
        const out = {
            segment: seg,
            entite: grille.entites[seg],
            base_prix: grille[seg].prix,
            basse_saison: estBasseSaison(grille, seg, demande.dateArrivee),
            lignes: [], notes: [], manuel: []
        };
        ({ seminaire, groupe, mariage })[seg](grille, demande, out);

        const parTva = {};
        out.lignes.forEach(l => {
            parTva[l.tva] = parTva[l.tva] || { ht: 0, tva: 0 };
            parTva[l.tva].ht += l.ht;
            parTva[l.tva].tva += l.ttc - l.ht;
        });
        Object.values(parTva).forEach(v => { v.ht = r2(v.ht); v.tva = r2(v.tva); });
        const ht = r2(out.lignes.reduce((s, l) => s + l.ht, 0));
        const ttc = r2(out.lignes.reduce((s, l) => s + l.ttc, 0));
        out.totaux = { ht, tva: r2(ttc - ht), ttc, par_tva: parTva };
        out.acompte = r2(ttc * (out.acompte_taux || 0.3));
        const nb = (out.convives_retenus || demande.personnes) || 1;
        out.par_personne = { ht: r2(ht / nb), ttc: r2(ttc / nb) };
        out.automatisable = out.manuel.length === 0;
        return out;
    }

    // -------------------------------------------------------------------------
    // QUESTIONNAIRE SÉMINAIRE → demande pour compute()
    // q = { participants, dateArrivee, dateDepart, journeeEtude,
    //       arrivee: 'matin'|'midi'|'apresmidi', depart: 'matin'|'apres_dejeuner'|'soir',
    //       restauration: 'pension'|'sans_diner'|'aucune', pauses, vin,
    //       soiree: 'aucune'|'aperitif'|'pack'|'formule', activites: [codes],
    //       transport: 'aucun'|'vtc'|'autocar', agence }
    // Renvoie { demande, jours } ; jours = planning des repas, un objet par jour.
    // -------------------------------------------------------------------------
    function nuitsEntre(a, b) {
        if (!a || !b) return 0;
        return Math.max(0, Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000));
    }

    function planRepas(q) {
        const nuits = q.journeeEtude ? 0 : nuitsEntre(q.dateArrivee, q.dateDepart);
        const p = !!q.pauses, jours = [];
        for (let d = 0; d <= nuits; d++) {
            const j = { accueil: 0, petitDej: 0, collationMatin: 0, dejeuner: 0, collationAprem: 0, diner: 0 };
            const premier = d === 0, dernier = d === nuits;
            if (premier) {
                if (q.arrivee !== 'midi' && p) j.accueil = 1;
                if (q.arrivee !== 'apresmidi') { j.dejeuner = 1; if (p) j.collationAprem = 1; }
                if (nuits > 0) j.diner = 1;
            } else if (!dernier) {
                Object.assign(j, { petitDej: 1, collationMatin: +p, dejeuner: 1, collationAprem: +p, diner: 1 });
            } else {
                j.petitDej = 1;
                if (q.depart !== 'matin') { j.collationMatin = +p; j.dejeuner = 1; }
                if (q.depart === 'soir') j.collationAprem = +p;
            }
            if (q.restauration === 'sans_diner') j.diner = 0;
            if (q.restauration === 'aucune') { j.petitDej = 0; j.dejeuner = 0; j.diner = 0; }
            jours.push(j);
        }
        return { nuits, jours };
    }

    function fromQuestionnaire(grille, q) {
        const n = Math.max(1, +q.participants || 0);
        // Groupe / mariage : forfait, pas de programme repas
        if (q.segment === 'groupe' || q.segment === 'mariage') {
            const nuits = q.dateArrivee && q.dateDepart
                ? Math.max(0, Math.round((new Date(q.dateDepart) - new Date(q.dateArrivee)) / 86400000)) : 2;
            return {
                jours: [],
                demande: {
                    segment: q.segment, dateArrivee: q.dateArrivee || '', personnes: n, nuits,
                    options: { draps: q.draps ? Math.min(n, 40) : 0, archipel: !!q.archipel, cuisine_pro: !!q.cuisine_pro },
                    mariage: { diner: n, pack: q.pack || undefined, secondeSoiree: !!q.secondeSoiree,
                               traiteurExterieur: !!q.traiteurExterieur, nuitsSup: Math.max(0, nuits - 2) }
                }
            };
        }
        const { nuits, jours } = planRepas(q);
        const somme = k => jours.reduce((s, j) => s + j[k], 0);
        const cat = grille.seminaire.catalogue;
        const prestations = [];
        const add = (code, qte) => { if (qte > 0) prestations.push({ code, qte }); };

        add('accueil_cafe', n * somme('accueil'));
        add('petit_dej', n * somme('petitDej'));
        add('collation', n * (somme('collationMatin') + somme('collationAprem')));
        add('dejeuner', n * somme('dejeuner'));
        add('diner', n * somme('diner'));
        if (q.vin) add('supplement_vin', n * somme('diner'));
        if (q.soiree === 'aperitif') add('aperitif', n);
        if (q.soiree === 'pack') add('pack_soiree', n);
        if (q.soiree === 'formule') add('formule_soiree', 1);
        (q.activites || []).forEach(code => {
            const a = cat[code];
            if (a) add(code, a.unite === 'unite' ? 1 : n);
        });
        if (q.transport === 'vtc') add('navette_vtc', Math.ceil(n / 7));
        if (q.transport === 'autocar') add('navette_car', 1);

        const nbActivites = (q.activites || []).filter(c => cat[c]).length;
        return {
            jours,
            demande: {
                segment: 'seminaire',
                dateArrivee: q.dateArrivee || '',
                personnes: n,
                nuits,
                agence: !!q.agence,
                prestations,
                joursAnimation: Math.min(nbActivites, jours.length),
                journeesCompletes: q.arrivee === 'matin' && q.depart === 'soir'
            }
        };
    }

    const PricingEngine = { compute, estBasseSaison, planRepas, fromQuestionnaire };
    if (typeof module !== 'undefined' && module.exports) module.exports = PricingEngine;
    else root.PricingEngine = PricingEngine;
})(typeof window !== 'undefined' ? window : this);
