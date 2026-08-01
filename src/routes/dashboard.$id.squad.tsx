import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ExternalLink, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSeason } from "@/lib/season-context";
import { OWNER_DETAILS } from "@/lib/ownerData";
import {
  fetchRankingData,
  fetchSquadBundle,
  numberOr,
  type OpenApiSquadPlayer,
  type OpenApiSquadSnapshot,
  type SquadBundle,
} from "@/lib/service-data";
import {
  SQUAD_ANALYSIS,
  type FormationUsageRaw,
  type ManagerModeAnalysisRaw,
  type Position,
  type SquadAnalysisRaw,
  type SquadPlayerRaw,
  type TacticalStyleRaw,
} from "@/lib/squadData";

export const Route = createFileRoute("/dashboard/$id/squad")({
  head: ({ params }) => ({
    meta: [
      {
        title: `스쿼드 분석 · ${OWNER_DETAILS[params.id]?.구단주 ?? params.id} — ESCLUB`,
      },
      {
        name: "description",
        content: `${OWNER_DETAILS[params.id]?.구단주 ?? "구단주"}의 주전 11인, 로테이션, 포메이션·전술 사용 분포.`,
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SquadPage,
});

function SquadPage() {
  const { id } = Route.useParams();
  const { season } = useSeason();
  const [bundle, setBundle] = useState<SquadBundle | null>(null);
  const [rankingName, setRankingName] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<SnapshotPlayer | null>(null);
  const [activeTeamColor, setActiveTeamColor] = useState<TeamColor | null>(null);

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
  }, [id, season]);

  const owner = useMemo(() => {
    const existing = OWNER_DETAILS[id];
    if (existing) return existing;
    return {
      id,
      구단주:
        bundle?.squad?.player?.nickname ?? bundle?.manager?.player?.nickname ?? rankingName ?? id,
      시즌: season,
      랭킹: 0,
      승: 0,
      무: 0,
      패: 0,
      승률: 0,
      득점: 0,
      실점: 0,
      득실: 0,
      포인트: 0,
      최근폼: [],
      티어: "분석",
    };
  }, [bundle, id, rankingName, season]);

  const squad = useMemo(() => resolveSquad(id, owner.구단주, bundle), [bundle, id, owner.구단주]);
  const mm = useMemo(() => resolveManagerMode(bundle), [bundle]);
  const watchList = useMemo(() => buildWatchList(bundle), [bundle]);
  const recentMatches = bundle?.matches?.rows?.slice(0, 5) ?? [];
  const squadMeta = bundle?.snapshot?.squad;
  const pitchPlayers = useMemo(() => latestMatchPitchPlayers(bundle), [bundle]);
  const recentFormation = useMemo(() => formationFromPitchPlayers(pitchPlayers), [pitchPlayers]);
  const formationLabel = recentFormation || squadMeta?.formation || mm.주포메이션 || "-";
  const teamColors = bundle?.snapshot?.teamColors ?? [];

  const totalForms = mm.포메이션별.reduce((s, f) => s + f.경기수, 0);
  const totalStyles = mm.전술스타일.reduce((s, f) => s + f.경기수, 0);

  return (
    <div className="flex flex-col">
      <div className="px-4 md:px-8 py-6 border-b border-border">
        <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground mb-3">
          <Link
            to="/dashboard/$id"
            params={{ id }}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <ChevronLeft className="size-3" /> {owner.구단주}
          </Link>
          <span>/</span>
          <span className="text-foreground">스쿼드 분석</span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">스쿼드 분석</h2>
            <p className="mt-1 text-[11px] font-mono text-muted-foreground">
              최근 갱신: {formatUpdatedAt(squad.갱신일자)} · 상태: {statusLabel(bundle?.status)}
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2">
            <Kpi label="기용" value={`${squad.기용선수수}`} unit="명" />
            <Kpi label="평균 평점" value={averageRating(squad).toFixed(1)} accent />
            <Kpi
              label="스쿼드가치"
              value={squadMeta?.clubValueText ?? squad.스쿼드가치.toLocaleString()}
              unit={squadMeta?.clubValueText ? undefined : "억 BP"}
            />
            <Kpi label="급여" value={formatSalary(squadMeta?.salary)} />
          </div>
        </div>
      </div>

      <section className="px-4 md:px-8 py-6 grid items-stretch gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(420px,0.5fr)]">
        <div className="order-2 flex min-w-0 flex-col lg:order-1">
          <SectionTitle>주전 11인</SectionTitle>
          <div className="mt-3 flex-1 overflow-x-auto rounded-md border border-border p-3 lg:min-h-[589px]">
            <PlayerTable
              rows={squad.주전11}
              snapshotPlayers={pitchPlayers}
              analysisRows={bundle?.squad?.rows ?? []}
              matchPlayers={bundle?.matches?.rows?.flatMap((match) => match.players ?? []) ?? []}
              onSelect={setSelectedPlayer}
              fillHeight
            />
          </div>
        </div>
        <div className="order-1 lg:order-2">
          <SectionTitle>주 포메이션</SectionTitle>
          <div className="mt-3 border border-border rounded-md p-4">
            <div className="flex items-baseline justify-between">
              <span className="font-mono-num text-2xl text-accent font-semibold">
                {formationLabel}
              </span>
              <TeamColorStrip
                colors={teamColors}
                activeColor={activeTeamColor}
                onHover={setActiveTeamColor}
              />
            </div>
            <PitchDiagram
              players={pitchPlayers}
              activeTeamColor={activeTeamColor}
              onSelect={setSelectedPlayer}
            />
          </div>
        </div>
      </section>

      <section className="px-4 md:px-8 py-6 border-t border-border">
        <SectionTitle>로테이션 · Rotation squad</SectionTitle>
        <div className="mt-3 overflow-x-auto">
          <PlayerTable
            rows={squad.로테이션}
            snapshotPlayers={bundle?.snapshot?.players ?? []}
            analysisRows={bundle?.squad?.rows ?? []}
            matchPlayers={bundle?.matches?.rows?.flatMap((match) => match.players ?? []) ?? []}
            onSelect={setSelectedPlayer}
          />
        </div>
      </section>

      <section className="px-4 md:px-8 py-6 border-t border-border grid gap-8 lg:grid-cols-2">
        <div>
          <SectionTitle>포메이션 사용 분포</SectionTitle>
          <div className="mt-3 space-y-2">
            {mm.포메이션별.map((f) => (
              <FormationRow key={f.포메이션} row={f} total={totalForms} />
            ))}
          </div>
        </div>
        <div>
          <SectionTitle>전술 스타일</SectionTitle>
          <div className="mt-3 space-y-2">
            {mm.전술스타일.map((s) => (
              <StyleRow key={s.스타일} row={s} total={totalStyles} />
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 md:px-8 py-6 border-t border-border">
        <SectionTitle>매니저 모드 · 경기당 평균</SectionTitle>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-x-8 gap-y-4">
          <Kpi label="점유율" value={`${mm.평균점유율}%`} />
          <Kpi label="슈팅" value={mm.평균슈팅.toFixed(1)} />
          <Kpi label="유효슈팅" value={mm.평균유효슈팅.toFixed(1)} />
          <Kpi label="패스성공률" value={`${(mm.평균패스성공률 * 100).toFixed(1)}%`} />
          <Kpi label="평균 교체시점" value={`${mm.교체시점평균}′`} />
        </div>
      </section>

      <section className="px-4 md:px-8 py-6 border-t border-border grid gap-8 lg:grid-cols-2">
        <div>
          <SectionTitle>최근 경기</SectionTitle>
          <div className="mt-3 divide-y divide-border/60 border-y border-border">
            {recentMatches.length > 0 ? (
              recentMatches.map((match) => (
                <Link
                  key={match.matchKey}
                  to="/dashboard/$id/match/$matchKey"
                  params={{ id, matchKey: match.matchKey ?? "unknown" }}
                  className="grid grid-cols-[96px_minmax(0,1fr)_72px] gap-3 py-3 text-sm hover:bg-surface-2/60 transition-colors"
                >
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {formatDate(match.dateKst)}
                  </span>
                  <span className="truncate">{match.opponent?.nickname ?? "UNKNOWN"}</span>
                  <span className="text-right font-mono-num">
                    {match.self?.score ?? "-"}:{match.opponent?.score ?? "-"}
                  </span>
                </Link>
              ))
            ) : (
              <EmptyLine>최근 경기 분석 파일 없음</EmptyLine>
            )}
          </div>
        </div>
        <div>
          <SectionTitle>점검 후보</SectionTitle>
          <div className="mt-3 divide-y divide-border/60 border-y border-border">
            {watchList.length > 0 ? (
              watchList.map((player) => (
                <div
                  key={player.playerKey ?? player.spId}
                  className="grid grid-cols-4 gap-3 py-3 text-sm"
                >
                  <span className="col-span-2 truncate">{player.playerName ?? player.name}</span>
                  <span className="font-mono-num text-right text-muted-foreground">
                    {numberOr(player.appearances, 0)}경기
                  </span>
                  <span className="font-mono-num text-right text-neg">
                    {(numberOr(player.playerWinRate, 0) * 100).toFixed(0)}%
                  </span>
                </div>
              ))
            ) : (
              <EmptyLine>점검 후보 없음</EmptyLine>
            )}
          </div>
        </div>
      </section>

      {selectedPlayer && (
        <PlayerModal
          ownerId={id}
          player={selectedPlayer}
          bundle={bundle}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  );
}

function resolveSquad(id: string, ownerName: string, bundle: SquadBundle | null): SquadAnalysisRaw {
  const rows = bundle?.squad?.rows ?? [];
  if (rows.length === 0) {
    return (
      SQUAD_ANALYSIS[id] ?? {
        id,
        구단주: ownerName,
        갱신일자: "",
        기용선수수: 0,
        평균OVR: 0,
        스쿼드가치: 0,
        주전11: [],
        로테이션: [],
      }
    );
  }

  const players = rows.map(openApiPlayerToSquadPlayer);
  return {
    id,
    구단주: ownerName,
    갱신일자: bundle?.squad?.generatedAt ?? "",
    기용선수수: bundle?.squad?.summary?.uniquePlayers ?? players.length,
    평균OVR: averageNumber(players.map((player) => player.OVR)),
    스쿼드가치: 0,
    주전11: players.slice(0, 11),
    로테이션: players.slice(11, 20),
  };
}

function resolveManagerMode(bundle: SquadBundle | null): ManagerModeAnalysisRaw {
  const summary = bundle?.manager?.summary;
  const formationRows =
    bundle?.manager?.expanded?.formationPerformance?.map((row) => ({
      포메이션: row.formation ?? row.label ?? "-",
      경기수: numberOr(row.matches, 0),
      승: numberOr(row.w, 0),
      무: numberOr(row.d, 0),
      패: numberOr(row.l, 0),
    })) ?? [];

  if (!summary && formationRows.length === 0) {
    return {
      주포메이션: "-",
      포메이션별: [{ 포메이션: "-", 경기수: 0, 승: 0, 무: 0, 패: 0 }],
      전술스타일: [{ 스타일: "전체", 경기수: 0, 승률: 0 }],
      평균점유율: 0,
      평균슈팅: 0,
      평균유효슈팅: 0,
      평균패스성공률: 0,
      교체시점평균: 0,
    };
  }

  return {
    주포메이션: formationRows[0]?.포메이션 ?? bundle?.snapshot?.squad?.formation ?? "-",
    포메이션별:
      formationRows.length > 0
        ? formationRows
        : [{ 포메이션: "-", 경기수: 0, 승: 0, 무: 0, 패: 0 }],
    전술스타일: [
      {
        스타일: bundle?.manager?.expanded?.styleProfile?.primary ?? "전체",
        경기수: numberOr(summary?.sampleSize, 0),
        승률: numberOr(summary?.winRate, 0) / 100,
      },
    ],
    평균점유율: Math.round(numberOr(summary?.averagePossession, 0)),
    평균슈팅: numberOr(summary?.shotsPerMatch, 0),
    평균유효슈팅: numberOr(summary?.shotsOnTargetPerMatch, 0),
    평균패스성공률: numberOr(summary?.passSuccessRate, 0) / 100,
    교체시점평균: 0,
  };
}

function openApiPlayerToSquadPlayer(row: OpenApiSquadPlayer): SquadPlayerRaw {
  return {
    선수id: row.playerKey ?? String(row.spId ?? row.playerName ?? row.name ?? "unknown"),
    선수명: row.playerName ?? row.name ?? String(row.spId ?? "UNKNOWN"),
    포지션: normalizePosition(row.positionName ?? row.position),
    국적: "-",
    시즌: row.seasonName ?? (row.seasonId ? String(row.seasonId) : "-"),
    OVR: Math.round(
      numberOr(row.avgRating, numberOr(row.attackPower, numberOr(row.defensePower, 0))),
    ),
    경기수: numberOr(row.appearances, 0),
    선발: numberOr(row.appearances, 0),
    득점: numberOr(row.goal, 0),
    도움: numberOr(row.assist, 0),
    평점: numberOr(row.avgRating, 0),
    가치: Math.round(numberOr(row.attackPower, 0)),
  };
}

function normalizePosition(value: string | undefined): Position {
  const pos = (value ?? "CM").replace(/[LR]/g, "");
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
  if (allowed.includes(value as Position)) return value as Position;
  if (allowed.includes(pos as Position)) return pos as Position;
  return "CM";
}

function buildWatchList(bundle: SquadBundle | null): OpenApiSquadPlayer[] {
  const rows = bundle?.squad?.rows ?? [];
  return rows
    .filter((row) => numberOr(row.appearances, 0) >= 5 && numberOr(row.playerWinRate, 1) < 0.45)
    .sort((a, b) => numberOr(a.playerWinRate, 1) - numberOr(b.playerWinRate, 1))
    .slice(0, 5);
}

function averageRating(squad: SquadAnalysisRaw): number {
  return averageNumber([...squad.주전11, ...squad.로테이션].map((player) => player.평점));
}

function averageNumber(values: number[]): number {
  const finite = values.filter((value) => Number.isFinite(value) && value > 0);
  if (finite.length === 0) return 0;
  return Math.round((finite.reduce((sum, value) => sum + value, 0) / finite.length) * 10) / 10;
}

function formatDate(value: string | undefined): string {
  if (!value) return "-";
  return value.slice(0, 10);
}

function PlayerTable({
  rows,
  snapshotPlayers = [],
  analysisRows = [],
  matchPlayers = [],
  onSelect,
  fillHeight = false,
}: {
  rows: SquadPlayerRaw[];
  snapshotPlayers?: SnapshotPlayer[];
  analysisRows?: OpenApiSquadPlayer[];
  matchPlayers?: MatchPlayerForGrade[];
  onSelect: (player: SnapshotPlayer) => void;
  fillHeight?: boolean;
}) {
  if (rows.length === 0) return <EmptyLine>선수 분석 파일 없음</EmptyLine>;
  return (
    <table
      className={
        "w-full text-left border-collapse md:min-w-[520px] " + (fillHeight ? "h-full" : "")
      }
    >
      <thead>
        <tr className="border-b border-border">
          <Th>POS</Th>
          <Th>선수</Th>
          <Th>시즌</Th>
          <ThNum>강화</ThNum>
          <ThNum>경기(선발)</ThNum>
          <ThNum>골</ThNum>
          <ThNum>어시스트</ThNum>
          <ThNum>공격포인트</ThNum>
          <ThNum>선수가치</ThNum>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/50">
        {rows.map((p) => {
          const snapshot = findSnapshotPlayer(p, snapshotPlayers);
          const analysis = findAnalysisPlayer(p, analysisRows);
          const grade = resolvePlayerGrade(p, snapshot, analysis, matchPlayers);
          return (
            <tr key={p.선수id} className="transition-colors hover:bg-surface-2/60">
              <td className="py-2 px-2">
                <span className="inline-flex items-center justify-center min-w-8 px-1.5 h-5 rounded-[3px] border border-border/80 text-[10px] font-mono font-semibold text-muted-foreground">
                  {displayPosition(p, snapshot)}
                </span>
              </td>
              <td className="py-2 px-2">
                {snapshot ? (
                  <button
                    type="button"
                    onClick={() => onSelect(snapshot)}
                    className="group block max-w-full text-left"
                  >
                    <span className="block truncate text-sm group-hover:text-accent transition-colors">
                      {p.선수명}
                    </span>
                  </button>
                ) : (
                  <span className="block truncate text-sm group-hover:text-accent transition-colors">
                    {p.선수명}
                  </span>
                )}
              </td>
              <td className="py-2 px-2">
                {analysis?.seasonImg ? (
                  <img
                    src={analysis.seasonImg}
                    alt={compactSeasonName(analysis.seasonName ?? p.시즌)}
                    title={compactSeasonName(analysis.seasonName ?? p.시즌)}
                    className="h-5 w-8 object-contain"
                    loading="lazy"
                  />
                ) : (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {compactSeasonName(p.시즌)}
                  </span>
                )}
              </td>
              <td className="py-2 px-2 text-center">
                <EnhanceGrade grade={grade} />
              </td>
              <Td className="min-w-16">
                {p.경기수}
                <span className="text-muted-foreground text-[11px]"> ({p.선발})</span>
              </Td>
              <Td>{p.득점}</Td>
              <Td>{p.도움}</Td>
              <Td className="text-accent font-semibold">
                {formatAttackPointPerMatch(analysis, p)}
              </Td>
              <Td muted>{snapshot?.priceText ?? p.가치}</Td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function FormationRow({ row, total }: { row: FormationUsageRaw; total: number }) {
  const pct = total > 0 ? row.경기수 / total : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-mono-num">{row.포메이션}</span>
        <span className="font-mono-num text-muted-foreground">
          {row.경기수}경기 · {row.승}-{row.무}-{row.패} · {(pct * 100).toFixed(0)}%
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full bg-surface-2 rounded-sm overflow-hidden">
        <div className="h-full bg-accent" style={{ width: `${pct * 100}%` }} aria-hidden />
      </div>
    </div>
  );
}

function StyleRow({ row, total }: { row: TacticalStyleRaw; total: number }) {
  const pct = total > 0 ? row.경기수 / total : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span>{row.스타일}</span>
        <span className="font-mono-num text-muted-foreground">
          {row.경기수}경기 · 승률 {(row.승률 * 100).toFixed(0)}%
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full bg-surface-2 rounded-sm overflow-hidden">
        <div
          className={
            "h-full " + (row.승률 >= 0.6 ? "bg-pos" : row.승률 >= 0.5 ? "bg-accent" : "bg-warn")
          }
          style={{ width: `${pct * 100}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}

type SnapshotPlayer = NonNullable<OpenApiSquadSnapshot["players"]>[number];
type TeamColor = NonNullable<OpenApiSquadSnapshot["teamColors"]>[number];
type MatchPlayerForGrade = NonNullable<
  NonNullable<SquadBundle["matches"]>["rows"][number]["players"]
>[number];

function latestMatchPitchPlayers(bundle: SquadBundle | null): SnapshotPlayer[] {
  const snapshot = bundle?.snapshot?.players ?? [];
  const snapshotBySpid = new Map(
    snapshot.flatMap((player) =>
      player.spId
        ? [
            [String(player.spId), player] as const,
            [String(player.spId % 1_000_000), player] as const,
          ]
        : [],
    ),
  );

  const latestUsableMatch = (bundle?.matches?.rows ?? []).find((match) => {
    const starters = (match.players ?? []).filter(
      (player) => player.positionName !== "SUB" && numberOr(player.rating, 0) > 0,
    );
    return starters.length >= 11;
  });
  const starters = (latestUsableMatch?.players ?? [])
    .filter((player) => player.positionName !== "SUB" && numberOr(player.rating, 0) > 0)
    .slice(0, 11);

  if (starters.length < 11) return snapshot.filter((player) => player.starter).slice(0, 11);
  return starters.map((player, index) => {
    const matched =
      player.spId &&
      (snapshotBySpid.get(String(player.spId)) ??
        snapshotBySpid.get(String(player.spId % 1_000_000)));
    return {
      ...matched,
      spId: player.spId,
      name: player.name ?? matched?.name,
      role: player.positionName ?? matched?.role,
      position: player.positionName ?? matched?.position,
      order: index,
      starter: true,
      spGrade: player.spGrade ?? matched?.spGrade,
    };
  });
}

function formationFromPitchPlayers(players: SnapshotPlayer[]): string {
  const starters = players.filter(
    (player) => String(player.position ?? player.role ?? "") !== "SUB",
  );
  if (starters.length === 0) return "-";
  const counts = [0, 0, 0];
  for (const player of starters) {
    const pos = String(player.position ?? player.role ?? "").toUpperCase();
    if (pos === "GK") continue;
    if (pos.includes("B")) counts[0] += 1;
    else if (pos.includes("M")) counts[1] += 1;
    else counts[2] += 1;
  }
  return counts.join("-");
}

function PitchDiagram({
  players,
  activeTeamColor,
  onSelect,
}: {
  players: SnapshotPlayer[];
  activeTeamColor: TeamColor | null;
  onSelect: (player: SnapshotPlayer) => void;
}) {
  const fallbackRows = [[1], [4], [2], [3], [1]];
  const placedPlayers = players
    .map((player, index) => ({ player, index, position: pitchPosition(player, index) }))
    .sort((a, b) => numberOr(a.player.order, a.index) - numberOr(b.player.order, b.index));

  return (
    <div className="mt-4 relative aspect-[3/4] min-h-[520px] w-full rounded-sm bg-[radial-gradient(ellipse_at_center,color-mix(in_oklab,var(--accent)_8%,transparent),transparent_65%)] overflow-hidden">
      <div className="absolute inset-2 border border-border/60 rounded-sm" />
      <div className="absolute left-2 right-2 top-1/2 h-px bg-border/60" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-10 rounded-full border border-border/60" />
      {placedPlayers.length > 0 ? (
        <div className="absolute inset-0">
          {placedPlayers.map(({ player, position }) => (
            <button
              key={player.spId ?? player.name}
              type="button"
              onClick={() => onSelect(player)}
              className={
                "absolute w-[88px] h-[72px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[4px] border bg-background/90 text-left shadow-sm transition-colors hover:border-accent/60 hover:text-accent " +
                (teamColorAppliesToPlayer(player, players, activeTeamColor)
                  ? "border-accent/80 shadow-[0_0_0_2px_color-mix(in_oklab,var(--accent)_22%,transparent)]"
                  : "border-border/80")
              }
              style={{ left: `${position.x}%`, top: `${position.y}%` }}
              title={`${player.name ?? "UNKNOWN"} · ${player.role ?? player.position ?? "-"}`}
            >
              <div className="absolute inset-x-0 top-0 h-11 bg-surface-2/70">
                {player.spId && (
                  <PlayerImage spId={player.spId} className="mx-auto h-12 w-12 object-contain" />
                )}
                {numberOr(player.spGrade, 0) > 0 && (
                  <span className="absolute right-1 top-1 rounded-[3px] bg-background/90 px-1 font-mono-num text-[9px] font-semibold text-accent ring-1 ring-border">
                    +{player.spGrade}
                  </span>
                )}
              </div>
              <div className="absolute inset-x-1 bottom-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[8px] font-mono uppercase text-muted-foreground truncate">
                    {String(player.role ?? player.position ?? "-").toUpperCase()}
                  </span>
                  <span className="text-[8px] font-mono-num text-accent">
                    {numberOr(player.pay, 0)}
                  </span>
                </div>
                <div className="truncate text-[10px] font-medium leading-tight">
                  {player.name ?? player.spId}
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="absolute inset-3 flex flex-col-reverse justify-between">
          {fallbackRows.map((row, ri) => (
            <div key={ri} className="flex justify-around">
              {row.map((_, i) => (
                <span
                  key={i}
                  className="size-2.5 rounded-full bg-accent ring-2 ring-background"
                  aria-hidden
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerModal({
  ownerId,
  player,
  bundle,
  onClose,
}: {
  ownerId: string;
  player: SnapshotPlayer;
  bundle: SquadBundle | null;
  onClose: () => void;
}) {
  const playerId = String(player.spId ?? player.name ?? "unknown");
  const analysis = bundle?.squad?.rows?.find((row) => snapshotMatchesAnalysis(player, row));
  const recent = recentPlayerMatches(player, bundle).slice(0, 6);
  const classRows = matchingClassRows(analysis, bundle).slice(0, 3);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/70 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-md border border-border bg-background shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              {String(player.role ?? player.position ?? "-").toUpperCase()}
            </div>
            <h3 className="text-base font-semibold">{player.name ?? player.spId}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-7 place-items-center rounded-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            aria-label="닫기"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-4 p-4 md:grid-cols-[140px_minmax(0,1fr)] md:gap-5">
          <div className="grid size-24 place-items-center rounded-md border border-border bg-surface-2/50 md:size-36">
            {player.spId ? (
              <PlayerImage
                spId={player.spId}
                className="h-24 w-24 object-contain md:h-32 md:w-32"
              />
            ) : (
              <span className="text-xs text-muted-foreground">NO IMAGE</span>
            )}
          </div>
          <div className="grid content-start gap-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <ModalLine label="SPID" value={playerId} />
              <ModalLine label="급여" value={`${numberOr(player.pay, 0)}`} />
              <ModalLine label="가격" value={player.priceText ?? "-"} />
              <ModalLine label="상태" value={player.starter ? "선발" : "후보"} />
              <ModalLine label="출전" value={`${numberOr(analysis?.appearances, 0)}경기`} />
              <ModalLine
                label="승률"
                value={`${numberOr(analysis?.playerWinRate, 0).toFixed(1)}%`}
              />
              <ModalLine label="득점" value={`${numberOr(analysis?.goal, 0)}`} />
              <ModalLine label="도움" value={`${numberOr(analysis?.assist, 0)}`} />
              <ModalLine label="공격P/경기" value={formatAnalysisAttackPointPerMatch(analysis)} />
              <ModalLine label="평점" value={numberOr(analysis?.avgRating, 0).toFixed(2)} />
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <ModalLine label="패스 성공" value={`${ratioPercent(analysis?.passSuccessRate)}`} />
              <ModalLine
                label="드리블 성공"
                value={`${ratioPercent(analysis?.dribbleSuccessRate)}`}
              />
              <ModalLine label="태클 성공" value={`${ratioPercent(analysis?.tackleSuccessRate)}`} />
              <ModalLine label="공중볼" value={`${ratioPercent(analysis?.aerialSuccessRate)}`} />
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-border p-4 md:grid-cols-2">
          <div className="hidden md:block">
            <SectionTitle>최근 경기</SectionTitle>
            <div className="mt-2 divide-y divide-border/50 border-y border-border/60">
              {recent.length > 0 ? (
                recent.map((match) => (
                  <div
                    key={match.matchKey}
                    className="grid grid-cols-[76px_minmax(0,1fr)_48px] gap-2 py-2 text-xs"
                  >
                    <span className="font-mono-num text-muted-foreground">
                      {formatDate(match.dateKst)}
                    </span>
                    <span className="truncate">{match.opponent?.nickname ?? "UNKNOWN"}</span>
                    <span className="text-right font-mono-num text-accent">
                      {numberOr(match.player?.rating, 0).toFixed(1)}
                    </span>
                  </div>
                ))
              ) : (
                <EmptyLine>최근 경기 없음</EmptyLine>
              )}
            </div>
          </div>
          <div>
            <SectionTitle>클래스 집계</SectionTitle>
            <div className="mt-2 divide-y divide-border/50 border-y border-border/60">
              {classRows.length > 0 ? (
                classRows.map((row) => (
                  <div
                    key={row.seasonId}
                    className="grid grid-cols-[minmax(0,1fr)_48px_48px] gap-2 py-2 text-xs"
                  >
                    <span className="truncate">{compactSeasonName(row.seasonName ?? "-")}</span>
                    <span className="text-right font-mono-num text-muted-foreground">
                      {numberOr(row.appearances, 0)}
                    </span>
                    <span className="text-right font-mono-num text-accent">
                      {numberOr(row.avgRating, 0).toFixed(2)}
                    </span>
                  </div>
                ))
              ) : (
                <EmptyLine>클래스 집계 없음</EmptyLine>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-surface-2/60 px-3 py-1.5 text-xs font-medium hover:bg-surface-2"
          >
            닫기
          </button>
          <Link
            to="/dashboard/$id/player/$playerId"
            params={{ id: ownerId, playerId }}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:brightness-110"
          >
            상세 페이지
            <ExternalLink className="size-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function ModalLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/50 pb-1.5 last:border-b-0">
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 truncate text-right font-mono-num">{value}</span>
    </div>
  );
}

function PlayerImage({ spId, className }: { spId: number; className: string }) {
  const [srcIndex, setSrcIndex] = useState(0);
  const sources = playerImageSources(spId);
  const src = sources[srcIndex];
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className={className}
      onError={() => setSrcIndex((index) => index + 1)}
    />
  );
}

function playerImageSources(spId: number): string[] {
  const baseId = spId % 1000000;
  const ids = baseId > 0 && baseId !== spId ? [baseId, spId] : [spId];
  return [
    ...ids.map(
      (id) => `https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/playersAction/p${id}.png`,
    ),
    ...ids.map(
      (id) => `https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/players/p${id}.png`,
    ),
    `/api/player-image/${spId}?kind=portrait`,
  ];
}

function TeamColorStrip({
  colors,
  activeColor,
  onHover,
}: {
  colors: NonNullable<OpenApiSquadSnapshot["teamColors"]>;
  activeColor: TeamColor | null;
  onHover: (color: TeamColor | null) => void;
}) {
  if (colors.length === 0) {
    return <span className="text-[10px] font-mono text-muted-foreground">팀컬러 없음</span>;
  }
  return (
    <div className="flex max-w-[260px] items-center justify-end gap-1.5 overflow-visible">
      {sortTeamColors(colors)
        .slice(0, 5)
        .map((color) => {
          const active = sameTeamColor(color, activeColor);
          const skills = (color.skills ?? [])
            .map((skill) => skill.label ?? skill.name)
            .filter(Boolean)
            .join(" · ");
          return (
            <button
              key={color.id ?? color.name}
              type="button"
              onMouseEnter={() => onHover(color)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(color)}
              onBlur={() => onHover(null)}
              aria-label={color.name ?? "팀컬러"}
              className={
                "group relative grid size-7 shrink-0 place-items-center rounded-sm border bg-surface-2 transition-colors " +
                (active
                  ? "border-accent/80 shadow-[0_0_0_2px_color-mix(in_oklab,var(--accent)_24%,transparent)]"
                  : "border-border/70 hover:border-accent/60")
              }
            >
              {color.image ? (
                <img src={color.image} alt="" className="size-6 object-contain" loading="lazy" />
              ) : (
                <span className="text-[10px] font-mono text-muted-foreground">
                  {color.level ?? "-"}
                </span>
              )}
              <span className="pointer-events-none absolute right-0 top-8 z-20 hidden w-56 rounded-md border border-border bg-background p-2 text-left shadow-xl group-hover:block group-focus:block">
                <span className="block text-[10px] font-mono text-muted-foreground">
                  {color.groupLabel ?? color.group ?? "팀컬러"} · {color.playerCount ?? 0}명
                </span>
                <span className="mt-0.5 block text-xs font-semibold text-foreground">
                  {color.name ?? "-"}
                </span>
                <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">
                  {skills || "효과 정보 없음"}
                </span>
              </span>
            </button>
          );
        })}
    </div>
  );
}

function sortTeamColors(
  colors: NonNullable<OpenApiSquadSnapshot["teamColors"]>,
): NonNullable<OpenApiSquadSnapshot["teamColors"]> {
  return [...colors].sort((a, b) => teamColorSortOrder(a) - teamColorSortOrder(b));
}

function teamColorSortOrder(color: TeamColor): number {
  const group = String(color.group ?? color.groupLabel ?? "").toLowerCase();
  const label = `${color.groupLabel ?? ""} ${color.name ?? ""}`;
  if (group.includes("affiliation") || label.includes("팀컬러")) return 0;
  if (group.includes("feature") || label.includes("특성")) return 1;
  if (group.includes("enhance") || label.includes("강화")) return 2;
  return 3;
}

function sameTeamColor(a: TeamColor | null | undefined, b: TeamColor | null | undefined): boolean {
  if (!a || !b) return false;
  if (a.id && b.id) return a.id === b.id;
  return Boolean(a.name && b.name && a.name === b.name);
}

function teamColorAppliesToPlayer(
  player: SnapshotPlayer,
  players: SnapshotPlayer[],
  color: TeamColor | null | undefined,
): boolean {
  if (!color) return false;
  const appliedCount = Math.max(0, Math.min(players.length, numberOr(color.playerCount, 0)));
  if (appliedCount === 0) return false;
  const appliedPlayers = players
    .filter((row) => row.starter !== false)
    .sort((a, b) => numberOr(a.order, 0) - numberOr(b.order, 0))
    .slice(0, appliedCount);
  return appliedPlayers.some((row) => String(row.spId) === String(player.spId));
}

function findSnapshotPlayer(
  player: SquadPlayerRaw,
  snapshotPlayers: SnapshotPlayer[],
): SnapshotPlayer | undefined {
  return snapshotPlayers.find(
    (snapshot) =>
      String(snapshot.spId) === player.선수id ||
      snapshot.name === player.선수명 ||
      String(snapshot.spId) === String(player.선수id).replace(/\D/g, ""),
  );
}

function resolvePlayerGrade(
  player: SquadPlayerRaw,
  snapshot: SnapshotPlayer | undefined,
  analysis: OpenApiSquadPlayer | undefined,
  matchPlayers: MatchPlayerForGrade[],
): number {
  const snapshotGrade = numberOr(snapshot?.spGrade, 0);
  if (snapshotGrade > 0) return snapshotGrade;
  const analysisGrade = numberOr(
    (analysis as OpenApiSquadPlayer & { spGrade?: number })?.spGrade,
    0,
  );
  if (analysisGrade > 0) return analysisGrade;
  const idDigits = String(player.선수id).replace(/\D/g, "");
  const baseId = idDigits ? String(Number(idDigits) % 1_000_000) : "";
  const matched = matchPlayers.find((row) => {
    if (row.spId) {
      const rowId = String(row.spId);
      const rowBaseId = String(row.spId % 1_000_000);
      if (rowId === idDigits || rowBaseId === idDigits || (baseId && rowBaseId === baseId)) {
        return true;
      }
    }
    return (
      row.name === player.선수명 || row.name === analysis?.playerName || row.name === analysis?.name
    );
  });
  return numberOr(matched?.spGrade, 0);
}

function EnhanceGrade({ grade }: { grade: number }) {
  const [srcIndex, setSrcIndex] = useState(0);
  const sources = enhanceGradeImageSources(grade);

  useEffect(() => {
    setSrcIndex(0);
  }, [grade]);

  if (grade <= 0) return <span className="text-muted-foreground">-</span>;
  const src = sources[srcIndex];
  if (!src) return <EnhanceGradeText grade={grade} />;
  return (
    <img
      src={src}
      alt={`+${grade}`}
      title={`+${grade}`}
      className="mx-auto h-5 w-8 object-contain"
      loading="lazy"
      onError={() => setSrcIndex((index) => index + 1)}
    />
  );
}

function EnhanceGradeText({ grade }: { grade: number }) {
  return (
    <span className="inline-flex h-5 min-w-8 items-center justify-center rounded-[3px] border border-border/80 bg-surface-2/60 px-1.5 font-mono-num text-[10px] font-semibold text-accent">
      +{grade}
    </span>
  );
}

function enhanceGradeImageSources(grade: number): string[] {
  if (grade <= 0) return [];
  return [
    `https://ssl.nexon.com/s2/game/fc/online/obt/externalAssets/new/grade/grade_${grade}.png`,
    `https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/grade/grade_${grade}.png`,
    `https://ssl.nexon.com/s2/game/fc/online/obt/externalAssets/new/season/grade_${grade}.png`,
  ];
}

function formatAttackPointPerMatch(
  analysis: OpenApiSquadPlayer | undefined,
  player: SquadPlayerRaw,
): string {
  const attackPoint = numberOr(analysis?.attackPoint, player.득점 + player.도움);
  const appearances = numberOr(analysis?.appearances, player.경기수);
  return formatPerMatch(attackPoint, appearances);
}

function formatAnalysisAttackPointPerMatch(analysis: OpenApiSquadPlayer | undefined): string {
  const attackPoint = numberOr(
    analysis?.attackPoint,
    numberOr(analysis?.goal, 0) + numberOr(analysis?.assist, 0),
  );
  const appearances = numberOr(analysis?.appearances, 0);
  return formatPerMatch(attackPoint, appearances);
}

function formatPerMatch(total: number, appearances: number): string {
  if (appearances <= 0) return "0.00";
  return (total / appearances).toFixed(2);
}

function findAnalysisPlayer(
  player: SquadPlayerRaw,
  analysisRows: OpenApiSquadPlayer[],
): OpenApiSquadPlayer | undefined {
  return analysisRows.find(
    (row) =>
      row.playerKey === player.선수id ||
      String(row.spId) === player.선수id ||
      row.playerName === player.선수명 ||
      row.name === player.선수명,
  );
}

function snapshotMatchesAnalysis(player: SnapshotPlayer, row: OpenApiSquadPlayer): boolean {
  return (
    String(player.spId) === String(row.spId) ||
    player.name === row.playerName ||
    player.name === row.name
  );
}

function recentPlayerMatches(player: SnapshotPlayer, bundle: SquadBundle | null) {
  return (bundle?.matches?.rows ?? [])
    .map((match) => ({
      ...match,
      player: match.players?.find((item) => String(item.spId) === String(player.spId)),
    }))
    .filter((match) => match.player && numberOr(match.player.rating, 0) > 0);
}

function matchingClassRows(player: OpenApiSquadPlayer | undefined, bundle: SquadBundle | null) {
  const rows = bundle?.classes?.classRows ?? [];
  if (!player?.seasonId) return rows;
  const exact = rows.filter((row) => row.seasonId === player.seasonId);
  return exact.length > 0 ? exact : rows;
}

function displayPosition(player: SquadPlayerRaw, snapshot: SnapshotPlayer | undefined): string {
  return String(snapshot?.role ?? snapshot?.position ?? player.포지션).toUpperCase();
}

function ratioPercent(value: number | undefined): string {
  const n = numberOr(value, 0);
  const pct = n <= 1 ? n * 100 : n;
  return `${pct.toFixed(1)}%`;
}

function compactSeasonName(value: string): string {
  return value.replace(/\s*\([^)]*\)/g, "").trim();
}

function pitchPosition(player: SnapshotPlayer, index: number): { x: number; y: number } {
  const role = String(player.role ?? player.position ?? "").toLowerCase();
  const fixed: Record<string, { x: number; y: number }> = {
    gk: { x: 50, y: 88 },
    lb: { x: 20, y: 66 },
    lcb: { x: 38, y: 70 },
    cb: { x: 50, y: 70 },
    rcb: { x: 62, y: 70 },
    rb: { x: 80, y: 66 },
    lwb: { x: 14, y: 58 },
    rwb: { x: 86, y: 58 },
    cdm: { x: 50, y: 56 },
    ldm: { x: 38, y: 56 },
    rdm: { x: 62, y: 56 },
    lcm: { x: 34, y: 45 },
    cm: { x: 50, y: 45 },
    rcm: { x: 66, y: 45 },
    lm: { x: 18, y: 38 },
    rm: { x: 82, y: 38 },
    cam: { x: 50, y: 32 },
    lam: { x: 34, y: 30 },
    ram: { x: 66, y: 30 },
    lw: { x: 20, y: 20 },
    rw: { x: 80, y: 20 },
    cf: { x: 50, y: 20 },
    st: { x: 50, y: 12 },
  };
  if (fixed[role]) return fixed[role];
  const fallback = [
    { x: 50, y: 88 },
    { x: 20, y: 66 },
    { x: 38, y: 70 },
    { x: 62, y: 70 },
    { x: 80, y: 66 },
    { x: 38, y: 52 },
    { x: 62, y: 52 },
    { x: 22, y: 34 },
    { x: 50, y: 30 },
    { x: 78, y: 34 },
    { x: 50, y: 14 },
  ];
  return fallback[index] ?? { x: 50, y: 50 };
}

function formatSalary(
  salary: OpenApiSquadSnapshot["squad"] extends infer S
    ? S extends { salary?: infer T }
      ? T
      : never
    : never,
): string {
  if (typeof salary === "number") return `${salary}/310`;
  if (salary && typeof salary === "object") {
    const current = numberOr(salary.current, 0);
    const cap = numberOr(salary.cap, 310);
    return `${current}/${cap}`;
  }
  return "-";
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

function formatUpdatedAt(value: string | null | undefined): string {
  return value || "확인 중";
}

function statusLabel(status: SquadBundle["status"] | undefined): string {
  if (status === "ready") return "정상";
  if (status === "partial") return "일부 데이터";
  if (status === "missing") return "대기";
  return "확인 중";
}

function Kpi({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <span className="flex items-baseline gap-1">
        <span
          className={"font-mono-num " + (accent ? "text-xl text-accent font-semibold" : "text-lg")}
        >
          {value}
        </span>
        {unit && <span className="text-[10px] font-mono text-muted-foreground">{unit}</span>}
      </span>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="py-2 px-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
      {children}
    </th>
  );
}

function ThNum({ children }: { children: React.ReactNode }) {
  return (
    <th className="py-2 px-2 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
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
        "py-2 px-2 text-center font-mono-num text-sm " +
        (muted ? "text-muted-foreground " : "text-foreground/90 ") +
        className
      }
    >
      {children}
    </td>
  );
}
