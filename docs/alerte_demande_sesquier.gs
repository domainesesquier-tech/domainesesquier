// Domaine Sesquier — alerte mail à chaque nouvelle demande du questionnaire.
// À coller dans script.google.com (compte domainesesquier@gmail.com), puis :
// Déployer > Nouveau déploiement > Type « Application Web »
//   Exécuter en tant que : Moi · Qui a accès : Tout le monde
// L'URL du déploiement sert de clé : ne la partage pas.

const DESTINATAIRE = 'contact@domainesesquier.com';
const TABLEAU_DE_BORD = 'https://admin.domainesesquier.com/';

function doPost(e) {
  const d = JSON.parse(e.postData.contents || '{}');
  const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const date = v => v ? Utilities.formatDate(new Date(v + 'T12:00:00'), 'Europe/Paris', 'dd/MM/yyyy') : '—';
  const euros = v => v ? Number(v).toLocaleString('fr-FR') + ' € HT' : '—';
  const type = { seminaire: 'Séminaire', groupe: 'Week-end de groupe', mariage: 'Mariage' }[d.segment] || d.type || 'Demande';

  const lignes = [
    ['Client', d.nom_client],
    ['Contact', d.contact],
    ['E-mail', d.email],
    ['Téléphone', d.telephone || '—'],
    ['Dates', date(d.date_arrivee) + ' → ' + date(d.date_depart)],
    ['Personnes', d.personnes],
    ['Estimation interne', euros(d.estimation_ht)],
    ['Source', d.source + (d.origine ? ' · ' + d.origine : '')],
    ['ID dossier', d.id],
  ].map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">${k}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`).join('');

  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2a1c">
    <h2 style="color:#2C4226;margin:0 0 12px">Nouvelle demande : ${esc(type)}</h2>
    <table>${lignes}</table>
    <p style="margin:16px 0 4px;color:#6b7280">Message du client</p>
    <div style="background:#F3F1EA;border-radius:8px;padding:12px;white-space:pre-wrap">${esc(d.message || '—')}</div>
    <p style="margin-top:16px"><a href="${TABLEAU_DE_BORD}" style="color:#2C4226">Ouvrir le tableau de bord</a> (dossier « à traiter », ID ${esc(d.id)})</p>
  </div>`;

  MailApp.sendEmail({
    to: DESTINATAIRE,
    replyTo: d.email || DESTINATAIRE,
    subject: `Nouvelle demande ${type} — ${d.nom_client} (${d.personnes} pers., ${date(d.date_arrivee)})`,
    htmlBody: html,
    name: 'Domaine Sesquier — questionnaire',
  });
  return ContentService.createTextOutput('ok');
}

// Pour tester depuis l'éditeur (bouton Exécuter sur cette fonction) : envoie un mail d'essai.
function testAlerte() {
  doPost({ postData: { contents: JSON.stringify({
    id: 'recTEST', segment: 'seminaire', nom_client: 'Test H2M Events', contact: 'Marjorie Test',
    email: 'test@exemple.fr', date_arrivee: '2026-11-26', date_depart: '2026-11-27', personnes: 14,
    estimation_ht: 3678, message: 'Ceci est un mail de test.', source: 'questionnaire',
  }) } });
}
