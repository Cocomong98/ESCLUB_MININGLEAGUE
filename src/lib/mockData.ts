/**
 * Mock data shapes mirror the real DATA_AND_ROUTE_CONTRACT source fields.
 * - /season_config.json → seasons list
 * - /data/{season}/current_crawl_display_data.json → ranking rows
 * Real source keys are Korean; UI adapter (below) normalizes for display only.
 * Raw payload shape preserved (id, 승, 무, 패, 승점, 득실, 최근5, rank_delta).
 */

export type SeasonId = string;

export interface SeasonConfig {
  id: SeasonId;
  label: string;
  phase?: string;
  active?: boolean;
}

export type MatchResult = "W" | "D" | "L";

/** Raw ranking row — matches server payload keys (source-of-truth). */
export interface RankingRowRaw {
  id: string;
  구단주: string;
  경기수: number;
  승: number;
  무: number;
  패: number;
  득점: number;
  실점: number;
  승점: number;
  최근5: MatchResult[]; // oldest → newest
  rank_delta: number | null; // +up, -down, 0 same, null new
}

export const SEASONS: SeasonConfig[] = [
  { id: "2024-p2", label: "2024 Phase 2", phase: "Phase 2", active: true },
  { id: "2024-p1", label: "2024 Phase 1", phase: "Phase 1" },
  { id: "2023-p2", label: "2023 Phase 2", phase: "Phase 2" },
  { id: "2023-p1", label: "2023 Phase 1", phase: "Phase 1" },
];

export const RANKINGS: Record<SeasonId, RankingRowRaw[]> = {
  "2024-p2": [
    { id: "u001", 구단주: "강남 스트라이커즈", 경기수: 34, 승: 22, 무: 8, 패: 4, 득점: 71, 실점: 39, 승점: 74, 최근5: ["W","W","D","W","W"], rank_delta: 0 },
    { id: "u002", 구단주: "해운대 타이탄즈", 경기수: 34, 승: 21, 무: 6, 패: 7, 득점: 68, 실점: 40, 승점: 69, 최근5: ["L","W","W","L","W"], rank_delta: -1 },
    { id: "u003", 구단주: "판교 데이터즈", 경기수: 34, 승: 19, 무: 10, 패: 5, 득점: 55, 실점: 36, 승점: 67, 최근5: ["D","D","W","W","W"], rank_delta: 1 },
    { id: "u004", 구단주: "송도 유나이티드", 경기수: 34, 승: 18, 무: 8, 패: 8, 득점: 60, 실점: 45, 승점: 62, 최근5: ["W","L","W","D","W"], rank_delta: 0 },
    { id: "u005", 구단주: "역삼 FC", 경기수: 34, 승: 17, 무: 9, 패: 8, 득점: 52, 실점: 44, 승점: 60, 최근5: ["D","W","L","W","D"], rank_delta: 2 },
    { id: "u006", 구단주: "성수 워리어스", 경기수: 34, 승: 16, 무: 8, 패: 10, 득점: 49, 실점: 47, 승점: 56, 최근5: ["L","D","W","L","W"], rank_delta: -2 },
    { id: "u007", 구단주: "잠실 로얄스", 경기수: 34, 승: 15, 무: 10, 패: 9, 득점: 47, 실점: 46, 승점: 55, 최근5: ["W","W","D","D","L"], rank_delta: 0 },
    { id: "u008", 구단주: "용산 다이너스", 경기수: 34, 승: 14, 무: 11, 패: 9, 득점: 44, 실점: 44, 승점: 53, 최근5: ["D","W","L","W","D"], rank_delta: 1 },
    { id: "u009", 구단주: "홍대 리버스", 경기수: 34, 승: 14, 무: 8, 패: 12, 득점: 46, 실점: 49, 승점: 50, 최근5: ["L","L","W","D","W"], rank_delta: -1 },
    { id: "u010", 구단주: "여의도 캐피탈", 경기수: 34, 승: 13, 무: 9, 패: 12, 득점: 42, 실점: 48, 승점: 48, 최근5: ["W","L","D","L","W"], rank_delta: 0 },
    { id: "u011", 구단주: "종로 헤리티지", 경기수: 34, 승: 11, 무: 12, 패: 11, 득점: 38, 실점: 44, 승점: 45, 최근5: ["D","D","L","W","D"], rank_delta: 3 },
    { id: "u012", 구단주: "동대문 나이츠", 경기수: 34, 승: 10, 무: 9, 패: 15, 득점: 36, 실점: 51, 승점: 39, 최근5: ["L","L","D","W","L"], rank_delta: -2 },
    { id: "u013", 구단주: "마포 콜렉티브", 경기수: 34, 승: 8, 무: 10, 패: 16, 득점: 32, 실점: 55, 승점: 34, 최근5: ["L","D","L","L","W"], rank_delta: 0 },
    { id: "u014", 구단주: "노원 파일럿츠", 경기수: 34, 승: 7, 무: 8, 패: 19, 득점: 28, 실점: 60, 승점: 29, 최근5: ["L","L","W","L","L"], rank_delta: -1 },
    { id: "u015", 구단주: "구로 스파크스", 경기수: 34, 승: 5, 무: 7, 패: 22, 득점: 24, 실점: 68, 승점: 22, 최근5: ["L","L","L","D","L"], rank_delta: null },
  ],
  "2024-p1": [],
  "2023-p2": [],
  "2023-p1": [],
};

/** UI adapter: normalizes raw row into display-friendly derived fields. */
export interface RankingRowView {
  rank: number;
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
  winRate: number | null; // 0..1 or null when gp=0 (missing ≠ 0)
  form: MatchResult[];
  delta: number | null;
}

export function toRankingView(rows: RankingRowRaw[]): RankingRowView[] {
  const sorted = [...rows].sort((a, b) => {
    if (b.승점 !== a.승점) return b.승점 - a.승점;
    const gdA = a.득점 - a.실점;
    const gdB = b.득점 - b.실점;
    if (gdB !== gdA) return gdB - gdA;
    return b.득점 - a.득점;
  });
  return sorted.map((r, i) => ({
    rank: i + 1,
    id: r.id,
    name: r.구단주,
    gp: r.경기수,
    w: r.승,
    d: r.무,
    l: r.패,
    gd: r.득점 - r.실점,
    gf: r.득점,
    ga: r.실점,
    pts: r.승점,
    winRate: r.경기수 > 0 ? r.승 / r.경기수 : null,
    form: r.최근5,
    delta: r.rank_delta,
  }));
}
