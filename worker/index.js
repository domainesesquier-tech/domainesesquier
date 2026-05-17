// ============================================================
// Domaine Sesquier — Cloudflare Worker (Supabase backend)
// ============================================================

function corsHeaders(env = {}, requestOrigin = "") {
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const origin = allowed.includes(requestOrigin) ? requestOrigin : (allowed[0] || "*");
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400",
  };
}

function json(body, status = 200, env = {}, requestOrigin = "") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(env, requestOrigin),
    },
  });
}

// ── Supabase helpers ────────────────────────────────────────

async function sbFetch(env, path, init = {}) {
  const url = `${env.SUPABASE_URL}/rest/v1${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "apikey": env.SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${env.SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || `Supabase error (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

// Génère un ID de type Airtable (crypto-safe) pour les nouvelles réservations
function newRecId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  let s = 'rec';
  for (let i = 0; i < 14; i++) s += chars[bytes[i] % chars.length];
  return s;
}

// ── Conversion Supabase row → Airtable record ───────────────

function rowToRecord(row) {
  return {
    id: row.id,
    fields: {
      'Nom client':               row.nom_client,
      'Entreprise':               row.entreprise,
      'Prénom contact':           row.prenom_contact,
      'Nom contact':              row.nom_contact,
      'Email':                    row.email,
      'Téléphone':                row.telephone,
      'Type':                     row.type,
      'Statut':                   row.statut,
      'Date arrivée':             row.date_arrivee,
      'Date départ':              row.date_depart,
      'Nombre de personnes':      row.nombre_de_personnes,
      'Nb personnes':             row.nombre_de_personnes,
      'Option draps':             row.option_draps,
      'Option ménage':            row.option_menage,
      'Repas petit-déjeuner':     row.repas_petit_dej,
      'Repas déjeuner':           row.repas_dejeuner,
      'Repas dîner':              row.repas_diner,
      'Qté collation':            row.qte_collation,
      'Montant Hébergement HT':   row.montant_hebergement_ht,
      'Montant Repas HT':         row.montant_repas_ht,
      'Montant Options HT':       row.montant_options_ht,
      'Message':                  row.message,
      'Budget estimé':            row.budget_estime,
      'Details JSON':             row.details_json,
      'JSON Snapshot':            row.json_snapshot,
      'DOSSIER JSON':             row.dossier_json,
      'Timeline JSON':            row.timeline_json,
      'Rooming JSON':             row.rooming_json,
      'Notes':                    row.notes,
      'Suivi Source':             row.suivi_source,
      'Suivi Décideur':           row.suivi_decideur,
      'Suivi Date devis':         row.suivi_date_devis,
      'Suivi Probabilité':        row.suivi_probabilite,
      'Suivi Date relance':       row.suivi_date_relance,
      'Suivi Prochaine action':   row.suivi_prochaine_action,
      'Suivi Log':                row.suivi_log,
      'est_archive':              row.est_archive,
      'Acompte Payé':             row.acompte_paye,
      'Acompte Montant':          row.acompte_montant,
      'Created':                  row.created_at,
      'Updated':                  row.updated_at,
    },
  };
}

// ── Conversion champs Airtable → colonnes Supabase ──────────

const FIELD_MAP = {
  'Nom client':               'nom_client',
  'Entreprise':               'entreprise',
  'Prénom contact':           'prenom_contact',
  'Nom contact':              'nom_contact',
  'Email':                    'email',
  'Téléphone':                'telephone',
  'Type':                     'type',
  'Statut':                   'statut',
  'Date arrivée':             'date_arrivee',
  'Date départ':              'date_depart',
  'Nombre de personnes':      'nombre_de_personnes',
  'Nb personnes':             'nombre_de_personnes',
  'Option draps':             'option_draps',
  'Option ménage':            'option_menage',
  'Repas petit-déjeuner':     'repas_petit_dej',
  'Repas déjeuner':           'repas_dejeuner',
  'Repas dîner':              'repas_diner',
  'Qté collation':            'qte_collation',
  'Montant Hébergement HT':   'montant_hebergement_ht',
  'Montant Repas HT':         'montant_repas_ht',
  'Montant Options HT':       'montant_options_ht',
  'Message':                  'message',
  'Budget estimé':            'budget_estime',
  'Details JSON':             'details_json',
  'JSON Snapshot':            'json_snapshot',
  'DOSSIER JSON':             'dossier_json',
  'Timeline JSON':            'timeline_json',
  'Rooming JSON':             'rooming_json',
  'Notes':                    'notes',
  'Suivi Source':             'suivi_source',
  'Suivi Décideur':           'suivi_decideur',
  'Suivi Date devis':         'suivi_date_devis',
  'Suivi Probabilité':        'suivi_probabilite',
  'Suivi Date relance':       'suivi_date_relance',
  'Suivi Prochaine action':   'suivi_prochaine_action',
  'Suivi Log':                'suivi_log',
  'est_archive':              'est_archive',
  'Acompte Payé':             'acompte_paye',
  'Acompte Montant':          'acompte_montant',
};

function fieldsToRow(fields) {
  const row = {};
  for (const [airtableKey, value] of Object.entries(fields)) {
    const col = FIELD_MAP[airtableKey];
    if (col) row[col] = value;
  }
  return row;
}

// ── Pricing : row → Airtable record ────────────────────────

function pricingRowToRecord(row) {
  return {
    id: `price_${row.id}`,
    fields: {
      'Catégorie':          row.categorie,
      'Type':               row.type,
      'Intitulé':           row.intitule,
      'Unité':              row.unite,
      'PU':                 row.pu,
      'TVA % (auto)':       row.tva_pct,
      'Prix TTC (calculé)': row.prix_ttc,
      'Code':               row.code,
      'Condition':          row.condition,
      'Durée min nuits':    row.duree_min_nuits,
      'Durée max nuits':    row.duree_max_nuits,
      'Nb pers min':        row.nb_pers_min,
      'Nb pers max':        row.nb_pers_max,
    },
  };
}

// ── Planning : row → record ────────────────────────────────

function planningRowToRecord(row) {
  return {
    id: row.id,
    fields: {
      'Nom':          row.nom,
      'Type':         row.type,
      'Logements':    row.logements || [],
      'Date arrivée': row.date_arrivee,
      'Date départ':  row.date_depart,
      'Statut':       row.statut,
      'Nb personnes': row.nb_personnes,
      'Montant':      row.montant,
      'Notes':        row.notes,
      'Created':      row.created_at,
    },
  };
}

// ── Library : row → Airtable record ────────────────────────

function libraryRowToRecord(row) {
  return {
    id: `lib_${row.id}`,
    fields: {
      'Nom':         row.nom,
      'Description': row.description,
      'Catégorie':   row.categorie,
      'Prix HT':     row.prix_ht,
      'TVA':         row.tva,
      'Actif':       row.actif,
    },
  };
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================

export default {
  async fetch(request, env) {
    const url           = new URL(request.url);
    const method        = request.method.toUpperCase();
    const requestOrigin = request.headers.get("Origin") || "";

    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      return json({ error: { message: "SUPABASE_URL or SUPABASE_ANON_KEY missing." } }, 500, env, requestOrigin);
    }

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env, requestOrigin) });
    }

    try {

      // ── HEALTH ─────────────────────────────────────────────
      if (url.pathname === "/api/health" && method === "GET") {
        return json({ ok: true, backend: "supabase" }, 200, env, requestOrigin);
      }

      // ── RESERVATIONS ───────────────────────────────────────
      if (url.pathname === "/api/reservations" && method === "GET") {
        const id = url.searchParams.get("id");
        if (id) {
          const rows = await sbFetch(env, `/reservations?id=eq.${encodeURIComponent(id)}`);
          if (!rows.length) return json({ error: { message: "Not found" } }, 404, env, requestOrigin);
          return json({ records: [rowToRecord(rows[0])] }, 200, env, requestOrigin);
        }
        const rows = await sbFetch(env, `/reservations?order=created_at.desc`);
        return json({ records: rows.map(rowToRecord) }, 200, env, requestOrigin);
      }

      if (url.pathname === "/api/reservations" && method === "POST") {
        const body   = await request.json().catch(() => ({}));
        const fields = body?.fields;
        if (!fields) return json({ error: { message: "{ fields } requis" } }, 400, env, requestOrigin);
        const row = { id: newRecId(), ...fieldsToRow(fields) };
        const result = await sbFetch(env, `/reservations`, {
          method: "POST",
          body: JSON.stringify(row),
        });
        const saved = Array.isArray(result) ? result[0] : result;
        return json(rowToRecord(saved), 201, env, requestOrigin);
      }

      if (url.pathname === "/api/reservations" && method === "PATCH") {
        const body = await request.json().catch(() => ({}));
        if (!body.id || !body.fields) return json({ error: { message: "{ id, fields } requis" } }, 400, env, requestOrigin);
        const row = fieldsToRow(body.fields);
        if (Object.keys(row).length === 0) return json({ error: { message: "Aucun champ valide à mettre à jour" } }, 400, env, requestOrigin);
        const result = await sbFetch(env, `/reservations?id=eq.${encodeURIComponent(body.id)}`, {
          method: "PATCH",
          body: JSON.stringify(row),
        });
        const saved = Array.isArray(result) ? result[0] : result;
        if (!saved) return json({ error: { message: `Record '${body.id}' introuvable` } }, 404, env, requestOrigin);
        return json(rowToRecord(saved), 200, env, requestOrigin);
      }

      if (url.pathname.startsWith("/api/reservations") && method === "DELETE") {
        // 1. Query param (source prioritaire — toujours fiable)
        let id = url.searchParams.get("id");

        // 2. URL path /api/reservations/:id
        if (!id) {
          const parts = url.pathname.split("/").filter(Boolean);
          const lastPart = parts[parts.length - 1];
          if (lastPart && lastPart !== "reservations") id = lastPart;
        }

        // 3. Body JSON — dernier recours (navigateurs peuvent stripper le body sur DELETE)
        if (!id) {
          const body = await request.json().catch(() => ({}));
          id = body.id || null;
        }

        if (!id) return json({ error: { message: "ID requis (?id= en query param)" } }, 400, env, requestOrigin);
        await sbFetch(env, `/reservations?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
        return json({ deleted: true, id }, 200, env, requestOrigin);
      }

      // ── PRICING ────────────────────────────────────────────
      if (url.pathname === "/api/pricing" && method === "GET") {
        const rows = await sbFetch(env, `/politique_tarifaire?order=id.asc`);
        return json({ records: rows.map(pricingRowToRecord) }, 200, env, requestOrigin);
      }

      // ── PLANNING (table dédiée) ────────────────────────────
      if (url.pathname === "/api/planning" && method === "GET") {
        const id   = url.searchParams.get("id");
        const mois = url.searchParams.get("mois");

        if (id) {
          const rows = await sbFetch(env, `/planning?id=eq.${encodeURIComponent(id)}`);
          if (!rows.length) return json({ error: { message: "Not found" } }, 404, env, requestOrigin);
          return json({ record: planningRowToRecord(rows[0]) }, 200, env, requestOrigin);
        }

        let path = `/planning?order=date_arrivee.asc`;
        if (mois && /^\d{4}-\d{2}$/.test(mois)) {
          const [year, month] = mois.split("-").map(Number);
          const firstDay  = `${year}-${String(month).padStart(2,"0")}-01`;
          const nextFirst = new Date(Date.UTC(year, month, 1)).toISOString().split("T")[0];
          path = `/planning?date_arrivee=lt.${nextFirst}&date_depart=gt.${firstDay}&order=date_arrivee.asc`;
        }
        const rows = await sbFetch(env, path);
        return json({ records: rows.map(planningRowToRecord) }, 200, env, requestOrigin);
      }

      if (url.pathname === "/api/planning" && method === "POST") {
        const body = await request.json().catch(() => ({}));
        if (!body.fields) return json({ error: { message: "{ fields } requis" } }, 400, env, requestOrigin);
        const f = body.fields;
        const row = {
          nom:          f['Nom']          || f.nom          || "",
          type:         f['Type']         || f.type         || "",
          logements:    f['Logements']    || f.logements    || [],
          date_arrivee: f['Date arrivée'] || f.date_arrivee || null,
          date_depart:  f['Date départ']  || f.date_depart  || null,
          statut:       f['Statut']       || f.statut       || "Confirmé",
          nb_personnes: parseInt(f['Nb personnes'] || f.nb_personnes || 0, 10) || null,
          montant:      parseFloat(f['Montant'] || f.montant || 0) || null,
          notes:        f['Notes']        || f.notes        || null,
        };
        const result = await sbFetch(env, `/planning`, { method: "POST", body: JSON.stringify(row) });
        const saved = Array.isArray(result) ? result[0] : result;
        if (!saved) return json({ error: { message: "Échec création planning" } }, 500, env, requestOrigin);
        return json({ record: planningRowToRecord(saved) }, 201, env, requestOrigin);
      }

      if (url.pathname === "/api/planning" && method === "PATCH") {
        const body = await request.json().catch(() => ({}));
        if (!body.id || !body.fields) return json({ error: { message: "{ id, fields } requis" } }, 400, env, requestOrigin);
        const f   = body.fields;
        const row = {};
        if (f['Nom']          !== undefined) row.nom          = f['Nom'];
        if (f['Type']         !== undefined) row.type         = f['Type'];
        if (f['Logements']    !== undefined) row.logements    = f['Logements'];
        if (f['Date arrivée'] !== undefined) row.date_arrivee = f['Date arrivée'];
        if (f['Date départ']  !== undefined) row.date_depart  = f['Date départ'];
        if (f['Statut']       !== undefined) row.statut       = f['Statut'];
        if (f['Nb personnes'] !== undefined) row.nb_personnes = parseInt(f['Nb personnes'], 10) || null;
        if (f['Montant']      !== undefined) row.montant      = parseFloat(f['Montant']) || null;
        if (f['Notes']        !== undefined) row.notes        = f['Notes'];
        if (Object.keys(row).length === 0) return json({ error: { message: "Aucun champ valide à mettre à jour" } }, 400, env, requestOrigin);
        const result = await sbFetch(env, `/planning?id=eq.${encodeURIComponent(body.id)}`, {
          method: "PATCH", body: JSON.stringify(row),
        });
        const saved = Array.isArray(result) ? result[0] : result;
        if (!saved) return json({ error: { message: `Planning '${body.id}' introuvable` } }, 404, env, requestOrigin);
        return json({ record: planningRowToRecord(saved) }, 200, env, requestOrigin);
      }

      if (url.pathname === "/api/planning" && method === "DELETE") {
        const id = url.searchParams.get("id");
        if (!id) return json({ error: { message: "?id= requis" } }, 400, env, requestOrigin);
        await sbFetch(env, `/planning?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
        return json({ deleted: true, id }, 200, env, requestOrigin);
      }

      // ── LIBRARY ────────────────────────────────────────────
      if (url.pathname === "/api/library" && method === "GET") {
        const rows = await sbFetch(env, `/bibliotheque_prestations?order=id.asc`);
        return json({ records: rows.map(libraryRowToRecord) }, 200, env, requestOrigin);
      }

      if (url.pathname === "/api/library" && method === "POST") {
        const body = await request.json().catch(() => ({}));
        if (!body.fields) return json({ error: { message: "{ fields } requis" } }, 400, env, requestOrigin);
        const f = body.fields;
        const row = {
          nom:         f.Nom         || f.nom         || "",
          description: f.Description || f.description || "",
          categorie:   f.Catégorie   || f.categorie   || "",
          prix_ht:     f['Prix HT']  || f.prix_ht     || 0,
          tva:         f.TVA         || f.tva         || "10%",
          actif:       f.Actif !== undefined ? f.Actif : true,
        };
        const result = await sbFetch(env, `/bibliotheque_prestations`, { method: "POST", body: JSON.stringify(row) });
        const saved = Array.isArray(result) ? result[0] : result;
        if (!saved) return json({ error: { message: "Échec création bibliothèque" } }, 500, env, requestOrigin);
        return json(libraryRowToRecord(saved), 201, env, requestOrigin);
      }

      if (url.pathname === "/api/library" && method === "PATCH") {
        const body = await request.json().catch(() => ({}));
        if (!body.id || !body.fields) return json({ error: { message: "{ id, fields } requis" } }, 400, env, requestOrigin);
        const numId = String(body.id).replace(/^lib_/, '');
        const f = body.fields;
        const row = {};
        if (f.Nom         !== undefined) row.nom         = f.Nom;
        if (f.Description !== undefined) row.description = f.Description;
        if (f.Catégorie   !== undefined) row.categorie   = f.Catégorie;
        if (f['Prix HT']  !== undefined) row.prix_ht     = f['Prix HT'];
        if (f.TVA         !== undefined) row.tva         = f.TVA;
        if (f.Actif       !== undefined) row.actif       = f.Actif;
        const result = await sbFetch(env, `/bibliotheque_prestations?id=eq.${numId}`, {
          method: "PATCH", body: JSON.stringify(row),
        });
        const saved = Array.isArray(result) ? result[0] : result;
        if (!saved) return json({ error: { message: `Item '${body.id}' introuvable` } }, 404, env, requestOrigin);
        return json(libraryRowToRecord(saved), 200, env, requestOrigin);
      }

      if (url.pathname === "/api/library" && method === "DELETE") {
        const body = await request.json().catch(() => ({}));
        const rawId = body.id || url.searchParams.get("id");
        if (!rawId) return json({ error: { message: "ID requis" } }, 400, env, requestOrigin);
        const numId = String(rawId).replace(/^lib_/, '');
        await sbFetch(env, `/bibliotheque_prestations?id=eq.${numId}`, { method: "DELETE" });
        return json({ success: true, id: rawId }, 200, env, requestOrigin);
      }

      return json({ error: { message: "Not found" } }, 404, env, requestOrigin);

    } catch (err) {
      return json({ error: { message: String(err.message || err) } }, 500, env, requestOrigin);
    }
  },
};
