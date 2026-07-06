# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

This repository has no git tags yet. The `1.0.0` entry below documents the
real commit history that led to the current state of the codebase; the
`1.0.0` version matches the version declared in `package.json` and
`vessel.json`. vessel-tuner is a private Cloudflare Worker (not published to
npm), so the package version is internal only and was not checked against the
npm registry.

## [Unreleased]

No changes since the `1.0.0` grouping below.

## [1.0.0] - 2026-07-06

Initial release of the Vessel Tuner Worker: an outside-in fleet scanner that
scores each vessel on repository reachability, source size, `vessel.json`
compliance, and security-header source patterns, stores the latest scan in KV,
and serves an HTML dashboard.

### Added
- Core Cloudflare Worker (`src/worker.ts`) that scans a configured fleet of Workers, computes a weighted 0–100 score per vessel, aggregates the top fleet issues, writes the latest result to the `TUNER_KV` namespace, and serves a small HTML dashboard plus `/health`, `/vessel.json`, `/api/scan`, `/api/scan?priority=true`, `/api/scan/latest`, and `/api/vessel?name=` endpoints. ([353b85f])
- MIT license. ([41bfbda])
- Vitest test harness with TypeScript configuration and tests covering health scoring, vessel metadata validation, configurable org/domain, `master`→`main` fallback, priority scans, and latest-scan KV storage. ([ddb2904])
- GitHub Actions CI workflow (`test` job) running `typecheck` and `npm test` on push to `master`/`main`/`polish/**` and on pull requests to `master`/`main`. ([ddb2904])
- `CLAUDE.md` specialist/shipwright operations document (deploy, endpoints, recovery, refactoring guardrails). ([6d969f3])
- README documenting endpoints, the scoring rubric, env-var configuration, and current limitations. ([e73cdd5], [ddb2904], [ac7748b])

### Changed
- Scanner now reads each vessel's source from `raw.githubusercontent.com` (trying `master` then `main`) instead of fetching the vessel's live `/health`, landing page, and `/vessel.json` endpoints, to work around Cloudflare error 1042 (a Worker cannot `fetch` a sibling Worker on the same `workers.dev` subdomain). Latency is now measured against the GitHub raw fetch rather than the live endpoint. ([8736735])
- Fleet configuration (`VESSEL_LIST`, `PRIORITY_VESSEL_LIST`, `GITHUB_ORG`, `DOMAIN_SUFFIX`) is now read from Worker env vars, with the existing hard-coded fleet kept as defaults. ([ddb2904])
- Security-pattern detection (`content-security-policy`, `x-frame-options`, `frame-ancestors`) is now case-insensitive via a lower-cased comparison, and `frame-ancestors` is recognized as a `X-Frame-Options` equivalent. ([3b54cf0])
- Configured the `TUNER_KV` namespace id in `wrangler.toml`. ([5e28ff9])

### Fixed
- Discarded fallback-fetch bug: the `master`→`main` branch-fallback responses were being fetched but their bodies thrown away; the fallback response is now captured and used. ([ddb2904])
- Removed phantom (non-deployed) repositories from the default scan list so only deployed vessels are scanned. ([1ef1049])
- Corrected a stale repository reference in `CLAUDE.md` (`github.com/Lucineer/vessel-tuner` → `github.com/purplepincher/vessel-tuner`). ([77e32b5])
- Removed a stale hard-coded vessel count (`"Scanning 90 vessels..."`) from the dashboard status text that no longer matched the size of `DEFAULT_VESSELS`; the real count is already shown once results load. ([e0680a0])

[Unreleased]: https://github.com/purplepincher/vessel-tuner/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/purplepincher/vessel-tuner/releases/tag/v1.0.0

<!-- Commit references (grouped release of untagged history; no tag exists yet) -->
[353b85f]: https://github.com/purplepincher/vessel-tuner/commit/353b85f
[5e28ff9]: https://github.com/purplepincher/vessel-tuner/commit/5e28ff9
[8736735]: https://github.com/purplepincher/vessel-tuner/commit/8736735
[3b54cf0]: https://github.com/purplepincher/vessel-tuner/commit/3b54cf0
[1ef1049]: https://github.com/purplepincher/vessel-tuner/commit/1ef1049
[e73cdd5]: https://github.com/purplepincher/vessel-tuner/commit/e73cdd5
[6d969f3]: https://github.com/purplepincher/vessel-tuner/commit/6d969f3
[41bfbda]: https://github.com/purplepincher/vessel-tuner/commit/41bfbda
[ddb2904]: https://github.com/purplepincher/vessel-tuner/commit/ddb2904
[77e32b5]: https://github.com/purplepincher/vessel-tuner/commit/77e32b5
[ac7748b]: https://github.com/purplepincher/vessel-tuner/commit/ac7748b
[e0680a0]: https://github.com/purplepincher/vessel-tuner/commit/e0680a0
