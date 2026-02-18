export function sortSeasonsDesc(seasons) {
  return [...new Set(seasons)].sort((a, b) => {
    const [aYear, aPart] = a.split("-").map(Number);
    const [bYear, bPart] = b.split("-").map(Number);
    const aKey = (aYear || 0) * 100 + (aPart || 0);
    const bKey = (bYear || 0) * 100 + (bPart || 0);
    return bKey - aKey;
  });
}

function parseDateOrNull(dateText) {
  if (!dateText) return null;
  const date = new Date(dateText);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getCurrentSeasonByDateRange(config, seasonsWithData) {
  const seasonRanges = config?.season_ranges || {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const inRangeSeasons = seasonsWithData.filter((season) => {
    const range = seasonRanges[season];
    if (!range) return false;
    const start = parseDateOrNull(range.startDate || range.start_date);
    const end = parseDateOrNull(range.endDate || range.end_date);
    if (!start || !end) return false;
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return start <= today && today <= end;
  });

  if (inRangeSeasons.length === 0) return "";
  return sortSeasonsDesc(inRangeSeasons)[0];
}

export async function fetchSeasonsWithData() {
  const response = await fetch("/season_config.json");
  if (!response.ok) throw new Error("Could not load season config");

  const config = await response.json();
  const seasonCandidates = sortSeasonsDesc(Array.isArray(config.seasons) ? config.seasons : []);
  const cacheBuster = Date.now();

  const checks = await Promise.all(
    seasonCandidates.map(async (season) => {
      try {
        const seasonDataRes = await fetch(
          `/data/${season}/current_crawl_display_data.json?t=${cacheBuster}`
        );
        if (!seasonDataRes.ok) return null;

        const seasonData = await seasonDataRes.json();
        const hasRows = Array.isArray(seasonData?.results) && seasonData.results.length > 0;
        return hasRows ? season : null;
      } catch (error) {
        return null;
      }
    })
  );

  const seasons = checks.filter(Boolean);
  const inRangeSeason = getCurrentSeasonByDateRange(config, seasons);
  return {
    seasons,
    latestSeason: inRangeSeason || seasons[0] || "",
    currentSeason: config.current_season || "",
  };
}
