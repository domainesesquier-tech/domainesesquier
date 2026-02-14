# Deploy Cloudflare Worker (Secure Airtable)

## 1) Install and login
```bash
npm i -g wrangler
wrangler login
```

## 2) Go to repo folder
```bash
cd "/Users/waelsmali/Documents/New project/domainesesquier"
```

## 3) Set Airtable token as secret (never commit this)
```bash
wrangler secret put AIRTABLE_TOKEN
```

## 4) Deploy Worker
```bash
wrangler deploy
```

After deploy you get a URL like:
`https://domainesesquier-api.<subdomain>.workers.dev`

## 5) Connect frontend to Worker
Before loading the main script in your HTML page, define:

```html
<script>
  window.CONFIGURATEUR_API_BASE = "https://domainesesquier-api.<subdomain>.workers.dev";
</script>
```

If your HTML is served from the same domain as the Worker route, you can skip this and keep relative `/api/...`.

## 6) Lock CORS (recommended)
Edit `wrangler.toml`:
```toml
ALLOWED_ORIGIN = "https://ton-domaine.com"
```
Then redeploy:
```bash
wrangler deploy
```

## 7) Test endpoints
```bash
curl "https://domainesesquier-api.<subdomain>.workers.dev/api/health"
curl "https://domainesesquier-api.<subdomain>.workers.dev/api/pricing"
curl "https://domainesesquier-api.<subdomain>.workers.dev/api/reservations"
```
