// Lancer : node tests/pricing-engine.test.js
const assert = require('node:assert');
const grille = require('../assets/grille_2027.json');
const { compute } = require('../assets/pricing-engine.js');

const lieu = r => r.lignes.filter(l => ['hebergement', 'lieu'].includes(l.cat)).reduce((s, l) => s + l.total, 0);
const sem = (personnes, nuits, extra = {}) => compute(grille, { segment: 'seminaire', dateArrivee: '2027-09-07', personnes, nuits, ...extra });

const cas = [
    // Séminaire : partie lieu (hébergement + forfait lieu) des devis 2026
    ['CAP 5, 11 p, 1 nuit', lieu(sem(11, 1)), 2393],
    ['JRI, 13 p, 2 nuits', lieu(sem(13, 2)), 4983],
    ['Tohero, 29 p, 1 nuit', lieu(sem(29, 1)), 4058],
    ['Etail, 28 p, 2 nuits', lieu(sem(28, 2)), 7645],
    ['Sandfall, 30 p, 1 nuit', lieu(sem(30, 1)), 4150],
    ['greenmyvoyage, 30 p, 4 nuits', lieu(sem(30, 4)), 15700],
    ['Tohero tarif agence', lieu(sem(29, 1, { agence: true })), 3652.2],
    ['Séminaire 8 p facturé 10', lieu(sem(8, 1)), 2300],
    // Groupe : exemples publiés sur la grille groupe
    ['Groupe 35 p, 2 nuits, draps', compute(grille, { segment: 'groupe', dateArrivee: '2027-06-11', personnes: 35, nuits: 2, options: { draps: 35 } }).totaux.ttc, 4350],
    ['Groupe pont 3 nuits, draps', compute(grille, { segment: 'groupe', dateArrivee: '2027-05-06', personnes: 35, nuits: 3, options: { draps: 35 } }).totaux.ttc, 6100],
    ['Groupe basse saison janvier', compute(grille, { segment: 'groupe', dateArrivee: '2027-01-15', personnes: 30, nuits: 2 }).totaux.ttc, 3500],
    ['Groupe fêtes (pas de remise)', compute(grille, { segment: 'groupe', dateArrivee: '2026-12-30', personnes: 30, nuits: 2 }).totaux.ttc, 4000],
    // Mariage : forfait
    ['Mariage 40 convives Champs d\'olivier', compute(grille, { segment: 'mariage', dateArrivee: '2027-06-19', mariage: { vinHonneur: 40, diner: 40 } }).totaux.ttc, 7950],
    ['Mariage 80 au dîner, 100 au vin d\'honneur', compute(grille, { segment: 'mariage', dateArrivee: '2027-06-19', mariage: { vinHonneur: 100, diner: 80 } }).totaux.ttc, 10400],
    ['Mariage 80 basse saison', compute(grille, { segment: 'mariage', dateArrivee: '2027-02-13', mariage: { vinHonneur: 80, diner: 80 } }).totaux.ttc, 8500],
    ['Mariage 2 soirées Archipel, 80', compute(grille, { segment: 'mariage', dateArrivee: '2027-06-19', mariage: { vinHonneur: 80, diner: 80, secondeSoiree: true } }).totaux.ttc, 11250],
];

let ko = 0;
cas.forEach(([nom, obtenu, attendu]) => {
    const ok = Math.abs(obtenu - attendu) < 0.01;
    if (!ok) ko++;
    console.log(`${ok ? 'OK ' : 'KO '} ${nom} : ${obtenu} (attendu ${attendu})`);
});

// Contrôles de structure
const m = compute(grille, { segment: 'mariage', dateArrivee: '2027-06-19', mariage: { vinHonneur: 80, diner: 80 } });
assert.strictEqual(m.entite, 'ozza');
assert.strictEqual(sem(20, 1).entite, 'foudre');
const part10 = m.lignes.filter(l => l.tva === 10).reduce((s, l) => s + l.ttc, 0);
assert.strictEqual(part10, 4400, 'TVA 10 % mariage = hébergement + linge');
assert.ok(sem(45, 1).manuel.length > 0, 'Plus de 40 personnes → manuel');
const coord = sem(25, 1, { prestations: [{ code: 'kayak', qte: 1 }] }).lignes.some(l => l.cat === 'service');
assert.ok(coord, 'Activité → coordination ajoutée');
assert.ok(!sem(25, 1, { prestations: [{ code: 'diner', qte: 25 }] }).lignes.some(l => l.cat === 'service'), 'Sans activité → pas de coordination');

// Questionnaire séminaire : 25 p, 2 jours / 1 nuit, arrivée matin, départ en fin de journée, pension, pauses
const { fromQuestionnaire } = require('../assets/pricing-engine.js');
const fq = fromQuestionnaire(grille, { participants: 25, dateArrivee: '2027-09-07', dateDepart: '2027-09-08', arrivee: 'matin', depart: 'soir', restauration: 'pension', pauses: true, activites: ['kayak'] });
const rq = compute(grille, fq.demande);
const qte = code => (fq.demande.prestations.find(x => x.code === code) || {}).qte || 0;
assert.deepStrictEqual([qte('accueil_cafe'), qte('petit_dej'), qte('collation'), qte('dejeuner'), qte('diner')], [25, 25, 75, 50, 25]);
// 2375 (1000 + 55 × 25) + salle 1313 (1 jour de travail) + repas 25 × 165 + kayak 1000 + coordination 400
const okQ = Math.abs(rq.totaux.ht - 9213) < 0.01;
if (!okQ) ko++;
console.log(`${okQ ? 'OK ' : 'KO '} Questionnaire 25 p 2j/1n pension + kayak : ${rq.totaux.ht} (attendu 9213)`);
const etude = fromQuestionnaire(grille, { participants: 15, dateArrivee: '2027-03-10', journeeEtude: true, arrivee: 'matin', restauration: 'pension', pauses: true });
assert.strictEqual(etude.demande.nuits, 0);
assert.ok(!compute(grille, etude.demande).lignes.some(l => l.cat === 'hebergement'), 'Journée d\'étude sans hébergement');

console.log(ko ? `\n${ko} cas en échec` : '\nTous les cas passent');
process.exit(ko ? 1 : 0);
