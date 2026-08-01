/**
 * Squad & Manager mode analysis mock. Mirrors source payloads:
 * - /data/{season}/user/{id}/squad_analysis_all.json
 * - /data/{season}/user/{id}/manager_mode_analysis.json
 * Korean source keys preserved. UI adapters live in the route component.
 */

import { RANKINGS } from "./mockData";

export type Position =
  "GK" | "SW" | "CB" | "LB" | "RB" | "DM" | "CM" | "LM" | "RM" | "AM" | "LW" | "RW" | "CF" | "ST";

export interface SquadPlayerRaw {
  선수id: string;
  선수명: string;
  포지션: Position;
  국적: string;
  시즌: string; // e.g. "TT", "23UCL"
  OVR: number;
  경기수: number;
  선발: number;
  득점: number;
  도움: number;
  평점: number; // 0..10
  가치: number; // BP (억)
}

export interface FormationUsageRaw {
  포메이션: string;
  경기수: number;
  승: number;
  무: number;
  패: number;
}

export interface TacticalStyleRaw {
  스타일: string; // e.g. "빠른 역습", "티키타카"
  경기수: number;
  승률: number; // 0..1
}

export interface SquadAnalysisRaw {
  id: string;
  구단주: string;
  갱신일자: string;
  기용선수수: number;
  평균OVR: number;
  스쿼드가치: number; // 억 BP
  주전11: SquadPlayerRaw[];
  로테이션: SquadPlayerRaw[];
}

export interface ManagerModeAnalysisRaw {
  주포메이션: string;
  포메이션별: FormationUsageRaw[];
  전술스타일: TacticalStyleRaw[];
  평균점유율: number; // %
  평균슈팅: number;
  평균유효슈팅: number;
  평균패스성공률: number; // 0..1
  교체시점평균: number; // 분
}

const FIRST_NAMES = [
  "김",
  "이",
  "박",
  "최",
  "정",
  "강",
  "조",
  "윤",
  "장",
  "임",
  "한",
  "오",
  "서",
  "신",
  "권",
  "황",
  "안",
  "송",
  "전",
  "홍",
];
const GIVEN = [
  "민준",
  "서준",
  "도윤",
  "예준",
  "시우",
  "주원",
  "하준",
  "지호",
  "지훈",
  "건우",
  "우진",
  "선우",
  "서진",
  "민재",
  "현우",
  "도현",
  "지후",
  "준서",
  "준우",
  "연우",
];
const NATIONS = ["KOR", "BRA", "ARG", "ESP", "FRA", "GER", "ENG", "POR", "ITA", "NED"];
const SEASONS_LABEL = ["TT", "23UCL", "22TB", "20KH", "19KH", "21NG", "VTR", "BTB", "LN", "HR"];

function player(
  seed: number,
  pos: Position,
  ovr: number,
  apps: number,
  starts: number,
  g: number,
  a: number,
  rating: number,
  val: number,
): SquadPlayerRaw {
  const s = seed;
  return {
    선수id: `p${String(s).padStart(4, "0")}`,
    선수명: `${FIRST_NAMES[s % FIRST_NAMES.length]}${GIVEN[(s * 3) % GIVEN.length]}`,
    포지션: pos,
    국적: NATIONS[(s * 7) % NATIONS.length],
    시즌: SEASONS_LABEL[(s * 5) % SEASONS_LABEL.length],
    OVR: ovr,
    경기수: apps,
    선발: starts,
    득점: g,
    도움: a,
    평점: rating,
    가치: val,
  };
}

