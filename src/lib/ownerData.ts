/**
 * Owner (구단주) detail mock data. Mirrors the real payload shape from
 * /data/{season}/user/{id}/{id}_{YYMMDD}.json — Korean source keys preserved.
 * UI adapter normalizes to *View shape for display; raw payload is preserved.
 */

import type { MatchResult, SeasonId } from "./mockData";

export interface MatchLogRaw {
  matchKey: string;
  일자: string; // YYYY-MM-DD
  상대: string; // 상대 구단주명
  홈원정: "홈" | "원정";
  결과: MatchResult;
  득점: number;
  실점: number;
  포메이션: string;
  점유율: number; // %
}

export interface OwnerDetailRaw {
  id: string;
  구단주: string;
  시즌: SeasonId;
  갱신일자: string;
  홈성적: { 승: number; 무: number; 패: number; 득점: number; 실점: number };
  원정성적: { 승: number; 무: number; 패: number; 득점: number; 실점: number };
  최근20: MatchLogRaw[];
}

/** Deterministic helper — generate a plausible 20-match log per owner. */
function buildLog(seed: string, form: MatchResult[]): MatchLogRaw[] {
  const opponents = [
    "강남 스트라이커즈","해운대 타이탄즈","판교 데이터즈","송도 유나이티드","역삼 FC",
    "성수 워리어스","잠실 로얄스","용산 다이너스","홍대 리버스","여의도 캐피탈",
    "종로 헤리티지","동대문 나이츠","마포 콜렉티브","노원 파일럿츠","구로 스파크스",
  ].filter((n) => n !== seed);
  const results: MatchResult[] = [];
  // pad last-20 with a repeating pattern from form
  for (let i = 0; i < 20; i++) results.push(form[i % form.length]);
  return results.map((r, i) => {
    const gf = r === "W" ? 2 + (i % 2) : r === "D" ? 1 : (i % 2);
    const ga = r === "L" ? 2 + (i % 2) : r === "D" ? 1 : (i % 2);
    return {
      matchKey: `m${seed}-${String(i + 1).padStart(2, "0")}`,
      일자: `2024-05-${String(20 - i).padStart(2, "0")}`,
      상대: opponents[i % opponents.length],
      홈원정: i % 2 === 0 ? "홈" : "원정",
      결과: r,
      득점: gf,
      실점: ga,
      포메이션: ["4-2-3-1", "4-3-3", "3-4-3", "4-4-2"][i % 4],
      점유율: 45 + ((i * 3) % 20),
    };
  });
}

import { RANKINGS } from "./mockData";

export const OWNER_DETAILS: Record<string, OwnerDetailRaw> = Object.fromEntries(
  RANKINGS["2024-p2"].map((r) => [
    r.id,
    {
      id: r.id,
      구단주: r.구단주,
      시즌: "2024-p2",
      갱신일자: "2024-05-20",
      홈성적: {
        승: Math.ceil(r.승 / 2),
        무: Math.floor(r.무 / 2),
        패: Math.floor(r.패 / 2),
        득점: Math.ceil(r.득점 / 2),
        실점: Math.floor(r.실점 / 2),
      },
      원정성적: {
        승: Math.floor(r.승 / 2),
        무: Math.ceil(r.무 / 2),
        패: Math.ceil(r.패 / 2),
        득점: Math.floor(r.득점 / 2),
        실점: Math.ceil(r.실점 / 2),
      },
      최근20: buildLog(r.구단주, r.최근5),
    },
  ]),
);

export interface SplitLine {
  label: string;
  gp: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  winRate: number | null;
}

export function splitToView(
  label: string,
  s: OwnerDetailRaw["홈성적"],
): SplitLine {
  const gp = s.승 + s.무 + s.패;
  return {
    label,
    gp,
    w: s.승,
    d: s.무,
    l: s.패,
    gf: s.득점,
    ga: s.실점,
    gd: s.득점 - s.실점,
    pts: s.승 * 3 + s.무,
    winRate: gp > 0 ? s.승 / gp : null,
  };
}
