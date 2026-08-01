import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useSeason } from "@/lib/season-context";
import { formatSeasonLabel } from "@/lib/mockData";
import { fetchRankingData, fallbackRankingData, type RankingData } from "@/lib/service-data";
import { FormPips, FormDots } from "@/components/form-pips";
import { TierBadge } from "@/components/tier-badge";
import { ChevronUp, ChevronDown, Minus } from "lucide-react";

export const Route = createFileRoute("/tables")({
  head: () => ({
    meta: [
      { title: "시즌 순위 — ESCLUB" },
      {
        name: "description",
        content:
          "ESCLUB — FC Online 감독모드 클럽 시즌별 구단주 순위, 승점, 득실, 최근 5경기 폼을 비교합니다.",
      },
      { property: "og:title", content: "시즌 순위 — ESCLUB" },
      {
        property: "og:description",
        content: "감독모드 클럽 시즌별 구단주 순위와 비교 지표.",
      },
    ],
  }),
  component: TablesPage,
});

function DeltaCell({ delta }: { delta: number | null }) {
  if (delta === null)
    return (
      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
        NEW
      </span>
    );
  if (delta === 0) return <Minus className="size-3 text-muted-foreground" aria-label="변동 없음" />;
  if (delta > 0)
    return (
      <span className="flex items-center gap-0.5 text-pos font-mono-num text-xs">
        <ChevronUp className="size-3" />
        {delta}
      </span>
    );
  return (
    <span className="flex items-center gap-0.5 text-neg font-mono-num text-xs">
      <ChevronDown className="size-3" />
      {Math.abs(delta)}
    </span>
  );
}

function TablesPage() {
  const { season, seasons } = useSeason();
  const [data, setData] = useState<RankingData>(() => fallbackRankingData(season));
  const [loading, setLoading] = useState(true);
  const rows = useMemo(() => data.rows, [data]);
  const seasonMeta = seasons.find((s) => s.id === season) ?? {
    id: season,
    label: formatSeasonLabel(season),
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchRankingData(season).then((next) => {
      if (cancelled) return;
      setData(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [season]);

  if (!loading && rows.length === 0) {
    return <EmptyState seasonLabel={seasonMeta.label} />;
  }

  return (
    <div className="flex flex-col">
      {/* Sub-context bar */}
      <div className="hidden md:flex items-center justify-between px-8 py-3 border-b border-border bg-surface/40 text-[11px] font-mono text-muted-foreground">
        <div className="flex gap-6">
          <span>
            최근 갱신: <span className="text-foreground">{data.lastUpdated ?? "확인 중"}</span>
          </span>
          <span>
            ROWS: <span className="text-foreground">{loading ? "..." : rows.length}</span>
          </span>
        </div>
        <span>정렬: 순위 → 누적채굴량</span>
      </div>

      {data.kings && <KingStrip data={data} />}

      {/* Desktop table */}
      <div className="hidden md:block flex-1 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border">
              <Th className="pl-8 w-20">순위</Th>
              <Th className="w-14">변동</Th>
              <Th>구단주</Th>
              <ThNum>판수</ThNum>
              <ThNum>W</ThNum>
              <ThNum>D</ThNum>
              <ThNum>L</ThNum>
              <ThNum className="text-foreground">누적</ThNum>
              <ThNum>일일</ThNum>
              <ThNum>승률</ThNum>
              <ThNum>구단가치</ThNum>
              <Th className="pr-8">최근 5경기</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-surface-2/60 transition-colors group">
                <td className="py-3.5 pl-8 pr-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={
                        "font-mono-num text-sm " +
                        (!r.unranked && r.rank <= 3
                          ? "text-foreground font-semibold"
                          : "text-foreground")
                      }
                    >
                      {formatRank(r)}
                    </span>
                  </div>
                </td>
                <td className="py-3.5 px-3">
                  {r.unranked ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <DeltaCell delta={r.delta} />
                  )}
                </td>
                <td className="py-3.5 px-3">
                  <Link
                    to="/dashboard/$id"
                    params={{ id: r.id }}
                    className="flex items-center gap-3 group-hover:text-accent transition-colors"
                  >
                    <TierBadge image={r.tierImage} name={r.tierName} />
                    <span className="text-sm font-medium">{r.name}</span>
                  </Link>
                </td>
                <TdNum>{r.gp}</TdNum>
                <TdNum>{r.w}</TdNum>
                <TdNum>{r.d}</TdNum>
                <TdNum>{r.l}</TdNum>
                <TdNum className="text-foreground font-medium">{r.miningPower}</TdNum>
                <TdNum
                  className={
                    r.growth && r.growth > 0
                      ? "text-pos"
                      : r.growth && r.growth < 0
                        ? "text-neg"
                        : ""
                  }
                >
                  {r.growth === null ? "—" : r.growth > 0 ? `+${r.growth}` : r.growth}
                </TdNum>
                <TdNum>{r.winRate === null ? "—" : `${(r.winRate * 100).toFixed(1)}%`}</TdNum>
                <TdNum muted>{r.clubValue ?? "—"}</TdNum>
                <td className="py-3.5 pl-3 pr-8">
                  <FormPips form={r.form} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile list — separate information structure, not a squished table */}
      <div className="md:hidden flex flex-col">
        <div className="px-4 py-2.5 bg-surface/60 border-b border-border">
          <div className="grid grid-cols-12 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            <div className="col-span-2">RANK</div>
            <div className="col-span-6">구단주</div>
            <div className="col-span-2 text-right">누적</div>
            <div className="col-span-2 text-right">FORM</div>
          </div>
        </div>
        <div className="divide-y divide-border/60">
          {rows.map((r) => (
            <Link
              key={r.id}
              to="/dashboard/$id"
              params={{ id: r.id }}
              className="px-4 py-3.5 grid grid-cols-12 items-center active:bg-surface-2/60"
            >
              <div className="col-span-2 flex items-center gap-1.5">
                <span className="font-mono-num text-sm">{formatRank(r)}</span>
                {!r.unranked && r.delta !== null && r.delta !== 0 && (
                  <span className={r.delta > 0 ? "text-pos" : "text-neg"}>
                    {r.delta > 0 ? (
                      <ChevronUp className="size-3" />
                    ) : (
                      <ChevronDown className="size-3" />
                    )}
                  </span>
                )}
              </div>
              <div className="col-span-6 flex min-w-0 items-center gap-2">
                <TierBadge image={r.tierImage} name={r.tierName} size="sm" />
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium truncate">{r.name}</span>
                  <span className="truncate whitespace-nowrap text-[11px] text-muted-foreground font-mono-num">
                    {r.gp}판 · W{r.w} D{r.d} L{r.l}
                  </span>
                  <span className="truncate whitespace-nowrap text-[11px] text-muted-foreground font-mono-num">
                    구단가치 {r.clubValue ?? "가치 없음"}
                  </span>
                </div>
              </div>
              <div className="col-span-2 text-right font-mono-num font-semibold text-sm">
                {r.miningPower}
              </div>
              <div className="col-span-2">
                <FormDots form={r.form} />
              </div>
            </Link>
          ))}
        </div>
      </div>

      <footer className="mt-auto border-t border-border p-6 md:px-8">
        <div className="max-w-prose">
          <p className="text-[11px] leading-relaxed text-muted-foreground text-pretty">
            누적채굴량은 매치 당시 플레이어 티어 기준 승리 FC 합산입니다. 순위는 원본 시즌 집계의
            순위 필드를 우선 사용하고, 누락 시 누적채굴량 기준으로 정렬합니다.
          </p>
        </div>
      </footer>
    </div>
  );
}

