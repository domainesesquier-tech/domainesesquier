// Domaine Sesquier — à chaque nouvelle demande du questionnaire (et à chaque lead du site, voir traiterLead) :
//   1. accusé de réception au client, en copie cachée à contact@ (au plus 1 par adresse toutes les 6 h, 20 par tranche de 6 h)
//   2. alerte à contact@domainesesquier.com (« Répondre » écrit directement au client)
// À coller dans script.google.com (compte domainesesquier@gmail.com), puis :
//   Premier déploiement : Déployer > Nouveau déploiement > Type « Application Web »
//     Exécuter en tant que : Moi · Qui a accès : Tout le monde
//   Mise à jour : Déployer > Gérer les déploiements > crayon > Version : Nouvelle version > Déployer
//     (l'URL ne change pas, rien à modifier dans le Worker)
//   Alertes déposées directement dans la boîte de réception (10/11/2026) : activer le service avancé
//     « Gmail API » (Éditeur > Services > + > Gmail API > Ajouter), lancer une fois testAlerte pour
//     accepter l'autorisation, puis publier une nouvelle version du déploiement.
// L'URL du déploiement sert de clé : ne la partage pas.

const DESTINATAIRE = 'contact@domainesesquier.com';
const TABLEAU_DE_BORD = 'https://admin.domainesesquier.com/';
const BROCHURES = {
  seminaire: 'https://domainesesquier.com/wp-content/uploads/2026/10/brochure-seminaire-domaine-sesquier-2027-v2.pdf',
  groupe: 'https://domainesesquier.com/wp-content/uploads/2026/10/brochure-groupe-domaine-sesquier-2027.pdf',
  mariage: 'https://domainesesquier.com/wp-content/uploads/2026/10/brochure-mariage-domaine-sesquier-2027.pdf',
};
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
  if (d.lead) { traiterLead(d); return ContentService.createTextOutput('ok'); }
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
    `${type} pour ${d.personnes} ${d.segment === 'mariage' ? 'invité' : 'personne'}${d.personnes > 1 ? 's' : ''}`,
    periode(d),
    d.organisation || '',
  ].filter(Boolean);
  const bonjour = d.prenom ? `Bonjour ${d.prenom},` : 'Bonjour,';
  const intro = 'Merci pour votre demande, elle est bien arrivée. Voici ce que nous avons noté :';
  const suite = 'Je prépare votre devis détaillé et vous l’envoie sous 24 h. Si un élément change d’ici là '
    + '(dates, nombre de personnes, envies), répondez simplement à ce mail.';
  const brochure = BROCHURES[d.segment] || BROCHURES.seminaire;
  const attente = 'En attendant votre devis, découvrez le domaine dans notre brochure :';
  const signature = ['Waël Smali · 06 83 96 80 56',
    'Domaine Sesquier — Gîtes, accueil de groupes, séminaires, événements',
    '4 plan du Sesquier, 34140 Mèze · domainesesquier.com'];

  const texte = [bonjour, '', intro, ...points.map(p => '• ' + p), '', suite, '', attente, brochure, '', 'Bien cordialement,', '', ...signature].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1f2a1c">
    <p>${esc(bonjour)}</p>
    <p>${esc(intro)}</p>
    <ul>${points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
    <p>${esc(suite)}</p>
    <p>${esc(attente)}</p>
    <p><a href="${brochure}" style="display:inline-block;background:#2C4226;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none">Voir la brochure</a></p>
    <p>Bien cordialement,</p>
    <p style="color:#6b7280">${signature.slice(0, 2).map(esc).join('<br>')}<br>
      4 plan du Sesquier, 34140 Mèze · <a href="https://domainesesquier.com" style="color:#2C4226">domainesesquier.com</a></p>
  </div>`;

  try {
    MailApp.sendEmail({
      to: d.email,
      bcc: DESTINATAIRE, // copie cachée : contact@ reçoit ce que le client a reçu
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

  const sujet = `Nouvelle demande ${type} — ${d.nom_client} (${d.personnes} pers., ${date(d.date_arrivee)})`;
  deposerAlerte({ sujet, html, replyTo: d.email, nom: 'Site Domaine Sesquier' });
}

// Alerte déposée directement dans la boîte de réception (API Gmail, service avancé « Gmail ») :
// pas d'envoi à soi-même, donc ni « moi » comme expéditeur ni copie dans « Envoyés », et toujours non lue.
// « Répondre » écrit au client (Reply-To). Si le service n'est pas activé : repli sur l'ancien envoi.
const EXPEDITEUR_ALERTES = 'alertes@domainesesquier.com';
function deposerAlerte(a) {
  try {
    const b64 = s => Utilities.base64Encode(s || '', Utilities.Charset.UTF_8).replace(/.{76}/g, '$&\r\n');
    const entete = s => '=?UTF-8?B?' + Utilities.base64Encode(s, Utilities.Charset.UTF_8) + '?=';
    const frontiere = 'sesquier-' + Utilities.getUuid();
    const mime = [
      `From: ${entete(a.nom)} <${EXPEDITEUR_ALERTES}>`,
      `To: ${DESTINATAIRE}`,
      `Reply-To: ${a.replyTo || DESTINATAIRE}`,
      `Subject: ${entete(a.sujet)}`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${frontiere}"`,
      '',
      `--${frontiere}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
      b64(a.texte || a.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()),
      `--${frontiere}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
      b64(a.html),
      `--${frontiere}--`, '',
    ].join('\r\n');
    Gmail.Users.Messages.insert({ raw: Utilities.base64EncodeWebSafe(mime), labelIds: ['INBOX', 'UNREAD'] }, 'me');
    return true;
  } catch (err) {
    console.error('deposerAlerte, repli sur l\'envoi : ' + err);
    MailApp.sendEmail({ to: DESTINATAIRE, replyTo: a.replyTo || DESTINATAIRE, subject: a.sujet, body: a.texte || '', htmlBody: a.html, name: a.nom });
    versBoiteDeReception(a.sujet);
    return false;
  }
}

