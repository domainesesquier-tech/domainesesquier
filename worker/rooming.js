// Fiche rooming Google Sheets (copie du modèle « Rooming_2027 ») → lits et occupants par gîte.
// Les copies sont partagées « tous les utilisateurs disposant du lien » : l'export CSV se lit
// sans compte Google. Seuls le type de lits et le NOMBRE d'occupants sont renvoyés (pas les noms).

// Identifiant de la fiche à partir du lien rangé dans « Rooming JSON » (lienSheet)
export function idFiche(lien) {
  const m = String(lien || "").match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,100})/);
  return m ? m[1] : null;
}

// CSV (guillemets doublés, retours à la ligne dans les cellules) → tableau de lignes
export function parseCsv(texte) {
  const lignes = [];
  let ligne = [], cell = "", entreGuillemets = false;
  const s = String(texte || "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (entreGuillemets) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') entreGuillemets = false;
      else cell += c;
    } else if (c === '"') entreGuillemets = true;
    else if (c === ",") { ligne.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      ligne.push(cell); lignes.push(ligne); ligne = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || ligne.length) { ligne.push(cell); lignes.push(ligne); }
  return lignes;
}

export const cleGite = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

// Colonnes du modèle : A gîte/chambre · B capacité · C type de lit · D à G noms (« — » = case fermée)
export function lireRooming(texte) {
  const gites = {};
  let courant = null;
  for (const l of parseCsv(texte)) {
    const a = (l[0] || "").trim();
    if (a.includes("🏡")) {
      const nom = a.replace(/^.*🏡\s*/u, "").split(" - ")[0].trim();
      courant = { nom, chambres: [] };
      gites[cleGite(nom)] = courant;
    } else if (!a || /^total/i.test(a)) {
      courant = null;
    } else if (courant) {
      const occupants = l.slice(3, 7).map(v => (v || "").trim()).filter(v => v && !/^[—–-]+$/.test(v)).length;
      courant.chambres.push({ nom: a, capacite: parseInt(l[1], 10) || null, lits: (l[2] || "").trim(), occupants });
    }
  }
  return gites;
}

// Lit la fiche d'un dossier ; ne lève jamais d'erreur (l'onglet Ménage reste affiché)
export async function lireFiche(lien) {
  const id = idFiche(lien);
  if (!id) return { erreur: "lien" };
  try {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv`, { redirect: "follow" });
    if (!res.ok || !/text\/csv/.test(res.headers.get("content-type") || "")) return { erreur: "illisible" };
    return { gites: lireRooming(await res.text()) };
  } catch (e) {
    return { erreur: "illisible" };
  }
}
