import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Database,
  RefreshCw,
  Key,
  Users,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileJson,
} from "lucide-react";
import { SEASONS } from "@/lib/mockData";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "관리자 설정 — ESCLUB" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const [crawlInterval, setCrawlInterval] = useState("6");
  const [activeSeason, setActiveSeason] = useState(SEASONS[0].id);
  const [autoRefresh, setAutoRefresh] = useState(true);

  return (
    <div className="flex flex-col">
      {/* Sub-context bar */}
      <div className="hidden md:flex items-center justify-between px-8 py-3 border-b border-border bg-surface/40 text-[11px] font-mono text-muted-foreground">
        <div className="flex gap-6">
          <span>
            ROLE: <span className="text-foreground">ADMIN</span>
          </span>
          <span>
            ENV: <span className="text-foreground">production</span>
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5">
          <AlertTriangle className="size-3 text-warn" />
          변경 사항은 즉시 반영됩니다
        </span>
      </div>

      <div className="p-4 md:p-8 flex flex-col gap-6 max-w-4xl w-full">
        {/* System status */}
        <section className="grid gap-3 sm:grid-cols-3">
          <StatusCard
            icon={<CheckCircle2 className="size-4 text-pos" />}
            label="크롤러 상태"
            value="정상"
            hint="마지막 실행 4분 전"
          />
          <StatusCard
            icon={<Database className="size-4 text-accent" />}
            label="데이터 무결성"
            value="OK"
            hint="15/15 구단주 동기화"
          />
          <StatusCard
            icon={<Clock className="size-4 text-warn" />}
            label="다음 크롤"
            value="00:56:12"
            hint={`주기 ${crawlInterval}h`}
          />
        </section>

        {/* Data source */}
        <Section
          title="데이터 소스"
          description="크롤링 대상 시즌과 실행 주기를 관리합니다."
          icon={<FileJson className="size-4 text-muted-foreground" />}
        >
          <Field label="활성 시즌" hint="/data/{season}/current_crawl_display_data.json">
            <select
              value={activeSeason}
              onChange={(e) => setActiveSeason(e.target.value)}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono-num focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {SEASONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} — {s.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="크롤 주기 (시간)" hint="최소 1시간, 최대 24시간">
            <input
              type="number"
              min={1}
              max={24}
              value={crawlInterval}
              onChange={(e) => setCrawlInterval(e.target.value)}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono-num focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </Field>

          <Field label="자동 새로고침" hint="새 데이터 감지 시 클라이언트 갱신">
            <Toggle checked={autoRefresh} onChange={setAutoRefresh} />
          </Field>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="primary" icon={<RefreshCw className="size-3.5" />}>
              지금 크롤 실행
            </Button>
            <Button variant="ghost">캐시 무효화</Button>
            <Button variant="ghost">스냅샷 내보내기</Button>
          </div>
        </Section>

        {/* API keys */}
        <Section
          title="API 자격증명"
          description="외부 데이터 소스 인증 키. 값은 마스킹되어 표시됩니다."
          icon={<Key className="size-4 text-muted-foreground" />}
        >
          <KeyRow name="NEXON_OPEN_API_KEY" value="sk_live_••••••••••••4c9a" rotated="2024-04-18" />
          <KeyRow name="ESCLUB_CRAWLER_TOKEN" value="ec_••••••••••••8f21" rotated="2024-03-02" />
          <KeyRow name="STORAGE_SIGNING_KEY" value="sig_••••••••••••11ab" rotated="2024-05-10" />
        </Section>

        {/* Users */}
        <Section
          title="접근 권한"
          description="관리자 콘솔에 접근 가능한 계정 목록입니다."
          icon={<Users className="size-4 text-muted-foreground" />}
        >
          <div className="border border-border rounded-md overflow-hidden bg-background/40">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-2/40">
                  <th className="py-2.5 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">계정</th>
                  <th className="py-2.5 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">역할</th>
                  <th className="py-2.5 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">마지막 접속</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                <UserRow account="admin@esclub.gg" role="Owner" last="방금 전" />
                <UserRow account="ops@esclub.gg" role="Editor" last="2시간 전" />
                <UserRow account="analytics@esclub.gg" role="Viewer" last="어제" />
              </tbody>
            </table>
          </div>
        </Section>

        {/* Danger zone */}
        <Section
          title="위험 구역"
          description="되돌릴 수 없는 작업입니다. 신중히 실행하세요."
          icon={<AlertTriangle className="size-4 text-neg" />}
          variant="danger"
        >
          <div className="flex flex-wrap gap-2">
            <Button variant="danger">현재 시즌 데이터 초기화</Button>
            <Button variant="danger">모든 캐시 삭제</Button>
          </div>
        </Section>
      </div>
    </div>
  );
}

function StatusCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="border border-border rounded-md bg-surface/60 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {icon}
      </div>
      <div className="mt-2 text-lg font-semibold font-mono-num">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>
    </div>
  );
}

function Section({
  title,
  description,
  icon,
  children,
  variant = "default",
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  variant?: "default" | "danger";
}) {
  return (
    <section
      className={
        "border rounded-md bg-surface/40 " +
        (variant === "danger" ? "border-neg/40" : "border-border")
      }
    >
      <header className="px-4 md:px-5 py-3 border-b border-border flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {description}
          </p>
        </div>
      </header>
      <div className="p-4 md:p-5 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[200px_1fr] sm:items-center sm:gap-4">
      <div>
        <div className="text-xs font-medium">{label}</div>
        {hint && (
          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
            {hint}
          </div>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={
        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors " +
        (checked ? "bg-accent" : "bg-surface-2 border border-border")
      }
    >
      <span
        className={
          "inline-block size-3.5 rounded-full bg-background transition-transform " +
          (checked ? "translate-x-5" : "translate-x-0.5")
        }
      />
    </button>
  );
}

function Button({
  children,
  variant = "ghost",
  icon,
}: {
  children: React.ReactNode;
  variant?: "primary" | "ghost" | "danger";
  icon?: React.ReactNode;
}) {
  const base =
    "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors";
  const variants = {
    primary: "bg-accent text-accent-foreground hover:brightness-110",
    ghost:
      "bg-surface-2/60 text-foreground hover:bg-surface-2 border border-border",
    danger:
      "bg-transparent text-neg border border-neg/40 hover:bg-neg/10",
  };
  return (
    <button type="button" className={`${base} ${variants[variant]}`}>
      {icon}
      {children}
    </button>
  );
}

function KeyRow({
  name,
  value,
  rotated,
}: {
  name: string;
  value: string;
  rotated: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-border/60 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-mono text-foreground truncate">{name}</div>
        <div className="text-[11px] font-mono-num text-muted-foreground truncate">
          {value}
        </div>
      </div>
      <div className="text-[10px] font-mono text-muted-foreground shrink-0 hidden sm:block">
        rotated {rotated}
      </div>
      <button
        type="button"
        className="text-[11px] font-medium text-accent hover:underline shrink-0"
      >
        회전
      </button>
    </div>
  );
}

function UserRow({
  account,
  role,
  last,
}: {
  account: string;
  role: string;
  last: string;
}) {
  return (
    <tr className="hover:bg-surface-2/40">
      <td className="py-2.5 px-4 text-xs font-mono">{account}</td>
      <td className="py-2.5 px-4">
        <span className="inline-block px-2 py-0.5 rounded-sm text-[10px] font-mono uppercase tracking-wider bg-surface-2 border border-border">
          {role}
        </span>
      </td>
      <td className="py-2.5 px-4 text-[11px] text-muted-foreground font-mono-num">
        {last}
      </td>
    </tr>
  );
}