// Le script envoie depuis domainesesquier@gmail.com vers contact@, qui revient dans ce même Gmail :
// Gmail jette la copie reçue (doublon) et ne garde l'alerte que dans « Messages envoyés ».
// On remet donc le fil dans la boîte de réception, non lu. Un échec ici ne bloque pas la demande.
function versBoiteDeReception(sujet) {
  try {
    for (let essai = 0; essai < 5; essai++) {
      Utilities.sleep(1500);
      const fil = GmailApp.search('in:sent newer_than:1d', 0, 10).find(t => t.getFirstMessageSubject() === sujet);
      if (fil) { fil.moveToInbox(); fil.markUnread(); return; }
    }
  } catch (err) {
    console.error('versBoiteDeReception : ' + err);
  }
}

// Pour tester depuis l'éditeur (bouton Exécuter sur cette fonction) : alerte + accusé envoyés à DESTINATAIRE.
function testAlerte() {
  doPost({ postData: { contents: JSON.stringify({
    id: 'recTEST', segment: 'seminaire', nom_client: 'Test H2M Events', organisation: 'Test H2M Events',
    contact: 'Marjorie Test', prenom: 'Marjorie', email: DESTINATAIRE, date_arrivee: '2026-11-26', date_depart: '2026-11-27',
    personnes: 14, estimation_ht: 3678, message: 'Ceci est un mail de test.', source: 'questionnaire',
  }) } });
}

// ─── Leads du site, avant la demande de devis (Worker /api/public/lead, secret NOTIF_LEADS = "true") ───
//   brochure   : la brochure au client + alerte « à rappeler »
//   estimation : la fourchette affichée au client + lien vers le questionnaire + alerte
//   rappel     : alerte « à rappeler » (+ confirmation au client s'il a laissé un e-mail)
const QUESTIONNAIRE = 'https://domainesesquier.com/demande-de-devis/?type=seminaire&depuis=';
const euros = v => Math.round(Number(v) || 0).toLocaleString('fr-FR');

