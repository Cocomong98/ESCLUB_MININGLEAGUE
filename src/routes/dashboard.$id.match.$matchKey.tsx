import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ChevronLeft, MapPin, Whistle, ArrowRightLeft } from "lucide-react";
import { OWNER_DETAILS } from "@/lib/ownerData";
import { getMatchDetail, type TeamStatsRaw, type GoalEventRaw } from "@/lib/matchDetail";
import type { MatchResult } from "@/lib/mockData";

export const Route = createFileRoute("/dashboard/$id/match/$matchKey")({
  head: ({ params }) => {
    const md = getMatchDetail(params.id, params.matchKey);
    const owner = OWNER_DETAILS[params.id];
    const title = md
      ? `${owner?.구단주} vs ${md.상대} · ${md.득점}-${md.실점}`
      : "경기 상세";
    return {
      meta: [
        { title: `${title} — ESCLUB` },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  loader: ({ params }) => {
    if (!getMatchDetail(params.id, params.matchKey)) throw notFound();
    return null;
  },
  component: MatchPage,
});

function MatchPage() {
  const { id, matchKey } = Route.useParams();
  const owner = OWNER_DETAILS[id]!;
  const md = getMatchDetail(id, matchKey)!;
  const resultTone =
    md.결과 === "W" ? "text-pos" : md.결과 === "L" ? "text-neg" : "text-warn";
  const resultLabel = md.결과 === "W" ? "승" : md.결과 === "L" ? "패" : "무";

  return (
    <div className="flex flex-col">
      {/* Header */}
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
          <span className="text-foreground">경기 상세</span>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-3">
              <ResultBadge r={md.결과} size="lg" />
              <h2 className="text-2xl font-semibold tracking-tight">
                {owner.구단주}{" "}
                <span className="text-muted-foreground font-normal">vs</span>{" "}
                {md.상대}
              </h2>
            </div>
            <p className="mt-2 text-[11px] font-mono text-muted-foreground">
              {md.일자} · {md.홈원정} · {md.경기장} · SOURCE:
              /data/{owner.시즌}/user/{id}/match/{matchKey}.json
            </p>
          </div>

          {/* Big scoreline */}
          <div className="flex items-baseline gap-4">
            <span className="font-mono-num text-5xl tabular-nums">
              {md.득점}
            </span>
            <span className={`font-mono text-xl ${resultTone}`}>:</span>
            <span className="font-mono-num text-5xl tabular-nums text-muted-foreground">
              {md.실점}
            </span>
            <span className={`ml-3 text-xs font-mono uppercase tracking-wider ${resultTone}`}>
              {resultLabel}
            </span>
          </div>
        </div>

        {/* Meta strip */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-x-8 gap-y-3 border-t border-border/60 pt-4 text-xs">
          <MetaItem icon={<span className="font-mono-num">F</span>} label="포메이션" value={`${md.포메이션} vs ${md.상대포메이션}`} />
          <MetaItem icon={<MapPin className="size-3" />} label="경기장" value={md.경기장} />
          <MetaItem icon={<Whistle className="size-3" />} label="주심" value={md.주심} />
          <MetaItem icon={<span className="text-[9px] font-mono">MoM</span>} label="최고평점" value={`${md.최고평점.선수명} · ${md.최고평점.평점.toFixed(1)}`} />
          <MetaItem icon={<ArrowRightLeft className="size-3" />} label="교체" value={`${md.교체기록.length}회`} />
        </div>
      </div>

      {/* Team stats comparison */}
      <section className="px-4 md:px-8 py-6 border-b border-border">
        <div className="flex items-baseline justify-between">
          <SectionTitle>팀 스탯 · Team stats</SectionTitle>
          <span className="text-[10px] font-mono text-muted-foreground">
            {owner.구단주} vs {md.상대}
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

      {/* Goals timeline */}
      <section className="px-4 md:px-8 py-6 border-b border-border grid gap-8 lg:grid-cols-2">
        <div>
          <SectionTitle>득점 기록 · {owner.구단주}</SectionTitle>
          <GoalList list={md.득점기록} empty="득점 없음" />
        </div>
        <div>
          <SectionTitle>실점 기록 · {md.상대}</SectionTitle>
          <GoalList list={md.실점기록} empty="실점 없음" mute />
        </div>
      </section>

      {/* Starting XI */}
      <section className="px-4 md:px-8 py-6 border-b border-border">
        <SectionTitle>선발 11인</SectionTitle>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[640px]">
            <thead>
              <tr className="border-b border-border">
                <Th>POS</Th>
                <Th>선수</Th>
                <ThNum>OVR</ThNum>
                <ThNum>G</ThNum>
                <ThNum>A</ThNum>
                <ThNum>평점</ThNum>
                <Th className="text-right pr-2">상세</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {md.선발11.map((p) => (
                <tr key={p.선수id} className="hover:bg-surface-2/60 transition-colors">
                  <td className="py-2.5 px-3">
                    <span className="inline-flex items-center justify-center min-w-8 px-1.5 h-5 rounded-[3px] border border-border/80 text-[10px] font-mono font-semibold text-muted-foreground">
                      {p.포지션}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm">{p.선수명}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {p.국적}
                      </span>
                    </div>
                  </td>
                  <Td className="text-accent font-semibold">{p.OVR}</Td>
                  <Td>{p.득점}</Td>
                  <Td>{p.도움}</Td>
                  <Td className={p.평점 >= 8 ? "text-pos" : p.평점 < 7 ? "text-neg" : ""}>
                    {p.평점.toFixed(1)}
                  </Td>
                  <td className="py-2.5 pr-2 text-right">
                    <Link
                      to="/dashboard/$id/player/$playerId"
                      params={{ id, playerId: p.선수id }}
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
      </section>

      {/* Substitutions */}
      <section className="px-4 md:px-8 py-6">
        <SectionTitle>교체 기록</SectionTitle>
        {md.교체기록.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground italic">교체 없음</p>
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

function pct(a: number, b: number): number {
  return b > 0 ? Math.round((a / b) * 1000) / 10 : 0;
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
        <span className={`font-mono-num tabular-nums ${aWinning ? "text-accent font-semibold" : ""}`}>
          {a}
          {suffix}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <span className={`font-mono-num tabular-nums ${!aWinning && a !== b ? "text-foreground/90 font-medium" : "text-muted-foreground"}`}>
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

function GoalList({ list, empty, mute }: { list: GoalEventRaw[]; empty: string; mute?: boolean }) {
  if (list.length === 0) {
    return <p className="mt-3 text-xs text-muted-foreground italic">{empty}</p>;
  }
  return (
    <ul className="mt-3 divide-y divide-border/50 border-y border-border/60">
      {list.map((g, i) => (
        <li key={i} className="grid grid-cols-12 items-baseline gap-2 py-2.5 text-sm">
          <span className="col-span-2 font-mono-num text-xs text-muted-foreground">
            {g.분}′
          </span>
          <span className={"col-span-7 truncate " + (mute ? "text-muted-foreground" : "")}>
            <span className="mr-1">⚽</span>
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
      ))}
    </ul>
  );
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
