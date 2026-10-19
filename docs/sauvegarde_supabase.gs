/**
 * Sesquier — sauvegarde automatique de Supabase dans Google Drive
 * Compte : domainesesquier@gmail.com (projet Apps Script séparé de l'alerte mail)
 *
 * Installation (une fois) :
 *  1. script.google.com → Nouveau projet « Sesquier - sauvegarde Supabase » → coller ce fichier.
 *  2. Paramètres du projet → Propriétés du script :
 *       SUPABASE_URL          = https://ymwebdihbmzrcaivldxu.supabase.co
 *       SUPABASE_SERVICE_KEY  = clé « service_role » (Supabase → Project Settings → API). Ne jamais la partager.
 *  3. Exécuter installer() une fois (accepter les autorisations Drive / mail / requêtes externes).
 *     → crée les déclencheurs et lance une première sauvegarde.
 *
 * Ce que ça fait :
 *  - sauvegardeBase()      chaque nuit vers 3 h : toutes les tables en JSON → Drive « Sauvegardes Supabase Sesquier/base ».
 *                          On garde 30 jours + la sauvegarde du 1er de chaque mois pendant 12 mois.
 *  - sauvegardeDocuments() toutes les heures : copie les nouveaux fichiers du stockage « documents »
 *                          → Drive « …/documents » (5 min max par passage, reprend au passage suivant).
 *  - En cas d'échec : mail à contact@domainesesquier.com.
 *  - verifier() : compare le nombre de lignes de la dernière sauvegarde avec la base en direct (journal).
 */

const DOSSIER = 'Sauvegardes Supabase Sesquier';
const BUCKET = 'documents';
const ALERTE = 'contact@domainesesquier.com';
const GARDER_JOURS = 30;
const GARDER_MOIS = 12;
const BUDGET_MS = 5 * 60 * 1000;

function cfg_() {
  const p = PropertiesService.getScriptProperties();
  const url = (p.getProperty('SUPABASE_URL') || '').replace(/\/$/, '');
  const key = p.getProperty('SUPABASE_SERVICE_KEY') || '';
  if (!url || !key) throw new Error('Propriétés SUPABASE_URL / SUPABASE_SERVICE_KEY manquantes');
  return { url, key };
}

