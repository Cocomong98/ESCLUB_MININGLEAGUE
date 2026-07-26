import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/hall-of-fame")({
  head: () => ({
    meta: [
      { title: "명예의 전당 — ESCLUB" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <div className="p-8">
      <h2 className="text-lg font-semibold">명예의 전당</h2>
      <p className="mt-2 text-xs text-muted-foreground">5단계에서 설계됩니다.</p>
      <Link
        to="/tables"
        className="mt-4 inline-block text-[11px] font-mono text-accent hover:underline"
      >
        ← 시즌 순위
      </Link>
    </div>
  ),
});
