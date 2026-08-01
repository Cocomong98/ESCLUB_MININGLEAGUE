import { useState } from "react";

export function TierBadge({
  image,
  name,
  size = "md",
}: {
  image: string | null | undefined;
  name: string | null | undefined;
  size?: "sm" | "md" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  const dimensions = size === "lg" ? "size-9" : size === "sm" ? "size-6" : "size-7";
  if (!image || failed) {
    return (
      <div
        className={`${dimensions} shrink-0 rounded-sm border border-border bg-surface-2/40`}
        title={name ?? "티어 정보 없음"}
        aria-label={name ?? "티어 정보 없음"}
      />
    );
  }
  return (
    <img
      src={image}
      alt={name ?? "현재 시즌 티어"}
      title={name ?? undefined}
      className={`${dimensions} shrink-0 object-contain`}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}
