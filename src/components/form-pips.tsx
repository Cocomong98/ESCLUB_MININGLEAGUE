import type { MatchResult } from "@/lib/mockData";

const STYLES: Record<MatchResult, string> = {
  W: "bg-pos/15 border-pos/40 text-pos",
  D: "bg-warn/15 border-warn/40 text-warn",
  L: "bg-neg/15 border-neg/40 text-neg",
};

export function FormPips({ form, size = "md" }: { form: MatchResult[]; size?: "sm" | "md" }) {
  if (!form || form.length === 0) {
    return <span className="text-[11px] text-muted-foreground italic">데이터 없음</span>;
  }
  const box =
    size === "sm"
      ? "size-3 text-[8px] rounded-[2px]"
      : "size-4 text-[9px] rounded-[3px]";
  return (
    <div className="flex gap-1" aria-label="최근 5경기">
      {form.map((r, i) => (
        <div
          key={i}
          className={`${box} border ${STYLES[r]} flex items-center justify-center font-bold font-mono`}
          title={r === "W" ? "승" : r === "D" ? "무" : "패"}
        >
          {r}
        </div>
      ))}
    </div>
  );
}

export function FormDots({ form }: { form: MatchResult[] }) {
  if (!form || form.length === 0) return <span className="text-[10px] text-muted-foreground">—</span>;
  const map: Record<MatchResult, string> = {
    W: "bg-pos",
    D: "bg-warn",
    L: "bg-neg",
  };
  return (
    <div className="flex justify-end gap-0.5">
      {form.map((r, i) => (
        <div key={i} className={`size-1.5 rounded-full ${map[r]}`} />
      ))}
    </div>
  );
}
