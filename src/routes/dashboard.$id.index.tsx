import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Minus } from "lucide-react";
import { useSeason } from "@/lib/season-context";
import { RANKINGS, toRankingView, type MatchResult } from "@/lib/mockData";
import {
  divisionImageFromCode,
  divisionNameFromCode,
  fetchOwnerHistory,
  fetchRankingData,
  fetchSquadBundle,
  formatClubValueText,
  metricDiff,
  numberOr,
  winRateDiff,
  type OpenApiMatchDetails,
  type OwnerHistoryData,
  type RankingView,
  type SquadBundle,
} from "@/lib/service-data";
import { OWNER_DETAILS, type MatchLogRaw, type OwnerDetailRaw } from "@/lib/ownerData";
import { FormPips } from "@/components/form-pips";
import { TierBadge } from "@/components/tier-badge";

export const Route = createFileRoute("/dashboard/$id/")({
  head: ({ params }) => {
    const owner = OWNER_DETAILS[params.id];
    const title = owner ? `${owner.구단주} — 구단주 대시보드` : "구단주 — ESCLUB";
    return {
      meta: [
        { title: `${title} · ESCLUB` },
        {
          name: "description",
          content: owner
            ? `${owner.구단주}의 시즌 성과, 최근 5일 추세, 최근 경기 로그.`
            : "ESCLUB 구단주 대시보드.",
        },
        { property: "og:title", content: title },
        { name: "robots", content: owner ? "index,follow" : "noindex" },
      ],
    };
  },
  component: OwnerDashboard,
});