function formatRank(row: { rank: number; unranked?: boolean }): string {
  if (row.unranked) return "-";
  return String(row.rank).padStart(2, "0");
}

function KingStrip({ data }: { data: RankingData }) {
  const items = [
    {
      label: "채굴왕",
      row: data.kings?.mining,
      value: data.kings?.mining?.["지난 시즌 누적채굴량"] ?? data.kings?.mining?.누적채굴량,
    },
    { label: "승률왕", row: data.kings?.winRate, value: data.kings?.winRate?.["지난 시즌 승률"] },
    {
      label: "판수왕",
      row: data.kings?.gameCount,
      value: data.kings?.gameCount?.["지난 시즌 판수"],
    },
    { label: "승부왕", row: data.kings?.draw, value: data.kings?.draw?.["지난 시즌 무"] },
  ].filter((item) => item.row);

  if (items.length === 0) return null;

  return (
    <section className="grid gap-0 border-b border-border md:grid-cols-4">
      {items.map((item) => (
        <Link
          key={item.label}
          to="/dashboard/$id"
          params={{ id: item.row?.player_id ?? item.row?.name ?? "" }}
          className="border-border px-4 py-3 transition-colors hover:bg-surface-2/50 md:border-r md:px-8"
        >
          <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            {item.label}
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <span className="truncate text-sm font-semibold">
              {item.row?.구단주명 ?? item.row?.name}
            </span>
            <span className="shrink-0 font-mono-num text-xs text-accent">{item.value ?? "—"}</span>
          </div>
        </Link>
      ))}
    </section>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={
        "py-4 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider " +
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
        "py-4 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-right " +
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
        "py-3.5 px-3 text-right font-mono-num text-sm " +
        (muted ? "text-muted-foreground " : "text-foreground/80 ") +
        className
      }
    >
      {children}
    </td>
  );
}

function EmptyState({ seasonLabel }: { seasonLabel: string }) {
  return (
    <div className="flex-1 flex items-center justify-center p-12">
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-4 size-10 rounded-md border border-border grid place-items-center">
          <Minus className="size-4 text-muted-foreground" />
        </div>
        <h2 className="text-sm font-semibold">데이터 없음</h2>
        <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
          {seasonLabel} 시즌의 순위 데이터가 아직 없습니다. 과거 시즌으로 현재 데이터를 대체하지
          않습니다.
        </p>
      </div>
    </div>
  );
}
