# Security Notes

## Container Runtime
- Do not run this service with `privileged: true`.
- Use the provided `deploy/docker-compose.example.yaml` as baseline and keep least-privilege defaults.

## Secret Management
- Never commit `.env` files or API keys.
- Keep `NEXON_OPEN_API_KEY`, `ADMIN_PASSWORD`, and `FLASK_SECRET_KEY` only in runtime secrets/env.

## OpenAPI Cache Placement
- OpenAPI raw cache must be private and must not be served via `/data/*`.
- Use `OPENAPI_CACHE_DIR` and mount it to a private host path/volume.
- Recommended: mount a separate private volume outside `/app/data`.

## CSP Hardening Rollout
- For staged CSP migration plan and operational impact, see:
  - `docs/csp_hardening_rollout.md`
- Runtime toggle:
  - `CSP_REPORT_ONLY=1` enables report-only header for dry-run verification.

## 30-Day Refresh Obligation
- Nexon Open API crawled payloads must be refreshed or removed within 30 days.
- Current policy:
  - Default: purge stale cache older than 29 days.
  - Optional: enable budgeted refresh with `OPENAPI_REFRESH_STALE=1`.
  - Refresh budget: `OPENAPI_REFRESH_BUDGET_PER_RUN` (default `200`).
