// Lancer : node tests/lecture-demande.test.js
const assert = require('node:assert');
const { lire } = require('../assets/lecture-demande.js');

const AUJ = new Date(2026, 9, 22);
const cas = [
    ['Mail séminaire avec signature', `Bonjour,

Je me permets de vous contacter pour l'organisation de notre séminaire d'entreprise du 12 au 14 mars 2027.
Nous serons 25 collaborateurs, avec une soirée le jeudi.
Pourriez-vous m'envoyer un devis ?

Cordialement,
Marie DUPONT
Responsable RH
Acme Conseil
06 12 34 56 78
marie.dupont@acme-conseil.fr`, {
        type: 'seminaire', participants: 25, dateArrivee: '2027-03-12', dateDepart: '2027-03-14',
        prenom: 'Marie', nom: 'Dupont', email: 'marie.dupont@acme-conseil.fr', telephone: '06 12 34 56 78', organisation: 'Acme Conseil',
    }],
    ['Formulaire Cactus à libellés', `Nouvelle demande de devis
Nom : Martin
Prénom : Julien
Email : j.martin@gmail.com
Téléphone : +33 6 98 76 54 32
Type d'événement : Anniversaire 40 ans
Date : 05/06/2027
Nombre de personnes : 35
Durée : 2 nuits
Message : Week-end entre amis`, {
        type: 'groupe', participants: 35, dateArrivee: '2027-06-05', dateDepart: '2027-06-07',
        prenom: 'Julien', nom: 'Martin', email: 'j.martin@gmail.com', telephone: '06 98 76 54 32', organisation: undefined,
    }],
    ['Mariage, en-tête Gmail, dates sans année', `Sophie Bernard <sophie.b@hotmail.fr>
21 oct. 2026, 18:02

Bonjour, nous souhaitons nous marier au domaine les 18, 19 et 20 juin, une centaine d'invités environ.
Merci !
Sophie`, {
        type: 'mariage', participants: 100, dateArrivee: '2027-06-18', dateDepart: '2027-06-20', prenom: 'Sophie', nom: 'Bernard',
    }],
    ['Journée d\'étude, agence, sans numéro du domaine', `Bonjour,
Agence événementielle, nous cherchons un lieu pour une journée d'étude le mardi 9 février pour notre client, 40 participants.
Merci de rappeler au 01.45.67.89.10.
Thomas Leroy
Ce message répond à votre annonce (Domaine Sesquier, 06 83 96 80 56, contact@domainesesquier.com)`, {
        type: 'seminaire', profil: 'agence', format: 'etude', participants: 40, dateArrivee: '2027-02-09', dateDepart: '2027-02-09',
        telephone: '01 45 67 89 10', email: undefined,
    }],
    ['Fourchette et adultes + enfants', `Coucou ! Cousinade du 30 avril au 2 mai 2027, 30 adultes et 8 enfants. Bisous, Claire`, {
        type: 'groupe', participants: 38, dateArrivee: '2027-04-30', dateDepart: '2027-05-02',
    }],
    ['Date passée ignorée, nuits', `Le 15 octobre 2026 vous m'aviez répondu. Nous voudrions finalement venir le 8 avril pour 3 jours, 20 à 22 personnes.`, {
        participants: 22, dateArrivee: '2027-04-08', dateDepart: '2027-04-10',
    }],
];

let ko = 0;
for (const [nom, texte, attendu] of cas) {
    const { prefill } = lire(texte, AUJ);
    for (const [k, v] of Object.entries(attendu)) {
        try { assert.strictEqual(prefill[k], v); } catch (e) { ko++; console.log(`✗ ${nom} — ${k} : ${JSON.stringify(prefill[k])} (attendu ${JSON.stringify(v)})`); }
    }
}
console.log(ko ? `${ko} écart(s)` : `✓ ${cas.length} cas OK`);
process.exit(ko ? 1 : 0);
