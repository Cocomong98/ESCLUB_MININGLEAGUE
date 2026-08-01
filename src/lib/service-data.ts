import {
  formatSeasonLabel,
  RANKINGS,
  SEASONS,
  toRankingView,
  type MatchResult,
  type SeasonId,
} from "./mockData";

export interface ServiceSeasonConfig {
  current_season: string;
  seasons: string[];
  season_ranges?: Record<
    string,
    {
      startDate: string;
      startTime: string;
      endDate: string;
      endTime: string;
    }
  >;
}

export interface ServiceRankingRaw {
  name?: string;
  player_id?: string;
  구단주명?: string;
  승?: number;
  무?: number;
  패?: number;
  판수?: number;
  누적채굴량?: number;
  "전일 대비 채굴량"?: number;
  "채굴 효율"?: number;
  승률?: string;
  "최근 매치 티어"?: string;
  "최근 매치 티어 코드"?: string;
  "최근 매치 티어 이미지"?: string;
  "현재 티어"?: string;
  "현재 티어 코드"?: string;
  "현재 티어 이미지"?: string;
  "구단 가치"?: string;
  비고?: string;
  "지난 시즌 승"?: number;
  "지난 시즌 무"?: number;
  "지난 시즌 패"?: number;
  "지난 시즌 판수"?: number;
  "지난 시즌 누적채굴량"?: number;
  "지난 시즌 채굴 효율"?: number;
  "지난 시즌 승률"?: string;
  성장력?: number;
  crawl_time?: string;
  순위?: number;
}

export interface ServiceRankingPayload {
  results?: ServiceRankingRaw[];
  last_updated?: string;
  mining_king?: ServiceRankingRaw;
  win_rate_king?: ServiceRankingRaw;
  game_count_king?: ServiceRankingRaw;
  draw_king?: ServiceRankingRaw;
}

export interface RankingView {
  rank: number;
  unranked: boolean;
  id: string;
  name: string;
  gp: number;
  w: number;
  d: number;
  l: number;
  gd: number;
  gf: number;
  ga: number;
  pts: number;
  miningPower: number;
  growth: number | null;
  clubValue: string | null;
  clubValueSource?: "crawl" | "recent-match";
  tierName: string | null;
  tierCode: string | null;
  tierImage: string | null;
  winRate: number | null;
  form: MatchResult[];
  delta: number | null;
}

export interface RankingData {
  rows: RankingView[];
  source: string;
  lastUpdated?: string;
  kings?: {
    mining?: ServiceRankingRaw;
    winRate?: ServiceRankingRaw;
    gameCount?: ServiceRankingRaw;
    draw?: ServiceRankingRaw;
  };
}

const DIVISION_NAME_FALLBACK: Record<string, string> = {
  "1700": "마스터1",
  "1800": "마스터2",
  "1900": "마스터3",
};
const DIVISION_IMAGE_INDEX: Record<string, number> = {
  "800": 0,
  "900": 1,
  "1000": 2,
  "1100": 3,
  "1200": 4,
  "1300": 5,
  "1400": 6,
  "1500": 7,
  "1600": 8,
  "1700": 6,
  "1800": 7,
  "1900": 8,
  "2000": 9,
  "2100": 10,
  "2200": 11,
  "2300": 12,
  "2400": 13,
  "2500": 14,
  "2600": 15,
  "2700": 16,
  "2800": 17,
  "2900": 18,
  "3000": 19,
  "3100": 20,
};

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const next = value.trim();
  return next.length > 0 ? next : null;
}

export function divisionImageFromCode(code: string | number | null | undefined): string | null {
  if (typeof code === "number") code = String(code);
  if (!code) return null;
  const imageIndex = DIVISION_IMAGE_INDEX[code];
  if (imageIndex === undefined) return null;
  return `https://ssl.nexon.com/s2/game/fo4/obt/rank/large/update_2026/ico_rank${imageIndex}.png`;
}

