# Weekly Report Schema v1.0.0

This document defines the fixed JSON contract for weekly reports.

## File Path
- Runtime output: `data/<season>/weekly_report_<YYYY_WW>.json`
- Mock sample: `public/data/mockup/weekly_report_2026_W08.json`

## Top-level Fields
- `schema_version` (string): fixed schema version, e.g. `"1.0.0"`
- `report_type` (string): `"weekly"`
- `week_id` (string): ISO week id, e.g. `"2026-W08"`
- `timezone` (string): `"Asia/Seoul"`
- `window_start` (string, ISO8601)
- `window_end` (string, ISO8601)
- `generated_at` (string, ISO8601)
- `policy` (object)
- `weekly_kings` (object)
- `value_buckets` (array)
- `quality` (object)

## Numeric/Null Rules
- Store calculation values as numbers only.
- Do not store percent with `%` suffix. Use numeric percent values.
- Store squad value as KRW integer (not `"123조"` strings).
- Missing/unavailable values must be `null`.
- Use `0` only when the real value is zero.

## Policy Rules (Approved)
- Weekly window: Thursday `05:00:00` to next Thursday `04:59:59` (KST)
- Batch target run: Thursday `05:05` (after Thursday crawl completion)
- If a weekly range crosses seasons: split by season and aggregate.
- If cumulative values reset (`end < start`): treat as new-season reset.
- Missing data: `imputation = none`, boundary points required.
- Weekly kings minimum sample: `min_weekly_games = 500`
- This policy is weekly-report only; season king logic remains unchanged.

## Weekly Kings Object
Each king entry uses this shape:

```json
{
  "player_id": "1374062161",
  "manager_name": "ES맨유",
  "weekly_games_delta": 612,
  "metric_value": 1680,
  "eligible": true
}
```

If there is no eligible candidate, use `null`.

## Value Bucket Object
Each bucket entry uses this shape:

```json
{
  "bucket_id": "100_200_jo",
  "label": "100조~200조",
  "min_value_krw": 100000000000000,
  "max_value_krw": 200000000000000,
  "samples": 34,
  "avg_weekly_mining_delta": 512.4,
  "avg_weekly_win_rate": 51.8
}
```

## Versioning Rule
- Backward-compatible additions: patch/minor updates under major `1`.
- Breaking field changes (rename/remove/meaning change): increment major version.
