import { createFileRoute, Link } from "@tanstack/react-router";
import { Trophy, Medal, Award, Target, Shield } from "lucide-react";
import { CHAMPIONS, CAREER_RECORDS } from "@/lib/hallOfFame";

export const Route = createFileRoute("/hall-of-fame")({
  head: () => ({
    meta: [
      { title: "명예의 전당 — ESCLUB" },
      {
        name: "description",
        content:
          "ESCLUB — 역대 시즌 우승자, 준우승자, 최다득점·최소실점 기록과 통산 커리어 랭킹.",
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
  const career = [...CAREER_RECORDS].sort((a, b) => {
    if (b.우승 !== a.우승) return b.우승 - a.우승;
    return b.통산승점 - a.통산승점;
  });

  return (
    <div className="flex flex-col">
      {/* Sub-context bar */}
      <div className="hidden md:flex items-center justify-between px-8 py-3 border-b border-border bg-surface/40 text-[11px] font-mono text-muted-foreground">
        <div className="flex gap-6">
          <span>
            SOURCE:{" "}
            <span className="text-foreground">/data/hall_of_fame.json</span>
          </span>
          <span>
            SEASONS: <span className="text-foreground">{CHAMPIONS.length}</span>
          </span>
        </div>
        <span>집계: 시즌별 최종 순위 → 통산 누적</span>
      </div>

      {/* Champions timeline */}
      <section className="px-4 md:px-8 pt-6 md:pt-8 pb-2">
        <header className="flex items-baseline justify-between mb-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Trophy className="size-4 text-accent" />
            역대 시즌 챔피언
          </h2>
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            {CHAMPIONS.length} SEASONS
          </span>
        </header>

        <div className="grid gap-3 md:grid-cols-2">
          {CHAMPIONS.map((c) => (
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
                      {c.우승.승점} PTS · {c.우승.승}W {c.우승.무}D {c.우승.패}L
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
          ))}
        </div>
      </section>

      {/* Career records */}
      <section className="px-4 md:px-8 py-6 md:py-8">
        <header className="flex items-baseline justify-between mb-4">
          <h2 className="text-sm font-semibold">통산 커리어 랭킹</h2>
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            정렬: 우승 → 통산 승점
          </span>
        </header>

        {/* Desktop table */}
        <div className="hidden md:block border border-border rounded-md overflow-hidden bg-surface/40">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface-2/40">
                <Th className="pl-6 w-16">순위</Th>
                <Th>구단주</Th>
                <ThNum>우승</ThNum>
                <ThNum>준우승</ThNum>
                <ThNum>시즌</ThNum>
                <ThNum>W</ThNum>
                <ThNum>D</ThNum>
                <ThNum>L</ThNum>
                <ThNum>GF</ThNum>
                <ThNum>GA</ThNum>
                <ThNum className="text-foreground pr-6">통산 PTS</ThNum>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {career.map((c, i) => (
                <tr
                  key={c.id}
                  className="hover:bg-surface-2/60 transition-colors group"
                >
                  <td className="py-3 pl-6 pr-3 font-mono-num text-sm">
                    {String(i + 1).padStart(2, "0")}
                  </td>
                  <td className="py-3 px-3">
                    <Link
                      to="/dashboard/$id"
                      params={{ id: c.id }}
                      className="flex items-center gap-3 group-hover:text-accent transition-colors"
                    >
                      <div className="size-6 rounded-sm bg-surface-2 outline-1 -outline-offset-1 outline-white/5" />
                      <span className="text-sm font-medium">{c.구단주}</span>
                    </Link>
                  </td>
                  <TdNum>
                    {c.우승 > 0 ? (
                      <span className="inline-flex items-center gap-1 text-accent">
                        <Trophy className="size-3" />
                        {c.우승}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TdNum>
                  <TdNum>{c.준우승}</TdNum>
                  <TdNum muted>{c.참가시즌}</TdNum>
                  <TdNum>{c.통산승}</TdNum>
                  <TdNum muted>{c.통산무}</TdNum>
                  <TdNum muted>{c.통산패}</TdNum>
                  <TdNum muted>{c.통산득점}</TdNum>
                  <TdNum muted>{c.통산실점}</TdNum>
                  <TdNum className="text-foreground font-medium pr-6">
                    {c.통산승점}
                  </TdNum>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile list */}
        <div className="md:hidden divide-y divide-border/60 border border-border rounded-md overflow-hidden bg-surface/40">
          {career.map((c, i) => (
            <Link
              key={c.id}
              to="/dashboard/$id"
              params={{ id: c.id }}
              className="p-3.5 flex items-center gap-3 active:bg-surface-2/60"
            >
              <span className="font-mono-num text-sm w-6 text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{c.구단주}</div>
                <div className="text-[10px] text-muted-foreground font-mono-num">
                  {c.통산승}W {c.통산무}D {c.통산패}L · GD{" "}
                  {c.통산득점 - c.통산실점 > 0 ? "+" : ""}
                  {c.통산득점 - c.통산실점}
                </div>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono-num">
                {c.우승 > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-accent">
                    <Trophy className="size-3" />
                    {c.우승}
                  </span>
                )}
                <span className="text-foreground font-semibold">
                  {c.통산승점}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <footer className="mt-auto border-t border-border p-6 md:px-8">
        <p className="text-[11px] leading-relaxed text-muted-foreground max-w-prose">
          시즌별 챔피언은 정규 라운드 종료 시점의 최종 순위 기준입니다. 통산
          기록은 참가한 모든 시즌 합산이며, 미참가 시즌은 0으로 취급하지
          않습니다.
        </p>
      </footer>
    </div>
  );
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
      <div className="size-6 rounded-sm bg-surface-2 grid place-items-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="text-xs font-medium truncate">{name}</div>
      </div>
      <span className="text-[10px] font-mono-num text-muted-foreground shrink-0">
        {stat}
      </span>
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
