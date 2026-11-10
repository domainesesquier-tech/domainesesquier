/**
 * Fiche rooming Domaine Sesquier — nettoyage du modèle « Rooming_2027 » (Google Sheets).
 *
 * Installation (une fois) : ouvrir la feuille → Extensions → Apps Script → coller ce fichier
 * → Enregistrer → choisir la fonction « nettoyerModele » → Exécuter (autoriser l'accès la première fois).
 *
 * Exécuté le 22/10/2026 sur « Rooming_2027 » (projet Apps Script du compte domainesesquier@gmail.com).
 * Ce que fait le script :
 *  0. copie de sauvegarde « <nom> (avant nettoyage) » dans le même dossier Drive ;
 *  1. textes : émoji 🏡 abîmé, espaces, fautes (« lits imples », « 2 Simples », « lit Double », « 2 pers ») ;
 *  2. capacités : Pivoine chambre 2 = 2 pers., Belle de nuit séjour = 1 pers. (total séminaire 35) ;
 *  3. « Capacité totale » et « Total des personnes hébergées » calculés automatiquement ;
 *  4. feuille verrouillée : le client ne peut remplir que les cases des noms.
 */
const TIRET = '—';
const RE_CHAMBRE = /^\s*(Chambre|Séjour)\b/;

const ID_MODELE = '1UuQVAgCu5ZtFNi-ZbIpb9-J6_qADnP0CztAWVGfNyTI'; // « Rooming_2027 », si le script est lancé depuis script.google.com

