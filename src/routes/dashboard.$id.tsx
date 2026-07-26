import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMemo } from "react";
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Minus } from "lucide-react";
import { useSeason } from "@/lib/season-context";
import { RANKINGS, toRankingView } from "@/lib/mockData";
import { OWNER_DETAILS, splitToView, type SplitLine } from "@/lib/ownerData";
import { FormPips } from "@/components/form-pips";

export const Route = createFileRoute("/dashboard/$id")({
  head: ({ params }) => {
    const owner = OWNER_DETAILS[params.id];
    const title = owner ? `${owner.구단주} — 구단주 대시보드` : "구단주 — ESCLUB";
    return {
      meta: [
        { title: `${title} · ESCLUB` },
        {
          name: "description",
          content: owner
            ? `${owner.구단주}의 시즌 성과, 홈·원정 분리, 최근 경기 로그.`
            : "ESCLUB 구단주 대시보드.",
        },
        { property: "og:title", content: title },
        { name: "robots", content: owner ? "index,follow" : "noindex" },
      ],
    };
  },
  loader: ({ params }) => {
    if (!OWNER_DETAILS[params.id]) throw notFound();
    return null;
  },
  component: OwnerDashboard,
});

function DeltaCell({ delta }: { delta: number | null }) {
  if (delta === null)
    return <span className="text-[10px] font-mono text-muted-foreground">NEW</span>;
  if (delta === 0) return <Minus className="size-3 text-muted-foreground" />;
  const up = delta > 0;
  return (
    <span className={"flex items-center gap-0.5 font-mono-num text-xs " + (up ? "text-pos" : "text-neg")}>
      {up ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
      {Math.abs(delta)}
    </span>
  );
}

function OwnerDashboard() {
  const { id } = Route.useParams();
  const { season } = useSeason();
  const owner = OWNER_DETAILS[id]!;
  const ranking = useMemo(() => toRankingView(RANKINGS[season] ?? []), [season]);
  const row = ranking.find((r) => r.id === id);

  const home = splitToView("홈", owner.홈성적);
  const away = splitToView("원정", owner.원정성적);
  const total: SplitLine = {
    label: "전체",
    gp: home.gp + away.gp,
    w: home.w + away.w,
    d: home.d + away.d,
    l: home.l + away.l,
    gf: home.gf + away.gf,
    ga: home.ga + away.ga,
    gd: home.gf + away.gf - home.ga - away.ga,
    pts: home.pts + away.pts,
    winRate:
      home.gp + away.gp > 0 ? (home.w + away.w) / (home.gp + away.gp) : null,
  };

  const seasonHasData = (RANKINGS[season] ?? []).length > 0;

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
              <h2 className="text-2xl font-semibold tracking-tight">
                {owner.구단주}
              </h2>
              {row && (
                <span className="font-mono-num text-sm text-muted-foreground">
                  #{String(row.rank).padStart(2, "0")}
                </span>
              )}
              {row && <DeltaCell delta={row.delta} />}
            </div>
            <p className="mt-1 text-[11px] font-mono text-muted-foreground">
              SOURCE: /data/{season}/user/{owner.id}/{owner.id}_
              {owner.갱신일자.replace(/-/g, "").slice(2)}.json
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
            <Kpi label="승점" value={row.pts.toString()} accent />
            <Kpi
              label="승률"
              value={row.winRate === null ? "—" : `${(row.winRate * 100).toFixed(1)}%`}
            />
            <Kpi label="경기수" value={row.gp.toString()} />
            <Kpi
              label="W-D-L"
              value={`${row.w}-${row.d}-${row.l}`}
            />
            <Kpi
              label="득실차"
              value={row.gd > 0 ? `+${row.gd}` : row.gd.toString()}
              tone={row.gd > 0 ? "pos" : row.gd < 0 ? "neg" : undefined}
            />
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

      {/* Home / Away split */}
      <section className="px-4 md:px-8 py-6">
        <SectionTitle>홈 / 원정 분리</SectionTitle>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[640px]">
            <thead>
              <tr className="border-b border-border">
                <Th>구분</Th>
                <ThNum>GP</ThNum>
                <ThNum>W</ThNum>
                <ThNum>D</ThNum>
                <ThNum>L</ThNum>
                <ThNum>GF</ThNum>
                <ThNum>GA</ThNum>
                <ThNum>GD</ThNum>
                <ThNum>PTS</ThNum>
                <ThNum>승률</ThNum>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              <SplitRow line={home} />
              <SplitRow line={away} />
              <SplitRow line={total} emphasis />
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent matches */}
      <section className="px-4 md:px-8 py-6 border-t border-border">
        <div className="flex items-baseline justify-between">
          <SectionTitle>최근 경기 로그 · Last 20</SectionTitle>
          <span className="text-[10px] font-mono text-muted-foreground">
            match_details_last20.json
          </span>
        </div>

        {/* Desktop table */}
        <div className="mt-3 hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border">
                <Th>일자</Th>
                <Th>결과</Th>
                <Th>상대</Th>
                <Th>H/A</Th>
                <ThNum>스코어</ThNum>
                <Th>포메이션</Th>
                <ThNum>점유율</ThNum>
                <Th className="text-right pr-2">경기</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {owner.최근20.map((m) => (
                <tr key={m.matchKey} className="hover:bg-surface-2/60 transition-colors">
                  <td className="py-3 px-3 font-mono-num text-xs text-muted-foreground">
                    {m.일자}
                  </td>
                  <td className="py-3 px-3">
                    <ResultBadge r={m.결과} />
                  </td>
                  <td className="py-3 px-3 text-sm">{m.상대}</td>
                  <td className="py-3 px-3 text-xs text-muted-foreground">
                    {m.홈원정}
                  </td>
                  <td className="py-3 px-3 text-right font-mono-num text-sm">
                    {m.득점} : {m.실점}
                  </td>
                  <td className="py-3 px-3 font-mono-num text-xs text-muted-foreground">
                    {m.포메이션}
                  </td>
                  <td className="py-3 px-3 text-right font-mono-num text-sm">
                    {m.점유율}%
                  </td>
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
        </div>

        {/* Mobile list */}
        <div className="mt-3 md:hidden divide-y divide-border/60 border-y border-border/60">
          {owner.최근20.map((m) => (
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
                <div className="text-sm truncate">{m.상대}</div>
                <div className="text-[10px] font-mono text-muted-foreground">
                  {m.일자} · {m.홈원정} · {m.포메이션}
                </div>
              </div>
              <div className="col-span-4 text-right font-mono-num text-sm">
                {m.득점} : {m.실점}
              </div>
            </Link>
          ))}
        </div>
      </section>
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

function SplitRow({ line, emphasis }: { line: SplitLine; emphasis?: boolean }) {
  return (
    <tr className={emphasis ? "bg-surface/40" : ""}>
      <td className="py-3 px-3 text-sm">{line.label}</td>
      <Td>{line.gp}</Td>
      <Td>{line.w}</Td>
      <Td>{line.d}</Td>
      <Td>{line.l}</Td>
      <Td muted>{line.gf}</Td>
      <Td muted>{line.ga}</Td>
      <Td className={line.gd > 0 ? "text-pos" : line.gd < 0 ? "text-neg" : ""}>
        {line.gd > 0 ? `+${line.gd}` : line.gd}
      </Td>
      <Td className={emphasis ? "text-foreground font-medium" : ""}>{line.pts}</Td>
      <Td>{line.winRate === null ? "—" : `${(line.winRate * 100).toFixed(1)}%`}</Td>
    </tr>
  );
}

import type { MatchResult } from "@/lib/mockData";

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
