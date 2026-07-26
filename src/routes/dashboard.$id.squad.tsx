import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { OWNER_DETAILS } from "@/lib/ownerData";

export const Route = createFileRoute("/dashboard/$id/squad")({
  head: ({ params }) => ({
    meta: [
      {
        title: `스쿼드 분석 · ${OWNER_DETAILS[params.id]?.구단주 ?? params.id} — ESCLUB`,
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SquadPage,
});

function SquadPage() {
  const { id } = Route.useParams();
  const owner = OWNER_DETAILS[id];
  return (
    <div className="p-4 md:p-8">
      <Link
        to="/dashboard/$id"
        params={{ id }}
        className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="size-3" /> {owner?.구단주 ?? "구단주"}
      </Link>
      <h2 className="mt-4 text-lg font-semibold">스쿼드 분석</h2>
      <p className="mt-2 text-xs text-muted-foreground">
        3단계에서 설계됩니다. (squad_analysis_all.json / manager_mode_analysis.json)
      </p>
    </div>
  );
}