function DeltaCell({ delta }: { delta: number | null }) {
  if (delta === null)
    return <span className="text-[10px] font-mono text-muted-foreground">NEW</span>;
  if (delta === 0) return <Minus className="size-3 text-muted-foreground" />;
  const up = delta > 0;
  return (
    <span
      className={
        "flex items-center gap-0.5 font-mono-num text-xs " + (up ? "text-pos" : "text-neg")
      }
    >
      {up ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
      {Math.abs(delta)}
    </span>
  );
}

function OwnerDashboard() {
  const { id } = Route.useParams();
  const { season } = useSeason();
  const [serviceRows, setServiceRows] = useState<RankingView[]>([]);
  const [history, setHistory] = useState<OwnerHistoryData | null>(null);
  const [bundle, setBundle] = useState<SquadBundle | null>(null);
  const [loaded, setLoaded] = useState(false);
  const ranking = useMemo(
    () => (serviceRows.length > 0 ? serviceRows : toRankingView(RANKINGS[season] ?? [])),
    [season, serviceRows],
  );
  const row = ranking.find((r) => r.id === id);
  const owner = OWNER_DETAILS[id] ?? (row ? ownerFromRankingRow(row, season) : null);
  const trendData = useMemo(() => buildTrendData(history), [history]);
  const recentMatches = useMemo(() => buildRecentMatchRows(bundle?.matches), [bundle]);

  useEffect(() => {
    let cancelled = false;
    setBundle(null);
    setLoaded(false);
    Promise.all([
      fetchRankingData(season),
      fetchOwnerHistory(season, id),
      fetchSquadBundle(season, id),
    ]).then(([rankingData, historyData, squadBundle]) => {
      if (cancelled) return;
      setServiceRows(rankingData.rows);
      setHistory(historyData);
      setBundle(squadBundle);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id, season]);

  if (!owner && !loaded) {
    return <LoadingOwner id={id} />;
  }

  if (!owner) {
    return <MissingOwner id={id} />;
  }

  const seasonHasData = ranking.length > 0;
  const latest = history?.latest;
  const previous = history?.previous;
  const latestRank = row?.unranked ? undefined : (latest?.순위 ?? row?.rank);
  const latestMining = latest?.누적채굴량 ?? latest?.["채굴 효율"] ?? row?.miningPower;
  const latestGames = latest?.판수 ?? row?.gp;
  const latestWinRate =
    latest?.승률 ??
    (row?.winRate === null ? undefined : `${((row?.winRate ?? 0) * 100).toFixed(1)}%`);
  const latestClubValue = formatClubValueText(latest?.["구단 가치"]) ?? row?.clubValue;
  const rankDiff = row?.unranked ? null : metricDiff(latest ?? null, previous ?? null, "순위");
  const miningDiff =
    typeof latest?.["전일 대비 채굴량"] === "number"
      ? latest["전일 대비 채굴량"]
      : metricDiff(latest ?? null, previous ?? null, "누적채굴량");
  const gamesDiff = metricDiff(latest ?? null, previous ?? null, "판수");
  const rateDiff = winRateDiff(latest ?? null, previous ?? null);
  const bestDivision = bundle?.profile?.account?.managerModeBestDivision;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-4 md:px-8 py-6 border-b border-border">
        <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground mb-3">
          <Link
            to="/tables"
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <ChevronLeft className="size-3" /> 시즌 순위
          </Link>
          <span>/</span>
          <span className="text-foreground">{owner.구단주}</span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <TierBadge image={row?.tierImage} name={row?.tierName} size="lg" />
              <h2 className="text-2xl font-semibold tracking-tight">{owner.구단주}</h2>
              {row && (
                <span className="font-mono-num text-sm text-muted-foreground">
                  {row.unranked ? "-" : `#${String(row.rank).padStart(2, "0")}`}
                </span>
              )}
              {row && !row.unranked && <DeltaCell delta={row.delta} />}
            </div>
            <p className="mt-1 text-[11px] font-mono text-muted-foreground">
              최근 갱신:{" "}
              {formatUpdatedAt(
                latest?.crawl_time_detail ?? latest?.crawl_time ?? dataDate(owner.갱신일자),
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              to="/dashboard/$id/squad"
              params={{ id }}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium border border-border rounded-md hover:border-accent hover:text-accent transition-colors"
            >
              스쿼드 분석 <ChevronRight className="size-3" />
            </Link>
          </div>
        </div>

        {/* KPI strip — inline dense, not cards */}
        {seasonHasData && row ? (
          <div className="mt-6 grid grid-cols-2 md:grid-cols-6 gap-x-8 gap-y-4 border-t border-border/60 pt-5">
            <Kpi
              label="순위"
              value={latestRank === undefined ? "—" : `#${String(latestRank).padStart(2, "0")}`}
              detail={formatDelta(rankDiff, "rank")}
              tone={deltaTone(rankDiff)}
              accent
            />
            <Kpi
              label="누적채굴량"
              value={latestMining === undefined ? "—" : latestMining.toString()}
              detail={formatDelta(miningDiff)}
              tone={deltaTone(miningDiff)}
            />
            <Kpi
              label="승률"
              value={latestWinRate ?? "—"}
              detail={formatDelta(rateDiff, "percent")}
            />
            <Kpi
              label="판수"
              value={latestGames === undefined ? "—" : latestGames.toString()}
              detail={formatDelta(gamesDiff)}
            />
            <Kpi
              label="승-무-패"
              value={`${latest?.승 ?? row.w}-${latest?.무 ?? row.d}-${latest?.패 ?? row.l}`}
            />
            <Kpi label="구단가치" value={latestClubValue ?? "—"} />
            <Kpi label="레벨" value={formatProfileLevel(bundle?.profile?.account?.level)} />
            <Kpi label="최고 티어" value={bestDivision?.divisionName || "—"} />
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                최근 5경기
              </span>
              <FormPips form={row.form} />
            </div>
          </div>
        ) : (
          <div className="mt-6 text-xs text-muted-foreground italic">
            현재 시즌의 지표가 아직 없습니다. (누락값을 0으로 표시하지 않습니다.)
          </div>
        )}
      </div>

      <section className="px-4 md:px-8 py-6 border-b border-border">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <SectionTitle>최근 5일 성과 추적</SectionTitle>
          <span className="text-[10px] font-mono text-muted-foreground">
            최근 갱신: {formatUpdatedAt(latest?.crawl_time_detail ?? latest?.crawl_time)}
          </span>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          {historyStatusText(history?.status)}
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <TrendPanel title="순위 변동" detail={formatDelta(rankDiff, "rank")}>
            <MiniLineChart
              data={trendData.map((point) => ({ label: point.label, value: point.rank }))}
              domain={rankDomain(trendData)}
              reverse
              valueFormatter={(value) => `#${value}`}
              stroke="var(--accent)"
            />
          </TrendPanel>
          <TrendPanel title="일일 채굴량" detail="전일 대비 증가한 FC">
            <MiniBarChart
              data={trendData.map((point) => ({ label: point.label, value: point.miningDelta }))}
              domain={paddedDomain(trendData.map((point) => point.miningDelta))}
            />
          </TrendPanel>
          <TrendPanel title="승률 변동" detail={formatDelta(rateDiff, "percent")}>
            <MiniLineChart
              data={trendData.map((point) => ({ label: point.label, value: point.winRate }))}
              domain={paddedDomain(
                trendData.map((point) => point.winRate),
                0.4,
              )}
              valueFormatter={(value) => `${value.toFixed(1)}%`}
              stroke="var(--pos)"
            />
          </TrendPanel>
        </div>
      </section>

      {/* Recent matches */}
      <section className="px-4 md:px-8 py-6 border-t border-border">
        <div className="flex items-baseline justify-between">
          <SectionTitle>최근 경기 로그 · Last 20</SectionTitle>
          <span className="text-[10px] font-mono text-muted-foreground">
            상태: {squadStatusLabel(bundle?.status)}
          </span>
        </div>

        {/* Desktop table */}
        <div className="mt-3 hidden md:block overflow-x-auto">
          {recentMatches.length > 0 ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <Th>일자</Th>
                  <Th>결과</Th>
                  <Th>상대</Th>
                  <ThNum>스코어</ThNum>
                  <ThNum>슈팅</ThNum>
                  <ThNum>유효슈팅</ThNum>
                  <ThNum>점유율</ThNum>
                  <Th className="text-right pr-2">경기</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {recentMatches.map((m) => (
                  <tr key={m.matchKey} className="hover:bg-surface-2/60 transition-colors">
                    <td className="py-3 px-3 font-mono-num text-xs text-muted-foreground">
                      {m.일자}
                    </td>
                    <td className="py-3 px-3">
                      <ResultBadge r={m.결과} />
                    </td>
                    <td className="py-3 px-3 text-sm">
                      <div className="flex items-center gap-2">
                        <TierBadge image={m.상대티어이미지} name={m.상대티어명} size="sm" />
                        <span>{m.상대}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono-num text-sm">
                      {m.득점} : {m.실점}
                    </td>
                    <td className="py-3 px-3 text-right font-mono-num text-sm">{m.슈팅}</td>
                    <td className="py-3 px-3 text-right font-mono-num text-sm">{m.유효슈팅}</td>
                    <td className="py-3 px-3 text-right font-mono-num text-sm">{m.점유율}%</td>
                    <td className="py-3 pr-2 text-right">
                      <Link
                        to="/dashboard/$id/match/$matchKey"
                        params={{ id, matchKey: m.matchKey }}
                        className="text-[11px] font-mono text-muted-foreground hover:text-accent transition-colors"
                      >
                        상세 →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyLine>최근 20경기 분석 파일 없음</EmptyLine>
          )}
        </div>

        {/* Mobile list */}
        <div className="mt-3 md:hidden divide-y divide-border/60 border-y border-border/60">
          {recentMatches.length > 0 ? (
            recentMatches.map((m) => (
              <Link
                key={m.matchKey}
                to="/dashboard/$id/match/$matchKey"
                params={{ id, matchKey: m.matchKey }}
                className="grid grid-cols-12 items-center gap-2 py-3 active:bg-surface-2/60"
              >
                <div className="col-span-2">
                  <ResultBadge r={m.결과} />
                </div>
                <div className="col-span-6 min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <TierBadge image={m.상대티어이미지} name={m.상대티어명} size="sm" />
                    <span className="truncate text-sm">{m.상대}</span>
                  </div>
                  <div className="text-[11px] font-mono text-muted-foreground">
                    {m.일자} · 슈팅 {m.슈팅}/{m.유효슈팅} · 점유율 {m.점유율}%
                  </div>
                </div>
                <div className="col-span-4 text-right font-mono-num text-sm">
                  {m.득점} : {m.실점}
                </div>
              </Link>
            ))
          ) : (
            <EmptyLine>최근 20경기 분석 파일 없음</EmptyLine>
          )}
        </div>
      </section>
    </div>
  );
}

function ownerFromRankingRow(row: RankingView, season: string): OwnerDetailRaw {
  const homeWins = Math.ceil(row.w / 2);
  const awayWins = row.w - homeWins;
  const homeDraws = Math.floor(row.d / 2);
  const awayDraws = row.d - homeDraws;
  const homeLosses = Math.floor(row.l / 2);
  const awayLosses = row.l - homeLosses;
  return {
    id: row.id,
    구단주: row.name,
    시즌: season,
    갱신일자: new Date().toISOString().slice(0, 10),
    홈성적: {
      승: homeWins,
      무: homeDraws,
      패: homeLosses,
      득점: 0,
      실점: 0,
    },
    원정성적: {
      승: awayWins,
      무: awayDraws,
      패: awayLosses,
      득점: 0,
      실점: 0,
    },
    최근20: buildSyntheticLog(row),
  };
}

interface RecentMatchRow {
  matchKey: string;
  일자: string;
  상대: string;
  상대티어명: string | null;
  상대티어이미지: string | null;
  결과: MatchResult;
  득점: number;
  실점: number;
  슈팅: number;
  유효슈팅: number;
  점유율: number;
}

function buildRecentMatchRows(matches: OpenApiMatchDetails | null | undefined): RecentMatchRow[] {
  return (matches?.rows ?? [])
    .filter((row) => row.matchKey)
    .slice(0, 20)
    .map((row, index) => ({
      matchKey: row.matchKey ?? `match-${index}`,
      일자: formatRecentDate(row.dateKst),
      상대: row.opponent?.nickname ?? "UNKNOWN",
      상대티어명:
        row.opponent?.divisionName || divisionNameFromCode(row.opponent?.division) || null,
      상대티어이미지: divisionImageFromCode(row.opponent?.division),
      결과: normalizeResult(row.result),
      득점: numberOr(row.self?.score, 0),
      실점: numberOr(row.opponent?.score, 0),
      슈팅: numberOr(row.self?.shots, 0),
      유효슈팅: numberOr(row.self?.shotsOnTarget, 0),
      점유율: Math.round(numberOr(row.self?.possession, 0)),
    }));
}

function formatRecentDate(value: string | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes}`;
}

function normalizeResult(value: string | undefined): MatchResult {
  const normalized = String(value ?? "").toUpperCase();
  if (normalized === "W" || normalized === "WIN" || normalized === "승") return "W";
  if (normalized === "L" || normalized === "LOSE" || normalized === "패") return "L";
  return "D";
}

function buildSyntheticLog(row: RankingView): MatchLogRaw[] {
  const pool = row.form.length > 0 ? row.form : (["W", "D", "L"] satisfies MatchResult[]);
  return Array.from({ length: Math.min(20, Math.max(5, row.gp)) }, (_, index) => {
    const result = pool[index % pool.length];
    return {
      matchKey: `pending-${row.id}-${String(index + 1).padStart(2, "0")}`,
      일자: "데이터 준비중",
      상대: "분석 파일 미연결",
      홈원정: index % 2 === 0 ? "홈" : "원정",
      결과: result,
      득점: result === "W" ? 1 : 0,
      실점: result === "L" ? 1 : 0,
      포메이션: "—",
      점유율: 0,
    };
  });
}

function MissingOwner({ id }: { id: string }) {
  return (
    <div className="flex-1 p-8">
      <Link
        to="/tables"
        className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-3" /> 시즌 순위
      </Link>
      <div className="mt-8 max-w-sm">
        <h2 className="text-sm font-semibold">구단주 데이터 없음</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          `{id}`에 해당하는 시즌 순위 또는 개인 분석 데이터가 현재 경로에 없습니다.
        </p>
      </div>
    </div>
  );
}

function LoadingOwner({ id }: { id: string }) {
  return (
    <div className="flex-1 p-8">
      <Link
        to="/tables"
        className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-3" /> 시즌 순위
      </Link>
      <div className="mt-8 max-w-sm">
        <h2 className="text-sm font-semibold">구단주 데이터 확인 중</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          `{id}`의 시즌 순위와 개인 분석 파일을 불러오고 있습니다.
        </p>
      </div>
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
  detail,
  accent,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  accent?: boolean;
  tone?: "pos" | "neg";
}) {
  const toneClass = tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "";
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
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
      {detail && <span className="font-mono-num text-[11px] text-muted-foreground">{detail}</span>}
    </div>
  );
}

interface TrendPoint {
  label: string;
  rank: number | null;
  miningDelta: number | null;
  winRate: number | null;
}

function TrendPanel({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-surface/20 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-xs font-semibold">{title}</h4>
        <span className="truncate text-right font-mono-num text-[10px] text-muted-foreground">
          {detail}
        </span>
      </div>
      <div className="mt-3 h-[174px] overflow-hidden">{children}</div>
    </div>
  );
}

interface MiniChartDatum {
  label: string;
  value: number | null;
}

function MiniLineChart({
  data,
  domain,
  reverse = false,
  valueFormatter,
  stroke,
}: {
  data: MiniChartDatum[];
  domain: [number, number];
  reverse?: boolean;
  valueFormatter: (value: number) => string;
  stroke: string;
}) {
  const metrics = chartMetrics(data, domain, reverse);
  const path = metrics.points
    .filter((point) => point.value !== null)
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  return (
    <svg viewBox="0 0 320 180" className="h-full w-full overflow-hidden">
      <ChartGrid />
      {path && <path d={path} fill="none" stroke={stroke} strokeWidth="2.5" />}
      {metrics.points.map((point) =>
        point.value === null ? null : (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r="3.5" fill="var(--background)" stroke={stroke} />
            <text
              x={point.x}
              y={Math.max(14, point.y - 10)}
              textAnchor="middle"
              className="fill-muted-foreground text-[9px] font-mono"
            >
              {valueFormatter(point.value)}
            </text>
          </g>
        ),
      )}
      <ChartLabels points={metrics.points} />
    </svg>
  );
}

function MiniBarChart({ data, domain }: { data: MiniChartDatum[]; domain: [number, number] }) {
  const metrics = chartMetrics(data, domain);
  const zeroY = valueToY(0, domain, false);
  const barWidth = Math.max(14, 180 / Math.max(1, data.length));

  return (
    <svg viewBox="0 0 320 180" className="h-full w-full overflow-hidden">
      <ChartGrid />
      <line x1="24" x2="304" y1={zeroY} y2={zeroY} stroke="var(--border)" />
      {metrics.points.map((point) => {
        if (point.value === null) return null;
        const top = Math.min(point.y, zeroY);
        const height = Math.max(2, Math.abs(zeroY - point.y));
        return (
          <g key={point.label}>
            <rect
              x={point.x - barWidth / 2}
              y={top}
              width={barWidth}
              height={height}
              rx="3"
              fill={point.value >= 0 ? "var(--accent)" : "var(--neg)"}
              opacity="0.86"
            />
            <text
              x={point.x}
              y={Math.max(12, top - 8)}
              textAnchor="middle"
              className="fill-muted-foreground text-[9px] font-mono"
            >
              {point.value > 0 ? `+${point.value}` : point.value}
            </text>
          </g>
        );
      })}
      <ChartLabels points={metrics.points} />
    </svg>
  );
}

function ChartGrid() {
  return (
    <g>
      {[28, 62, 96, 130].map((y) => (
        <line key={y} x1="24" x2="304" y1={y} y2={y} stroke="var(--border)" strokeDasharray="3 4" />
      ))}
    </g>
  );
}

function ChartLabels({ points }: { points: Array<MiniChartDatum & { x: number; y: number }> }) {
  return (
    <g>
      {points.map((point) => (
        <text
          key={point.label}
          x={point.x}
          y="166"
          textAnchor="middle"
          className="fill-muted-foreground text-[10px] font-mono"
        >
          {point.label}
        </text>
      ))}
    </g>
  );
}

function chartMetrics(data: MiniChartDatum[], domain: [number, number], reverse = false) {
  const width = 280;
  const left = 24;
  const gap = data.length > 1 ? width / (data.length - 1) : 0;
  return {
    points: data.map((point, index) => ({
      ...point,
      x: left + gap * index,
      y: point.value === null ? 82 : valueToY(point.value, domain, reverse),
    })),
  };
}

function valueToY(value: number, domain: [number, number], reverse: boolean): number {
  const [min, max] = domain;
  const span = max === min ? 1 : max - min;
  const normalized = (value - min) / span;
  const ratio = reverse ? normalized : 1 - normalized;
  return 20 + ratio * 116;
}

function buildTrendData(history: OwnerHistoryData | null): TrendPoint[] {
  const points = history?.points ?? [];
  return points.map((point, index) => {
    const previous = index > 0 ? points[index - 1]?.row : null;
    const mining =
      typeof point.row?.["전일 대비 채굴량"] === "number"
        ? point.row["전일 대비 채굴량"]
        : point.row && previous
          ? numberFrom(point.row.누적채굴량 ?? point.row["채굴 효율"]) -
            numberFrom(previous.누적채굴량 ?? previous["채굴 효율"])
          : null;
    return {
      label: point.label,
      rank: isUnrankedRaw(point.row) ? null : (point.row?.순위 ?? null),
      miningDelta: mining,
      winRate: parsePercent(point.row?.승률),
    };
  });
}

function isUnrankedRaw(row: OwnerHistoryData["points"][number]["row"] | null | undefined): boolean {
  if (!row) return true;
  const w = numberOr(row.승, 0);
  const d = numberOr(row.무, 0);
  const l = numberOr(row.패, 0);
  const gp = numberOr(row.판수, w + d + l);
  const tierCode = String(row["최근 매치 티어 코드"] ?? "").trim();
  const tierImage = String(row["최근 매치 티어 이미지"] ?? "").trim();
  return gp <= 0 || (!tierCode && !tierImage);
}

function rankDomain(points: TrendPoint[]): [number, number] {
  const values = points
    .map((point) => point.rank)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (values.length === 0) return [1, 40];
  const min = Math.max(1, Math.min(...values) - 1);
  const max = Math.max(...values) + 1;
  return [min, max];
}

function paddedDomain(values: Array<number | null>, pad = 1): [number, number] {
  const finite = values.filter((value): value is number => Number.isFinite(value));
  if (finite.length === 0) return [0, 1];
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (min === max) return [min - pad, max + pad];
  return [Math.floor(min - pad), Math.ceil(max + pad)];
}

function numberFrom(value: unknown): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parsePercent(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value.replace("%", ""));
  return Number.isFinite(n) ? n : null;
}

function formatDelta(value: number | null, mode: "plain" | "rank" | "percent" = "plain") {
  if (value === null) return "전일 대비 —";
  if (value === 0) return "전일 대비 0";
  const prefix = value > 0 ? "+" : "";
  const suffix = mode === "percent" ? "%p" : "";
  const label = mode === "rank" ? (value > 0 ? "상승" : "하락") : "";
  return `전일 대비 ${prefix}${value}${suffix}${label ? ` ${label}` : ""}`;
}

function formatProfileLevel(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `Lv.${value}` : "—";
}

function dataDate(value: string | null | undefined): string | undefined {
  return value || undefined;
}

function deltaTone(value: number | null): "pos" | "neg" | undefined {
  if (value === null || value === 0) return undefined;
  return value > 0 ? "pos" : "neg";
}

function historyStatusText(status: OwnerHistoryData["status"] | undefined): string {
  if (status === "daily") return "최신 경기 데이터를 기준으로 전일 대비를 계산했습니다.";
  if (status === "ranking-fallback") return "현재 시즌 집계 기준으로 표시합니다.";
  if (status === "missing") return "현재 시즌 데이터에서 구단주를 찾지 못했습니다.";
  return "데이터를 확인하는 중입니다.";
}

function formatUpdatedAt(value: string | null | undefined): string {
  return value || "확인 중";
}

function squadStatusLabel(status: SquadBundle["status"] | undefined): string {
  if (status === "ready") return "정상";
  if (status === "partial") return "일부 데이터";
  if (status === "missing") return "대기";
  return "확인 중";
}

function ResultBadge({ r }: { r: MatchResult }) {
  const map = {
    W: "bg-pos/15 border-pos/40 text-pos",
    D: "bg-warn/15 border-warn/40 text-warn",
    L: "bg-neg/15 border-neg/40 text-neg",
  } as const;
  return (
    <span
      className={
        "inline-flex items-center justify-center size-5 border rounded-[3px] text-[10px] font-bold font-mono " +
        map[r]
      }
    >
      {r}
    </span>
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
function ThNum({ children }: { children: React.ReactNode }) {
  return (
    <th className="py-3 px-3 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
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
        "py-3 px-3 text-right font-mono-num text-sm " +
        (muted ? "text-muted-foreground " : "text-foreground/90 ") +
        className
      }
    >
      {children}
    </td>
  );
}
