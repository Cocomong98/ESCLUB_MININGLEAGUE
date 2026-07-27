import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { OWNER_DETAILS } from "@/lib/ownerData";
import {
  SQUAD_ANALYSIS,
  MANAGER_MODE,
  type SquadPlayerRaw,
  type FormationUsageRaw,
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
  loader: ({ params }) => {
    if (!SQUAD_ANALYSIS[params.id]) throw notFound();
    return null;
  },
  component: SquadPage,
});

function SquadPage() {
  const { id } = Route.useParams();
  const owner = OWNER_DETAILS[id]!;
  const squad = SQUAD_ANALYSIS[id]!;
  const mm = MANAGER_MODE[id]!;

  const totalForms = mm.포메이션별.reduce((s, f) => s + f.경기수, 0);
  const totalStyles = mm.전술스타일.reduce((s, f) => s + f.경기수, 0);

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
          <span className="text-foreground">스쿼드 분석</span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">스쿼드 분석</h2>
            <p className="mt-1 text-[11px] font-mono text-muted-foreground">
              SOURCE: /data/{squad.id ? owner.시즌 : ""}/user/{id}/squad_analysis_all.json
              · manager_mode_analysis.json
            </p>
          </div>
          <div className="grid grid-cols-3 gap-x-6 gap-y-2">
            <Kpi label="기용" value={`${squad.기용선수수}`} unit="명" />
            <Kpi label="평균 OVR" value={squad.평균OVR.toFixed(1)} accent />
            <Kpi label="스쿼드가치" value={squad.스쿼드가치.toLocaleString()} unit="억 BP" />
          </div>
        </div>
      </div>

      {/* Starters + Formation pitch */}
      <section className="px-4 md:px-8 py-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <SectionTitle>주전 11인</SectionTitle>
          <div className="mt-3 overflow-x-auto">
            <PlayerTable rows={squad.주전11} />
          </div>
        </div>
        <div>
          <SectionTitle>주 포메이션</SectionTitle>
          <div className="mt-3 border border-border rounded-md p-4">
            <div className="flex items-baseline justify-between">
              <span className="font-mono-num text-2xl text-accent font-semibold">
                {mm.주포메이션}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                Primary shape
              </span>
            </div>
            <PitchDiagram formation={mm.주포메이션} />
          </div>
        </div>
      </section>

      {/* Rotation */}
      <section className="px-4 md:px-8 py-6 border-t border-border">
        <SectionTitle>로테이션 · Rotation squad</SectionTitle>
        <div className="mt-3 overflow-x-auto">
          <PlayerTable rows={squad.로테이션} />
        </div>
      </section>

      {/* Formation usage + tactical style */}
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

      {/* Manager mode averages */}
      <section className="px-4 md:px-8 py-6 border-t border-border">
        <SectionTitle>매니저 모드 · 경기당 평균</SectionTitle>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-x-8 gap-y-4">
          <Kpi label="점유율" value={`${mm.평균점유율}%`} />
          <Kpi label="슈팅" value={mm.평균슈팅.toString()} />
          <Kpi label="유효슈팅" value={mm.평균유효슈팅.toString()} />
          <Kpi label="패스성공률" value={`${(mm.평균패스성공률 * 100).toFixed(1)}%`} />
          <Kpi label="평균 교체시점" value={`${mm.교체시점평균}′`} />
        </div>
      </section>
    </div>
  );
}

function PlayerTable({ rows }: { rows: SquadPlayerRaw[] }) {
  return (
    <table className="w-full text-left border-collapse min-w-[720px]">
      <thead>
        <tr className="border-b border-border">
          <Th>POS</Th>
          <Th>선수</Th>
          <Th>시즌</Th>
          <ThNum>OVR</ThNum>
          <ThNum>경기(선발)</ThNum>
          <ThNum>G</ThNum>
          <ThNum>A</ThNum>
          <ThNum>평점</ThNum>
          <ThNum>가치</ThNum>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/50">
        {rows.map((p) => (
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
            <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">
              {p.시즌}
            </td>
            <Td className="text-accent font-semibold">{p.OVR}</Td>
            <Td>
              {p.경기수}
              <span className="text-muted-foreground text-[11px]"> ({p.선발})</span>
            </Td>
            <Td>{p.득점}</Td>
            <Td>{p.도움}</Td>
            <Td className={p.평점 >= 8 ? "text-pos" : p.평점 < 7 ? "text-neg" : ""}>
              {p.평점.toFixed(1)}
            </Td>
            <Td muted>{p.가치}</Td>
          </tr>
        ))}
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
        <div
          className="h-full bg-accent"
          style={{ width: `${pct * 100}%` }}
          aria-hidden
        />
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
            "h-full " +
            (row.승률 >= 0.6 ? "bg-pos" : row.승률 >= 0.5 ? "bg-accent" : "bg-warn")
          }
          style={{ width: `${pct * 100}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}

/** Minimal pitch diagram; lines derived from formation string like "4-2-3-1". */
function PitchDiagram({ formation }: { formation: string }) {
  const lines = formation.split("-").map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
  // rows: [GK, ...lines]
  const rows = [[1], ...lines.map((n) => Array.from({ length: n }, () => 1))];
  return (
    <div className="mt-4 relative aspect-[3/4] w-full rounded-sm border border-border/70 bg-[radial-gradient(ellipse_at_center,color-mix(in_oklab,var(--accent)_8%,transparent),transparent_65%)] overflow-hidden">
      {/* pitch lines */}
      <div className="absolute inset-2 border border-border/60 rounded-sm" />
      <div className="absolute left-2 right-2 top-1/2 h-px bg-border/60" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-10 rounded-full border border-border/60" />
      {/* dots */}
      <div className="absolute inset-3 flex flex-col-reverse justify-between">
        {rows.map((row, ri) => (
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
          className={
            "font-mono-num " +
            (accent ? "text-xl text-accent font-semibold" : "text-lg")
          }
        >
          {value}
        </span>
        {unit && (
          <span className="text-[10px] font-mono text-muted-foreground">{unit}</span>
        )}
      </span>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="py-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
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