export function divisionNameFromCode(code: string | number | null | undefined): string | null {
  if (typeof code === "number") code = String(code);
  if (!code) return null;
  return DIVISION_NAME_FALLBACK[code] ?? null;
}

export interface OwnerHistoryPoint {
  date: string;
  label: string;
  row: ServiceRankingRaw | null;
}

export interface OwnerHistoryData {
  points: OwnerHistoryPoint[];
  validPoints: OwnerHistoryPoint[];
  latest: ServiceRankingRaw | null;
  previous: ServiceRankingRaw | null;
  source: string;
  status: "daily" | "ranking-fallback" | "missing";
}

export interface SeasonManifest {
  endDate?: string;
  endDateTime?: string;
}

export interface OpenApiSquadPlayer {
  playerKey?: string;
  spId?: number;
  seasonId?: number;
  seasonName?: string;
  seasonImg?: string;
  name?: string;
  playerName?: string;
  position?: string;
  spPosition?: number;
  positionName?: string;
  appearances?: number;
  record?: string;
  winRate?: number;
  playerWinRate?: number;
  attackPower?: number;
  defensePower?: number;
  attackPoint?: number;
  goal?: number;
  assist?: number;
  passSuccessRate?: number;
  dribbleSuccessRate?: number;
  interceptPerGame?: number;
  aerialSuccessRate?: number;
  tackleSuccessRate?: number;
  savePerGame?: number;
  shotDefenseRate?: number;
  avgRating?: number;
}

export interface OpenApiSquadAnalysis {
  generatedAt?: string;
  player?: {
    playerId?: string;
    nickname?: string;
  };
  summary?: {
    uniquePlayers?: number;
    totalAppearances?: number;
  };
  rows?: OpenApiSquadPlayer[];
}

export interface OpenApiManagerModeAnalysis {
  generatedAt?: string;
  status?: string;
  player?: {
    playerId?: string;
    nickname?: string;
  };
  summary?: {
    sampleSize?: number;
    w?: number;
    d?: number;
    l?: number;
    winRate?: number;
    goalsPerMatch?: number;
    goalsConcededPerMatch?: number;
    shotsPerMatch?: number;
    shotsOnTargetPerMatch?: number;
    averagePossession?: number;
    passSuccessRate?: number;
  };
  expanded?: {
    formationPerformance?: Array<{
      formation?: string;
      label?: string;
      matches?: number;
      w?: number;
      d?: number;
      l?: number;
      winRate?: number;
    }>;
    styleProfile?: {
      primary?: string;
      secondary?: string;
    };
  };
}

export interface OpenApiSquadSnapshot {
  generatedAt?: string;
  squad?: {
    name?: string;
    formation?: string;
    clubValue?: number;
    clubValueText?: string;
    salary?:
      | number
      | {
          current?: number;
          cap?: number;
        };
    playerCount?: number;
  };
  players?: Array<{
    spId?: number;
    name?: string;
    role?: string;
    position?: string;
    pay?: number;
    price?: number;
    priceText?: string;
    order?: number;
    starter?: boolean;
    spGrade?: number;
  }>;
  teamColors?: Array<{
    id?: string;
    group?: string;
    groupLabel?: string;
    level?: number;
    name?: string;
    playerCount?: number;
    image?: string;
    skills?: Array<{
      name?: string;
      amount?: number;
      label?: string;
    }>;
  }>;
}

