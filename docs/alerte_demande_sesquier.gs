// Domaine Sesquier — à chaque nouvelle demande du questionnaire :
//   1. accusé de réception au client (au plus 1 par adresse toutes les 6 h, 20 par tranche de 6 h)
//   2. alerte à contact@domainesesquier.com (« Répondre » écrit directement au client)
// À coller dans script.google.com (compte domainesesquier@gmail.com), puis :
//   Premier déploiement : Déployer > Nouveau déploiement > Type « Application Web »
//     Exécuter en tant que : Moi · Qui a accès : Tout le monde
//   Mise à jour : Déployer > Gérer les déploiements > crayon > Version : Nouvelle version > Déployer
//     (l'URL ne change pas, rien à modifier dans le Worker)
// L'URL du déploiement sert de clé : ne la partage pas.

const DESTINATAIRE = 'contact@domainesesquier.com';
const TABLEAU_DE_BORD = 'https://admin.domainesesquier.com/';
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const jour = v => new Date(v + 'T12:00:00Z');
const date = v => v ? Utilities.formatDate(jour(v), 'Europe/Paris', 'dd/MM/yyyy') : '—';
const dateLongue = (v, annee) => {
  const x = jour(v), n = x.getUTCDate();
  return `${JOURS[x.getUTCDay()]} ${n === 1 ? '1er' : n} ${MOIS[x.getUTCMonth()]}${annee ? ' ' + x.getUTCFullYear() : ''}`;
};

function doPost(e) {
  const d = JSON.parse(e.postData.contents || '{}');
  const accuse = d.email ? envoyerAccuse(d) : false;
  envoyerAlerte(d, accuse);
  return ContentService.createTextOutput('ok');
}

function periode(d) {
  if (!d.date_arrivee) return '';
  if (d.journee_etude || !d.date_depart || d.date_depart === d.date_arrivee) return `le ${dateLongue(d.date_arrivee, true)}`;
  const nuits = Math.round((jour(d.date_depart) - jour(d.date_arrivee)) / 86400000);
  const memeAnnee = d.date_arrivee.slice(0, 4) === d.date_depart.slice(0, 4);
  return `du ${dateLongue(d.date_arrivee, !memeAnnee)} au ${dateLongue(d.date_depart, true)} (${nuits} nuit${nuits > 1 ? 's' : ''})`;
}

// Renvoie true si l'accusé est parti. Le cache limite les abus (adresse saisie par n'importe qui sur le site).
function envoyerAccuse(d) {
  const cache = CacheService.getScriptCache();
  const cle = 'accuse:' + String(d.email).trim().toLowerCase();
  const total = Number(cache.get('accuses') || 0);
  if (cache.get(cle) || total >= 20) return false;

  const type = d.segment === 'mariage' ? 'Mariage' : d.segment === 'groupe' ? 'Séjour de groupe'
    : d.journee_etude ? 'Journée d’étude' : 'Séminaire';
  const points = [
    `${type} pour ${d.personnes} personne${d.personnes > 1 ? 's' : ''}`,
    periode(d),
    d.organisation || '',
  ].filter(Boolean);
  const bonjour = d.prenom ? `Bonjour ${d.prenom},` : 'Bonjour,';
  const intro = 'Merci pour votre demande, elle est bien arrivée. Voici ce que nous avons noté :';
  const suite = 'Je prépare votre devis détaillé et vous l’envoie sous 24 h. Si un élément change d’ici là '
    + '(dates, nombre de personnes, envies), répondez simplement à ce mail.';
  const signature = ['Waël Smali · 06 83 96 80 56',
    'Domaine Sesquier — Gîtes, accueil de groupes, séminaires, événements',
    '4 plan du Sesquier, 34140 Mèze · domainesesquier.com'];

  const texte = [bonjour, '', intro, ...points.map(p => '• ' + p), '', suite, '', 'Bien cordialement,', '', ...signature].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1f2a1c">
    <p>${esc(bonjour)}</p>
    <p>${esc(intro)}</p>
    <ul>${points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
    <p>${esc(suite)}</p>
    <p>Bien cordialement,</p>
    <p style="color:#6b7280">${signature.slice(0, 2).map(esc).join('<br>')}<br>
      4 plan du Sesquier, 34140 Mèze · <a href="https://domainesesquier.com" style="color:#2C4226">domainesesquier.com</a></p>
  </div>`;

  try {
    MailApp.sendEmail({
      to: d.email,
      replyTo: DESTINATAIRE,
      subject: `Votre demande au Domaine Sesquier — ${type} ${periode(d)}`.trim(),
      body: texte,
      htmlBody: html,
      name: 'Domaine Sesquier',
    });
  } catch (err) {
    console.error('Accusé de réception : ' + err.message);
    return false;
  }
  cache.put(cle, '1', 21600);
  cache.put('accuses', String(total + 1), 21600);
  return true;
}

function envoyerAlerte(d, accuse) {
  const type = { seminaire: 'Séminaire', groupe: 'Week-end de groupe', mariage: 'Mariage' }[d.segment] || d.type || 'Demande';
  const euros = v => v ? Number(v).toLocaleString('fr-FR') + ' € HT' : '—';
  const limite = Utilities.formatDate(new Date(Date.now() + 86400000), 'Europe/Paris', "dd/MM 'à' HH'h'mm");
  const lignes = [
    ['Client', d.nom_client],
    ['Contact', d.contact],
    ['E-mail', d.email],
    ['Téléphone', d.telephone || '—'],
    ['Dates', date(d.date_arrivee) + ' → ' + date(d.date_depart)],
    ['Personnes', d.personnes],
    ['Estimation interne', euros(d.estimation_ht)],
    ['Source', d.source + (d.origine ? ' · ' + d.origine : '')],
    ['Accusé de réception', accuse ? 'envoyé au client' : 'non envoyé'],
    ['Devis promis', 'avant le ' + limite],
  ].map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">${k}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`).join('');

  const lien = TABLEAU_DE_BORD + '?id=' + encodeURIComponent(d.id || '');
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2a1c">
    <h2 style="color:#2C4226;margin:0 0 12px">Nouvelle demande : ${esc(type)}</h2>
    <table>${lignes}</table>
    <p style="margin:16px 0 4px;color:#6b7280">Message du client</p>
    <div style="background:#F3F1EA;border-radius:8px;padding:12px;white-space:pre-wrap">${esc(d.message || '—')}</div>
    <p style="margin-top:16px"><a href="${esc(lien)}" style="color:#2C4226">Ouvrir le dossier</a> (statut « à traiter »)</p>
  </div>`;

  MailApp.sendEmail({
    to: DESTINATAIRE,
    replyTo: d.email || DESTINATAIRE,
    subject: `Nouvelle demande ${type} — ${d.nom_client} (${d.personnes} pers., ${date(d.date_arrivee)})`,
    htmlBody: html,
    name: 'Domaine Sesquier — questionnaire',
  });
}

// Pour tester depuis l'éditeur (bouton Exécuter sur cette fonction) : alerte + accusé envoyés à DESTINATAIRE.
function testAlerte() {
  doPost({ postData: { contents: JSON.stringify({
    id: 'recTEST', segment: 'seminaire', nom_client: 'Test H2M Events', organisation: 'Test H2M Events',
    contact: 'Marjorie Test', prenom: 'Marjorie', email: DESTINATAIRE, date_arrivee: '2026-11-26', date_depart: '2026-11-27',
    personnes: 14, estimation_ht: 3678, message: 'Ceci est un mail de test.', source: 'questionnaire',
  }) } });
}
