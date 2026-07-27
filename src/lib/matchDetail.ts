/**
 * Match detail mock. Mirrors source payload:
 * /data/{season}/user/{id}/match/{matchKey}.json — Korean source keys preserved.
 *
 * Deterministic derivation from (ownerId, matchKey) so URLs are stable and
 * shareable across sessions without server round-trips.
 */

import type { MatchResult } from "./mockData";
import { OWNER_DETAILS, type MatchLogRaw } from "./ownerData";
import { SQUAD_ANALYSIS, type SquadPlayerRaw } from "./squadData";

export interface TeamStatsRaw {
  점유율: number;
  슈팅: number;
  유효슈팅: number;
  패스시도: number;
  패스성공: number;
  코너킥: number;
  파울: number;
  경고: number;
  퇴장: number;
  태클성공: number;
  인터셉트: number;
}

export interface GoalEventRaw {
  분: number;
  선수id: string;
  선수명: string;
  어시스트id?: string;
  어시스트명?: string;
  종류: "오픈플레이" | "세트피스" | "패널티" | "역습";
  홈원정: "홈" | "원정";
}

export interface SubEventRaw {
  분: number;
  아웃id: string;
  아웃명: string;
  인id: string;
  인명: string;
}

export interface MatchDetailRaw {
  matchKey: string;
  일자: string;
  상대: string;
  홈원정: "홈" | "원정";
  결과: MatchResult;
  득점: number;
  실점: number;
  포메이션: string;
  상대포메이션: string;
  경기장: string;
  주심: string;
  아군스탯: TeamStatsRaw;
  상대스탯: TeamStatsRaw;
  득점기록: GoalEventRaw[];
  실점기록: GoalEventRaw[];
  선발11: SquadPlayerRaw[];
  교체기록: SubEventRaw[];
  최고평점: { 선수id: string; 선수명: string; 평점: number };
}

const STADIUMS = ["상암월드컵경기장", "부산아시아드", "인천문학", "수원월드컵", "대구스타디움"];
const REFEREES = ["김대영", "정회수", "박상호", "이동준", "최광호"];
const OPP_FORMS = ["4-3-3", "3-5-2", "4-2-3-1", "4-4-2", "5-3-2"];

/** Hash a string to a deterministic integer 0..2^31-1. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function statsFor(seed: number, dominant: boolean): TeamStatsRaw {
  const base = dominant ? 58 : 42;
  const shots = dominant ? 14 + (seed % 5) : 8 + (seed % 4);
  const sot = Math.round(shots * (dominant ? 0.45 : 0.32));
  const passTry = dominant ? 480 + (seed % 60) : 360 + (seed % 50);
  const passOk = Math.round(passTry * (dominant ? 0.86 : 0.78));
  return {
    점유율: base + (seed % 6),
    슈팅: shots,
    유효슈팅: sot,
    패스시도: passTry,
    패스성공: passOk,
    코너킥: dominant ? 6 + (seed % 3) : 3 + (seed % 2),
    파울: 8 + (seed % 5),
    경고: seed % 3,
    퇴장: seed % 11 === 0 ? 1 : 0,
    태클성공: 12 + (seed % 6),
    인터셉트: 8 + (seed % 5),
  };
}

function goalEvents(
  count: number,
  side: "홈" | "원정",
  players: SquadPlayerRaw[],
  seed: number,
): GoalEventRaw[] {
  const kinds: GoalEventRaw["종류"][] = ["오픈플레이", "역습", "세트피스", "패널티"];
  const attackers = players.filter((p) =>
    ["ST", "CF", "LW", "RW", "AM", "CM"].includes(p.포지션),
  );
  const events: GoalEventRaw[] = [];
  for (let i = 0; i < count; i++) {
    const scorer = attackers[(seed + i * 3) % attackers.length];
    const assist = attackers[(seed + i * 5 + 1) % attackers.length];
    events.push({
      분: 8 + Math.floor(((seed + i * 17) % 80)),
      선수id: scorer.선수id,
      선수명: scorer.선수명,
      어시스트id: scorer.선수id === assist.선수id ? undefined : assist.선수id,
      어시스트명: scorer.선수id === assist.선수id ? undefined : assist.선수명,
      종류: kinds[(seed + i) % kinds.length],
      홈원정: side,
    });
  }
  return events.sort((a, b) => a.분 - b.분);
}

/** Fake opponent goals — use scorer names from opponent id, keyed by seed. */
function opponentGoals(count: number, opp: string, side: "홈" | "원정", seed: number): GoalEventRaw[] {
  const kinds: GoalEventRaw["종류"][] = ["오픈플레이", "역습", "세트피스", "패널티"];
  const names = [`${opp} #9`, `${opp} #10`, `${opp} #7`, `${opp} #11`];
  const events: GoalEventRaw[] = [];
  for (let i = 0; i < count; i++) {
    events.push({
      분: 12 + Math.floor(((seed + i * 23) % 78)),
      선수id: `opp-${seed}-${i}`,
      선수명: names[(seed + i) % names.length],
      종류: kinds[(seed + i + 1) % kinds.length],
      홈원정: side,
    });
  }
  return events.sort((a, b) => a.분 - b.분);
}

