import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchSeasonConfig } from "./service-data";
import { formatSeasonLabel, SEASONS, type SeasonConfig, type SeasonId } from "./mockData";

interface SeasonCtx {
  season: SeasonId;
  setSeason: (id: SeasonId) => void;
  seasons: SeasonConfig[];
  loaded: boolean;
}

const Ctx = createContext<SeasonCtx | null>(null);

export function SeasonProvider({ children }: { children: ReactNode }) {
  const fallbackSeason = SEASONS.find((item) => item.active)?.id ?? SEASONS[0].id;
  const [season, setSeason] = useState<SeasonId>(fallbackSeason);
  const [seasons, setSeasons] = useState<SeasonConfig[]>(SEASONS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchSeasonConfig().then((config) => {
      if (cancelled) return;
      if (config?.seasons?.length) {
        const current = config.current_season;
        const nextSeasons = config.seasons.map((id) => ({
          id,
          label: formatSeasonLabel(id),
          phase: id,
          active: id === current,
        }));
        setSeasons(nextSeasons);
        setSeason((prev) => {
          if (nextSeasons.some((item) => item.id === prev)) return prev;
          if (nextSeasons.some((item) => item.id === current)) return current;
          return nextSeasons[0].id;
        });
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <Ctx.Provider value={{ season, setSeason, seasons, loaded }}>{children}</Ctx.Provider>;
}

export function useSeason() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSeason must be used within SeasonProvider");
  return ctx;
}
