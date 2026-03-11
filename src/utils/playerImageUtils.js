function toNumericSpId(spId) {
  const parsed = Number(spId);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function buildIdCandidates(spId) {
  const fullId = toNumericSpId(spId);
  if (fullId === null) return [];

  const candidates = [fullId];
  const derivedPid = fullId % 1000000;
  if (derivedPid > 0 && derivedPid !== fullId) {
    candidates.push(derivedPid);
  }
  return candidates;
}

export function buildPlayerPortraitUrl(spId) {
  const id = toNumericSpId(spId);
  if (id === null) return "";
  return `https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/players/p${id}.png`;
}

export function buildPlayerPortraitUrls(spId) {
  const ids = buildIdCandidates(spId);
  if (ids.length === 0) return [];

  const urls = [];
  ids.forEach((id) => {
    urls.push(`https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/players/p${id}.png`);
    urls.push(`https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/playersAction/p${id}.png`);
    urls.push(`https://ssl.nexon.com/s2/game/fo4/obt/externalAssets/common/players/p${id}.png`);
    urls.push(
      `https://ssl.nexon.com/s2/game/fo4/obt/externalAssets/common/playersAction/p${id}.png`
    );
  });
  return urls.filter((url, index, arr) => arr.indexOf(url) === index);
}

export default {
  buildPlayerPortraitUrl,
  buildPlayerPortraitUrls,
};
