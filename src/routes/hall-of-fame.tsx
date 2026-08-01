import { createFileRoute, Link } from "@tanstack/react-router";
import { Trophy, Medal, Award, Target, Shield, Activity, Percent, Gamepad2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CHAMPIONS, CAREER_RECORDS } from "@/lib/hallOfFame";
import { useSeason } from "@/lib/season-context";
import {
  fetchRankingData,
  numberOr,
  parsePercent,
  seasonLabel,
  type RankingData,
  type ServiceRankingRaw,
} from "@/lib/service-data";
import { TierBadge } from "@/components/tier-badge";

export const Route = createFileRoute("/hall-of-fame")({
  head: () => ({
    meta: [
      { title: "명예의 전당 — ESCLUB" },
      {
        name: "description",
        content: "ESCLUB — 역대 시즌 우승자, 준우승자, 최다득점·최소실점 기록과 통산 커리어 랭킹.",
      },
      { property: "og:title", content: "명예의 전당 — ESCLUB" },
      {
        property: "og:description",
        content: "역대 시즌 챔피언과 통산 커리어 랭킹.",
      },
    ],
  }),
  component: HallOfFamePage,
});

function HallOfFamePage() {
  const { season } = useSeason();
  const [ranking, setRanking] = useState<RankingData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRankingData(season).then((data) => {
      if (!cancelled) setRanking(data);
    });
    return () => {
      cancelled = true;
    };
  }, [season]);

  const remote = useMemo(() => buildRemoteHall(season, ranking), [ranking, season]);
  const champions = remote?.champions ?? CHAMPIONS;
  const career = [...CAREER_RECORDS].sort((a, b) => {
    if (b.우승 !== a.우승) return b.우승 - a.우승;
    return b.통산승점 - a.통산승점;
  });
  const currentCareer = remote?.career ?? career;

  return (
    <div className="flex flex-col">
      <div className="hidden md:flex items-center justify-between px-8 py-3 border-b border-border bg-surface/40 text-[11px] font-mono text-muted-foreground">
        <div className="flex gap-6">
          <span>
            최근 갱신: <span className="text-foreground">{ranking?.lastUpdated ?? "확인 중"}</span>
          </span>
          <span>
            SEASONS: <span className="text-foreground">{champions.length}</span>
          </span>
        </div>
        <span>
          {remote ? "집계: 현재 시즌 랭킹 → 특수 지표" : "집계: 시즌별 최종 순위 → 통산 누적"}
        </span>
      </div>

      <section className="px-4 md:px-8 pt-6 md:pt-8 pb-2">
        <header className="flex items-baseline justify-between mb-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Trophy className="size-4 text-accent" />
            {remote ? "현재 시즌 기록왕" : "역대 시즌 챔피언"}
          </h2>
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            {champions.length} SEASONS
          </span>
        </header>

        <div className="grid gap-3 md:grid-cols-2">
          {champions.map((c) =>
            remote ? (
              <CurrentSeasonRecordCard key={c.season} record={remote.record} />
            ) : (
              <article
                key={c.season}
                className="border border-border rounded-md bg-surface/60 overflow-hidden"
              >
                {/* Header strip */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface-2/40">
                  <div className="flex items-center gap-2">
                    <span className="font-mono-num text-[11px] text-muted-foreground">
                      {c.season}
                    </span>
                    <span className="text-xs font-semibold">{c.label}</span>
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    {c.phase}
                  </span>
                </div>

                {/* Podium */}
                <div className="p-4">
                  <Link
                    to="/dashboard/$id"
                    params={{ id: c.우승.id }}
                    className="flex items-center gap-3 group"
                  >
                    <div className="size-10 rounded-md bg-accent/15 outline-1 outline-accent/30 grid place-items-center">
                      <Trophy className="size-4 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-accent">
                        우승
                      </div>
                      <div className="text-sm font-semibold truncate group-hover:text-accent transition-colors">
                        {c.우승.구단주}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono-num">
                        {c.우승.승점} PTS · {c.우승.승}승 {c.우승.무}무 {c.우승.패}패
                      </div>
                    </div>
                  </Link>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <PodiumRow
                      icon={<Medal className="size-3 text-foreground/70" />}
                      label="준우승"
                      id={c.준우승.id}
                      name={c.준우승.구단주}
                      stat={`${c.준우승.승점} PTS`}
                    />
                    <PodiumRow
                      icon={<Award className="size-3 text-warn" />}
                      label="3위"
                      id={c["3위"].id}
                      name={c["3위"].구단주}
                      stat={`${c["3위"].승점} PTS`}
                    />
                  </div>

                  <div className="mt-3 pt-3 border-t border-border/60 grid grid-cols-2 gap-2">
                    <PodiumRow
                      icon={<Target className="size-3 text-pos" />}
                      label="최다득점"
                      id={c.최다득점.id}
                      name={c.최다득점.구단주}
                      stat={`${c.최다득점.득점} GF`}
                    />
                    <PodiumRow
                      icon={<Shield className="size-3 text-accent" />}
                      label="최소실점"
                      id={c.최소실점.id}
                      name={c.최소실점.구단주}
                      stat={`${c.최소실점.실점} GA`}
                    />
                  </div>
                </div>
              </article>
            ),
          )}
        </div>
      </section>

      <section className="px-4 md:px-8 py-6 md:py-8">
        <header className="flex items-baseline justify-between mb-4">
          <h2 className="text-sm font-semibold">
            {remote ? "현재 시즌 랭킹" : "통산 커리어 랭킹"}
          </h2>
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            {remote ? "정렬: 순위 → 누적채굴량" : "정렬: 우승 → 통산 승점"}
          </span>
        </header>

        <div className="hidden md:block border border-border rounded-md overflow-hidden bg-surface/40">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface-2/40">
                <Th className="pl-6 w-16">순위</Th>
                <Th>구단주</Th>
                <ThNum>우승</ThNum>
                <ThNum>준우승</ThNum>
                <ThNum>시즌</ThNum>
                <ThNum>승</ThNum>
                <ThNum>무</ThNum>
                <ThNum>패</ThNum>
                <ThNum>{remote ? "판수" : "득점"}</ThNum>
                <ThNum>{remote ? "성장" : "실점"}</ThNum>
                <ThNum className="text-foreground pr-6">{remote ? "누적채굴량" : "통산 PTS"}</ThNum>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {currentCareer.map((c, i) => (
                <tr key={c.id} className="hover:bg-surface-2/60 transition-colors group">
                  <td className="py-3 pl-6 pr-3 font-mono-num text-sm">
                    {String(i + 1).padStart(2, "0")}
                  </td>
                  <td className="py-3 px-3">
                    <Link
                      to="/dashboard/$id"
                      params={{ id: c.id }}
                      className="flex items-center gap-3 group-hover:text-accent transition-colors"
                    >
                      <TierBadge
                        image={"tierImage" in c ? c.tierImage : null}
                        name={"tierName" in c ? c.tierName : null}
                        size="sm"
                      />
                      <span className="text-sm font-medium">{c.구단주}</span>
                    </Link>
                  </td>
                  <TdNum>
                    {remote ? (
                      <span className="text-muted-foreground">-</span>
                    ) : c.우승 > 0 ? (
                      <span className="inline-flex items-center gap-1 text-accent">
                        <Trophy className="size-3" />
                        {c.우승}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TdNum>
                  <TdNum>
                    {remote ? <span className="text-muted-foreground">-</span> : c.준우승}
                  </TdNum>
                  <TdNum muted>{remote ? season : c.참가시즌}</TdNum>
                  <TdNum>{c.통산승}</TdNum>
                  <TdNum muted>{c.통산무}</TdNum>
                  <TdNum muted>{c.통산패}</TdNum>
                  <TdNum muted>{c.통산득점}</TdNum>
                  <TdNum muted>{c.통산실점}</TdNum>
                  <TdNum className="text-foreground font-medium pr-6">{c.통산승점}</TdNum>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="md:hidden divide-y divide-border/60 border border-border rounded-md overflow-hidden bg-surface/40">
          {currentCareer.map((c, i) => (
            <Link
              key={c.id}
              to="/dashboard/$id"
              params={{ id: c.id }}
              className="p-3.5 flex items-center gap-3 active:bg-surface-2/60"
            >
              <span className="font-mono-num text-sm w-6 text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <TierBadge
                image={"tierImage" in c ? c.tierImage : null}
                name={"tierName" in c ? c.tierName : null}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{c.구단주}</div>
                <div className="text-[11px] text-muted-foreground font-mono-num">
                  {c.통산승}승 {c.통산무}무 {c.통산패}패 · {remote ? "판수" : "득실"}{" "}
                  {c.통산득점 - c.통산실점 > 0 ? "+" : ""}
                  {c.통산득점 - c.통산실점}
                </div>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono-num">
                {!remote && c.우승 > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-accent">
                    <Trophy className="size-3" />
                    {c.우승}
                  </span>
                )}
                <span className="text-foreground font-semibold">{c.통산승점}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <footer className="mt-auto border-t border-border p-6 md:px-8">
        <p className="text-[11px] leading-relaxed text-muted-foreground max-w-prose">
          {remote
            ? "현재 시즌 기록은 크롤링 표시 데이터 기준입니다. 시즌 종료 전 우승, 준우승, 3위는 확정 기록으로 표시하지 않습니다."
            : "시즌별 챔피언은 정규 라운드 종료 시점의 최종 순위 기준입니다. 통산 기록은 참가한 모든 시즌 합산이며, 미참가 시즌은 0으로 취급하지 않습니다."}
        </p>
      </footer>
    </div>
  );
}

function buildRemoteHall(season: string, ranking: RankingData | null) {
  if (!ranking || ranking.rows.length === 0 || ranking.source.startsWith("mockData:")) return null;
  const rows = ranking.rows.filter((row) => !row.unranked);
  if (rows.length === 0) return null;
  const top = rows[0];
  const second = rows[1] ?? rows[0];
  const third = rows[2] ?? rows[0];
  const mining = rawToAward(ranking.kings?.mining) ?? top;
  const winRate = rawToAward(ranking.kings?.winRate) ?? top;
  const gameCount = rawToAward(ranking.kings?.gameCount) ?? top;
  const draw = rawToAward(ranking.kings?.draw) ?? top;

  return {
    record: {
      season,
      label: seasonLabel(season),
      phase: "Current",
      leader: top,
      mining,
      winRate,
      gameCount,
      draw,
    },
    champions: [
      {
        season,
        label: seasonLabel(season),
        phase: "Current",
        우승: {
          id: top.id,
          구단주: top.name,
          승점: top.miningPower,
          승: top.w,
          무: top.d,
          패: top.l,
        },
        준우승: { id: second.id, 구단주: second.name, 승점: second.miningPower },
        "3위": { id: third.id, 구단주: third.name, 승점: third.miningPower },
        최다득점: {
          id: mining.id,
          구단주: `채굴왕 · ${mining.name}`,
          득점: mining.miningPower,
        },
        최소실점: {
          id: winRate.id,
          구단주: `승률왕 · ${winRate.name}`,
          실점: Math.round((winRate.winRate ?? 0) * 1000) / 10,
        },
      },
    ],
    career: rows.map((row) => ({
      id: row.id,
      구단주: row.name,
      우승: 0,
      준우승: 0,
      통산승점: row.miningPower,
      통산승: row.w,
      통산무: row.d,
      통산패: row.l,
      통산득점: row.gp,
      통산실점: row.growth ?? 0,
      tierName: row.tierName,
      tierImage: row.tierImage,
      참가시즌:
        row.id === gameCount.id ? numberOr(gameCount.gp, row.gp) : row.id === draw.id ? row.d : 1,
    })),
  };
}

function CurrentSeasonRecordCard({
  record,
}: {
  record: NonNullable<ReturnType<typeof buildRemoteHall>>["record"];
}) {
  return (
    <article className="border border-border rounded-md bg-surface/60 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface-2/40">
        <div className="flex items-center gap-2">
          <span className="font-mono-num text-[11px] text-muted-foreground">{record.season}</span>
          <span className="text-xs font-semibold">{record.label}</span>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          {record.phase}
        </span>
      </div>

      <div className="p-4">
        <Link
          to="/dashboard/$id"
          params={{ id: record.leader.id }}
          className="flex items-center gap-3 group"
        >
          <div className="size-10 rounded-md bg-accent/15 outline-1 outline-accent/30 grid place-items-center">
            <Activity className="size-4 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono uppercase tracking-wider text-accent">
              현재 1위
            </div>
            <div className="flex items-center gap-2">
              <TierBadge image={record.leader.tierImage} name={record.leader.tierName} size="sm" />
              <span className="truncate text-sm font-semibold group-hover:text-accent transition-colors">
                {record.leader.name}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground font-mono-num">
              {record.leader.miningPower} FC · {record.leader.w}승 {record.leader.d}무{" "}
              {record.leader.l}패
            </div>
          </div>
        </Link>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <PodiumRow
            icon={<Target className="size-3 text-pos" />}
            label="채굴왕"
            id={record.mining.id}
            name={record.mining.name}
            stat={`${record.mining.miningPower}`}
          />
          <PodiumRow
            icon={<Percent className="size-3 text-accent" />}
            label="승률왕"
            id={record.winRate.id}
            name={record.winRate.name}
            stat={`${Math.round((record.winRate.winRate ?? 0) * 1000) / 10}%`}
          />
        </div>

        <div className="mt-3 pt-3 border-t border-border/60 grid grid-cols-2 gap-2">
          <PodiumRow
            icon={<Gamepad2 className="size-3 text-foreground/70" />}
            label="판수왕"
            id={record.gameCount.id}
            name={record.gameCount.name}
            stat={`${record.gameCount.gp}판`}
          />
          <PodiumRow
            icon={<Shield className="size-3 text-warn" />}
            label="승부왕"
            id={record.draw.id}
            name={record.draw.name}
            stat={`${record.draw.d}무`}
          />
        </div>
      </div>
    </article>
  );
}

function rawToAward(row: ServiceRankingRaw | undefined) {
  if (!row) return null;
  const w = numberOr(row.승, 0);
  const d = numberOr(row.무, 0);
  const l = numberOr(row.패, 0);
  const gp = numberOr(row.판수, w + d + l);
  return {
    id: row.player_id ?? row.name ?? row.구단주명 ?? "unknown",
    name: row.구단주명 ?? row.name ?? row.player_id ?? "UNKNOWN",
    w,
    d,
    l,
    gp,
    miningPower: numberOr(row.누적채굴량, numberOr(row["채굴 효율"], 0)),
    winRate: parsePercent(row.승률),
    tierName: row["최근 매치 티어"] ?? row["현재 티어"] ?? null,
    tierImage: row["최근 매치 티어 이미지"] ?? row["현재 티어 이미지"] ?? null,
  };
}

function PodiumRow({
  icon,
  label,
  id,
  name,
  stat,
}: {
  icon: React.ReactNode;
  label: string;
  id: string;
  name: string;
  stat: string;
}) {
  return (
    <Link
      to="/dashboard/$id"
      params={{ id }}
      className="flex items-center gap-2 min-w-0 hover:text-accent transition-colors"
    >
      <div className="size-6 rounded-sm bg-surface-2 grid place-items-center shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="text-xs font-medium truncate">{name}</div>
      </div>
      <span className="text-[11px] font-mono-num text-muted-foreground shrink-0">{stat}</span>
    </Link>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={
        "py-3 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider " +
        className
      }
    >
      {children}
    </th>
  );
}
function ThNum({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={
        "py-3 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-right " +
        className
      }
    >
      {children}
    </th>
  );
}
function TdNum({
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
        "py-3 px-3 text-right font-mono-num text-sm " +
        (muted ? "text-muted-foreground " : "text-foreground/80 ") +
        className
      }
    >
      {children}
    </td>
  );
}
