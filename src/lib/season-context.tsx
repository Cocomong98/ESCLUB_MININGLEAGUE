import { createContext, useContext, useState, type ReactNode } from "react";
import { SEASONS, type SeasonId } from "./mockData";

interface SeasonCtx {
  season: SeasonId;
  setSeason: (id: SeasonId) => void;
}

const Ctx = createContext<SeasonCtx | null>(null);

export function SeasonProvider({ children }: { children: ReactNode }) {
  const [season, setSeason] = useState<SeasonId>(SEASONS[0].id);
  return <Ctx.Provider value={{ season, setSeason }}>{children}</Ctx.Provider>;
}

export function useSeason() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSeason must be used within SeasonProvider");
  return ctx;
}