function nettoyerModele() {
  const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(ID_MODELE);
  const sh = ss.getSheets()[0];

  // 0. Sauvegarde
  const fichier = DriveApp.getFileById(ss.getId());
  const parents = fichier.getParents();
  fichier.makeCopy(ss.getName() + ' (avant nettoyage)', parents.hasNext() ? parents.next() : DriveApp.getRootFolder());

  const lastRow = sh.getLastRow();
  const lastCol = Math.max(sh.getLastColumn(), 7);
  const valeurs = sh.getRange(1, 1, lastRow, lastCol).getValues();
  const formules = sh.getRange(1, 1, lastRow, lastCol).getFormulas();
  const ecrire = (r, c, val) => { if (!formules[r][c] && valeurs[r][c] !== val) { sh.getRange(r + 1, c + 1).setValue(val); valeurs[r][c] = val; } };

  // Repères : colonne « NOM PARTICIPANT 1 », lignes de chambres, gîte de chaque ligne
  let colP1 = 3;
  valeurs.forEach(l => l.forEach((v, c) => { if (String(v).trim() === 'NOM PARTICIPANT 1') colP1 = c; }));
  const gite = [];
  let giteCourant = '';
  valeurs.forEach((l, r) => {
    const a = String(l[0]);
    if (/^ð|^🏡/.test(a)) giteCourant = a.replace(/^ð[\u0080-ÿ]*|^🏡/, '').trim().split(' - ')[0].trim().toUpperCase();
    gite[r] = RE_CHAMBRE.test(a) ? giteCourant : null;
  });
  const lignesChambres = gite.map((g, r) => g ? r : -1).filter(r => r >= 0);

  // 1. Textes
  valeurs.forEach((l, r) => l.forEach((v, c) => {
    if (typeof v !== 'string' || !v) return;
    let t = v;
    if (c === 0 && /^ð|^🏡/.test(t)) t = '🏡 ' + t.replace(/^ð[\u0080-ÿ]*|^🏡/, '').trim().replace(/\s{2,}/g, ' ');
    else if (c === 0 && gite[r]) t = '    ' + t.trim();
    else if (c !== 0) t = t.trim().replace(/\s{2,}/g, ' ');
    if (gite[r] && c === 1) t = t.replace(/^(\d+)\s*pers\.?$/i, '$1 pers.');
    if (gite[r] && c === 2) t = t.replace(/lits? imples/gi, 'lits simples').replace(/^(\d+) Simples$/i, '$1 lits simples').replace(/lit Double/g, 'lit double');
    t = t.replace(/1 SDB, chambres/, '1 SDB, 2 chambres');
    ecrire(r, c, t);
  }));

  // 2. Capacités (format de ligne recopié d'une chambre de même capacité : couleurs individuelle / partagée, cases grisées)
  const trouver = (nomGite, piece) => lignesChambres.find(r => gite[r].startsWith(nomGite) && String(valeurs[r][0]).trim() === piece);
  const recopierFormat = (source, cible) => {
    if (source === undefined || cible === undefined) return;
    sh.getRange(source + 1, 1, 1, lastCol).copyFormatToRange(sh, 1, lastCol, cible + 1, cible + 1);
  };
  const pivoine2 = trouver('PIVOINE', 'Chambre 2');
  if (pivoine2 !== undefined) {
    recopierFormat(trouver('IRIS', 'Chambre 2'), pivoine2);          // 2 pers., 2 lits simples
    ecrire(pivoine2, 1, '2 pers.');
    ecrire(pivoine2, colP1, valeurs[pivoine2][colP1] === TIRET ? '' : valeurs[pivoine2][colP1]);
    ecrire(pivoine2, colP1 + 1, valeurs[pivoine2][colP1 + 1] === TIRET ? '' : valeurs[pivoine2][colP1 + 1]);
  }
  const belleSejour = trouver('BELLE DE NUIT', 'Séjour');
  if (belleSejour !== undefined) {
    recopierFormat(trouver('ACACIA', 'Séjour'), belleSejour);        // 1 pers.
    ecrire(belleSejour, 1, '1 pers.');
    for (let k = 1; k < 4; k++) ecrire(belleSejour, colP1 + k, TIRET);
  }

  // 3. Totaux automatiques
  const SEP = ss.getSpreadsheetLocale().startsWith('en') ? ',' : ';'; // feuille en français : séparateur « ; »
  const lettre = c => String.fromCharCode(65 + c);
  const f = lignesChambres[0] + 1, l = lignesChambres[lignesChambres.length - 1] + 1;
  const plage = c => `${lettre(c)}${f}:${lettre(c)}${l}`;
  const formuleCapacite = `=ARRAYFORMULA(SUM(IFERROR(VALUE(REGEXEXTRACT(TO_TEXT(${plage(1)})${SEP}"^(\\d+) pers")))))`;
  const remplis = [0, 1, 2, 3].map(k => `(${plage(colP1 + k)}<>"")*(${plage(colP1 + k)}<>"${TIRET}")`).join('+');
  const formuleTotal = `=ARRAYFORMULA(SUM(IF(REGEXMATCH(${plage(0)}${SEP}"^\\s*(Chambre|Séjour)")${SEP}${remplis}${SEP}0)))`;
  let celluleCapacite = null;
  valeurs.forEach((ligne, r) => ligne.forEach((v, c) => {
    const t = String(v).trim().toUpperCase();
    if (t.startsWith('CAPACITÉ TOTALE')) {
      celluleCapacite = celluleValeur(sh, r + 1, c + 1, lastCol);
      celluleCapacite.setFormula(formuleCapacite).setNumberFormat('0" places"');
    }
  }));
  valeurs.forEach((ligne, r) => {
    if (String(ligne[0]).trim().toUpperCase().startsWith('TOTAL DES PERSONNES')) {
      const cel = celluleValeur(sh, r + 1, 1, lastCol);
      cel.setFormula(celluleCapacite ? `=${formuleTotal.slice(1)}&" / "&${celluleCapacite.getA1Notation()}` : formuleTotal);
    }
  });

  // 4. Verrouillage : seules les cases des noms (hors « — ») restent modifiables
  sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(p => p.remove());
  const protection = sh.protect().setDescription('Modèle rooming : seules les cases des noms sont modifiables');
  const libres = [];
  lignesChambres.forEach(r => {
    const n = [0, 1, 2, 3].filter(k => valeurs[r][colP1 + k] !== TIRET).length;
    if (n) libres.push(sh.getRange(r + 1, colP1 + 1, 1, n));
  });
  protection.setUnprotectedRanges(libres);
  const moi = Session.getEffectiveUser();
  protection.addEditor(moi);
  protection.removeEditors(protection.getEditors().filter(e => e.getEmail() !== moi.getEmail()));
  if (protection.canDomainEdit()) protection.setDomainEdit(false);

  sh.setName('Rooming');
  const message = `Modèle nettoyé : ${lignesChambres.length} chambres, ${libres.length} lignes de noms modifiables. Sauvegarde créée.`;
  console.log(message);
  try { ss.toast(message, 'Rooming', 8); } catch (e) {} // pas de notification quand le script est lancé hors de la feuille
}

