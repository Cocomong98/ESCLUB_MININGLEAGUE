import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { OWNER_DETAILS } from "@/lib/ownerData";

export const Route = createFileRoute("/dashboard/$id/match/$matchKey")({
  head: () => ({
    meta: [
      { title: "경기 상세 — ESCLUB" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MatchPage,
});

function MatchPage() {
  const { id, matchKey } = Route.useParams();
  const owner = OWNER_DETAILS[id];
  const match = owner?.최근20.find((m) => m.matchKey === matchKey);
  return (
    <div className="p-4 md:p-8">
      <Link
        to="/dashboard/$id"
        params={{ id }}
        className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="size-3" /> {owner?.구단주 ?? "구단주"}
      </Link>
      <h2 className="mt-4 text-lg font-semibold">경기 상세</h2>
      <p className="mt-2 text-xs font-mono text-muted-foreground">
        {matchKey} {match ? `· vs ${match.상대} · ${match.득점}:${match.실점}` : ""}
      </p>
      <p className="mt-4 text-xs text-muted-foreground">
        4단계에서 설계됩니다.
      </p>
    </div>
  );
}