function buildSquad(idSeed: number): { starters: SquadPlayerRaw[]; rotation: SquadPlayerRaw[] } {
  const b = idSeed * 11;
  const starters: SquadPlayerRaw[] = [
    player(b + 1, "GK", 108, 34, 34, 0, 1, 7.6, 320),
    player(b + 2, "RB", 105, 32, 30, 2, 6, 7.4, 180),
    player(b + 3, "CB", 110, 33, 33, 1, 0, 7.5, 240),
    player(b + 4, "CB", 108, 30, 29, 2, 1, 7.3, 210),
    player(b + 5, "LB", 106, 31, 28, 1, 8, 7.5, 190),
    player(b + 6, "DM", 111, 33, 32, 3, 4, 7.7, 280),
    player(b + 7, "CM", 112, 32, 31, 6, 9, 7.8, 340),
    player(b + 8, "AM", 114, 30, 30, 9, 12, 8.2, 460),
    player(b + 9, "RW", 113, 31, 29, 14, 8, 8.0, 420),
    player(b + 10, "LW", 112, 29, 27, 11, 7, 7.9, 400),
    player(b + 11, "ST", 116, 33, 33, 22, 5, 8.4, 620),
  ];
  const rotation: SquadPlayerRaw[] = [
    player(b + 12, "GK", 102, 4, 0, 0, 0, 6.9, 90),
    player(b + 13, "CB", 104, 12, 6, 0, 0, 7.1, 120),
    player(b + 14, "CM", 108, 18, 9, 2, 3, 7.2, 210),
    player(b + 15, "LM", 107, 15, 5, 3, 4, 7.3, 170),
    player(b + 16, "ST", 110, 14, 4, 6, 2, 7.6, 240),
    player(b + 17, "RW", 108, 12, 3, 4, 3, 7.2, 180),
  ];
  return { starters, rotation };
}

export const SQUAD_ANALYSIS: Record<string, SquadAnalysisRaw> = Object.fromEntries(
  RANKINGS["2024-p2"].map((r, i) => {
    const { starters, rotation } = buildSquad(i + 1);
    const all = [...starters, ...rotation];
    const avg = all.reduce((s, p) => s + p.OVR, 0) / all.length;
    const val = all.reduce((s, p) => s + p.가치, 0);
    return [
      r.id,
      {
        id: r.id,
        구단주: r.구단주,
        갱신일자: "2024-05-20",
        기용선수수: all.length,
        평균OVR: Math.round(avg * 10) / 10,
        스쿼드가치: val,
        주전11: starters,
        로테이션: rotation,
      } satisfies SquadAnalysisRaw,
    ];
  }),
);

export const MANAGER_MODE: Record<string, ManagerModeAnalysisRaw> = Object.fromEntries(
  RANKINGS["2024-p2"].map((r, i) => {
    const forms: FormationUsageRaw[] = [
      { 포메이션: "4-2-3-1", 경기수: 18 - (i % 4), 승: 12, 무: 3, 패: 3 },
      { 포메이션: "4-3-3", 경기수: 9 + (i % 3), 승: 5, 무: 2, 패: 2 },
      { 포메이션: "3-4-3", 경기수: 5, 승: 2, 무: 2, 패: 1 },
      { 포메이션: "4-4-2", 경기수: 2, 승: 1, 무: 1, 패: 0 },
    ];
    const styles: TacticalStyleRaw[] = [
      { 스타일: "빠른 역습", 경기수: 14, 승률: 0.64 },
      { 스타일: "점유율 축구", 경기수: 12, 승률: 0.58 },
      { 스타일: "측면 돌파", 경기수: 6, 승률: 0.5 },
      { 스타일: "직선적 공격", 경기수: 2, 승률: 0.5 },
    ];
    return [
      r.id,
      {
        주포메이션: "4-2-3-1",
        포메이션별: forms,
        전술스타일: styles,
        평균점유율: 54 + (i % 6),
        평균슈팅: 13 + (i % 3),
        평균유효슈팅: 5 + (i % 2),
        평균패스성공률: 0.82 - (i % 5) * 0.01,
        교체시점평균: 62 + (i % 6),
      } satisfies ManagerModeAnalysisRaw,
    ];
  }),
);