/** Cellule où écrire la valeur d'une étiquette (« Capacité totale : »…) : juste après l'étiquette ou sa fusion. */
function celluleValeur(sh, r, c, lastCol) {
  const fusion = sh.getRange(r, c).getMergedRanges()[0];
  let fin = fusion ? fusion.getLastColumn() : c;
  if (fin >= lastCol) {
    if (fusion) fusion.breakApart();
    if (lastCol - 1 > c) sh.getRange(r, c, 1, lastCol - c).merge();
    fin = lastCol - 1;
  }
  return sh.getRange(r, fin + 1);
}

// ===== Bouton « Créer le rooming » du tableau de bord =====
// Web app : Déployer → Nouveau déploiement → Application Web, exécuter en tant que « moi » (domainesesquier), accès « Tout le monde ».
// Pas de secret partagé : la requête porte la session du tableau de bord, vérifiée auprès de Supabase (clé anon publique),
// et seuls les comptes ci-dessous peuvent créer une fiche.
const SUPABASE_URL = 'https://ymwebdihbmzrcaivldxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inltd2ViZGloYm16cmNhaXZsZHh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0ODkxMjMsImV4cCI6MjA5NDA2NTEyM30.htAc4nHjbv-yFHW-59i_1eBPUsNcfd8-DMq9D1igVPw';
const COMPTES_AUTORISES = ['smali.w05@gmail.com', 'domainesesquier@gmail.com'];

function doPost(e) {
  let data = {};
  try { data = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {}
  const email = emailSession(data.jeton);
  if (!email || COMPTES_AUTORISES.indexOf(email.toLowerCase()) === -1) return reponseJson({ error: 'Session du tableau de bord non reconnue' });

  const modele = DriveApp.getFileById(ID_MODELE);
  const parents = modele.getParents();
  const nom = ['Rooming', data.nom, data.dates].filter(Boolean).join(' — ').slice(0, 150);
  const copie = modele.makeCopy(nom, parents.hasNext() ? parents.next() : DriveApp.getRootFolder());
  const cel = SpreadsheetApp.openById(copie.getId()).getSheets()[0].createTextFinder('Date du séjour').findNext();
  if (cel && data.dates) cel.setValue('Date du séjour : ' + String(data.dates).slice(0, 80));
  copie.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT); // le client remplit les noms (cases non verrouillées)
  return reponseJson({ url: copie.getUrl() });
}

function emailSession(jeton) {
  if (!jeton) return null;
  const r = UrlFetchApp.fetch(SUPABASE_URL + '/auth/v1/user', { headers: { Authorization: 'Bearer ' + jeton, apikey: SUPABASE_ANON_KEY }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return null;
  try { return JSON.parse(r.getContentText()).email || null; } catch (err) { return null; }
}

function reponseJson(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// À lancer une fois depuis l'éditeur pour autoriser l'appel à Supabase (vérification de la session)
function autoriserAcces() {
  UrlFetchApp.fetch(SUPABASE_URL + '/auth/v1/health', { headers: { apikey: SUPABASE_ANON_KEY }, muteHttpExceptions: true });
}
