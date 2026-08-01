import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSeason } from "@/lib/season-context";
import { OWNER_DETAILS } from "@/lib/ownerData";
import {
  getPlayerDetail,
  type MatchRatingRaw,
  type PlayerDetailRaw,
  type SkillRadarRaw,
} from "@/lib/playerDetail";
import {
  fetchRankingData,
  fetchSquadBundle,
  numberOr,
  type OpenApiSquadPlayer,
  type SquadBundle,
} from "@/lib/service-data";
import { type Position, type SquadPlayerRaw } from "@/lib/squadData";

export const Route = createFileRoute("/dashboard/$id/player/$playerId")({
  head: ({ params }) => {
    const pd = getPlayerDetail(params.id, params.playerId);
    return {
      meta: [
        {
          title: pd ? `${pd.선수.선수명} · ${pd.구단주} — ESCLUB` : "선수 상세 — ESCLUB",
        },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: PlayerPage,
});

function PlayerPage() {
  const { id, playerId } = Route.useParams();
  const { season } = useSeason();
  const [bundle, setBundle] = useState<SquadBundle | null>(null);
  const [rankingName, setRankingName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBundle(null);
    Promise.all([fetchSquadBundle(season, id), fetchRankingData(season)]).then(
      ([nextBundle, ranking]) => {
        if (cancelled) return;
        setBundle(nextBundle);
        setRankingName(ranking.rows.find((row) => row.id === id)?.name ?? null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, playerId, season]);

  const ownerName =
    OWNER_DETAILS[id]?.구단주 ?? bundle?.squad?.player?.nickname ?? rankingName ?? id;
  const pd = useMemo(
    () => resolvePlayerDetail(id, ownerName, playerId, bundle) ?? getPlayerDetail(id, playerId),
    [bundle, id, ownerName, playerId],
  );
  const p = pd?.선수;
  const isRemotePlayer = Boolean(
    bundle?.squad?.rows?.some((row) => matchesPlayerId(row, playerId)),
  );
  const classRows = useMemo(() => matchingClassRows(playerId, bundle), [bundle, playerId]);
  const latestMatchPlayer = useMemo(
    () => latestPlayerMatchRow(playerId, bundle),
    [bundle, playerId],
  );

  if (!pd || !p) {
    return (
      <div className="px-4 md:px-8 py-6">
        <BackNav id={id} ownerName={ownerName} />
        <div className="mt-8 border-y border-border py-8">
          <h2 className="text-2xl font-semibold tracking-tight">선수 상세</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            선수 정보를 불러오는 중입니다. 상태: {statusLabel(bundle?.status)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="px-4 md:px-8 py-6 border-b border-border">
        <BackNav id={id} ownerName={ownerName} playerName={p.선수명} />

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center min-w-9 px-2 h-6 rounded-[4px] border border-border text-[11px] font-mono font-semibold text-muted-foreground">
                {p.포지션}
              </span>
              <h2 className="text-2xl font-semibold tracking-tight">{p.선수명}</h2>
              <span
                className={
                  "text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-[3px] border " +
                  (pd.역할 === "주전"
                    ? "text-accent border-accent/40 bg-accent/10"
                    : "text-muted-foreground border-border")
                }
              >
                {pd.역할}
              </span>
            </div>
            <p className="mt-2 text-[11px] font-mono text-muted-foreground">
              {p.국적} · {p.시즌}
            </p>
          </div>

          <div className="flex items-baseline gap-6">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                공격 지표
              </span>
              <span className="font-mono-num text-4xl text-accent font-semibold">{p.OVR}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                출전
              </span>
              <span className="font-mono-num text-2xl">
                {p.경기수.toLocaleString()}
                <span className="ml-1 text-[10px] text-muted-foreground">경기</span>
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 md:grid-cols-6 gap-x-8 gap-y-4 border-t border-border/60 pt-5">
          <Kpi label="경기(선발)" value={`${p.경기수} (${p.선발})`} />
          <Kpi label="득점" value={p.득점.toString()} />
          <Kpi label="도움" value={p.도움.toString()} />
          <Kpi
            label="평점"
            value={p.평점.toFixed(1)}
            tone={p.평점 >= 8 ? "pos" : p.평점 < 7 ? "neg" : undefined}
          />
          <Kpi
            label={isRemotePlayer ? "승률" : "총 출전 시간"}
            value={isRemotePlayer ? `${pd.총분.toFixed(1)}%` : `${pd.총분}′`}
          />
          <Kpi label="90분당 G+A" value={pd.분당공격P.toFixed(2)} accent />
          <Kpi
            label="최근 패스"
            value={formatMadeTry(
              latestMatchPlayer?.status?.passSuccess,
              latestMatchPlayer?.status?.passTry,
            )}
          />
          <Kpi
            label="최근 드리블"
            value={formatMadeTry(
              latestMatchPlayer?.status?.dribbleSuccess,
              latestMatchPlayer?.status?.dribbleTry,
            )}
          />
          <Kpi
            label="최근 태클"
            value={formatMadeTry(
              latestMatchPlayer?.status?.tackle,
              latestMatchPlayer?.status?.tackleTry,
            )}
          />
        </div>
      </div>

      <section className="px-4 md:px-8 py-6 border-b border-border grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <SectionTitle>스킬 프로필</SectionTitle>
          <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2.5">
            <SkillBar label="공격" value={pd.스킬.슈팅} />
            <SkillBar label="패스" value={pd.스킬.패스} />
            <SkillBar label="드리블" value={pd.스킬.드리블} />
            <SkillBar label="수비" value={pd.스킬.수비} />
            <SkillBar label="인터셉트" value={pd.스킬.페이스} />
            <SkillBar label="제공권" value={pd.스킬.피지컬} />
          </div>
        </div>
        <div>
          <SectionTitle>홈 / 원정 평점</SectionTitle>
          <div className="mt-3 border border-border rounded-md divide-y divide-border/60">
            <SplitLine label="홈" rating={pd.홈평점} />
            <SplitLine label="원정" rating={pd.원정평점} />
          </div>
        </div>
      </section>

      <section className="px-4 md:px-8 py-6 border-b border-border">
        <div className="flex items-baseline justify-between">
          <SectionTitle>최근 10경기 평점</SectionTitle>
          <span className="text-[10px] font-mono text-muted-foreground">
            match_details_last20.json
          </span>
        </div>

        <div className="mt-4 flex items-end gap-1.5 h-32 border-b border-border/60 pb-1">
          {pd.최근10.map((m) => {
            const h = ((m.평점 - 5) / 5) * 100;
            const tone = m.평점 >= 8 ? "bg-pos" : m.평점 < 7 ? "bg-neg" : "bg-accent/70";
            return (
              <Link
                key={m.matchKey}
                to="/dashboard/$id/match/$matchKey"
                params={{ id, matchKey: m.matchKey }}
                className="group flex-1 flex flex-col items-center justify-end gap-1 min-w-0"
                title={`${m.일자} vs ${m.상대} · ${m.평점.toFixed(1)}`}
              >
                <span className="text-[9px] font-mono-num text-muted-foreground group-hover:text-foreground">
                  {m.평점.toFixed(1)}
                </span>
                <div
                  className={`${tone} w-full rounded-t-[2px] group-hover:opacity-80 transition-opacity`}
                  style={{ height: `${Math.max(4, h)}%` }}
                  aria-hidden
                />
              </Link>
            );
          })}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[560px]">
            <thead>
              <tr className="border-b border-border">
                <Th>일자</Th>
                <Th>상대</Th>
                <Th>결과</Th>
                <ThNum>슈팅</ThNum>
                <ThNum>G</ThNum>
                <ThNum>A</ThNum>
                <ThNum>평점</ThNum>
                <Th className="text-right pr-2">경기</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {pd.최근10.map((m) => (
                <tr key={m.matchKey} className="hover:bg-surface-2/60 transition-colors">
                  <td className="py-2.5 px-3 font-mono-num text-xs text-muted-foreground">
                    {m.일자}
                  </td>
                  <td className="py-2.5 px-3 text-sm">{m.상대}</td>
                  <td className="py-2.5 px-3 text-xs text-muted-foreground">{m.홈원정}</td>
                  <Td muted>{m.분}</Td>
                  <Td>{m.득점 || <span className="text-muted-foreground">·</span>}</Td>
                  <Td>{m.도움 || <span className="text-muted-foreground">·</span>}</Td>
                  <Td className={ratingTone(m.평점)}>{m.평점.toFixed(1)}</Td>
                  <td className="py-2.5 pr-2 text-right">
                    <Link
                      to="/dashboard/$id/match/$matchKey"
                      params={{ id, matchKey: m.matchKey }}
                      className="text-[11px] font-mono text-muted-foreground hover:text-accent transition-colors"
                    >
                      상세
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="px-4 md:px-8 py-6">
        <div className="flex items-baseline justify-between">
          <SectionTitle>클래스 집계</SectionTitle>
          <span className="text-[10px] font-mono text-muted-foreground">
            player_class_analysis.json
          </span>
        </div>
        <div className="mt-3 overflow-x-auto">
          {classRows.length > 0 ? (
            <table className="w-full text-left border-collapse min-w-[560px]">
              <thead>
                <tr className="border-b border-border">
                  <Th>클래스</Th>
                  <ThNum>선수</ThNum>
                  <ThNum>출전</ThNum>
                  <ThNum>G</ThNum>
                  <ThNum>A</ThNum>
                  <ThNum>공격P</ThNum>
                  <ThNum>평점</ThNum>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {classRows.map((row) => (
                  <tr key={row.seasonId} className="hover:bg-surface-2/60 transition-colors">
                    <td className="py-2.5 px-3 text-sm">{row.seasonName ?? row.seasonId}</td>
                    <Td muted>{numberOr(row.players, 0)}</Td>
                    <Td>{numberOr(row.appearances, 0)}</Td>
                    <Td>{numberOr(row.goals, 0)}</Td>
                    <Td>{numberOr(row.assists, 0)}</Td>
                    <Td className="text-accent font-semibold">{numberOr(row.attackPoints, 0)}</Td>
                    <Td className={ratingTone(numberOr(row.avgRating, 0))}>
                      {numberOr(row.avgRating, 0).toFixed(2)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyLine>클래스 집계 파일 없음</EmptyLine>
          )}
        </div>
      </section>
    </div>
  );
}

function resolvePlayerDetail(
  ownerId: string,
  ownerName: string,
  playerId: string,
  bundle: SquadBundle | null,
): PlayerDetailRaw | null {
  const row = bundle?.squad?.rows?.find((item) => matchesPlayerId(item, playerId));
  if (!row) return null;
  const player = openApiPlayerToSquadPlayer(row);
  const recent = recentRatings(row, bundle);
  const home = recent.filter((match) => match.홈원정 === "홈");
  const away = recent.filter((match) => match.홈원정 === "원정");
  const winRate = normalizeRate(row.playerWinRate);
  return {
    ownerId,
    구단주: ownerName,
    선수: player,
    역할: numberOr(row.appearances, 0) >= 10 ? "주전" : "로테이션",
    스킬: skillFromRow(row),
    최근10: recent,
    홈평점: averageRating(home),
    원정평점: averageRating(away),
    총분: winRate * 100,
    분당공격P:
      player.경기수 > 0 ? Math.round(((player.득점 + player.도움) / player.경기수) * 100) / 100 : 0,
  };
}

function openApiPlayerToSquadPlayer(row: OpenApiSquadPlayer): SquadPlayerRaw {
  return {
    선수id: row.playerKey ?? String(row.spId ?? row.playerName ?? row.name ?? "unknown"),
    선수명: row.playerName ?? row.name ?? String(row.spId ?? "UNKNOWN"),
    포지션: normalizePosition(row.positionName ?? row.position),
    국적: "-",
    시즌: row.seasonName ?? (row.seasonId ? String(row.seasonId) : "-"),
    OVR: Math.round(numberOr(row.attackPower, numberOr(row.avgRating, 0))),
    경기수: numberOr(row.appearances, 0),
    선발: numberOr(row.appearances, 0),
    득점: numberOr(row.goal, 0),
    도움: numberOr(row.assist, 0),
    평점: numberOr(row.avgRating, 0),
    가치: Math.round(numberOr(row.attackPower, 0)),
  };
}

function recentRatings(row: OpenApiSquadPlayer, bundle: SquadBundle | null): MatchRatingRaw[] {
  const matches = bundle?.matches?.rows ?? [];
  return matches
    .map((match) => {
      const found = match.players?.find((player) => String(player.spId) === String(row.spId));
      if (!found || numberOr(found.rating, 0) <= 0) return null;
      return {
        matchKey: match.matchKey ?? "unknown",
        일자: formatDate(match.dateKst),
        상대: match.opponent?.nickname ?? "UNKNOWN",
        홈원정: resultLabel(match.result),
        분: numberOr(found.shoot, 0),
        평점: numberOr(found.rating, 0),
        득점: numberOr(found.goal, 0),
        도움: numberOr(found.assist, 0),
      } satisfies MatchRatingRaw;
    })
    .filter((item): item is MatchRatingRaw => Boolean(item))
    .slice(0, 10);
}

function skillFromRow(row: OpenApiSquadPlayer): SkillRadarRaw {
  return {
    페이스: scaleMetric(row.interceptPerGame, 0, 3),
    슈팅: scaleMetric(row.attackPower, 0, 100),
    패스: scaleMetric(row.passSuccessRate, 0, 100),
    드리블: scaleMetric(row.dribbleSuccessRate, 0, 100),
    수비: scaleMetric(row.defensePower, 0, 100),
    피지컬: scaleMetric(row.aerialSuccessRate ?? row.tackleSuccessRate, 0, 100),
  };
}

function matchingClassRows(playerId: string, bundle: SquadBundle | null) {
  const player = bundle?.squad?.rows?.find((row) => matchesPlayerId(row, playerId));
  const seasonId = player?.seasonId;
  const rows = bundle?.classes?.classRows ?? [];
  if (!seasonId) return rows.slice(0, 6);
  const exact = rows.filter((row) => row.seasonId === seasonId);
  return exact.length > 0 ? exact : rows.slice(0, 6);
}

function latestPlayerMatchRow(playerId: string, bundle: SquadBundle | null) {
  for (const match of bundle?.matches?.rows ?? []) {
    const player = match.players?.find((row) => String(row.spId) === playerId);
    if (player) return player;
  }
  return null;
}

function formatMadeTry(made: number | undefined, tried: number | undefined): string {
  const madeValue = numberOr(made, 0);
  const triedValue = numberOr(tried, 0);
  return triedValue > 0 ? `${madeValue}/${triedValue}` : "—";
}

function matchesPlayerId(row: OpenApiSquadPlayer, playerId: string): boolean {
  return (
    row.playerKey === playerId ||
    String(row.spId) === playerId ||
    row.playerName === playerId ||
    row.name === playerId
  );
}

function normalizePosition(value: string | undefined): Position {
  const original = value ?? "CM";
  const stripped = original.replace(/[LR]/g, "");
  const allowed: Position[] = [
    "GK",
    "SW",
    "CB",
    "LB",
    "RB",
    "DM",
    "CM",
    "LM",
    "RM",
    "AM",
    "LW",
    "RW",
    "CF",
    "ST",
  ];
  if (allowed.includes(original as Position)) return original as Position;
  if (allowed.includes(stripped as Position)) return stripped as Position;
  return "CM";
}

function normalizeRate(value: number | undefined): number {
  const n = numberOr(value, 0);
  return n > 1 ? n / 100 : n;
}

function scaleMetric(value: number | undefined, min: number, max: number): number {
  const n = numberOr(value, min);
  if (max <= min) return 50;
  return Math.round(Math.min(120, Math.max(50, 50 + ((n - min) / (max - min)) * 70)));
}

function averageRating(rows: MatchRatingRaw[]): number {
  if (rows.length === 0) return 0;
  return Math.round((rows.reduce((sum, row) => sum + row.평점, 0) / rows.length) * 10) / 10;
}

function resultLabel(result: string | undefined): "홈" | "원정" {
  return result === "승" ? "홈" : "원정";
}

function formatDate(value: string | undefined): string {
  if (!value) return "-";
  return value.slice(0, 10);
}

function ratingTone(v: number): string {
  return v >= 8 ? "text-pos" : v < 7 ? "text-neg" : "";
}

function BackNav({
  id,
  ownerName,
  playerName,
}: {
  id: string;
  ownerName: string;
  playerName?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground mb-3">
      <Link
        to="/dashboard/$id"
        params={{ id }}
        className="flex items-center gap-1 hover:text-foreground transition-colors"
      >
        <ChevronLeft className="size-3" /> {ownerName}
      </Link>
      <span>/</span>
      <Link
        to="/dashboard/$id/squad"
        params={{ id }}
        className="hover:text-foreground transition-colors"
      >
        스쿼드
      </Link>
      {playerName && (
        <>
          <span>/</span>
          <span className="text-foreground">{playerName}</span>
        </>
      )}
    </div>
  );
}

function SkillBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, ((value - 50) / 70) * 100);
  const tone =
    value >= 110
      ? "bg-pos"
      : value >= 95
        ? "bg-accent"
        : value >= 80
          ? "bg-foreground/50"
          : "bg-warn";
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono-num tabular-nums">{value}</span>
      </div>
      <div className="mt-1 h-1.5 w-full bg-surface-2 rounded-sm overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} aria-hidden />
      </div>
    </div>
  );
}

function SplitLine({ label, rating }: { label: string; rating: number }) {
  return (
    <div className="flex items-baseline justify-between px-4 py-3">
      <span className="text-xs text-muted-foreground uppercase tracking-wider font-mono">
        {label}
      </span>
      <span
        className={
          "font-mono-num text-xl " +
          (rating >= 8 ? "text-pos font-semibold" : rating < 7 && rating > 0 ? "text-neg" : "")
        }
      >
        {rating > 0 ? rating.toFixed(1) : "—"}
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <div className="py-3 text-sm text-muted-foreground">{children}</div>;
}

function Kpi({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: "pos" | "neg";
}) {
  const toneClass = tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "";
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <span
        className={
          "font-mono-num " +
          (accent ? "text-xl text-accent font-semibold " : "text-lg ") +
          toneClass
        }
      >
        {value}
      </span>
    </div>
  );
}

function statusLabel(status: SquadBundle["status"] | undefined): string {
  if (status === "ready") return "정상";
  if (status === "partial") return "일부 데이터";
  if (status === "missing") return "대기";
  return "확인 중";
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={
        "py-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider " +
        className
      }
    >
      {children}
    </th>
  );
}

function ThNum({ children }: { children: React.ReactNode }) {
  return (
    <th className="py-2.5 px-3 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
  muted,
}: {
  children: React.ReactNode;
  className?: string;
  muted?: boolean;
}) {
  return (
    <td
      className={
        "py-2.5 px-3 text-right font-mono-num text-sm " +
        (muted ? "text-muted-foreground " : "text-foreground/90 ") +
        className
      }
    >
      {children}
    </td>
  );
}
