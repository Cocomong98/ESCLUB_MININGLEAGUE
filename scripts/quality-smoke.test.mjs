import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const root = new URL("../", import.meta.url);
const file = (path) => new URL(path, root);

test("season configuration has one canonical current season", () => {
  const config = readJson(file("public/season_config.json"));
  assert.ok(config.current_season);
  assert.ok(Array.isArray(config.seasons));
  assert.ok(config.seasons.includes(config.current_season));
  assert.equal(existsSync(file("config/season_config.json")), false);
});

test("current season summary uses internally consistent match counts", () => {
  const config = readJson(file("public/season_config.json"));
  const summary = readJson(
    file(`public/data/${config.current_season}/current_crawl_display_data.json`),
  );
  assert.ok(Array.isArray(summary.results));
  for (const row of summary.results) {
    const games = Number(row.판수 ?? 0);
    const resultTotal = Number(row.승 ?? 0) + Number(row.무 ?? 0) + Number(row.패 ?? 0);
    assert.equal(games, resultTotal, `${row.구단주명 ?? row.player_id} 판수 불일치`);
  }
});

test("runtime deployment files keep the cache on the persistent volume", () => {
  const compose = readFileSync(file("docker-compose.yaml"), "utf8");
  const cache = readFileSync(file("backend/fconline_openapi/cache.py"), "utf8");
  const ignore = readFileSync(file(".dockerignore"), "utf8");
  assert.match(compose, /OPENAPI_CACHE_DIR:\s*\/app\/\.private\/openapi_cache/);
  assert.match(cache, /parents\[2\]/);
  assert.match(ignore, /\*\*\/\.private\/\*\*/);
});

test("production backend and scheduler are separate processes", () => {
  const supervisor = readFileSync(file("docker/supervisord.conf"), "utf8");
  assert.match(supervisor, /gunicorn/);
  assert.match(supervisor, /app\.py scheduler/);
});

test("required route and evaluation documents exist", () => {
  for (const path of [
    "src/routes/tables.tsx",
    "src/routes/dashboard.$id.squad.tsx",
    "docs/evaluation/RUBRIC.md",
    "docs/evaluation/TEST_SCENARIOS.md",
  ]) {
    assert.equal(existsSync(file(path)), true, path);
  }
});
