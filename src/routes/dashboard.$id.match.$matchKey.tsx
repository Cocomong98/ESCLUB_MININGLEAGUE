import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRightLeft, ChevronLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSeason } from "@/lib/season-context";
import {
  getMatchDetail,
  type GoalEventRaw,
  type MatchDetailRaw,
  type TeamStatsRaw,
} from "@/lib/matchDetail";
import { OWNER_DETAILS } from "@/lib/ownerData";
import {
  divisionImageFromCode,
  divisionNameFromCode,
  fetchRankingData,
  fetchSquadBundle,
  numberOr,
  type OpenApiSquadSnapshot,
  type SquadBundle,
} from "@/lib/service-data";
import { TierBadge } from "@/components/tier-badge";
import type { MatchResult } from "@/lib/mockData";
import type { Position, SquadPlayerRaw } from "@/lib/squadData";

export const Route = createFileRoute("/dashboard/$id/match/$matchKey")({
  head: ({ params }) => {
    const md = getMatchDetail(params.id, params.matchKey);
    const owner = OWNER_DETAILS[params.id];
    const title = md ? `${owner?.구단주} vs ${md.상대} · ${md.득점}-${md.실점}` : "경기 상세";
    return {
      meta: [{ title: `${title} — ESCLUB` }, { name: "robots", content: "noindex" }],
    };
  },
  component: MatchPage,
});

