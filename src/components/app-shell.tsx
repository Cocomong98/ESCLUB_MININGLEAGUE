import { Link, useRouterState } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { Trophy, Table2, Settings, Circle } from "lucide-react";
import { useSeason } from "@/lib/season-context";
import { SEASONS } from "@/lib/mockData";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { to: "/tables", label: "시즌 순위", icon: Table2 },
  { to: "/hall-of-fame", label: "명예의 전당", icon: Trophy },
  { to: "/admin", label: "관리자 설정", icon: Settings },
] as const;

function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col border-r border-border bg-background z-30">
      <div className="flex h-14 items-center px-6 border-b border-border">
        <Link to="/tables" className="flex items-center gap-2">
          <div className="size-1.5 rounded-full bg-accent" aria-hidden />
          <span className="text-sm font-semibold tracking-tight">ESCLUB ANALYTICS</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {NAV.map((item) => {
          const active =
            pathname === item.to || pathname.startsWith(item.to + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={
                "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors " +
                (active
                  ? "bg-surface-2 text-foreground ring-1 ring-white/5"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              <Icon className={"size-4 shrink-0 " + (active ? "text-accent" : "")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 px-3">
          <div className="size-8 rounded-full bg-surface-2 outline-1 -outline-offset-1 outline-white/10" />
          <div className="flex flex-col">
            <span className="text-xs font-medium">Guest</span>
            <span className="text-[10px] text-muted-foreground tracking-wider">
              PUBLIC VIEW
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

function SeasonSelector() {
  const { season, setSeason } = useSeason();
  const current = SEASONS.find((s) => s.id === season) ?? SEASONS[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
        시즌 선택
        <svg className="size-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <path d="M8 10.5l-3.5-3.5h7L8 10.5z" />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        {SEASONS.map((s) => (
          <DropdownMenuItem
            key={s.id}
            onSelect={() => setSeason(s.id)}
            className={s.id === current.id ? "text-accent" : ""}
          >
            <span className="font-mono-num text-xs mr-2">{s.id}</span>
            {s.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 backdrop-blur-md">
      <div className="grid grid-cols-3">
        {NAV.map((item) => {
          const active =
            pathname === item.to || pathname.startsWith(item.to + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={
                "flex flex-col items-center gap-1 py-2.5 text-[10px] uppercase tracking-wider " +
                (active ? "text-accent" : "text-muted-foreground")
              }
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { season } = useSeason();
  const current = SEASONS.find((s) => s.id === season) ?? SEASONS[0];
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="lg:pl-64 flex flex-col min-h-screen pb-16 lg:pb-0">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between px-4 md:px-8 bg-background/80 backdrop-blur-md border-b border-border">
          <div className="flex items-center gap-4">
            <h1 className="text-base font-semibold">{current.label}</h1>
            <div className="h-4 w-px bg-border" />
            <SeasonSelector />
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Circle className="size-1.5 fill-accent text-accent animate-pulse" />
              LIVE DATA
            </span>
          </div>
        </header>
        {children}
        <MobileNav />
      </main>
    </div>
  );
}
