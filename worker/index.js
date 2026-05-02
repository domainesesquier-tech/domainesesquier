function corsHeaders(env) {
  // Ultra permissive CORS for debugging
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400",
  };
}

function json(body, status = 200, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(env),
    },
  });
}

function buildAirtableUrl(env, tableName, query = "") {
  const base = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`;
  return query ? `${base}?${query}` : base;
}

async function airtableRequest(env, url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.error) {
    const msg = payload?.error?.message || `Airtable error (${res.status})`;
    throw new Error(msg);
  }
  return payload;
}

async function fetchAllRecords(env, tableName, queryParams = "") {
  const records = [];
  let offset = null;

  while (true) {
    const params = new URLSearchParams(queryParams);
    if (offset) params.set("offset", offset);

    const page = await airtableRequest(env, buildAirtableUrl(env, tableName, params.toString()));
    if (Array.isArray(page.records)) records.push(...page.records);
    if (!page.offset) break;
    offset = page.offset;
  }

  return records;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (!env.AIRTABLE_TOKEN) {
      return json({ error: { message: "AIRTABLE_TOKEN missing in Worker secrets." } }, 500, env);
    }

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    try {
      if (url.pathname === "/api/health" && method === "GET") {
        return json({ ok: true }, 200, env);
      }

      if (url.pathname === "/api/reservations" && method === "GET") {
        const id = url.searchParams.get("id");
        if (id) {
          const record = await airtableRequest(env, `${buildAirtableUrl(env, env.AIRTABLE_RESERVATIONS_TABLE)}/${id}`);
          return json({ records: [record] }, 200, env);
        }

        const formula = "AND({Date arrivée}, {Date départ})";
        const records = await fetchAllRecords(
          env,
          env.AIRTABLE_RESERVATIONS_TABLE,
          `filterByFormula=${encodeURIComponent(formula)}`
        );
        return json({ records }, 200, env);
      }

      if (url.pathname === "/api/pricing" && method === "GET") {
        const records = await fetchAllRecords(env, env.AIRTABLE_PRICING_TABLE);
        return json({ records }, 200, env);
      }

      if (url.pathname === "/api/reservations" && method === "POST") {
        const body = await request.json().catch(() => ({}));
        const fields = body && typeof body.fields === "object" ? body.fields : null;
        if (!fields) return json({ error: { message: "Invalid payload: expected { fields }." } }, 400, env);

        const result = await airtableRequest(env, buildAirtableUrl(env, env.AIRTABLE_RESERVATIONS_TABLE), {
          method: "POST",
          body: JSON.stringify({ fields, typecast: true }),
        });
        return json(result, 201, env);
      }

      if (url.pathname === "/api/reservations" && method === "PATCH") {
        const body = await request.json().catch(() => ({}));
        const recordId = body.id;
        const fields = body.fields;
        if (!recordId || !fields) return json({ error: { message: "Invalid payload: expected { id, fields }." } }, 400, env);

        const result = await airtableRequest(env, `${buildAirtableUrl(env, env.AIRTABLE_RESERVATIONS_TABLE)}/${recordId}`, {
          method: "PATCH",
          body: JSON.stringify({ fields, typecast: true }),
        });
        return json(result, 200, env);
      }

      if (url.pathname.startsWith("/api/reservations") && method === "DELETE") {
        // Try to get ID from URL path first (e.g., /api/reservations/rec123)
        let recordId = url.pathname.split("/").pop();
        
        // If the last part is "reservations", it means no ID was in path, check body
        if (recordId === "reservations") {
            const body = await request.json().catch(() => ({}));
            recordId = body.id;
        }

        if (!recordId) return json({ error: { message: "Invalid payload: expected ID in URL or body { id }." } }, 400, env);

        const result = await airtableRequest(env, `${buildAirtableUrl(env, env.AIRTABLE_RESERVATIONS_TABLE)}/${recordId}`, {
          method: "DELETE"
        });
        return json({ success: true, id: recordId, result }, 200, env);
      }

      return json({ error: { message: "Not found" } }, 404, env);
    } catch (error) {
      return json({ error: { message: String(error.message || error) } }, 500, env);
    }
  },
};