function traiterLead(d) {
  const brochure = BROCHURES[d.segment] || BROCHURES.seminaire;
  const est = d.estimation || {};
  const modeles = {
    brochure: {
      titre: 'Brochure demandée',
      sujet: 'Votre brochure séminaire — Domaine Sesquier',
      lignes: ['Merci pour votre intérêt. Voici notre brochure séminaire : le domaine, les deux salles, l’hébergement, la restauration et les activités.'],
      bouton: ['Télécharger la brochure', brochure],
      suite: 'Pour recevoir un devis détaillé, décrivez votre projet en 3 minutes (dates, effectif, programme) : '
        + 'je vous réponds sous 24 h. ' + QUESTIONNAIRE + 'mail-brochure',
    },
    estimation: {
      titre: 'Estimation faite sur le site',
      sujet: 'Votre estimation de séminaire — Domaine Sesquier',
      lignes: [
        'Voici l’estimation que vous avez faite sur notre site' + (d.resume ? ` (${d.resume})` : '') + ' :',
        est.min_pp ? `entre ${euros(est.min_pp)} et ${euros(est.max_pp)} € HT par personne, soit environ ${euros(est.min)} à ${euros(est.max)} € HT au total.` : '',
        'C’est une fourchette indicative : votre devis ferme dépend de vos dates, de votre programme et de vos envies.',
      ].filter(Boolean),
      bouton: ['Recevoir mon devis détaillé', QUESTIONNAIRE + 'mail-estimation'],
      suite: 'Notre brochure pour découvrir le domaine : ' + brochure,
    },
    rappel: {
      titre: 'À RAPPELER',
      sujet: 'Nous vous rappelons — Domaine Sesquier',
      lignes: [`C’est noté : nous vous rappelons au ${d.telephone}${d.creneau ? ` (${String(d.creneau).toLowerCase()})` : ''}.`],
      bouton: ['Découvrir la brochure', brochure],
      suite: '',
    },
  };
  const m = modeles[d.lead];
  if (!m) return;
  const client = d.email ? envoyerMailLead(d, m) : false;

  const lignes = [
    ['Type', m.titre], ['Contact', [d.prenom, d.organisation].filter(Boolean).join(' · ') || '—'],
    ['E-mail', d.email || '—'], ['Téléphone', d.telephone || '—'],
    ['Créneau', d.creneau || ''], ['Projet', d.resume || (d.personnes ? d.personnes + ' pers.' : '')],
    ['Estimation', est.min_pp ? `${euros(est.min_pp)} à ${euros(est.max_pp)} € HT / pers.` : ''],
    ['Origine', d.origine || ''], ['Mail au client', client ? 'envoyé' : 'non envoyé'],
  ].filter(l => l[1]);
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2a1c">
    <p><b>${esc(m.titre)}</b> — à rappeler sous 24 h, c'est le moment où le lead est chaud.</p>
    <table cellpadding="6" style="border-collapse:collapse">${lignes.map(l => `<tr><td style="color:#6b7280">${esc(l[0])}</td><td>${esc(l[1])}</td></tr>`).join('')}</table>
    <p><a href="${TABLEAU_DE_BORD}?id=${encodeURIComponent(d.id || '')}">Ouvrir le dossier dans le tableau de bord</a></p></div>`;
  const sujet = `${m.titre} — ${d.nom_client || d.email || d.telephone}`;
  deposerAlerte({ sujet, html, texte: lignes.map(l => `${l[0]} : ${l[1]}`).join('\n'), replyTo: d.email, nom: 'Site Domaine Sesquier' });
}

function envoyerMailLead(d, m) {
  const cache = CacheService.getScriptCache();
  const cle = 'lead:' + d.lead + ':' + String(d.email).trim().toLowerCase();
  const total = Number(cache.get('accuses') || 0);
  if (cache.get(cle) || total >= 20) return false;
  const bonjour = d.prenom ? `Bonjour ${d.prenom},` : 'Bonjour,';
  const signature = ['Waël Smali · 06 83 96 80 56', 'Domaine Sesquier — Gîtes, accueil de groupes, séminaires, événements',
    '4 plan du Sesquier, 34140 Mèze · domainesesquier.com'];
  const texte = [bonjour, '', ...m.lignes, '', m.bouton[0] + ' : ' + m.bouton[1], '', m.suite, '', 'Bien cordialement,', '', ...signature]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1f2a1c">
    <p>${esc(bonjour)}</p>${m.lignes.map(l => `<p>${esc(l)}</p>`).join('')}
    <p><a href="${m.bouton[1]}" style="display:inline-block;background:#2C4226;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none">${esc(m.bouton[0])}</a></p>
    ${m.suite ? `<p>${esc(m.suite)}</p>` : ''}
    <p>Bien cordialement,</p>
    <p style="color:#6b7280">${signature.slice(0, 2).map(esc).join('<br>')}<br>
      4 plan du Sesquier, 34140 Mèze · <a href="https://domainesesquier.com" style="color:#2C4226">domainesesquier.com</a></p></div>`;
  try {
    MailApp.sendEmail({ to: d.email, bcc: DESTINATAIRE, replyTo: DESTINATAIRE, subject: m.sujet, body: texte, htmlBody: html, name: 'Domaine Sesquier' });
  } catch (err) {
    console.error('Mail lead : ' + err.message);
    return false;
  }
  cache.put(cle, '1', 21600);
  cache.put('accuses', String(total + 1), 21600);
  return true;
}

function testLead() {
  traiterLead({ lead: 'estimation', id: 'recTEST', segment: 'seminaire', prenom: 'Test', email: DESTINATAIRE, nom_client: 'Test estimation',
    personnes: 20, resume: '20 pers. · 2 jours / 1 nuit', estimation: { min_pp: 325, max_pp: 415, min: 6500, max: 8300 } });
}