export interface OpenApiMatchDetails {
  generatedAt?: string;
  rows?: Array<{
    matchKey?: string;
    dateKst?: string;
    result?: string;
    opponent?: {
      nickname?: string;
      score?: number;
      division?: number | null;
      divisionName?: string;
      detail?: OpenApiMatchSideDetail;
    };
    self?: {
      score?: number;
      division?: number | null;
      divisionName?: string;
      possession?: number;
      shots?: number;
      shotsOnTarget?: number;
      detail?: OpenApiMatchSideDetail;
    };
    miningFc?: number;
    miningPolicy?: string;
    miningPolicyKnown?: boolean;
    players?: Array<{
      spId?: number;
      name?: string;
      spPosition?: number;
      positionName?: string;
      spGrade?: number;
      rating?: number;
      goal?: number;
      assist?: number;
      shoot?: number;
      effectiveShoot?: number;
      status?: OpenApiMatchPlayerStatus;
    }>;
    opponentPlayers?: Array<{
      spId?: number;
      name?: string;
      spPosition?: number;
      positionName?: string;
      spGrade?: number;
      rating?: number;
      goal?: number;
      assist?: number;
      shoot?: number;
      effectiveShoot?: number;
      status?: OpenApiMatchPlayerStatus;
    }>;
  }>;
}

export interface OpenApiMatchSideDetail {
  matchEndType?: number;
  controller?: string;
  foul?: number;
  injury?: number;
  redCards?: number;
  yellowCards?: number;
  cornerKick?: number;
  offside?: number;
  passTry?: number;
  passSuccess?: number;
  shortPassTry?: number;
  shortPassSuccess?: number;
  longPassTry?: number;
  longPassSuccess?: number;
  throughPassTry?: number;
  throughPassSuccess?: number;
  blockTry?: number;
  blockSuccess?: number;
  tackleTry?: number;
  tackleSuccess?: number;
  ownGoal?: number;
  shootHeading?: number;
  goalHeading?: number;
  shootInPenalty?: number;
  goalInPenalty?: number;
  shootOutPenalty?: number;
  goalOutPenalty?: number;
}

export interface OpenApiMatchPlayerStatus {
  dribble?: number;
  intercept?: number;
  defending?: number;
  passTry?: number;
  passSuccess?: number;
  dribbleTry?: number;
  dribbleSuccess?: number;
  ballPossessionTry?: number;
  ballPossessionSuccess?: number;
  aerialTry?: number;
  aerialSuccess?: number;
  blockTry?: number;
  block?: number;
  tackleTry?: number;
  tackle?: number;
  yellowCards?: number;
  redCards?: number;
}

export interface OpenApiPlayerClassAnalysis {
  generatedAt?: string;
  classRows?: Array<{
    seasonId?: number;
    seasonName?: string;
    players?: number;
    appearances?: number;
    goals?: number;
    assists?: number;
    attackPoints?: number;
    avgRating?: number;
  }>;
  samePlayerCardComparisons?: Array<Record<string, unknown>>;
}

export interface OpenApiAccountProfile {
  generatedAt?: string;
  status?: string;
  account?: {
    nickname?: string;
    level?: number;
    managerModeBestDivision?: {
      matchType?: number;
      division?: number;
      divisionName?: string;
      achievementDate?: string;
    };
    divisionRows?: Array<{
      matchType?: number;
      division?: number;
      divisionName?: string;
      achievementDate?: string;
    }>;
  };
}

export interface SquadBundle {
  status: "ready" | "partial" | "empty" | "pending";
  squad: OpenApiSquadAnalysis | null;
  manager: OpenApiManagerModeAnalysis | null;
  snapshot: OpenApiSquadSnapshot | null;
  matches: OpenApiMatchDetails | null;
  classes: OpenApiPlayerClassAnalysis | null;
  profile: OpenApiAccountProfile | null;
}

