# CONTEXT.md — Domaine Sesquier

Documentation technique de référence pour le projet. À mettre à jour à chaque bug résolu ou changement d'architecture.

---

## Architecture

- **`index.html`** : Dashboard principal (liste des réservations, KPIs, filtres, dossiers)
- **`COMMERCIAL.html`** : Outil de génération de devis & factures
- **`worker/index.js`** : Cloudflare Worker — proxy entre le front et l'API Airtable
- **`assets/utils.js`** : Utilitaires partagés (`SesquierUtils`, `fetchJson`, `formatEuro`, etc.)
- **`assets/constants.js`** : Constantes globales
- **`assets/dossier-model.js`** : Modèle de données du dossier client
- **`assets/records.js`** : **Source unique de vérité** — `FIELDS` (noms de champs Airtable), `STATUS_MAP`, `normalizeRecord()`. Chargé en premier dans index.html.

---

## Points clés

- Le Worker est déployé sur : `https://domainesesquier-api.domainesesquier.workers.dev`
- Les secrets Airtable (`AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`, etc.) sont dans les variables d'environnement Cloudflare — jamais dans le code.
- Le champ **Statut** dans Airtable est un **Linked Record**, stocké comme un tableau de strings : `["à traiter"]`.

---

## Historique des bugs résolus

### 2026-05-02 — Système de statuts

#### Bug 1 : `let finalVal` non déclaré
- **Symptôme** : `ReferenceError: finalVal is not defined` → crash du script entier → données qui ne chargent plus.
- **Cause** : La variable `finalVal` était utilisée dans le bloc `if (field === 'Statut')` sans avoir été déclarée au préalable.
- **Règle** : Toujours initialiser avec `let finalVal = val;` **avant** tout bloc conditionnel qui la modifie.

```js
// ✅ Correct
let finalVal = val;
if (field === 'Statut') {
    finalVal = [bestVal];
}

// ❌ Incorrect — ReferenceError
if (field === 'Statut') {
    finalVal = [bestVal]; // finalVal n'existe pas encore
}
```

---

#### Bug 2 : `normalizeStatut` — confusion de signature
- **Symptôme** : La fonction retournait toujours `'à traiter'` car elle recevait un objet au lieu d'une string.
- **Cause** : La fonction était parfois appelée avec `f` (l'objet `fields` complet) et parfois avec la valeur brute du champ Statut.
- **Règle** : `normalizeStatut` ne s'appelle qu'avec **la valeur brute** du champ (string ou tableau), jamais avec `r.fields`.

```js
// ✅ Correct
const s = normalizeStatut(r.fields["Statut"]);

// ❌ Incorrect — reçoit un objet, ne peut pas normaliser
const s = normalizeStatut(r.fields);
```

> **Note** : La fonction a été rendue tolérante aux deux formats (object et raw) comme mesure de sécurité, mais la convention reste d'appeler avec la valeur brute.

---

#### Bug 3 : `STATUS_MAP` — casse incorrecte des valeurs Airtable
- **Symptôme** : Erreur Airtable `"Insufficient permissions to create new select option"` → Airtable refuse la valeur car elle ne correspond pas à une option existante.
- **Cause** : Le `STATUS_MAP` utilisait des valeurs capitalisées (`"À traiter"`, `"Confirmé"`) alors qu'Airtable stocke et attend des **minuscules** (`"à traiter"`, `"confirmé"`).
- **Règle** : Les valeurs `airtable` dans `STATUS_MAP` doivent être en **minuscules**, exactement comme retournées par l'API.

```js
// ✅ Correct — correspond à ce qu'Airtable retourne et attend
const STATUS_MAP = {
    'à traiter':    { airtable: 'à traiter',    ... },
    'confirmé':     { airtable: 'confirmé',     ... },
    'devis envoyé': { airtable: 'devis envoyé', ... },
    'effectué':     { airtable: 'effectué',     ... },
    'annulé':       { airtable: 'annulé',       ... },
};

// ❌ Incorrect — Airtable rejette ces valeurs capitalisées
const STATUS_MAP = {
    'à traiter': { airtable: 'À traiter', ... }, // ERREUR: majuscule
    'annulé':    { airtable: 'Annulé',    ... }, // ERREUR: majuscule
};
```

---

#### Bug 4 : Format du payload Statut — String vs Array
- **Symptôme** : Erreur `"Cannot parse value for field Statut"`.
- **Cause** : Le champ Statut est un **Linked Record** dans Airtable, il attend un tableau `["valeur"]`, pas une string `"valeur"`.
- **Règle** : Toujours envoyer le statut sous forme de tableau.

```js
// ✅ Correct
finalVal = ['à traiter'];   // tableau

// ❌ Incorrect
finalVal = 'à traiter';     // string simple — "Cannot parse value"
```

---

## Mémo Airtable

Base ID : `app6AAb5nlRHVnGzW` — Table Réservation : `tbl3Ku22gmRNJSRIz`

| Champ | Type Airtable | Format attendu | Notes |
|---|---|---|---|
| `Statut` | multiSelect | `["confirmé"]` (tableau, minuscules) | Valeurs : `demande`, `à traiter`, `devis envoyé`, `confirmé`, `effectué`, `annulé` |
| `Date arrivée` | Date | `"YYYY-MM-DD"` | |
| `Date départ` | Date | `"YYYY-MM-DD"` | |
| `est_archive` | Select (vide) | truthy si valeur présente | Pas une checkbox — `!!f['est_archive']` |
| `Nombre de personnes` | Number | `18` (décimal en base, traité comme entier) | Le champ `Nb personnes` N'EXISTE PAS |
| `DOSSIER JSON` | multilineText | JSON string | Casse importante : tout en majuscules |
| `Timeline JSON` | text | JSON string `[{date, text}]` | Créé le 2026-05-02 |
| `Entreprise` | **N'EXISTE PAS** | — | Utiliser `Nom client` à la place |

### Règle : toujours passer par `normalizeRecord()` (assets/records.js)
Ne jamais lire `r.fields["Statut"]` depuis les données brutes Airtable — toujours normaliser d'abord. Le `.trim()` et la gestion `Array vs String` sont dans `SesquierRecords.normalize()`.
