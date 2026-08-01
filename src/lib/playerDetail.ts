/**
 * Player detail mock. Mirrors source payload:
 * /data/{season}/user/{id}/player/{playerId}.json — Korean source keys preserved.
 *
 * Deterministic derivation from (ownerId, playerId) using existing squad data,
 * expanded with per-match rating history and skill radar.
 */

import { SQUAD_ANALYSIS, type SquadPlayerRaw } from "./squadData";
import { OWNER_DETAILS } from "./ownerData";

export interface MatchRatingRaw {
  matchKey: string;
  일자: string;
  상대: string;
  홈원정: "홈" | "원정";
  분: number;
  평점: number;
  득점: number;
  도움: number;
}

export interface SkillRadarRaw {
  페이스: number;
  슈팅: number;
  패스: number;
  드리블: number;
  수비: number;
  피지컬: number;
}

export interface PlayerDetailRaw {
  ownerId: string;
  구단주: string;
  선수: SquadPlayerRaw;
  역할: "주전" | "로테이션";
  스킬: SkillRadarRaw;
  최근10: MatchRatingRaw[];
  홈평점: number;
  원정평점: number;
  총분: number;
  분당공격P: number; // (G+A)/90
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function skillFor(p: SquadPlayerRaw, seed: number): SkillRadarRaw {
  const base = p.OVR;
  const pos = p.포지션;
  const bump = (n: number) => Math.min(120, Math.max(50, base + n));
  const j = (n: number) => (seed >> n) & 0x7;
  switch (pos) {
    case "GK":
      return {
        페이스: bump(-30 + j(0)),
        슈팅: bump(-40 + j(1)),
        패스: bump(-15 + j(2)),
        드리블: bump(-30 + j(3)),
        수비: bump(4 + j(4)),
        피지컬: bump(-2 + j(5)),
      };
    case "CB":
    case "LB":
    case "RB":
    case "SW":
      return {
        페이스: bump(-2 + j(0)),
        슈팅: bump(-25 + j(1)),
        패스: bump(-8 + j(2)),
        드리블: bump(-15 + j(3)),
        수비: bump(6 + j(4)),
        피지컬: bump(4 + j(5)),
      };
    case "DM":
    case "CM":
      return {
        페이스: bump(-4 + j(0)),
        슈팅: bump(-6 + j(1)),
        패스: bump(6 + j(2)),
        드리블: bump(-2 + j(3)),
        수비: bump(2 + j(4)),
        피지컬: bump(0 + j(5)),
      };
    case "AM":
    case "LM":
    case "RM":
      return {
        페이스: bump(2 + j(0)),
        슈팅: bump(2 + j(1)),
        패스: bump(4 + j(2)),
        드리블: bump(6 + j(3)),
        수비: bump(-8 + j(4)),
        피지컬: bump(-4 + j(5)),
      };
    case "LW":
    case "RW":
      return {
        페이스: bump(8 + j(0)),
        슈팅: bump(2 + j(1)),
        패스: bump(-2 + j(2)),
        드리블: bump(8 + j(3)),
        수비: bump(-18 + j(4)),
        피지컬: bump(-8 + j(5)),
      };
    case "ST":
    case "CF":
      return {
        페이스: bump(4 + j(0)),
        슈팅: bump(10 + j(1)),
        패스: bump(-6 + j(2)),
        드리블: bump(2 + j(3)),
        수비: bump(-25 + j(4)),
        피지컬: bump(4 + j(5)),
      };
  }
}

function ratingHistory(ownerId: string, p: SquadPlayerRaw): MatchRatingRaw[] {
  const owner = OWNER_DETAILS[ownerId];
  if (!owner) return [];
  const last10 = owner.최근20.slice(0, 10);
  const seed = hash(p.선수id);
  const base = p.평점;
  return last10.map((m, i) => {
    const swing = (((seed >> i) & 0xf) / 15 - 0.5) * 1.2; // ±0.6
    const bonus = m.결과 === "W" ? 0.25 : m.결과 === "L" ? -0.35 : 0;
    const rating = Math.max(5.0, Math.min(10, base + swing + bonus));
    const scored = (seed + i) % 5 === 0 && p.득점 > 3 ? 1 : 0;
    const assisted = (seed + i * 3) % 6 === 0 && p.도움 > 3 ? 1 : 0;
    return {
      matchKey: m.matchKey,
      일자: m.일자,
      상대: m.상대,
      홈원정: m.홈원정,
      분: 88 - ((seed + i) % 20),
      평점: Math.round(rating * 10) / 10,
      득점: scored,
      도움: assisted,
    };
  });
}

export function getPlayerDetail(ownerId: string, playerId: string): PlayerDetailRaw | null {
  const squad = SQUAD_ANALYSIS[ownerId];
  const owner = OWNER_DETAILS[ownerId];
  if (!squad || !owner) return null;
  const inStarters = squad.주전11.find((p) => p.선수id === playerId);
  const inRotation = squad.로테이션.find((p) => p.선수id === playerId);
  const p = inStarters ?? inRotation;
  if (!p) return null;
  const seed = hash(playerId);
  const history = ratingHistory(ownerId, p);
  const homeMatches = history.filter((h) => h.홈원정 === "홈");
  const awayMatches = history.filter((h) => h.홈원정 === "원정");
  const avg = (xs: MatchRatingRaw[]) =>
    xs.length ? Math.round((xs.reduce((s, x) => s + x.평점, 0) / xs.length) * 10) / 10 : 0;
  const 총분 = p.선발 * 88 + (p.경기수 - p.선발) * 22;
  return {
    ownerId,
    구단주: owner.구단주,
    선수: p,
    역할: inStarters ? "주전" : "로테이션",
    스킬: skillFor(p, seed),
    최근10: history,
    홈평점: avg(homeMatches),
    원정평점: avg(awayMatches),
    총분,
    분당공격P: 총분 > 0 ? Math.round(((p.득점 + p.도움) / (총분 / 90)) * 100) / 100 : 0,
  };
}