function sb_(path, opts) {
  const c = cfg_();
  const o = opts || {};
  const res = UrlFetchApp.fetch(c.url + path, {
    method: o.method || 'get',
    contentType: 'application/json',
    payload: o.body ? JSON.stringify(o.body) : undefined,
    headers: { apikey: c.key, Authorization: 'Bearer ' + c.key },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error(path + ' → HTTP ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200));
  return res;
}

function dossier_(nom) {
  const racine = DriveApp.getFoldersByName(DOSSIER);
  const r = racine.hasNext() ? racine.next() : DriveApp.createFolder(DOSSIER);
  if (!nom) return r;
  const it = r.getFoldersByName(nom);
  return it.hasNext() ? it.next() : r.createFolder(nom);
}

function alerte_(quoi, e) {
  console.error(quoi, e);
  MailApp.sendEmail(ALERTE, '⚠️ Sauvegarde Supabase en échec (' + quoi + ')',
    'La sauvegarde automatique a échoué :\n\n' + (e && e.stack || e) + '\n\nScript : Sesquier - sauvegarde Supabase (domainesesquier@gmail.com).');
}

/** Liste des tables exposées par l'API (hors fonctions rpc). */
function tables_() {
  const api = JSON.parse(sb_('/rest/v1/').getContentText());
  return Object.keys(api.paths || {})
    .filter(p => p !== '/' && !p.startsWith('/rpc/'))
    .map(p => p.slice(1))
    .sort();
}

function lireTable_(t) {
  const lignes = [];
  for (let off = 0; ; off += 1000) {
    const page = JSON.parse(sb_('/rest/v1/' + encodeURIComponent(t) + '?select=*&limit=1000&offset=' + off).getContentText());
    lignes.push.apply(lignes, page);
    if (page.length < 1000) return lignes;
  }
}

function sauvegardeBase() {
  try {
    const out = { date: new Date().toISOString(), source: cfg_().url, tables: {}, compte: {} };
    tables_().forEach(t => { out.tables[t] = lireTable_(t); out.compte[t] = out.tables[t].length; });
    const nom = 'supabase_' + Utilities.formatDate(new Date(), 'Europe/Paris', "yyyy-MM-dd_HH'h'mm") + '.json';
    dossier_('base').createFile(nom, JSON.stringify(out), MimeType.PLAIN_TEXT);
    menage_();
    console.log('OK ' + nom + ' ' + JSON.stringify(out.compte));
  } catch (e) { alerte_('base', e); throw e; }
}

/** Supprime (corbeille Drive, récupérable 30 j) les sauvegardes trop anciennes. */
function menage_() {
  const maintenant = Date.now();
  const it = dossier_('base').getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const m = f.getName().match(/^supabase_(\d{4})-(\d{2})-(\d{2})/);
    if (!m) continue;
    const age = (maintenant - new Date(+m[1], +m[2] - 1, +m[3]).getTime()) / 86400000;
    const mensuelle = m[3] === '01';
    if (age > (mensuelle ? GARDER_MOIS * 31 : GARDER_JOURS)) f.setTrashed(true);
  }
}

/** Parcourt le bucket (dossiers récursifs). */
function listerBucket_(prefix, acc) {
  for (let off = 0; ; off += 1000) {
    const items = JSON.parse(sb_('/storage/v1/object/list/' + BUCKET, {
      method: 'post', body: { prefix: prefix, limit: 1000, offset: off, sortBy: { column: 'name', order: 'asc' } },
    }).getContentText());
    items.forEach(i => {
      const chemin = prefix ? prefix + '/' + i.name : i.name;
      if (i.id === null) listerBucket_(chemin, acc);
      else acc.push({ chemin: chemin, maj: i.updated_at || '' });
    });
    if (items.length < 1000) return acc;
  }
}

function sauvegardeDocuments() {
  const debut = Date.now();
  try {
    const dos = dossier_('documents');
    const idxIt = dos.getFilesByName('_index.json');
    const idxFile = idxIt.hasNext() ? idxIt.next() : null;
    const index = idxFile ? JSON.parse(idxFile.getBlob().getDataAsString()) : {};
    let copies = 0, restants = 0;
    listerBucket_('', []).forEach(o => {
      if (index[o.chemin] === o.maj) return;
      if (Date.now() - debut > BUDGET_MS) { restants++; return; }
      const blob = sb_('/storage/v1/object/' + BUCKET + '/' + o.chemin.split('/').map(encodeURIComponent).join('/')).getBlob();
      const nom = o.chemin.replace(/\//g, '__');
      const anciens = dos.getFilesByName(nom);
      while (anciens.hasNext()) anciens.next().setTrashed(true);
      dos.createFile(blob.setName(nom));
      index[o.chemin] = o.maj;
      copies++;
    });
    const txt = JSON.stringify(index);
    if (idxFile) idxFile.setContent(txt); else dos.createFile('_index.json', txt, MimeType.PLAIN_TEXT);
    console.log('Documents : ' + copies + ' copiés, ' + restants + ' au prochain passage, ' + Object.keys(index).length + ' au total');
  } catch (e) { alerte_('documents', e); throw e; }
}

/** Compare la dernière sauvegarde avec la base en direct. */
function verifier() {
  const it = dossier_('base').getFiles();
  let dernier = null;
  while (it.hasNext()) { const f = it.next(); if (!dernier || f.getName() > dernier.getName()) dernier = f; }
  if (!dernier) throw new Error('Aucune sauvegarde');
  const s = JSON.parse(dernier.getBlob().getDataAsString());
  const lignes = tables_().map(t => {
    const live = lireTable_(t).length, sauv = (s.tables[t] || []).length;
    return (live === sauv ? '✓ ' : '≠ ') + t + ' : sauvegarde ' + sauv + ' / en direct ' + live;
  });
  console.log(dernier.getName() + '\n' + lignes.join('\n'));
}

function installer() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sauvegardeBase').timeBased().everyDays(1).atHour(3).inTimezone('Europe/Paris').create();
  ScriptApp.newTrigger('sauvegardeDocuments').timeBased().everyHours(1).create();
  sauvegardeBase();
  sauvegardeDocuments();
}