export async function fetchSeasonConfig(): Promise<ServiceSeasonConfig | null> {
  try {
    const response = await fetch("/season_config.json", { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as ServiceSeasonConfig;
  } catch {
    return null;
  }
}

export async function fetchRankingData(season: SeasonId): Promise<RankingData> {
  const source = `/data/${season}/current_crawl_display_data.json`;
  try {
    const response = await fetch(source, { cache: "no-store" });
    if (!response.ok) return fallbackRankingData(season);
    const payload = (await response.json()) as ServiceRankingPayload;
    const previousDateKey = await resolvePreviousDateKey(season);
    const rows = await enrichRowsWithRecentMatchData(
      season,
      normalizeServiceRows(payload.results ?? []),
      previousDateKey,
    );
    const rankedKings = currentSeasonKings(rows);
    return {
      rows,
      source,
      lastUpdated: payload.last_updated,
      kings: rankedKings,
    };
  } catch {
    return fallbackRankingData(season);
  }
}

export async function fetchOwnerHistory(
  season: SeasonId,
  playerId: string,
): Promise<OwnerHistoryData> {
  const config = await fetchSeasonConfig();
  const dates = await resolveHistoryDates(season, config);
  const points = await Promise.all(
    dates.map(async (date) => {
      const source = `/data/${season}/user/${playerId}/${playerId}_${date}.json`;
      try {
        const response = await fetch(source, { cache: "no-store" });
        if (!response.ok) return historyPoint(date, null);
        const payload = (await response.json()) as ServiceRankingRaw[] | ServiceRankingRaw;
        const row = Array.isArray(payload) ? (payload[0] ?? null) : payload;
        return historyPoint(date, row);
      } catch {
        return historyPoint(date, null);
      }
    }),
  );
  const validPoints = points.filter((point) => point.row);

  if (validPoints.length > 0) {
    return {
      points,
      validPoints,
      latest: validPoints.at(-1)?.row ?? null,
      previous: validPoints.length > 1 ? (validPoints.at(-2)?.row ?? null) : null,
      source: `/data/${season}/user/${playerId}/{id}_YYMMDD.json`,
      status: "daily",
    };
  }

  const ranking = await fetchRankingData(season);
  const row = ranking.rows.find((item) => item.id === playerId);
  if (!row) {
    return {
      points,
      validPoints: [],
      latest: null,
      previous: null,
      source: `/data/${season}/user/${playerId}`,
      status: "missing",
    };
  }

  const fallback = rankingViewToRaw(row);
  return {
    points: [historyPoint("ranking", fallback)],
    validPoints: [historyPoint("ranking", fallback)],
    latest: fallback,
    previous: null,
    source: `/data/${season}/current_crawl_display_data.json`,
    status: "ranking-fallback",
  };
}

export async function fetchSquadBundle(season: SeasonId, playerId: string): Promise<SquadBundle> {
  const base = `/data/${season}/user/${playerId}/analysis`;
  const [squad, manager, snapshot, matches, classes, profile] = await Promise.all([
    fetchOptionalJson<OpenApiSquadAnalysis>(`${base}/squad_analysis_all.json`),
    fetchOptionalJson<OpenApiManagerModeAnalysis>(`${base}/manager_mode_analysis.json`),
    fetchOptionalJson<OpenApiSquadSnapshot>(`${base}/squad_snapshot.json`),
    fetchOptionalJson<OpenApiMatchDetails>(`${base}/match_details_last20.json`),
    fetchOptionalJson<OpenApiPlayerClassAnalysis>(`${base}/player_class_analysis.json`),
    fetchOptionalJson<OpenApiAccountProfile>(`${base}/account_profile.json`),
  ]);
  const meaningful = [
    (squad?.rows?.length ?? 0) > 0,
    (manager?.summary?.sampleSize ?? 0) > 0 ||
      (manager?.expanded?.formationPerformance?.length ?? 0) > 0,
    (snapshot?.players?.length ?? 0) > 0,
    (matches?.rows?.length ?? 0) > 0,
    (classes?.classRows?.length ?? 0) > 0,
    Boolean(profile?.account),
  ];
  const readyCount = meaningful.filter(Boolean).length;
  return {
    status: readyCount === 6 ? "ready" : readyCount > 0 ? "partial" : "empty",
    squad,
    manager,
    snapshot,
    matches,
    classes,
    profile,
  };
}

export function metricDiff(
  latest: ServiceRankingRaw | null,
  previous: ServiceRankingRaw | null,
  key: "순위" | "누적채굴량" | "채굴 효율" | "판수",
): number | null {
  if (!latest || !previous) return null;
  const latestValue = numberOr(latest[key], NaN);
  const previousValue = numberOr(previous[key], NaN);
  if (!Number.isFinite(latestValue) || !Number.isFinite(previousValue)) return null;
  if (key === "순위") return previousValue - latestValue;
  return latestValue - previousValue;
}

export function winRateDiff(
  latest: ServiceRankingRaw | null,
  previous: ServiceRankingRaw | null,
): number | null {
  const latestRate = parsePercent(latest?.승률);
  const previousRate = parsePercent(previous?.승률);
  if (latestRate === null || previousRate === null) return null;
  return Math.round((latestRate - previousRate) * 1000) / 10;
}

export function fallbackRankingData(season: SeasonId): RankingData {
  return {
    rows: toRankingView(RANKINGS[season] ?? []).map((row) => ({
      ...row,
      unranked: false,
      miningPower: row.pts,
      growth: row.delta,
      clubValue: null,
      tierName: null,
      tierCode: null,
      tierImage: null,
    })),
    source: `mockData:${season}`,
  };
}

export function normalizeServiceRows(rows: ServiceRankingRaw[]): RankingView[] {
  const normalized = rows.map((row, index) => {
    const w = numberOr(row.승, 0);
    const d = numberOr(row.무, 0);
    const l = numberOr(row.패, 0);
    const gp = numberOr(row.판수, w + d + l);
    const miningPower = numberOr(row.누적채굴량, numberOr(row["채굴 효율"], 0));
    const recentTierCode = cleanText(row["최근 매치 티어 코드"]);
    const recentTierImage = cleanText(row["최근 매치 티어 이미지"]);
    const tierCode = recentTierCode ?? cleanText(row["현재 티어 코드"]);
    const tierName =
      cleanText(row["최근 매치 티어"]) ??
      cleanText(row["현재 티어"]) ??
      divisionNameFromCode(tierCode);
    const tierImage =
      recentTierImage ?? cleanText(row["현재 티어 이미지"]) ?? divisionImageFromCode(tierCode);
    const unranked = gp <= 0 || (!recentTierCode && !recentTierImage);
    return {
      rank: numberOr(row.순위, index + 1),
      unranked,
      id: row.player_id ?? row.name ?? row.구단주명 ?? `row-${index + 1}`,
      name: row.구단주명 ?? row.name ?? row.player_id ?? "UNKNOWN",
      gp,
      w,
      d,
      l,
      gd: 0,
      gf: 0,
      ga: 0,
      pts: miningPower,
      miningPower,
      growth:
        typeof row["전일 대비 채굴량"] === "number"
          ? row["전일 대비 채굴량"]
          : typeof row.성장력 === "number"
            ? row.성장력
            : null,
      clubValue: formatClubValueText(row["구단 가치"]),
      clubValueSource: "crawl",
      tierName,
      tierCode,
      tierImage,
      winRate: parsePercent(row.승률),
      form: [],
      delta: null,
    };
  });

  const ranked = normalized
    .filter((row) => !row.unranked)
    .sort(compareRankingRows)
    .map((row, index) => ({ ...row, rank: index + 1 }));
  const unranked = normalized.filter((row) => row.unranked).sort(compareRankingRows);
  return [...ranked, ...unranked];
}

function compareRankingRows(a: RankingView, b: RankingView): number {
  if (a.unranked !== b.unranked) return a.unranked ? 1 : -1;
  const rankA = Number.isFinite(a.rank) ? a.rank : Number.MAX_SAFE_INTEGER;
  const rankB = Number.isFinite(b.rank) ? b.rank : Number.MAX_SAFE_INTEGER;
  if (rankA !== rankB) return rankA - rankB;
  return b.miningPower - a.miningPower;
}

async function enrichRowsWithRecentMatchData(
  season: SeasonId,
  rows: RankingView[],
  previousDateKey: string | null,
): Promise<RankingView[]> {
  const enriched = await Promise.all(
    rows.map(async (row) => {
      const [recent, previousRank] = await Promise.all([
        fetchRecentMatchData(season, row.id),
        fetchPreviousRank(season, row.id, previousDateKey),
      ]);
      if (!recent && previousRank === null) return row;
      return {
        ...row,
        ...(recent.clubValue
          ? {
              clubValue: recent.clubValue.text,
              clubValueSource: "recent-match" as const,
            }
          : {}),
        form: recent?.form ?? row.form,
        delta: previousRank === null ? null : previousRank - row.rank,
      };
    }),
  );
  return enriched;
}

async function resolvePreviousDateKey(season: SeasonId): Promise<string | null> {
  try {
    const response = await fetch(`/data/${season}/manifest.json`, { cache: "no-store" });
    if (!response.ok) return null;
    const manifest = (await response.json()) as SeasonManifest;
    if (!manifest.endDate) return null;
    return dateKeysFromCompactEndDate(manifest.endDate, 2)[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchPreviousRank(
  season: SeasonId,
  playerId: string,
  dateKey: string | null,
): Promise<number | null> {
  if (!dateKey) return null;
  const payload = await fetchOptionalJson<ServiceRankingRaw[] | ServiceRankingRaw>(
    `/data/${season}/user/${playerId}/${playerId}_${dateKey}.json`,
  );
  const row = Array.isArray(payload) ? payload[0] : payload;
  const rank = row?.순위;
  return typeof rank === "number" && Number.isFinite(rank) ? rank : null;
}

async function fetchRecentMatchData(
  season: SeasonId,
  playerId: string,
): Promise<{
  clubValue: { value: number; text: string } | null;
  form: MatchResult[];
} | null> {
  const base = `/data/${season}/user/${playerId}/analysis`;
  const [snapshot, matches] = await Promise.all([
    fetchOptionalJson<OpenApiSquadSnapshot>(`${base}/squad_snapshot.json`),
    fetchOptionalJson<OpenApiMatchDetails>(`${base}/match_details_last20.json`),
  ]);
  const form = recentFormFromMatches(matches);
  const prices = new Map<string, number>();
  for (const player of snapshot?.players ?? []) {
    const price = numberOr(player.price, 0);
    if (!player.spId || price <= 0) continue;
    prices.set(String(player.spId), price);
    prices.set(String(player.spId % 1_000_000), price);
  }

  const starters = (matches?.rows?.[0]?.players ?? []).filter(
    (player) => player.positionName !== "SUB" && numberOr(player.rating, 0) > 0,
  );
  if (starters.length === 0) return { clubValue: null, form };

  const value = starters.reduce((sum, player) => {
    if (!player.spId) return sum;
    return (
      sum + (prices.get(String(player.spId)) ?? prices.get(String(player.spId % 1_000_000)) ?? 0)
    );
  }, 0);
  return {
    clubValue: value > 0 ? { value, text: formatClubValueFromBp(value) } : null,
    form,
  };
}

function recentFormFromMatches(matches: OpenApiMatchDetails | null): MatchResult[] {
  const resultMap: Record<string, MatchResult> = {
    승: "W",
    무: "D",
    패: "L",
  };
  return (matches?.rows ?? [])
    .filter((match) => resultMap[match.result ?? ""])
    .slice(0, 5)
    .map((match) => resultMap[match.result ?? ""]);
}

export function seasonLabel(id: SeasonId): string {
  return SEASONS.find((season) => season.id === id)?.label ?? formatSeasonLabel(id);
}

export function parsePercent(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed / 100 : null;
}

export function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

async function fetchOptionalJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function historyPoint(date: string, row: ServiceRankingRaw | null): OwnerHistoryPoint {
  return {
    date,
    label: date === "ranking" ? "집계" : `${date.slice(2, 4)}/${date.slice(4, 6)}`,
    row,
  };
}

async function resolveHistoryDates(
  season: SeasonId,
  config: ServiceSeasonConfig | null,
): Promise<string[]> {
  try {
    const response = await fetch(`/data/${season}/manifest.json`, { cache: "no-store" });
    if (response.ok) {
      const manifest = (await response.json()) as SeasonManifest;
      if (manifest.endDate) return [manifest.endDate];
    }
  } catch {
    // ranking fallback handles missing manifests.
  }

  if (season === config?.current_season) return recentDateKeys(new Date(), 1);

  const rangeEnd = config?.season_ranges?.[season]?.endDate;
  if (rangeEnd) return recentDateKeys(new Date(`${rangeEnd}T00:00:00`), 5);
  return recentDateKeys(new Date(), 5);
}

function recentDateKeys(endDate: Date, count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(endDate);
    date.setDate(date.getDate() - (count - 1 - index));
    return compactDateKey(date);
  });
}

function dateKeysFromCompactEndDate(endDate: string, count: number): string[] {
  const year = Number(endDate.slice(0, 2)) + 2000;
  const month = Number(endDate.slice(2, 4)) - 1;
  const day = Number(endDate.slice(4, 6));
  return recentDateKeys(new Date(year, month, day), count);
}

function compactDateKey(date: Date): string {
  const year = String(date.getFullYear()).slice(2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function rankingViewToRaw(row: RankingView): ServiceRankingRaw {
  return {
    player_id: row.id,
    name: row.name,
    구단주명: row.name,
    승: row.w,
    무: row.d,
    패: row.l,
    판수: row.gp,
    누적채굴량: row.miningPower,
    "전일 대비 채굴량": row.growth ?? undefined,
    "채굴 효율": row.miningPower,
    승률: row.winRate === null ? undefined : `${(row.winRate * 100).toFixed(1)}%`,
    "구단 가치": row.clubValue ?? undefined,
    "최근 매치 티어": row.tierName ?? undefined,
    "최근 매치 티어 코드": row.tierCode ?? undefined,
    "최근 매치 티어 이미지": row.tierImage ?? undefined,
    순위: row.unranked ? undefined : row.rank,
  };
}

export function formatClubValueText(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^(\d+)조$/);
  if (!match) return value;

  const jo = Number(match[1]);
  if (!Number.isFinite(jo) || jo < 10_000) return value;

  const gyeong = Math.floor(jo / 10_000);
  const restJo = jo % 10_000;
  return restJo > 0 ? `${gyeong}경 ${restJo}조` : `${gyeong}경`;
}

function formatClubValueFromBp(value: number): string {
  const joUnit = 1_000_000_000_000;
  if (value < joUnit) return "1조 미만";
  return formatClubValueText(`${Math.floor(value / joUnit)}조`) ?? "-";
}

function currentSeasonKings(rows: RankingView[]): RankingData["kings"] {
  const ranked = rows.filter((row) => !row.unranked && row.id);
  const maxBy = (score: (row: RankingView) => number) =>
    ranked.reduce<RankingView | undefined>(
      (best, row) => (!best || score(row) > score(best) ? row : best),
      undefined,
    );
  const toRaw = (row: RankingView | undefined): ServiceRankingRaw | undefined =>
    row ? rankingViewToRaw(row) : undefined;

  return {
    mining: toRaw(maxBy((row) => row.miningPower)),
    winRate: toRaw(maxBy((row) => row.winRate ?? -1)),
    gameCount: toRaw(maxBy((row) => row.gp)),
    draw: toRaw(maxBy((row) => row.d)),
  };
}
