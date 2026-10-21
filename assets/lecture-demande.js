/**
 * Lecture d'une demande collée (mail, message Cactus, notes d'appel) → clés du questionnaire (#prefill).
 * Sans IA : repères simples (libellés « Nom : », signature, dates, effectif, mots-clés).
 * Ce qui n'est pas reconnu reste vide : Wael complète dans le questionnaire.
 * Tests : node tests/lecture-demande.test.js
 */
(function (racine) {
    const NOS_NUMEROS = ['0683968056', '0640000107', '0651345000'];
    const NOS_DOMAINES = /domainesesquier|sesquier|ozza|foudre/i;
    const MESSAGERIES = /^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|orange|wanadoo|free|sfr|neuf|bbox|laposte|icloud|me|mac|gmx|protonmail|proton|aol|numericable|club-internet|cegetel|aliceadsl|libertysurf|tiscali|voila|caramail)$/i;
    const SANS_REPONSE = /no-?reply|ne-pas-repondre|notification|mailer-daemon|postmaster/i;

    const JOURS = '(?:(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\\s+)?';
    const MOIS = '(janv(?:ier)?|fevr?(?:ier)?|mars|avr(?:il)?|mai|juin|juil(?:let)?|aout|sept(?:embre)?|oct(?:obre)?|nov(?:embre)?|dec(?:embre)?)';
    const MOIS_NUM = [['janv', 1], ['fev', 2], ['mars', 3], ['avr', 4], ['mai', 5], ['juin', 6], ['juil', 7], ['aout', 8], ['sep', 9], ['oct', 10], ['nov', 11], ['dec', 12]];
    const RE_TEL = /(?:\+33\s?(?:\(0\)\s?)?|0033\s?|\b0)[1-9](?:[\s.-]?\d{2}){4}\b/g;
    const RE_MAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
    const NOMBRES = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10 };
    const ENVIRON = { dizaine: 10, douzaine: 12, quinzaine: 15, vingtaine: 20, trentaine: 30, quarantaine: 40, cinquantaine: 50, soixantaine: 60, centaine: 100 };

    // minuscules sans accents, même longueur que le texte d'origine
    const plat = s => s.normalize('NFC').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'");
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const majuscule = m => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase();
    const nombre = t => (/^\d+$/.test(t) ? parseInt(t, 10) : NOMBRES[t]);

    // « Libellé : valeur » sur une ligne
    function champ(lignes, re) {
        for (const l of lignes) {
            const m = plat(l).match(new RegExp('^\\s*[-*•]?\\s*(?:' + re + ')\\s*[:：]\\s*(.+)$'));
            if (m) { const v = l.slice(l.length - m[1].length).trim(); if (v) return v; }
        }
        return '';
    }

    function decouperNom(complet) {
        const mots = complet.replace(/["<>()]/g, ' ').replace(/^\s*(m\.|mme|mlle|madame|monsieur|mr)\s+/i, '').trim().split(/\s+/).filter(Boolean);
        if (!mots.length) return {};
        const capitales = mots.filter(m => m.length > 1 && m === m.toUpperCase() && /\p{L}/u.test(m));
        if (capitales.length && capitales.length < mots.length) {
            return { prenom: mots.filter(m => !capitales.includes(m)).join(' '), nom: capitales.map(majuscule).join(' ') };
        }
        if (mots.length === 1) return { prenom: majuscule(mots[0]) };
        return { prenom: mots[0], nom: mots.slice(1).join(' ') };
    }
    const ressembleNom = l => /^[\p{Lu}][\p{L}'’.-]*(\s+[\p{L}'’.-]+){1,3}$/u.test(l) && l.length <= 40;

    // téléphones et e-mails masqués (mêmes positions) pour ne pas les lire comme des dates ou des effectifs
    const masquer = p => p.replace(RE_MAIL, s => ' '.repeat(s.length)).replace(RE_TEL, s => ' '.repeat(s.length));

    function dates(texte, aujourdHui) {
        const p = masquer(plat(texte));
        const trouvees = [];
        const ajouter = (idx, fin, j, m, a) => {
            if (j < 1 || j > 31 || m < 1 || m > 12) return;
            trouvees.push({ idx, fin, j, m, a: a ? (a < 100 ? 2000 + a : a) : null });
        };
        let r;
        const reTexte = new RegExp('\\b(\\d{1,2})(?:er)?\\s+' + MOIS + '(?![a-z])\\.?(?:\\s+(\\d{4}))?', 'g');
        while ((r = reTexte.exec(p))) ajouter(r.index, r.index + r[0].length, +r[1], MOIS_NUM.find(([k]) => r[2].startsWith(k))[1], r[3] && +r[3]);
        const reChiffres = /\b(\d{1,2})([/.-])(\d{1,2})(?:\2(\d{4}|\d{2}))?\b/g;
        while ((r = reChiffres.exec(p))) if (r[4] || r[2] === '/') ajouter(r.index, r.index + r[0].length, +r[1], +r[3], r[4] && +r[4]);
        const reIso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
        while ((r = reIso.exec(p))) ajouter(r.index, r.index + r[0].length, +r[3], +r[2], +r[1]);

        // « du 12 au 14 mars », « les 12, 13 et 14 mars » : jours seuls devant une date complète
        const reAvant = new RegExp('(\\d{1,2})(?:er)?\\s*(?:,|au|a|et|-|–|&)\\s*' + JOURS + '$');
        trouvees.sort((x, y) => x.idx - y.idx);
        for (const d of [...trouvees]) {
            let cible = d;
            for (let n = 0; n < 6; n++) {
                const debut = Math.max(0, cible.idx - 30);
                const m = p.slice(debut, cible.idx).match(reAvant);
                if (!m || /\d/.test(p.charAt(debut + m.index - 1))) break;
                const idx = cible.idx - m[0].length;
                if (trouvees.some(t => t.idx <= idx && t.fin > idx)) break;
                const j = +m[1];
                const avant = { idx, fin: idx + m[1].length, j, m: j > cible.j ? (cible.m === 1 ? 12 : cible.m - 1) : cible.m, a: cible.a && j > cible.j && cible.m === 1 ? cible.a - 1 : cible.a, seul: true };
                trouvees.push(avant);
                cible = avant;
            }
        }
        trouvees.sort((x, y) => x.idx - y.idx);
        // année : celle de la date suivante proche, sinon la prochaine occurrence
        const demain = new Date(aujourdHui.getFullYear(), aujourdHui.getMonth(), aujourdHui.getDate() + 1);
        for (let i = trouvees.length - 1; i >= 0; i--) {
            const d = trouvees[i], s = trouvees[i + 1];
            if (d.a) continue;
            if (s && s.a && s.idx - d.fin < 40) d.a = d.m > s.m ? s.a - 1 : s.a;
            else { d.a = aujourdHui.getFullYear(); if (new Date(d.a, d.m - 1, d.j) < demain) d.a++; }
        }
        const limite = new Date(aujourdHui.getFullYear() + 3, aujourdHui.getMonth(), aujourdHui.getDate());
        return trouvees
            .map(d => Object.assign(d, { date: new Date(d.a, d.m - 1, d.j) }))
            .filter(d => d.date.getDate() === d.j && d.date >= demain && d.date <= limite);
    }

    function lire(texte, aujourdHui = new Date()) {
        texte = String(texte || '').replace(/\r/g, '').trim();
        const out = {};
        if (!texte) return { prefill: out, resume: [] };
        const lignes = texte.split('\n');
        const p = plat(texte);

        // ── Contact ──
        const emails = [...texte.matchAll(RE_MAIL)].map(m => m[0].replace(/\.$/, ''))
            .filter(e => !NOS_DOMAINES.test(e) && !SANS_REPONSE.test(e));
        const emailLibelle = (champ(lignes, 'e-?mail|mail|courriel|adresse (?:e-?)?mail').match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/) || [])[0];
        const email = emailLibelle && !NOS_DOMAINES.test(emailLibelle) ? emailLibelle : emails[0];
        if (email) out.email = email.toLowerCase();

        const tels = [...texte.matchAll(RE_TEL)].map(m => m[0].replace(/\D/g, '').replace(/^(0033|33)/, '0'))
            .map(t => (t.length === 9 ? '0' + t : t)).filter(t => t.length === 10 && !NOS_NUMEROS.includes(t));
        if (tels[0]) out.telephone = tels[0].replace(/(\d{2})(?=\d)/g, '$1 ');

        let nom = {};
        const prenomL = champ(lignes, 'prenom|first ?name'), nomL = champ(lignes, 'nom(?: de famille)?|last ?name|surname');
        const completL = champ(lignes, 'nom (?:et|&) prenom|prenom (?:et|&) nom|nom complet|contact|interlocuteur|demandeur|name');
        if (prenomL) nom = { prenom: prenomL, nom: nomL };
        else if (nomL && /\s/.test(nomL)) nom = decouperNom(nomL);
        else if (nomL) nom = { nom: nomL };
        if (!nom.prenom && completL && !/[@\d]/.test(completL)) nom = decouperNom(completL);
        if (!nom.prenom && email) {
            const entete = texte.match(new RegExp('([\\p{L}\'’". -]{3,60}?)\\s*<\\s*' + email.replace(/[.+]/g, '\\$&') + '\\s*>', 'iu'));
            if (entete && ressembleNom(entete[1].replace(/^.*[:]\s*/, '').replace(/"/g, '').trim())) nom = decouperNom(entete[1].replace(/^.*[:]\s*/, ''));
        }
        if (!nom.prenom) {
            const m = texte.match(/je m['’]appelle\s+([\p{Lu}][\p{L}'’-]+(?:\s+[\p{Lu}][\p{L}'’-]+)?)/u);
            if (m) nom = decouperNom(m[1]);
        }
        if (!nom.prenom) {
            const formule = /^(?:bien\s+)?(?:cordialement|a vous|a bientot|bien a vous|bien a toi|belle journee|bonne (?:journee|soiree|fin de journee)|merci(?: d'avance| par avance| beaucoup| a vous)?|(?:sinceres |meilleures )?salutations|best regards|regards|amities)[\s,.!]*$/;
            for (let i = 0; i < lignes.length && !nom.prenom; i++) {
                if (!formule.test(plat(lignes[i]).trim())) continue;
                const suivante = lignes.slice(i + 1).map(l => l.trim()).find(Boolean);
                if (suivante && (ressembleNom(suivante) || /^[\p{Lu}][\p{L}'’-]+$/u.test(suivante))) nom = decouperNom(suivante);
            }
        }
        if (!nom.prenom && email) {
            const m = email.split('@')[0].match(/^([a-z]{2,})[._-]([a-z]{2,})$/i);
            if (m) nom = { prenom: majuscule(m[1]), nom: majuscule(m[2]) };
        }
        if (nom.prenom) out.prenom = nom.prenom.trim();
        if (nom.nom) out.nom = nom.nom.trim();

        // ── Type de demande ──
        const compte = re => (p.match(re) || []).length;
        const mariage = /anniversaire de mariage|noces d'(?:or|argent)/.test(p) ? 0
            : compte(/\bmariage|\bnoces?\b|wedding|\bpacs\b|vin d'honneur|futurs? (?:maries|epoux)|ceremonie laique|nous marier|se marier/g);
        const seminaire = compte(/seminaire|team.?building|incentive|off.?site|\bcodir\b|comite de direction|convention|kick.?off|journee d'etude|collaborateurs|salaries|\bentreprise|\bcse\b|reunion de travail|formation|force de vente|equipe commerciale|workshop|pleniere|\bagence\b/g);
        const groupe = compte(/anniversaire|week.?end|famille|familial|cousinade|\bamis\b|\bevjf\b|\bevg\b|vie de (?:jeune fille|garcon)|retrouvailles|association|\bclub\b|chorale|\bstage\b|yoga|\bfete\b|vacances/g);
        if (mariage) out.type = 'mariage';
        else if (seminaire || groupe) out.type = seminaire >= groupe ? 'seminaire' : 'groupe';

        if (out.type === 'seminaire') {
            if (/\bagence\b|evenementiel|\bdmc\b|pour (?:le compte d'un|un de nos|notre) client|nos clients\b/.test(p)) out.profil = 'agence';
            const sansNuit = /journee d'etude|sans (?:nuit|hebergement)|pas (?:besoin )?d'hebergement|day.?meeting/.test(p);
            const journee = /\b(?:une|1) journee\b|demi.?journee/.test(p) && !/nuit|chambre|dormir|couchage|hebergement/.test(p);
            if (sansNuit || journee) out.format = 'etude';
        }

        // ── Organisation ──
        const orga = champ(lignes, 'societe|entreprise|organisation|structure|raison sociale|company|association|agence|etablissement');
        if (orga) out.organisation = orga;
        else if (email && out.type !== 'groupe' && out.type !== 'mariage') {
            const dom = email.split('@')[1].split('.');
            const nomDom = dom.length > 2 && dom[0].length <= 4 ? dom[1] : dom[0];
            if (!MESSAGERIES.test(nomDom) && !MESSAGERIES.test(dom[0])) out.organisation = nomDom.split(/[-_]/).map(majuscule).join(' ');
        }

        // ── Effectif ──
        const sansBruit = masquer(p);
        const lu = champ(lignes, "nombre de (?:participants|personnes|invites|convives|couchages)|nb (?:de )?(?:participants|personnes|pers)|effectif|participants|personnes|pax");
        let effectif = lu && Math.max(0, ...(lu.match(/\d+/g) || []).map(Number).filter(n => n <= 200));
        if (!effectif) {
            const niveau = mots => {
                const re = new RegExp('(?<!\\d)(\\d{1,3})(?:\\s*(?:a|-|–|ou|/)\\s*(\\d{1,3}))?\\s*(?:' + mots + ')(?![a-z])', 'g');
                return [...sansBruit.matchAll(re)].map(m => +(m[2] || m[1]));
            };
            const adultes = niveau('adultes?'), enfants = niveau('enfants?');
            const forts = niveau('pers(?:onnes?)?\\.?|participants?|pax|convives?|invites?|couchages?');
            const faibles = niveau('collaborateurs?|salaries?|membres|equipiers|cadres|managers|amis|commerciaux');
            const autres = [...sansBruit.matchAll(/(?:nous (?:serons|sommes)|on sera|groupe de|equipe de|effectif de)\s+(?:environ\s+|une?\s+)?(\d{1,3})(?![\d/.:h])/g)].map(m => +m[1]);
            const approx = [...sansBruit.matchAll(/\b(dizaine|douzaine|quinzaine|vingtaine|trentaine|quarantaine|cinquantaine|soixantaine|centaine)\b/g)].map(m => ENVIRON[m[1]]);
            if (adultes.length) effectif = Math.max(...adultes) + (enfants.length ? Math.max(...enfants) : 0);
            else if (forts.length) effectif = Math.max(...forts);
            else if (autres.length || approx.length) effectif = Math.max(...autres, ...approx);
            else if (faibles.length) effectif = Math.max(...faibles);
        }
        if (effectif >= 1 && effectif <= 200) out.participants = effectif;

        // ── Dates ──
        const ds = dates(texte, aujourdHui);
        if (ds.length) {
            const lien = new RegExp('^[\\s,&\\-–]*(?:au|a|et|jusqu\'?au|jusqu\'?a)?[\\s,]*' + JOURS + '\\s*$');
            let fin = ds[0];
            for (let i = 1; i < ds.length; i++) {
                const ecart = (ds[i].date - ds[0].date) / 86400000;
                if (ds[i].date <= fin.date || ecart > 14 || !lien.test(p.slice(ds[i - 1].fin, ds[i].idx))) break;
                fin = ds[i];
            }
            out.dateArrivee = iso(ds[0].date);
            let nuits = fin !== ds[0] ? 0 : null;
            if (nuits === null) {
                const n = p.match(/\b(\d{1,2}|une|deux|trois|quatre|cinq|six|sept)\s+nuits?\b/);
                const j = p.match(/\b(\d{1,2}|deux|trois|quatre|cinq|six|sept)\s+jours?\b/);
                nuits = n ? nombre(n[1]) : j ? nombre(j[1]) - 1 : out.format === 'etude' ? 0 : null;
            }
            if (fin !== ds[0]) out.dateDepart = iso(fin.date);
            else if (nuits !== null && nuits >= 0 && nuits <= 14) out.dateDepart = iso(new Date(ds[0].a, ds[0].m - 1, ds[0].j + nuits));
        }

        out.message = 'Demande collée dans le tableau de bord :\n\n' + texte.replace(/\n{3,}/g, '\n\n').slice(0, 6000);

        const TYPES = { seminaire: 'Séminaire', groupe: 'Groupe', mariage: 'Mariage' };
        const fr = s => s && s.split('-').reverse().join('/');
        const resume = [
            ['Type', out.type && TYPES[out.type] + (out.format === 'etude' ? ' (journée d\'étude)' : '') + (out.profil === 'agence' ? ', agence' : '')],
            ['Personnes', out.participants],
            ['Dates', out.dateArrivee && (out.dateDepart && out.dateDepart !== out.dateArrivee ? `${fr(out.dateArrivee)} → ${fr(out.dateDepart)}` : fr(out.dateArrivee) + (out.dateDepart ? '' : ' (départ ?)'))],
            ['Contact', [out.prenom, out.nom].filter(Boolean).join(' ')],
            ['Organisation', out.organisation],
            ['E-mail', out.email],
            ['Téléphone', out.telephone],
        ].map(([k, v]) => [k, v ? String(v) : '']);
        return { prefill: out, resume };
    }

    const api = { lire };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else racine.LectureDemande = api;
})(typeof window !== 'undefined' ? window : globalThis);
