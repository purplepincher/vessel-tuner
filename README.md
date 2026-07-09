# Vessel Tuner

A single Cloudflare Worker that scans a fleet of Workers from the outside, scores each one on repository health, source size, `vessel.json` spec compliance, and security-header patterns, stores only the latest result in Cloudflare KV, and serves a small HTML dashboard.

**Live example:** [vessel-tuner.casey-digennaro.workers.dev](https://vessel-tuner.casey-digennaro.workers.dev)

## Status & capabilities

Verified by reading `src/worker.ts` (the entire Worker is one 242-line file),
running `npm test` (6/6 passing) and `npm run typecheck`, and tracing each
endpoint's code path.

- ✅ **Six route handlers, all real today:** `GET /` (HTML dashboard),
  `GET /health`, `GET /vessel.json`, `GET /api/scan` (with optional
  `?priority=true`), `GET /api/scan/latest`, `GET /api/vessel?name=…`.
- ✅ **5-signal scoring** (health, latency, size, vessel.json, security
  patterns), weighted 0–100 and banded pass/warn/fail — rubric matches the code
  exactly (see below).
- ✅ **KV persistence of the latest scan** under key `latest_scan` (overwrites;
  see limitations).
- ✅ **`master` → `main` branch fallback** when fetching repo files from GitHub.
- ✅ **Batched scanning** (5 vessels per `Promise.all`) to stay within the
  Cloudflare free-tier subrequest limit.
- ✅ **Inline HTML dashboard** with sort/top-issues; zero runtime dependencies
  (`package.json` has only dev deps).
- ⚠️ **Repo-scanned, not live-probed:** the tuner reads `src/worker.ts` and
  `vessel.json` from `raw.githubusercontent.com` — it does **not** fetch the
  deployed Worker endpoints (see the error-1042 note below).
- ⚠️ **Latency = GitHub fetch latency**, not the vessel's live HTTP latency.
- ⚠️ **Security checks are source-string greps** inside `worker.ts`
  (`content-security-policy`, `x-frame-options`, `frame-ancestors`), not live
  HTTP response-header inspections.
- ⚠️ **Anonymous GitHub fetches** — subject to unauthenticated rate limits.

### What it does NOT do (yet)

- 🔮 **No scan history.** Only the most recent scan is kept in KV; there's no
  time series or trend view.
- 🔮 **No live HTTP probing / multi-region latency.** Latency is from the single
  Cloudflare region running the Worker, measured against GitHub raw.
- 🔮 **No real security-header audit, no HSTS check, no TLS/dependency scan.**
- 🔮 **No GitHub auth token passed** — large/frequent fleets may hit rate limits.
- 🔮 **No alerting or scheduling** — scans run only when an operator hits an
  endpoint (the dashboard button just calls `/api/scan`).

See **Limitations** below for the longer-form caveats.

## Quickstart

```bash
git clone https://github.com/purplepincher/vessel-tuner.git
cd vessel-tuner
npm install
npm test
npx wrangler deploy
```

Then open `https://<your-worker>.workers.dev/` and click **Scan Fleet**.

The dashboard calls `/api/scan` and displays the full fleet table, or `/api/scan?priority=true` for the priority list.

## Usage

Run the test harness:

```bash
npm test
```

```
✓ src/worker.test.ts (6 tests) 21ms

Test Files  1 passed (1)
     Tests  6 passed (6)
```

Health check:

```bash
curl https://vessel-tuner.casey-digennaro.workers.dev/health
```

```json
{"status":"ok","vessel":"vessel-tuner"}
```

Scan a single vessel:

```bash
curl "https://vessel-tuner.casey-digennaro.workers.dev/api/vessel?name=vessel-tuner"
```

```json
{
  "name": "vessel-tuner",
  "url": "https://vessel-tuner.casey-digennaro.workers.dev",
  "health": 200,
  "latency": 140,
  "size": 15875,
  "hasVesselJson": true,
  "hasCsp": true,
  "hasSecurity": true,
  "score": 98,
  "issues": ["vessel.json missing capabilities"],
  "ts": "2026-07-06T19:39:53.542Z"
}
```

Scan the full fleet:

```bash
curl https://vessel-tuner.casey-digennaro.workers.dev/api/scan
```

Scan only the priority vessels:

```bash
curl "https://vessel-tuner.casey-digennaro.workers.dev/api/scan?priority=true"
```

Retrieve the most recently stored scan:

```bash
curl https://vessel-tuner.casey-digennaro.workers.dev/api/scan/latest
```

## How it works

Everything lives in `src/worker.ts`.

- `GET /` returns a small HTML dashboard that fetches `/api/scan` and renders the results.
- `GET /health` returns a liveness JSON payload.
- `GET /vessel.json` returns the worker's own fleet metadata.
- `GET /api/scan` scans every configured vessel in batches of 5 (the size keeps the Worker inside the Cloudflare free-tier subrequest limit).
- `GET /api/scan?priority=true` scans only the priority list.
- `GET /api/scan/latest` returns the last stored scan from KV.
- `GET /api/vessel?name=<vessel-name>` scans one vessel on demand.

For each vessel the worker tries `master` then `main` on `raw.githubusercontent.com` and pulls `src/worker.ts` and `vessel.json`. From the fetched files it records:

- **health** — the HTTP status of the `src/worker.ts` fetch (`200` if found, `404` if not).
- **latency** — milliseconds to fetch `src/worker.ts` from GitHub raw. This is *not* the vessel's live HTTP latency: a Worker cannot directly fetch a sibling Worker on the same `workers.dev` subdomain (Cloudflare error 1042), so the tuner fetches the source from GitHub instead and times that.
- **size** — byte length of `src/worker.ts` (the source file, not a built bundle).
- **hasVesselJson** — whether a `vessel.json` exists and parses as JSON. Missing `name` or `capabilities` only adds an issue (`vessel.json missing name` / `…missing capabilities`); it does **not** flip this flag to false. So a vessel can report `hasVesselJson: true` while still being dinged for a missing `capabilities` field.
- **security patterns** — whether the `worker.ts` source contains the strings `content-security-policy`, `x-frame-options`, or `frame-ancestors`. This is a source-code grep, not a live HTTP-header inspection.

It then computes a weighted score (rubric below), aggregates the top issues across the fleet, and writes the full result to KV under `latest_scan`, overwriting any previous scan.

### Scoring rubric

| Signal | Points |
| --- | --- |
| `src/worker.ts` reachable on GitHub | +30 (or +10 for any other HTTP response) |
| Latency `< 200 / < 500 / < 1000 / < 5000` ms | +25 / +18 / +10 / +5 |
| Size `100 B–100 KB` (or `100–200 KB`) | +15 (or +8) |
| `vessel.json` present | +15 |
| CSP pattern in source | +10 |
| `X-Frame-Options` / `frame-ancestors` in source | +5 |
| Each issue flagged | −2 |

The score is clamped to `0–100`. The dashboard bands them as pass (`≥ 85`), warn (`70–84`), and fail (`< 70`).

## Configuration

Set these through `wrangler.toml` `[vars]` or the Cloudflare dashboard:

| Variable | Default | Purpose |
|----------|---------|---------|
| `VESSEL_LIST` | Hard-coded list of 64 vessel names in `src/worker.ts` | Comma-separated fleet to scan. |
| `PRIORITY_VESSEL_LIST` | Hard-coded list of 10 vessel names in `src/worker.ts` | Comma-separated subset for `/api/scan?priority=true`. |
| `GITHUB_ORG` | `Lucineer` | GitHub organization or user that owns the repositories. |
| `DOMAIN_SUFFIX` | `casey-digennaro.workers.dev` | Domain suffix used to build live vessel URLs. |

The KV namespace binding `TUNER_KV` is required for `/api/scan`, `/api/scan?priority=true`, and `/api/scan/latest`. It is already declared in `wrangler.toml`.

## Limitations

- Only the most recent scan is kept in KV; there is no history.
- Security checks are source-level string matches inside `src/worker.ts`, not live HTTP response header checks. There is no HSTS check.
- Latency is measured from the single Cloudflare region where the Worker runs, not from multiple global regions.
- The scanner reads repository files from GitHub, not the deployed Worker endpoints.
- Fetches are anonymous and subject to GitHub's unauthenticated rate limits; frequent scans of many repositories may need a token, which the Worker does not currently pass.

## License

MIT — see [LICENSE](./LICENSE). Operational notes (deploy, endpoints, recovery, refactoring guardrails) are in [CLAUDE.md](./CLAUDE.md).

---

[The Fleet](https://the-fleet.casey-digennaro.workers.dev) · [Cocapn](https://cocapn.ai)