function MatchPage() {
  const { id, matchKey } = Route.useParams();
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
  }, [id, matchKey, season]);

  const ownerName =
    OWNER_DETAILS[id]?.구단주 ??
    bundle?.matches?.rows?.find((row) => row.matchKey === matchKey)?.self?.nickname ??
    rankingName ??
    id;
  const md = useMemo(
    () => resolveMatchDetail(id, ownerName, matchKey, bundle) ?? getMatchDetail(id, matchKey),
    [bundle, id, matchKey, ownerName],
  );
  const liveMatch = bundle?.matches?.rows?.find((row) => row.matchKey === matchKey);

  if (!md) {
    return (
      <div className="px-4 md:px-8 py-6">
        <BackNav id={id} ownerName={ownerName} />
        <div className="mt-8 border-y border-border py-8">
          <h2 className="text-2xl font-semibold tracking-tight">경기 상세</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            경기 정보를 불러오는 중입니다. 상태: {statusLabel(bundle?.status)}
          </p>
        </div>
      </div>
    );
  }

  const resultTone = md.결과 === "W" ? "text-pos" : md.결과 === "L" ? "text-neg" : "text-warn";
  const resultLabel = md.결과 === "W" ? "승" : md.결과 === "L" ? "패" : "무";
  const selfPlayers = liveMatch?.players ?? [];
  const opponentPlayers = liveMatch?.opponentPlayers ?? [];
  const selfFormation = formationFromMatchPlayers(selfPlayers);
  const opponentFormation = formationFromMatchPlayers(opponentPlayers);
  const mom = topRatedPlayer([...selfPlayers, ...opponentPlayers]);
  const selfTierName =
    liveMatch?.self?.divisionName || divisionNameFromCode(liveMatch?.self?.division);
  const opponentTierName =
    liveMatch?.opponent?.divisionName || divisionNameFromCode(liveMatch?.opponent?.division);
  const selfTierImage = divisionImageFromCode(liveMatch?.self?.division);
  const opponentTierImage = divisionImageFromCode(liveMatch?.opponent?.division);

  return (
    <div className="flex flex-col">
      <div className="px-4 md:px-8 py-6 border-b border-border">
        <BackNav id={id} ownerName={ownerName} />

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <ResultBadge r={md.결과} size="lg" />
              <h2 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
                <TierBadge image={selfTierImage} name={selfTierName} size="lg" />
                <span>{ownerName}</span>
                <span className="text-muted-foreground font-normal">vs</span>
                <TierBadge image={opponentTierImage} name={opponentTierName} size="lg" />
                <span>{md.상대}</span>
              </h2>
            </div>
            <p className="mt-2 text-[11px] font-mono text-muted-foreground">{md.일자}</p>
          </div>

          <div className="flex items-baseline gap-4">
            <span className="font-mono-num text-5xl tabular-nums">{md.득점}</span>
            <span className={`font-mono text-xl ${resultTone}`}>:</span>
            <span className="font-mono-num text-5xl tabular-nums text-muted-foreground">
              {md.실점}
            </span>
            <span className={`ml-3 text-xs font-mono uppercase tracking-wider ${resultTone}`}>
              {resultLabel}
            </span>
          </div>
        </div>

        <div className="mt-6 grid gap-3 border-t border-border/60 pt-4 text-xs md:grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(220px,1fr)_minmax(120px,0.45fr)]">
          <MetaItem
            icon={<span className="font-mono-num">F</span>}
            label="포메이션"
            value={`${selfFormation} vs ${opponentFormation}`}
          />
          <MetaItem
            icon={<span className="font-mono-num">T</span>}
            label="당시 티어"
            value={`${liveMatch?.self?.divisionName || "-"} vs ${liveMatch?.opponent?.divisionName || "-"}`}
          />
          <MomMeta player={mom} fallback={md.최고평점} />
          <MetaItem
            icon={<ArrowRightLeft className="size-3" />}
            label="교체"
            value={`${md.교체기록.length}회`}
          />
        </div>
      </div>

      <section className="px-4 md:px-8 py-6 border-b border-border">
        <SectionTitle>양측 스쿼드</SectionTitle>
        <div className="mt-3 grid grid-cols-2 gap-2 md:gap-5 xl:grid-cols-2">
          <MatchPitch
            title={ownerName}
            formation={selfFormation}
            players={selfPlayers}
            teamColors={bundle?.snapshot?.teamColors ?? []}
          />
          <MatchPitch
            title={md.상대}
            formation={opponentFormation}
            players={opponentPlayers}
            muted
          />
        </div>
      </section>

      <section className="px-4 md:px-8 py-6 border-b border-border">
        <div className="flex items-baseline justify-between">
          <SectionTitle>팀 스탯 · Team stats</SectionTitle>
          <span className="text-[10px] font-mono text-muted-foreground">
            {ownerName} vs {md.상대}
          </span>
        </div>
        <div className="mt-4 space-y-3">
          <StatBar label="점유율" a={md.아군스탯.점유율} b={md.상대스탯.점유율} suffix="%" />
          <StatBar label="슈팅" a={md.아군스탯.슈팅} b={md.상대스탯.슈팅} />
          <StatBar label="유효슈팅" a={md.아군스탯.유효슈팅} b={md.상대스탯.유효슈팅} />
          <StatBar
            label="패스 성공률"
            a={pct(md.아군스탯.패스성공, md.아군스탯.패스시도)}
            b={pct(md.상대스탯.패스성공, md.상대스탯.패스시도)}
            suffix="%"
          />
          <StatBar label="코너킥" a={md.아군스탯.코너킥} b={md.상대스탯.코너킥} />
          <StatBar label="태클 성공" a={md.아군스탯.태클성공} b={md.상대스탯.태클성공} />
          <StatBar label="파울" a={md.아군스탯.파울} b={md.상대스탯.파울} invert />
          <StatBar label="경고" a={md.아군스탯.경고} b={md.상대스탯.경고} invert />
        </div>
      </section>

      <section className="px-4 md:px-8 py-6 border-b border-border grid gap-8 lg:grid-cols-2">
        <div>
          <SectionTitle>득점 기록 · {ownerName}</SectionTitle>
          <GoalList list={md.득점기록} players={selfPlayers} empty="득점 이벤트 상세 없음" />
        </div>
        <div>
          <SectionTitle>실점 기록 · {md.상대}</SectionTitle>
          <GoalList
            list={md.실점기록}
            players={opponentPlayers}
            empty="실점 이벤트 상세 없음"
            mute
          />
        </div>
      </section>

      <section className="px-4 md:px-8 py-6">
        <SectionTitle>교체 기록</SectionTitle>
        {md.교체기록.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground italic">교체 이벤트 상세 없음</p>
        ) : (
          <ul className="mt-3 divide-y divide-border/50 border-y border-border/60">
            {md.교체기록.map((s, i) => (
              <li key={i} className="grid grid-cols-12 items-center gap-3 py-3 text-sm">
                <span className="col-span-2 font-mono-num text-xs text-muted-foreground">
                  {s.분}′
                </span>
                <span className="col-span-4 truncate">
                  <span className="text-neg mr-1.5 font-mono text-[10px]">OUT</span>
                  {s.아웃명}
                </span>
                <ArrowRightLeft className="col-span-1 size-3 text-muted-foreground justify-self-center" />
                <span className="col-span-5 truncate">
                  <span className="text-pos mr-1.5 font-mono text-[10px]">IN</span>
                  {s.인명}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function resolveMatchDetail(
  ownerId: string,
  ownerName: string,
  matchKey: string,
  bundle: SquadBundle | null,
): MatchDetailRaw | null {
  const row = bundle?.matches?.rows?.find((item) => item.matchKey === matchKey);
  if (!row) return null;
  const players = (row.players ?? []).filter((player) => numberOr(player.rating, 0) > 0);
  const score = numberOr(row.self?.score, 0);
  const conceded = numberOr(row.opponent?.score, 0);
  const result = resultCode(row.result, score, conceded);
  const top = [...players].sort((a, b) => numberOr(b.rating, 0) - numberOr(a.rating, 0))[0];
  const selfDetail = row.self?.detail;
  const opponentDetail = row.opponent?.detail;

  return {
    matchKey,
    일자: formatDate(row.dateKst),
    상대: row.opponent?.nickname ?? "UNKNOWN",
    홈원정: "홈",
    결과: result,
    득점: score,
    실점: conceded,
    포메이션: bundle?.snapshot?.squad?.formation ?? "-",
    상대포메이션: "-",
    경기장: "감독모드",
    주심: "-",
    아군스탯: {
      점유율: Math.round(numberOr(row.self?.possession, 0)),
      슈팅: numberOr(row.self?.shots, 0),
      유효슈팅: numberOr(row.self?.shotsOnTarget, 0),
      패스시도: numberOr(selfDetail?.passTry, 0),
      패스성공: numberOr(selfDetail?.passSuccess, 0),
      코너킥: numberOr(selfDetail?.cornerKick, 0),
      파울: numberOr(selfDetail?.foul, 0),
      경고: numberOr(selfDetail?.yellowCards, 0),
      퇴장: numberOr(selfDetail?.redCards, 0),
      태클성공: numberOr(selfDetail?.tackleSuccess, 0),
      인터셉트: 0,
    },
    상대스탯: {
      점유율:
        row.self?.possession === null || row.self?.possession === undefined
          ? 0
          : 100 - Math.round(numberOr(row.self?.possession, 0)),
      슈팅: numberOr(row.opponent?.shots, 0),
      유효슈팅: numberOr(row.opponent?.shotsOnTarget, 0),
      패스시도: numberOr(opponentDetail?.passTry, 0),
      패스성공: numberOr(opponentDetail?.passSuccess, 0),
      코너킥: numberOr(opponentDetail?.cornerKick, 0),
      파울: numberOr(opponentDetail?.foul, 0),
      경고: numberOr(opponentDetail?.yellowCards, 0),
      퇴장: numberOr(opponentDetail?.redCards, 0),
      태클성공: numberOr(opponentDetail?.tackleSuccess, 0),
      인터셉트: 0,
    },
    득점기록: playerGoals(players, "홈"),
    실점기록: [],
    선발11: players.map(openApiMatchPlayerToSquadPlayer),
    교체기록: [],
    최고평점: {
      선수id: String(top?.spId ?? "unknown"),
      선수명: top?.name ?? ownerName,
      평점: numberOr(top?.rating, 0),
    },
  };
}

function openApiMatchPlayerToSquadPlayer(
  player: NonNullable<SquadBundle["matches"]>["rows"][number]["players"][number],
): SquadPlayerRaw {
  return {
    선수id: String(player.spId ?? player.name ?? "unknown"),
    선수명: player.name ?? String(player.spId ?? "UNKNOWN"),
    포지션: normalizePosition(player.positionName),
    국적: "-",
    시즌: "-",
    OVR: numberOr(player.shoot, 0),
    경기수: 1,
    선발: player.positionName === "SUB" ? 0 : 1,
    득점: numberOr(player.goal, 0),
    도움: numberOr(player.assist, 0),
    평점: numberOr(player.rating, 0),
    가치: numberOr(player.effectiveShoot, 0),
  };
}

function playerGoals(
  players: NonNullable<SquadBundle["matches"]>["rows"][number]["players"],
  side: "홈" | "원정",
): GoalEventRaw[] {
  return (players ?? [])
    .filter((player) => numberOr(player.goal, 0) > 0)
    .flatMap((player) =>
      Array.from({ length: numberOr(player.goal, 0) }, (_, index) => ({
        분: 0,
        선수id: String(player.spId ?? player.name ?? "unknown"),
        선수명: player.name ?? String(player.spId ?? "UNKNOWN"),
        어시스트명: index === 0 && numberOr(player.assist, 0) > 0 ? player.name : undefined,
        종류: "오픈플레이" as const,
        홈원정: side,
      })),
    );
}

function resultCode(result: string | undefined, score: number, conceded: number): MatchResult {
  if (result === "승" || score > conceded) return "W";
  if (result === "패" || score < conceded) return "L";
  return "D";
}

function topRatedPlayer(players: MatchPlayerRow[]): MatchPlayerRow | undefined {
  return players
    .filter((player) => numberOr(player.rating, 0) > 0)
    .sort((a, b) => numberOr(b.rating, 0) - numberOr(a.rating, 0))[0];
}

function formationFromMatchPlayers(players: MatchPlayerRow[]): string {
  const starters = players.filter(
    (player) => player.positionName !== "SUB" && numberOr(player.rating, 0) > 0,
  );
  if (starters.length === 0) return "-";
  const counts = [0, 0, 0];
  for (const player of starters) {
    const pos = String(player.positionName ?? "").toUpperCase();
    if (pos === "GK") continue;
    if (pos.includes("B")) counts[0] += 1;
    else if (pos.includes("M")) counts[1] += 1;
    else counts[2] += 1;
  }
  return counts.join("-");
}

function pitchPosition(player: MatchPlayerRow, index: number): { x: number; y: number } {
  const role = String(player.positionName ?? "").toUpperCase();
  const map: Record<string, { x: number; y: number }> = {
    GK: { x: 50, y: 90 },
    SW: { x: 50, y: 80 },
    LWB: { x: 18, y: 69 },
    LB: { x: 18, y: 74 },
    LCB: { x: 38, y: 72 },
    CB: { x: 50, y: 72 },
    RCB: { x: 62, y: 72 },
    RB: { x: 82, y: 74 },
    RWB: { x: 82, y: 69 },
    LDM: { x: 38, y: 58 },
    CDM: { x: 50, y: 58 },
    RDM: { x: 62, y: 58 },
    LM: { x: 20, y: 46 },
    LCM: { x: 38, y: 46 },
    CM: { x: 50, y: 46 },
    RCM: { x: 62, y: 46 },
    RM: { x: 80, y: 46 },
    LAM: { x: 34, y: 34 },
    CAM: { x: 50, y: 34 },
    RAM: { x: 66, y: 34 },
    LW: { x: 22, y: 20 },
    LF: { x: 38, y: 18 },
    CF: { x: 50, y: 18 },
    RF: { x: 62, y: 18 },
    RW: { x: 78, y: 20 },
    LS: { x: 42, y: 12 },
    ST: { x: 50, y: 12 },
    RS: { x: 58, y: 12 },
  };
  return map[role] ?? { x: 20 + (index % 4) * 20, y: 78 - Math.floor(index / 4) * 18 };
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
  return original === "SUB" ? "CM" : "CM";
}

function formatDate(value: string | undefined): string {
  if (!value) return "-";
  return value.slice(0, 10);
}

function pct(a: number, b: number): number {
  return b > 0 ? Math.round((a / b) * 1000) / 10 : 0;
}

function BackNav({ id, ownerName }: { id: string; ownerName: string }) {
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
      <span className="text-foreground">경기 상세</span>
    </div>
  );
}

function statusLabel(status: SquadBundle["status"] | undefined): string {
  if (status === "ready") return "정상";
  if (status === "partial") return "일부 데이터";
  if (status === "missing") return "대기";
  return "확인 중";
}

function MetaItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
        <span className="text-muted-foreground/70">{icon}</span>
        {label}
      </span>
      <span className="font-mono-num text-sm truncate">{value}</span>
    </div>
  );
}

function MomMeta({
  player,
  fallback,
}: {
  player: MatchPlayerRow | undefined;
  fallback: MatchDetailRaw["최고평점"];
}) {
  const spId = player?.spId;
  const rating = numberOr(player?.rating, fallback.평점);
  return (
    <div className="flex items-center gap-3">
      <div className="relative grid size-11 place-items-center overflow-hidden rounded-sm bg-surface-2/60">
        {spId ? <PlayerImage spId={spId} className="h-11 w-11 object-contain" /> : null}
        {numberOr(player?.spGrade, 0) > 0 && (
          <span className="absolute right-0.5 top-0.5 rounded-[3px] bg-background/90 px-1 font-mono-num text-[8px] font-semibold text-accent ring-1 ring-border">
            +{player?.spGrade}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          최고평점
        </div>
        <div className="truncate text-sm font-medium">
          {player?.name ?? fallback.선수명} · {rating.toFixed(1)}
        </div>
      </div>
    </div>
  );
}

type MatchPlayerRow = NonNullable<
  NonNullable<SquadBundle["matches"]>["rows"][number]["players"]
>[number];
type TeamColor = NonNullable<OpenApiSquadSnapshot["teamColors"]>[number];

function MatchPitch({
  title,
  formation,
  players,
  teamColors = [],
  muted = false,
}: {
  title: string;
  formation: string;
  players: MatchPlayerRow[];
  teamColors?: TeamColor[];
  muted?: boolean;
}) {
  const [activeTeamColor, setActiveTeamColor] = useState<TeamColor | null>(null);
  const starters = players
    .filter((player) => player.positionName !== "SUB" && numberOr(player.rating, 0) > 0)
    .sort((a, b) => numberOr(a.spPosition, 99) - numberOr(b.spPosition, 99))
    .slice(0, 11);
  if (starters.length === 0) {
    return (
      <div className="rounded-md border border-border p-4">
        <h4 className="text-sm font-semibold">{title}</h4>
        <p className="mt-3 text-xs text-muted-foreground">스쿼드 데이터 없음</p>
      </div>
    );
  }
  return (
    <div className={"rounded-md border border-border p-2 md:p-4 " + (muted ? "opacity-90" : "")}>
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between md:gap-3">
        <h4 className="truncate text-xs font-semibold md:text-sm">{title}</h4>
        <div className="flex items-center justify-between gap-2 md:gap-3">
          <TeamColorStrip
            colors={teamColors}
            activeColor={activeTeamColor}
            onHover={setActiveTeamColor}
          />
          <span className="font-mono-num text-sm font-semibold text-accent md:text-lg">
            {formation}
          </span>
        </div>
      </div>
      <div className="mt-3 grid gap-4 2xl:grid-cols-[minmax(330px,390px)_minmax(180px,1fr)]">
        <div className="relative h-[330px] w-full rounded-sm border border-border/70 bg-[radial-gradient(ellipse_at_center,color-mix(in_oklab,var(--accent)_8%,transparent),transparent_65%)] overflow-hidden md:h-[520px] md:max-h-[calc(100vh-260px)] md:min-h-[440px] md:max-w-[390px]">
          <div className="absolute inset-2 border border-border/60 rounded-sm" />
          <div className="absolute left-2 right-2 top-1/2 h-px bg-border/60" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-10 rounded-full border border-border/60" />
          <div className="absolute inset-0">
            {starters.map((player, index) => {
              const position = pitchPosition(player, index);
              return (
                <div
                  key={`${player.spId}-${player.positionName}`}
                  className={
                    "absolute h-[46px] w-[54px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[4px] border bg-background/90 text-left shadow-sm transition-colors md:h-[72px] md:w-[88px] " +
                    (teamColorAppliesToMatchPlayer(player, starters, activeTeamColor)
                      ? "border-accent/80 shadow-[0_0_0_2px_color-mix(in_oklab,var(--accent)_22%,transparent)]"
                      : "border-border/80")
                  }
                  style={{ left: `${position.x}%`, top: `${position.y}%` }}
                  title={`${player.name ?? player.spId} · ${player.positionName ?? "-"}`}
                >
                  <div className="absolute inset-x-0 top-0 h-7 bg-surface-2/70 md:h-11">
                    {player.spId && (
                      <PlayerImage
                        spId={player.spId}
                        className="mx-auto h-8 w-8 object-contain md:h-12 md:w-12"
                      />
                    )}
                    {numberOr(player.spGrade, 0) > 0 && (
                      <span className="absolute right-0.5 top-0.5 rounded-[3px] bg-background/90 px-0.5 font-mono-num text-[7px] font-semibold text-accent ring-1 ring-border md:right-1 md:top-1 md:px-1 md:text-[9px]">
                        +{player.spGrade}
                      </span>
                    )}
                  </div>
                  <div className="absolute inset-x-0.5 bottom-0.5 md:inset-x-1 md:bottom-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-[7px] font-mono uppercase text-muted-foreground md:text-[8px]">
                        {player.positionName ?? "-"}
                      </span>
                      <span className="text-[7px] font-mono-num text-accent md:text-[8px]">
                        {numberOr(player.rating, 0).toFixed(1)}
                      </span>
                    </div>
                    <div className="truncate text-[8px] font-medium leading-tight md:text-[10px]">
                      {player.name ?? player.spId}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="hidden md:block">
          <MatchPitchSummary players={players} starters={starters} />
        </div>
      </div>
    </div>
  );
}

function MatchPitchSummary({
  players,
  starters,
}: {
  players: MatchPlayerRow[];
  starters: MatchPlayerRow[];
}) {
  const top = topRatedPlayer(players);
  const summary = matchPlayerSummary(players, starters);
  return (
    <div className="grid content-start gap-4">
      <div className="rounded-sm border border-border/70 p-3">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          최고평점
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="relative grid size-12 place-items-center overflow-hidden rounded-sm bg-surface-2/70">
            {top?.spId && <PlayerImage spId={top.spId} className="h-12 w-12 object-contain" />}
            {numberOr(top?.spGrade, 0) > 0 && (
              <span className="absolute right-0.5 top-0.5 rounded-[3px] bg-background/90 px-1 font-mono-num text-[8px] font-semibold text-accent ring-1 ring-border">
                +{top?.spGrade}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{top?.name ?? "-"}</div>
            <div className="font-mono-num text-xs text-accent">
              {numberOr(top?.rating, 0).toFixed(1)}
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <SummaryKpi label="득점" value={summary.goals} />
        <SummaryKpi label="도움" value={summary.assists} />
        <SummaryKpi label="선발" value={summary.starters} />
        <SummaryKpi label="교체" value={summary.subs} />
      </div>
      <div className="rounded-sm border border-border/70 p-3">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          라인 구성
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          <SummaryKpi label="GK" value={summary.gk} compact />
          <SummaryKpi label="DF" value={summary.df} compact />
          <SummaryKpi label="MF" value={summary.mf} compact />
          <SummaryKpi label="FW" value={summary.fw} compact />
        </div>
      </div>
    </div>
  );
}

function SummaryKpi({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: number;
  compact?: boolean;
}) {
  return (
    <div className="rounded-sm bg-surface-2/60 px-2 py-2 text-center">
      <div className="text-[10px] font-mono text-muted-foreground">{label}</div>
      <div className={"mt-1 font-mono-num font-semibold " + (compact ? "text-base" : "text-lg")}>
        {value}
      </div>
    </div>
  );
}

function matchPlayerSummary(players: MatchPlayerRow[], starters: MatchPlayerRow[]) {
  const summary = {
    goals: 0,
    assists: 0,
    starters: starters.length,
    subs: players.filter((player) => player.positionName === "SUB").length,
    gk: 0,
    df: 0,
    mf: 0,
    fw: 0,
  };
  for (const player of players) {
    summary.goals += numberOr(player.goal, 0);
    summary.assists += numberOr(player.assist, 0);
  }
  for (const player of starters) {
    const pos = String(player.positionName ?? "").toUpperCase();
    if (pos === "GK") summary.gk += 1;
    else if (pos.includes("B")) summary.df += 1;
    else if (pos.includes("M")) summary.mf += 1;
    else summary.fw += 1;
  }
  return summary;
}

function TeamColorStrip({
  colors,
  activeColor,
  onHover,
}: {
  colors: TeamColor[];
  activeColor: TeamColor | null;
  onHover: (color: TeamColor | null) => void;
}) {
  if (colors.length === 0) {
    return <span className="text-[10px] font-mono text-muted-foreground">팀컬러 없음</span>;
  }
  return (
    <div className="flex max-w-[86px] items-center justify-end gap-1 overflow-hidden md:max-w-[220px] md:gap-1.5 md:overflow-visible">
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
                "group relative grid size-5 shrink-0 place-items-center rounded-sm border bg-surface-2 transition-colors md:size-7 " +
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

function sortTeamColors(colors: TeamColor[]): TeamColor[] {
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

function teamColorAppliesToMatchPlayer(
  player: MatchPlayerRow,
  starters: MatchPlayerRow[],
  color: TeamColor | null | undefined,
): boolean {
  if (!color) return false;
  const appliedCount = Math.max(0, Math.min(starters.length, numberOr(color.playerCount, 0)));
  if (appliedCount === 0) return false;
  const appliedPlayers = starters
    .sort((a, b) => numberOr(a.spPosition, 99) - numberOr(b.spPosition, 99))
    .slice(0, appliedCount);
  return appliedPlayers.some((row) => String(row.spId) === String(player.spId));
}

function StatBar({
  label,
  a,
  b,
  suffix = "",
  invert = false,
}: {
  label: string;
  a: number;
  b: number;
  suffix?: string;
  invert?: boolean;
}) {
  const total = a + b || 1;
  const aPct = (a / total) * 100;
  const bPct = (b / total) * 100;
  const aWinning = invert ? a < b : a > b;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span
          className={`font-mono-num tabular-nums ${aWinning ? "text-accent font-semibold" : ""}`}
        >
          {a}
          {suffix}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <span
          className={`font-mono-num tabular-nums ${!aWinning && a !== b ? "text-foreground/90 font-medium" : "text-muted-foreground"}`}
        >
          {b}
          {suffix}
        </span>
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-sm bg-surface-2">
        <div
          className={"h-full " + (aWinning ? "bg-accent" : "bg-foreground/30")}
          style={{ width: `${aPct}%` }}
          aria-hidden
        />
        <div className="w-px bg-background" aria-hidden />
        <div
          className={"h-full " + (!aWinning && a !== b ? "bg-foreground/50" : "bg-foreground/20")}
          style={{ width: `${bPct}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}

function GoalList({
  list,
  players,
  empty,
  mute,
}: {
  list: GoalEventRaw[];
  players: MatchPlayerRow[];
  empty: string;
  mute?: boolean;
}) {
  if (list.length === 0) {
    return <p className="mt-3 text-xs text-muted-foreground italic">{empty}</p>;
  }
  return (
    <ul className="mt-3 divide-y divide-border/50 border-y border-border/60">
      {list.map((g, i) => {
        const player = findGoalPlayer(g, players);
        return (
          <li key={i} className="grid grid-cols-12 items-center gap-2 py-2.5 text-sm">
            <span className="col-span-2 font-mono-num text-xs text-muted-foreground">
              {g.분 > 0 ? `${g.분}′` : "-"}
            </span>
            <span className="col-span-2">
              <span className="relative grid size-10 place-items-center overflow-hidden rounded-sm bg-surface-2/60">
                {player?.spId && (
                  <PlayerImage spId={player.spId} className="h-10 w-10 object-contain" />
                )}
                {numberOr(player?.spGrade, 0) > 0 && (
                  <span className="absolute right-0.5 top-0.5 rounded-[3px] bg-background/90 px-1 font-mono-num text-[8px] font-semibold text-accent ring-1 ring-border">
                    +{player?.spGrade}
                  </span>
                )}
              </span>
            </span>
            <span
              className={"col-span-5 min-w-0 truncate " + (mute ? "text-muted-foreground" : "")}
            >
              {g.선수명}
              {g.어시스트명 && (
                <span className="ml-2 text-[10px] font-mono text-muted-foreground">
                  A: {g.어시스트명}
                </span>
              )}
            </span>
            <span className="col-span-3 text-right text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              {g.종류}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function findGoalPlayer(goal: GoalEventRaw, players: MatchPlayerRow[]): MatchPlayerRow | undefined {
  const goalId = String(goal.선수id ?? "").trim();
  if (goalId) {
    const byId = players.find((player) => String(player.spId ?? "").trim() === goalId);
    if (byId) return byId;
  }
  const goalName = normalizePlayerName(goal.선수명);
  return players.find((player) => normalizePlayerName(player.name) === goalName);
}

function normalizePlayerName(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
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
  const baseId = spId % 1_000_000;
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

function ResultBadge({ r, size = "md" }: { r: MatchResult; size?: "md" | "lg" }) {
  const map = {
    W: "bg-pos/15 border-pos/40 text-pos",
    D: "bg-warn/15 border-warn/40 text-warn",
    L: "bg-neg/15 border-neg/40 text-neg",
  } as const;
  const box = size === "lg" ? "size-8 text-sm" : "size-5 text-[10px]";
  return (
    <span
      className={
        `inline-flex items-center justify-center border rounded-[4px] font-bold font-mono ${box} ` +
        map[r]
      }
    >
      {r}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
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
