import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSeason } from "@/lib/season-context";
import { RANKINGS, SEASONS, toRankingView } from "@/lib/mockData";
import { FormPips, FormDots } from "@/components/form-pips";
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
  if (delta === 0)
    return <Minus className="size-3 text-muted-foreground" aria-label="변동 없음" />;
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
  const { season } = useSeason();
  const rows = useMemo(() => toRankingView(RANKINGS[season] ?? []), [season]);
  const seasonMeta = SEASONS.find((s) => s.id === season)!;

  // Contract note: 과거 시즌에 현재 시즌 데이터를 fallback하지 않음.
  if (rows.length === 0) {
    return <EmptyState seasonLabel={seasonMeta.label} />;
  }

  return (
    <div className="flex flex-col">
      {/* Sub-context bar */}
      <div className="hidden md:flex items-center justify-between px-8 py-3 border-b border-border bg-surface/40 text-[11px] font-mono text-muted-foreground">
        <div className="flex gap-6">
          <span>
            SOURCE:{" "}
            <span className="text-foreground">
              /data/{season}/current_crawl_display_data.json
            </span>
          </span>
          <span>
            ROWS: <span className="text-foreground">{rows.length}</span>
          </span>
        </div>
        <span>정렬: 승점 → 득실차 → 득점</span>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block flex-1 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border">
              <Th className="pl-8 w-20">순위</Th>
              <Th className="w-14">변동</Th>
              <Th>구단주</Th>
              <ThNum>GP</ThNum>
              <ThNum>W</ThNum>
              <ThNum>D</ThNum>
              <ThNum>L</ThNum>
              <ThNum>GF</ThNum>
              <ThNum>GA</ThNum>
              <ThNum>GD</ThNum>
              <ThNum className="text-foreground">PTS</ThNum>
              <ThNum>승률</ThNum>
              <Th className="pr-8">최근 5경기</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {rows.map((r) => (
              <tr
                key={r.id}
                className="hover:bg-surface-2/60 transition-colors group"
              >
                <td className="py-3.5 pl-8 pr-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={
                        "font-mono-num text-sm " +
                        (r.rank <= 3 ? "text-foreground font-semibold" : "text-foreground")
                      }
                    >
                      {String(r.rank).padStart(2, "0")}
                    </span>
                  </div>
                </td>
                <td className="py-3.5 px-3">
                  <DeltaCell delta={r.delta} />
                </td>
                <td className="py-3.5 px-3">
                  <Link
                    to="/dashboard/$id"
                    params={{ id: r.id }}
                    className="flex items-center gap-3 group-hover:text-accent transition-colors"
                  >
                    <div className="size-6 rounded-sm bg-surface-2 outline-1 -outline-offset-1 outline-white/5" />
                    <span className="text-sm font-medium">{r.name}</span>
                  </Link>
                </td>
                <TdNum>{r.gp}</TdNum>
                <TdNum>{r.w}</TdNum>
                <TdNum>{r.d}</TdNum>
                <TdNum>{r.l}</TdNum>
                <TdNum muted>{r.gf}</TdNum>
                <TdNum muted>{r.ga}</TdNum>
                <TdNum className={r.gd > 0 ? "text-pos" : r.gd < 0 ? "text-neg" : ""}>
                  {r.gd > 0 ? `+${r.gd}` : r.gd}
                </TdNum>
                <TdNum className="text-foreground font-medium">{r.pts}</TdNum>
                <TdNum>
                  {r.winRate === null ? "—" : `${(r.winRate * 100).toFixed(1)}%`}
                </TdNum>
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
          <div className="grid grid-cols-12 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            <div className="col-span-2">RANK</div>
            <div className="col-span-6">구단주</div>
            <div className="col-span-2 text-right">PTS</div>
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
                <span className="font-mono-num text-sm">
                  {String(r.rank).padStart(2, "0")}
                </span>
                {r.delta !== null && r.delta !== 0 && (
                  <span className={r.delta > 0 ? "text-pos" : "text-neg"}>
                    {r.delta > 0 ? (
                      <ChevronUp className="size-3" />
                    ) : (
                      <ChevronDown className="size-3" />
                    )}
                  </span>
                )}
              </div>
              <div className="col-span-6 flex flex-col min-w-0">
                <span className="text-sm font-medium truncate">{r.name}</span>
                <span className="text-[10px] text-muted-foreground font-mono-num">
                  W{r.w} D{r.d} L{r.l} · GD {r.gd > 0 ? `+${r.gd}` : r.gd}
                </span>
              </div>
              <div className="col-span-2 text-right font-mono-num font-semibold text-sm">
                {r.pts}
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
            승점 = 승×3 + 무×1. 순위는 승점 → 득실차 → 득점 순으로 결정됩니다.
            누락된 지표는 0으로 취급하지 않습니다. 구단주명을 클릭하면 개별 대시보드로
            이동합니다.
          </p>
        </div>
      </footer>
    </div>
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
          {seasonLabel} 시즌의 순위 데이터가 아직 없습니다. 과거 시즌으로 현재 데이터를
          대체하지 않습니다.
        </p>
      </div>
    </div>
  );
}
