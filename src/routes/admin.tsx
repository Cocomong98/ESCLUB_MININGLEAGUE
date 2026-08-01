import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Database,
  RefreshCw,
  Key,
  Users,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileJson,
  Plus,
  Trash2,
} from "lucide-react";
import { SEASONS } from "@/lib/mockData";

interface AdminManager {
  name: string;
  player_id?: string;
  joined_at?: string;
}

interface AdminSeason {
  season: string;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  status?: string;
  hasData?: boolean;
}

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "관리자 설정 — ESCLUB" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminPage,
});

function AdminPage() {
  const [password, setPassword] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [managers, setManagers] = useState<AdminManager[]>([]);
  const [seasons, setSeasons] = useState<AdminSeason[]>([]);
  const [seasonForm, setSeasonForm] = useState({
    season: "",
    startDate: "",
    startTime: "00:00",
    endDate: "",
    endTime: "23:00",
  });
  const [crawlInterval, setCrawlInterval] = useState("6");
  const [activeSeason, setActiveSeason] = useState(SEASONS[0].id);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [newManagerName, setNewManagerName] = useState("");
  const [newManagerId, setNewManagerId] = useState("");
  const [bulkManagers, setBulkManagers] = useState("");
  const readySeasons = seasons.filter((season) => season.hasData).length;
  const seasonOptions = useMemo(
    () =>
      seasons.length > 0
        ? seasons.map((season) => ({ id: season.season, label: season.status ?? "season" }))
        : SEASONS,
    [seasons],
  );

  const loadAdminData = useCallback(async () => {
    const [managerResponse, seasonResponse] = await Promise.all([
      fetch("/api/managers", { credentials: "same-origin" }),
      fetch("/api/seasons", { credentials: "same-origin" }),
    ]);
    if (managerResponse.status === 401 || seasonResponse.status === 401) {
      setAuthorized(false);
      setManagers([]);
      setSeasons([]);
      setMessage("세션 만료");
      return;
    }
    if (managerResponse.ok) setManagers((await managerResponse.json()) as AdminManager[]);
    if (seasonResponse.ok) {
      const nextSeasons = (await seasonResponse.json()) as AdminSeason[];
      setSeasons(nextSeasons);
      setActiveSeason(nextSeasons[0]?.season ?? SEASONS[0].id);
    }
  }, []);

  const restoreSession = useCallback(async () => {
    try {
      const response = await fetch("/api/session", { credentials: "same-origin" });
      if (!response.ok) return;
      const data = (await response.json()) as { authenticated?: boolean };
      if (data.authenticated) {
        setAuthorized(true);
        await loadAdminData();
      }
    } catch {
      setMessage("백엔드 세션 API에 연결할 수 없습니다.");
    } finally {
      setCheckingSession(false);
    }
  }, [loadAdminData]);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  async function login() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ pw: password }),
      });
      if (!response.ok) {
        setMessage("관리자 인증 실패");
        setAuthorized(false);
        return;
      }
      setAuthorized(true);
      setPassword("");
      await loadAdminData();
      setMessage("관리자 인증 완료");
    } catch {
      setMessage("백엔드 로그인 API에 연결할 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function saveManagers() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/managers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ managers: managers.map(completeManager) }),
      });
      const data = await readApiMessage(response);
      if (!response.ok) {
        setMessage(data || "클럽원 저장 실패");
        return;
      }
      setMessage("클럽원 저장 완료");
    } catch {
      setMessage("클럽원 저장 API에 연결할 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function createSeason() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/seasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(seasonForm),
      });
      const data = await readApiMessage(response);
      setMessage(data || (response.ok ? "시즌 생성 완료" : "시즌 생성 실패"));
      if (response.ok) await loadAdminData();
    } catch {
      setMessage("시즌 API에 연결할 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }

  function updateManager(index: number, key: keyof AdminManager, value: string) {
    setManagers((prev) =>
      prev.map((row, i) => (i === index ? completeManager({ ...row, [key]: value }) : row)),
    );
  }

  function addManager() {
    const name = newManagerName.trim();
    const playerId = newManagerId.trim();
    if (!name) {
      setMessage("닉네임을 입력하세요.");
      return;
    }
    setManagers((prev) => [
      ...prev,
      completeManager({
        name,
        player_id: playerId,
        joined_at: new Date().toISOString().slice(0, 10),
      }),
    ]);
    setNewManagerName("");
    setNewManagerId("");
    setMessage("회원 추가됨. 저장 버튼을 눌러 반영하세요.");
  }

  function addBulkManagers() {
    const rows = parseBulkManagers(bulkManagers);
    if (rows.length === 0) {
      setMessage("추가할 회원 목록이 없습니다.");
      return;
    }
    setManagers((prev) => [...prev, ...rows.map(completeManager)]);
    setBulkManagers("");
    setMessage(`${rows.length}명 추가됨. 저장 버튼을 눌러 반영하세요.`);
  }

  function removeManager(index: number) {
    setManagers((prev) => prev.filter((_, i) => i !== index));
    setMessage("회원 삭제됨. 저장 버튼을 눌러 반영하세요.");
  }

  if (checkingSession) {
    return <AdminLoading />;
  }

  if (!authorized) {
    return (
      <AdminLockScreen
        password={password}
        message={message}
        loading={loading}
        onPasswordChange={setPassword}
        onLogin={login}
      />
    );
  }

  return (
    <div className="flex flex-col">
      <div className="hidden md:flex items-center justify-between px-8 py-3 border-b border-border bg-surface/40 text-[11px] font-mono text-muted-foreground">
        <div className="flex gap-6">
          <span>
            ROLE: <span className="text-foreground">ADMIN</span>
          </span>
          <span>
            SESSION: <span className="text-foreground">authenticated</span>
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5">
          <AlertTriangle className="size-3 text-warn" />
          변경 사항은 즉시 반영됩니다
        </span>
      </div>

      <div className="p-4 md:p-8 flex flex-col gap-6 max-w-4xl w-full">
        <section className="hidden grid gap-3 sm:grid-cols-3">
          <StatusCard
            icon={<CheckCircle2 className="size-4 text-pos" />}
            label="관리자 세션"
            value="인증됨"
            hint="활성 세션"
          />
          <StatusCard
            icon={<Database className="size-4 text-accent" />}
            label="클럽원"
            value={`${managers.length}`}
            hint="관리 가능"
          />
          <StatusCard
            icon={<Clock className="size-4 text-warn" />}
            label="시즌 데이터"
            value={`${readySeasons}/${seasons.length || SEASONS.length}`}
            hint={`주기 ${crawlInterval}h`}
          />
        </section>

        <div className="hidden">
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
                {seasonOptions.map((s) => (
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
              <Button variant="primary" icon={<RefreshCw className="size-3.5" />} disabled>
                지금 크롤 실행
              </Button>
              <Button variant="ghost" onClick={loadAdminData} disabled={!authorized || loading}>
                API 새로고침
              </Button>
              <Button variant="ghost" disabled>
                스냅샷 내보내기
              </Button>
            </div>
          </Section>
        </div>

        <div className="hidden">
          <Section
            title="시즌 생성"
            description="원본 시즌 API로 시즌 범위와 분리 데이터를 생성합니다."
            icon={<FileJson className="size-4 text-muted-foreground" />}
          >
            <Field label="시즌명" hint="예: 2026-4">
              <input
                value={seasonForm.season}
                onChange={(event) =>
                  setSeasonForm((prev) => ({ ...prev, season: event.target.value }))
                }
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono-num focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </Field>
            <Field label="시작">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={seasonForm.startDate}
                  onChange={(event) =>
                    setSeasonForm((prev) => ({ ...prev, startDate: event.target.value }))
                  }
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono-num focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <input
                  type="time"
                  value={seasonForm.startTime}
                  onChange={(event) =>
                    setSeasonForm((prev) => ({ ...prev, startTime: event.target.value }))
                  }
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono-num focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </Field>
            <Field label="종료">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={seasonForm.endDate}
                  onChange={(event) =>
                    setSeasonForm((prev) => ({ ...prev, endDate: event.target.value }))
                  }
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono-num focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <input
                  type="time"
                  value={seasonForm.endTime}
                  onChange={(event) =>
                    setSeasonForm((prev) => ({ ...prev, endTime: event.target.value }))
                  }
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono-num focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </Field>
            <Button variant="primary" onClick={createSeason} disabled={!authorized || loading}>
              시즌 생성
            </Button>
          </Section>
        </div>

        <Section
          title="회원 관리"
          description="닉네임과 기존 데이터 호환용 식별자를 기준으로 API 수집 대상을 관리합니다."
          icon={<Users className="size-4 text-muted-foreground" />}
        >
          <div className="grid gap-3 rounded-md border border-border bg-background/40 p-3">
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px_auto]">
              <input
                value={newManagerName}
                onChange={(event) => setNewManagerName(event.target.value)}
                placeholder="닉네임"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <Button
                variant="primary"
                icon={<Plus className="size-3.5" />}
                onClick={addManager}
                disabled={loading}
              >
                추가
              </Button>
            </div>

            <details className="rounded-md border border-border/70 bg-surface/40">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">
                여러 명 붙여넣기
              </summary>
              <div className="grid gap-2 border-t border-border/70 p-3">
                <textarea
                  value={bulkManagers}
                  onChange={(event) => setBulkManagers(event.target.value)}
                  placeholder={"닉네임\nES린이대디\nES골팝"}
                  rows={5}
                  className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <div className="flex justify-end">
                  <Button variant="ghost" onClick={addBulkManagers} disabled={loading}>
                    목록 추가
                  </Button>
                </div>
              </div>
            </details>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              총 <span className="font-mono-num text-foreground">{managers.length}</span>명
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={saveManagers} disabled={loading}>
                회원 저장
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            {managers.map((manager, index) => (
              <ManagerRow
                key={`${manager.player_id ?? manager.name}-${index}`}
                manager={manager}
                index={index}
                onChange={(key, value) => updateManager(index, key, value)}
                onRemove={() => removeManager(index)}
              />
            ))}
          </div>
          {message && <p className="text-xs text-muted-foreground">{message}</p>}
        </Section>

        <div className="hidden">
          <Section
            title="위험 구역"
            description="현재 이식 백엔드에는 삭제 API가 없습니다."
            icon={<AlertTriangle className="size-4 text-neg" />}
            variant="danger"
          >
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" disabled>
                현재 시즌 데이터 초기화
              </Button>
              <Button variant="danger" disabled>
                모든 캐시 삭제
              </Button>
            </div>
          </Section>
        </div>
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

function AdminLoading() {
  return (
    <div className="grid min-h-[calc(100vh-3.5rem)] place-items-center px-4">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <RefreshCw className="size-4 animate-spin text-accent" />
        세션 확인 중
      </div>
    </div>
  );
}

function AdminLockScreen({
  password,
  message,
  loading,
  onPasswordChange,
  onLogin,
}: {
  password: string;
  message: string;
  loading: boolean;
  onPasswordChange: (value: string) => void;
  onLogin: () => void;
}) {
  return (
    <div className="grid min-h-[calc(100vh-3.5rem)] place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Section
          title="관리자 인증"
          description="비밀번호를 입력해야 관리자 설정을 열 수 있습니다."
          icon={<Key className="size-4 text-muted-foreground" />}
        >
          <Field label="비밀번호">
            <input
              type="password"
              value={password}
              autoFocus
              onChange={(event) => onPasswordChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onLogin();
              }}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono-num focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </Field>
          <Button
            variant="primary"
            icon={<Key className="size-3.5" />}
            onClick={onLogin}
            disabled={loading || password.trim().length === 0}
          >
            로그인
          </Button>
          {message && <p className="text-xs text-muted-foreground">{message}</p>}
        </Section>
      </div>
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
          <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
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
        {hint && <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
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
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  variant?: "primary" | "ghost" | "danger";
  icon?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const base =
    "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-45 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-accent text-accent-foreground hover:brightness-110",
    ghost: "bg-surface-2/60 text-foreground hover:bg-surface-2 border border-border",
    danger: "bg-transparent text-neg border border-neg/40 hover:bg-neg/10",
  };
  return (
    <button
      type="button"
      className={`${base} ${variants[variant]}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      {children}
    </button>
  );
}

function ManagerRow({
  manager,
  index,
  onChange,
  onRemove,
}: {
  manager: AdminManager;
  index: number;
  onChange: (key: keyof AdminManager, value: string) => void;
  onRemove: () => void;
}) {
  return (
    <article className="rounded-md border border-border bg-background/50 p-3">
      <div className="grid gap-2 md:grid-cols-[42px_minmax(0,1fr)_140px_auto] md:items-center">
        <div className="font-mono-num text-xs text-muted-foreground">
          {String(index + 1).padStart(2, "0")}
        </div>
        <input
          value={manager.name}
          onChange={(event) => onChange("name", event.target.value)}
          className="w-full rounded-md border border-border bg-surface/40 px-3 py-2 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <input
          type="date"
          value={manager.joined_at ?? ""}
          onChange={(event) => onChange("joined_at", event.target.value)}
          className="w-full rounded-md border border-border bg-surface/40 px-3 py-2 font-mono-num text-xs focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <Button variant="danger" icon={<Trash2 className="size-3.5" />} onClick={onRemove}>
          삭제
        </Button>
      </div>
    </article>
  );
}

function completeManager(manager: AdminManager): AdminManager {
  const playerId = String(manager.player_id ?? "").replace(/\D/g, "");
  return {
    ...manager,
    name: manager.name.trim(),
    player_id: playerId || undefined,
    joined_at: manager.joined_at?.trim() || undefined,
  };
}

function parseBulkManagers(value: string): AdminManager[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", playerId = ""] = line.split(/[,\t ]+/).map((part) => part.trim());
      return {
        name,
        player_id: playerId.replace(/\D/g, ""),
        joined_at: new Date().toISOString().slice(0, 10),
      };
    })
    .filter((manager) => manager.name);
}

async function readApiMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { message?: string; error?: string };
    return data.message ?? data.error ?? "";
  } catch {
    return "";
  }
}
