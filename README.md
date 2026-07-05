# Vessel Tuner

Vessel Tuner is a single Cloudflare Worker that scans a fleet of Workers from the outside, scoring each on GitHub repository health, fetch latency, bundle size, the presence of a `vessel.json` spec, and basic security header patterns (CSP and X-Frame-Options / frame-ancestors). It stores only the most recent scan result in Cloudflare KV and serves a small HTML dashboard.

**Live Example:** [vessel-tuner.casey-digennaro.workers.dev](https://vessel-tuner.casey-digennaro.workers.dev)

## Quick Start

1.  **Fork** this repository.
2.  Run `npm install` and `npm test` to verify the local harness.
3.  Deploy to Cloudflare Workers with `wrangler deploy`.
4.  Configure your fleet without editing source code by setting Worker vars (in `wrangler.toml` or via the Cloudflare dashboard):
    -   `VESSEL_LIST` — comma-separated vessel names to scan.
    -   `PRIORITY_VESSEL_LIST` — comma-separated subset used by the "Priority 10 Only" scan.
    -   `GITHUB_ORG` — GitHub organization or user that owns the repositories (default: `Lucineer`).
    -   `DOMAIN_SUFFIX` — domain suffix used to build live URLs (default: `casey-digennaro.workers.dev`).
5.  Visit `/` to open the dashboard and hit **Scan Fleet**.

## Demo

```bash
# Run the test harness locally
npm install
npm test

# Deploy
wrangler deploy

# Health check
curl https://<your-worker>.workers.dev/health

# Scan a single vessel
curl "https://<your-worker>.workers.dev/api/vessel?name=<vessel-name>"

# Scan the full fleet
curl https://<your-worker>.workers.dev/api/scan

# Retrieve the most recent stored scan
curl https://<your-worker>.workers.dev/api/scan/latest
```

## What it does

-   Fetches each vessel's `src/worker.ts` and `vessel.json` from GitHub, trying `master` then `main`.
-   Scans vessels in batches of 5 to stay within the Cloudflare Workers free-tier subrequest limit.
-   Scores each vessel 0–100 based on health, latency, bundle size, spec compliance, and security patterns.
-   Aggregates the most common issues across the fleet.
-   Stores only the latest scan result in KV (`latest_scan`).

## What it does not do

-   It does not retain a history of scans; only the most recent result is kept in KV.
-   It does not perform an HSTS header check.
-   It does not measure latency from multiple global regions — latency is measured from the single Cloudflare region where the Worker runs.
-   It does not bypass GitHub rate limits; frequent scans of many repositories may need a token.

<div style="text-align:center;padding:16px;color:#64748b;font-size:.8rem"><a href="https://the-fleet.casey-digennaro.workers.dev" style="color:#64748b">The Fleet</a> &middot; <a href="https://cocapn.ai" style="color:#64748b">Cocapn</a></div>