function subs(seed: number, starters: SquadPlayerRaw[], bench: SquadPlayerRaw[]): SubEventRaw[] {
  const out: SubEventRaw[] = [];
  const n = 2 + (seed % 2);
  for (let i = 0; i < n; i++) {
    const o = starters[(seed + i * 4 + 3) % starters.length];
    const inp = bench[(seed + i * 3) % bench.length];
    out.push({
      분: 58 + i * 8 + (seed % 4),
      아웃id: o.선수id,
      아웃명: o.선수명,
      인id: inp.선수id,
      인명: inp.선수명,
    });
  }
  return out;
}

/** Build a match detail on demand. Returns null if owner or match unknown. */
export function getMatchDetail(ownerId: string, matchKey: string): MatchDetailRaw | null {
  const owner = OWNER_DETAILS[ownerId];
  if (!owner) return null;
  const log: MatchLogRaw | undefined = owner.최근20.find((m) => m.matchKey === matchKey);
  if (!log) return null;
  const squad = SQUAD_ANALYSIS[ownerId]!;
  const seed = hash(matchKey);
  const home = log.홈원정 === "홈";
  const dominant = log.결과 === "W";
  const mine = statsFor(seed, dominant);
  mine.점유율 = log.점유율;
  const theirs = statsFor(seed + 7, !dominant);
  theirs.점유율 = 100 - log.점유율;

  const mySide = home ? "홈" : "원정";
  const oppSide = home ? "원정" : "홈";
  const myGoals = goalEvents(log.득점, mySide, squad.주전11, seed);
  const oppGoals = opponentGoals(log.실점, log.상대, oppSide, seed + 3);

  const topScorer = myGoals[0]
    ? squad.주전11.find((p) => p.선수id === myGoals[0].선수id) ?? squad.주전11[10]
    : squad.주전11[10];
  const topRating =
    log.결과 === "W" ? 8.2 + ((seed % 6) / 10) : log.결과 === "D" ? 7.4 + ((seed % 5) / 10) : 6.9 + ((seed % 4) / 10);

  return {
    matchKey,
    일자: log.일자,
    상대: log.상대,
    홈원정: log.홈원정,
    결과: log.결과,
    득점: log.득점,
    실점: log.실점,
    포메이션: log.포메이션,
    상대포메이션: OPP_FORMS[seed % OPP_FORMS.length],
    경기장: STADIUMS[seed % STADIUMS.length],
    주심: REFEREES[(seed + 1) % REFEREES.length],
    아군스탯: mine,
    상대스탯: theirs,
    득점기록: myGoals,
    실점기록: oppGoals,
    선발11: squad.주전11,
    교체기록: subs(seed, squad.주전11, squad.로테이션),
    최고평점: {
      선수id: topScorer.선수id,
      선수명: topScorer.선수명,
      평점: Math.round(topRating * 10) / 10,
    },
  };
}
