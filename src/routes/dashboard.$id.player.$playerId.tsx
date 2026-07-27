import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { OWNER_DETAILS } from "@/lib/ownerData";
import { getPlayerDetail } from "@/lib/playerDetail";

export const Route = createFileRoute("/dashboard/$id/player/$playerId")({
  head: ({ params }) => {
    const pd = getPlayerDetail(params.id, params.playerId);
    return {
      meta: [
        {
          title: pd
            ? `${pd.선수.선수명} · ${pd.구단주} — ESCLUB`
            : "선수 상세 — ESCLUB",
        },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  loader: ({ params }) => {
    if (!getPlayerDetail(params.id, params.playerId)) throw notFound();
    return null;
  },
  component: PlayerPage,
});

function PlayerPage() {
  const { id, playerId } = Route.useParams();
  const owner = OWNER_DETAILS[id]!;
  const pd = getPlayerDetail(id, playerId)!;
  const p = pd.선수;

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
          <Link
            to="/dashboard/$id/squad"
            params={{ id }}
            className="hover:text-foreground transition-colors"
          >
            스쿼드
          </Link>
          <span>/</span>
          <span className="text-foreground">{p.선수명}</span>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center min-w-9 px-2 h-6 rounded-[4px] border border-border text-[11px] font-mono font-semibold text-muted-foreground">
                {p.포지션}
              </span>
              <h2 className="text-2xl font-semibold tracking-tight">
                {p.선수명}
              </h2>
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
              {p.국적} · {p.시즌} · SOURCE:
              /data/{owner.시즌}/user/{id}/player/{playerId}.json
            </p>
          </div>

          {/* OVR + value */}
          <div className="flex items-baseline gap-6">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                OVR
              </span>
              <span className="font-mono-num text-4xl text-accent font-semibold">
                {p.OVR}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                가치
              </span>
              <span className="font-mono-num text-2xl">
                {p.가치.toLocaleString()}
                <span className="ml-1 text-[10px] text-muted-foreground">억 BP</span>
              </span>
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-6 gap-x-8 gap-y-4 border-t border-border/60 pt-5">
          <Kpi label="경기(선발)" value={`${p.경기수} (${p.선발})`} />
          <Kpi label="득점" value={p.득점.toString()} />
          <Kpi label="도움" value={p.도움.toString()} />
          <Kpi
            label="평점"
            value={p.평점.toFixed(1)}
            tone={p.평점 >= 8 ? "pos" : p.평점 < 7 ? "neg" : undefined}
          />
          <Kpi label="총 출전 시간" value={`${pd.총분}′`} />
          <Kpi label="90분당 G+A" value={pd.분당공격P.toFixed(2)} accent />
        </div>
      </div>

      {/* Skill radar + Home/Away */}
      <section className="px-4 md:px-8 py-6 border-b border-border grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <SectionTitle>스킬 프로필</SectionTitle>
          <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2.5">
            <SkillBar label="페이스" value={pd.스킬.페이스} />
            <SkillBar label="슈팅" value={pd.스킬.슈팅} />
            <SkillBar label="패스" value={pd.스킬.패스} />
            <SkillBar label="드리블" value={pd.스킬.드리블} />
            <SkillBar label="수비" value={pd.스킬.수비} />
            <SkillBar label="피지컬" value={pd.스킬.피지컬} />
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

      {/* Recent 10 ratings */}
      <section className="px-4 md:px-8 py-6">
        <div className="flex items-baseline justify-between">
          <SectionTitle>최근 10경기 평점</SectionTitle>
          <span className="text-[10px] font-mono text-muted-foreground">
            recent_ratings.json
          </span>
        </div>

        {/* Bar chart */}
        <div className="mt-4 flex items-end gap-1.5 h-32 border-b border-border/60 pb-1">
          {pd.최근10.map((m) => {
            const h = ((m.평점 - 5) / 5) * 100; // 5..10 → 0..100
            const tone =
              m.평점 >= 8 ? "bg-pos" : m.평점 < 7 ? "bg-neg" : "bg-accent/70";
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

        {/* Table */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[560px]">
            <thead>
              <tr className="border-b border-border">
                <Th>일자</Th>
                <Th>상대</Th>
                <Th>H/A</Th>
                <ThNum>분</ThNum>
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
                  <td className="py-2.5 px-3 text-xs text-muted-foreground">
                    {m.홈원정}
                  </td>
                  <Td muted>{m.분}′</Td>
                  <Td>{m.득점 || <span className="text-muted-foreground">·</span>}</Td>
                  <Td>{m.도움 || <span className="text-muted-foreground">·</span>}</Td>
                  <Td className={ratingTone(m.평점)}>{m.평점.toFixed(1)}</Td>
                  <td className="py-2.5 pr-2 text-right">
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
      </section>
    </div>
  );
}

function ratingTone(v: number): string {
  return v >= 8 ? "text-pos" : v < 7 ? "text-neg" : "";
}

function SkillBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, ((value - 50) / 70) * 100); // 50..120 → 0..100
  const tone = value >= 110 ? "bg-pos" : value >= 95 ? "bg-accent" : value >= 80 ? "bg-foreground/50" : "bg-warn";
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
          (rating >= 8
            ? "text-pos font-semibold"
            : rating < 7 && rating > 0
              ? "text-neg"
              : "")
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

