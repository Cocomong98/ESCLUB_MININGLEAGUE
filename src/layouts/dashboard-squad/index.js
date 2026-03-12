import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";

import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Tooltip from "@mui/material/Tooltip";
import useMediaQuery from "@mui/material/useMediaQuery";
import { Dialog, DialogContent, DialogTitle, MenuItem, Select, Tab, Tabs } from "@mui/material";

import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDTypography from "components/MDTypography";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import DataTable from "examples/Tables/DataTable";

import PlayerChip from "components/pitch/PlayerChip";
import PitchBoard from "components/pitch/PitchBoard";
import FmMetricPanel from "components/metrics/FmMetricPanel";
import useElementSize from "hooks/useElementSize";
import { useMaterialUIController } from "context";
import { buildPlayerPortraitUrls } from "utils/playerImageUtils";
import { fetchSeasonsWithData } from "utils/seasonUtils";
import { uiTypography } from "utils/uiTypography";

const navActionSx = ({ palette }) => ({
  color: `${palette.info.main} !important`,
  borderColor: `${palette.info.main} !important`,
  backgroundColor: "transparent",
  "&:hover": {
    color: `${palette.common.white} !important`,
    borderColor: `${palette.info.main} !important`,
    backgroundColor: palette.info.main,
  },
});

const TOP_ROW_MIN_HEIGHT = 420;
const TOP_ROW_MAX_HEIGHT = 760;

const INSIGHT_LAYOUT_ORDER_DESKTOP = ["full", "compact", "ultra", "tabs"];
const INSIGHT_LAYOUT_ORDER_MOBILE = ["compact", "ultra", "tabs"];
const INSIGHT_SUMMARY_LABELS = [
  "선제골 후 승리율",
  "리드 지키기",
  "빌드업 실수율",
  "후반 실점 비중",
];

const ADVANCED_METRIC_DESCRIPTIONS = {
  "선제골 후 승리율": "선제 득점한 경기에서 최종 승리한 비율",
  "역전 회복력": "선제 실점 경기에서 만회한 승점 효율",
  "리드 지키기": "리드한 경기에서 실점이 발생한 비율 (대체 정의)",
  "강팀 상대 효율": "상위 상대 구간 기준 승점 획득 효율",
  "공격 템포": "전방 패스 비율과 분당 패스 수를 결합한 지표",
  "빌드업 실수율": "전체 패스 시도 대비 실패 비율 (대체 정의)",
  "측면 의존도(슈팅)": "전체 슈팅 중 측면 발생 슈팅 비율",
  "측면 의존도(도움 기점)": "도움 위치 기준 측면 기점 비율",
  "중앙 침투 수율": "중앙 침투 시도 대비 중앙 득점 비율",
  "득점 루트 집중도": "최다 득점 루트 횟수 / 전체 득점 수",
  "볼 회수 우위": "상대 패스 대비 회수 (인터셉트 / 태클 / 차단) 밀도",
  "후반 실점 비중": "전체 실점 중 80분 이후 실점 비율",
  "선방 기여율": "피유효슈팅 대비 세이브 비율",
  "2실점+ 빈도": "2실점 이상 경기 비율",
};

const SP_POSITION_TO_LABEL = {
  0: "GK",
  1: "SW",
  2: "RWB",
  3: "RB",
  4: "RCB",
  5: "CB",
  6: "LCB",
  7: "LB",
  8: "LWB",
  9: "RDM",
  10: "CDM",
  11: "LDM",
  12: "RM",
  13: "RCM",
  14: "CM",
  15: "LCM",
  16: "LM",
  17: "RAM",
  18: "CAM",
  19: "LAM",
  20: "RW",
  21: "RF",
  22: "CF",
  23: "LF",
  24: "LW",
  25: "RS",
  26: "ST",
  27: "LS",
};

const PITCH_SLOT_MAP = {
  GK: { x: 50, y: 89 },
  LB: { x: 18, y: 71 },
  LWB: { x: 14, y: 62 },
  RB: { x: 82, y: 71 },
  RWB: { x: 86, y: 62 },
  LCB: { x: 36, y: 74 },
  CB: { x: 50, y: 76 },
  RCB: { x: 64, y: 74 },
  LDM: { x: 38, y: 61 },
  DM: { x: 50, y: 59 },
  RDM: { x: 62, y: 61 },
  LCM: { x: 38, y: 47 },
  CM: { x: 50, y: 46 },
  RCM: { x: 62, y: 47 },
  LAM: { x: 36, y: 34 },
  AM: { x: 50, y: 33 },
  RAM: { x: 64, y: 34 },
  LW: { x: 16, y: 27 },
  RW: { x: 84, y: 27 },
  LST: { x: 40, y: 18 },
  ST: { x: 50, y: 15 },
  RST: { x: 60, y: 18 },
  UNKNOWN: { x: 50, y: 50 },
};

const FORMATION_SLOT_KEYS = Object.keys(PITCH_SLOT_MAP).filter((key) => key !== "UNKNOWN");

const SLOT_SOURCE_BOUNDS = FORMATION_SLOT_KEYS.reduce(
  (acc, key) => {
    const slot = PITCH_SLOT_MAP[key];
    return {
      minX: Math.min(acc.minX, slot.x),
      maxX: Math.max(acc.maxX, slot.x),
      minY: Math.min(acc.minY, slot.y),
      maxY: Math.max(acc.maxY, slot.y),
    };
  },
  { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
);

const PITCH_PLAYABLE_BOUNDS = {
  minX: 10,
  maxX: 90,
  minY: 12,
  maxY: 88,
};

const PITCH_LAYOUT_SCALE = {
  x: 1.0,
  y: 1.2,
};

const PITCH_LAYOUT_SHIFT = {
  x: 0,
  y: -1.5,
};

const PITCH_VISUAL_CENTER = {
  x: 50.0,
  y: 50.0,
};

const POSITION_SLOT_ALIASES = {
  SW: "CB",
  CDM: "DM",
  CAM: "AM",
  LM: "LW",
  RM: "RW",
  CF: "ST",
  LF: "LST",
  RF: "RST",
  LS: "LST",
  RS: "RST",
  LA: "LAM",
  RA: "RAM",
};

const POSITION_TOKEN_REGEX = /[A-Z]{2,4}/g;

const VERTICAL_OFFSET_SLOTS = new Set([
  "GK",
  "CB",
  "LCB",
  "RCB",
  "DM",
  "LDM",
  "RDM",
  "CM",
  "LCM",
  "RCM",
  "AM",
  "LAM",
  "RAM",
  "ST",
  "LST",
  "RST",
]);

function normalizePositionText(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function extractPositionTokens(value) {
  const normalized = normalizePositionText(value);
  if (!normalized) return [];

  const tokens = normalized.match(POSITION_TOKEN_REGEX) || [];
  return [...new Set(tokens)];
}

function resolveDisplayPosition(player) {
  const fromName = normalizePositionText(player?.positionName);
  if (fromName) return fromName;

  const spPosition = toNumber(player?.spPosition, null);
  if (spPosition !== null && SP_POSITION_TO_LABEL[spPosition]) {
    return SP_POSITION_TO_LABEL[spPosition];
  }

  const fromPosition = normalizePositionText(player?.position);
  if (fromPosition) return fromPosition;

  return "N/A";
}

function resolveSlotBySideHint(normalized) {
  if (!normalized) return "";

  if (normalized.includes("LC")) {
    if (normalized.includes("AM")) return "LAM";
    if (normalized.includes("DM")) return "LDM";
    if (normalized.includes("B")) return "LCB";
    if (normalized.includes("W")) return "LW";
    if (normalized.includes("ST") || normalized.includes("CF")) return "LST";
    return "LCM";
  }

  if (normalized.includes("RC")) {
    if (normalized.includes("AM")) return "RAM";
    if (normalized.includes("DM")) return "RDM";
    if (normalized.includes("B")) return "RCB";
    if (normalized.includes("W")) return "RW";
    if (normalized.includes("ST") || normalized.includes("CF")) return "RST";
    return "RCM";
  }

  return "";
}

function resolveSlotKey(player, displayPos) {
  const normalized = normalizePositionText(displayPos);
  const tokens = extractPositionTokens(normalized);

  for (const token of tokens) {
    if (PITCH_SLOT_MAP[token]) return token;
  }

  for (const token of tokens) {
    const alias = POSITION_SLOT_ALIASES[token];
    if (alias && PITCH_SLOT_MAP[alias]) return alias;
  }

  const sideHint = resolveSlotBySideHint(normalized);
  if (sideHint) return sideHint;

  const spPosition = toNumber(player?.spPosition, null);
  if (spPosition !== null) {
    const codeLabel = SP_POSITION_TO_LABEL[spPosition] || "";
    if (PITCH_SLOT_MAP[codeLabel]) return codeLabel;
    const alias = POSITION_SLOT_ALIASES[codeLabel];
    if (alias && PITCH_SLOT_MAP[alias]) return alias;
  }

  if (normalized.includes("AM")) return "AM";
  if (normalized.includes("DM")) return "DM";
  if (normalized.includes("CM")) return "CM";
  if (normalized.includes("LM") || normalized.includes("LW")) return "LW";
  if (normalized.includes("RM") || normalized.includes("RW")) return "RW";
  if (normalized.includes("LB")) return "LB";
  if (normalized.includes("RB")) return "RB";
  if (normalized.includes("CB")) return "CB";
  if (normalized.includes("GK")) return "GK";
  if (normalized.includes("ST") || normalized.includes("CF")) return "ST";

  return "UNKNOWN";
}

function isVerticalSlot(slotKey) {
  return VERTICAL_OFFSET_SLOTS.has(slotKey);
}

function calculateSlotOffset(index, totalPlayers, slotKey, spreadX, spreadY) {
  if (totalPlayers <= 1) return { x: 0, y: 0 };

  const verticalPreferred = isVerticalSlot(slotKey);
  const dx = spreadX;
  const dy = spreadY;

  if (totalPlayers === 2) {
    if (verticalPreferred) {
      return index === 0 ? { x: 0, y: -dy * 0.85 } : { x: 0, y: dy * 0.85 };
    }
    return index === 0 ? { x: -dx * 0.9, y: 0 } : { x: dx * 0.9, y: 0 };
  }

  if (totalPlayers === 3) {
    if (verticalPreferred) {
      const pattern = [
        { x: 0, y: -dy * 0.95 },
        { x: -dx * 0.85, y: dy * 0.85 },
        { x: dx * 0.85, y: dy * 0.85 },
      ];
      return pattern[index] || { x: 0, y: 0 };
    }
    const pattern = [
      { x: -dx * 0.95, y: 0 },
      { x: dx * 0.95, y: 0 },
      { x: 0, y: dy * 0.9 },
    ];
    return pattern[index] || { x: 0, y: 0 };
  }

  const cols = Math.ceil(Math.sqrt(totalPlayers));
  const rows = Math.ceil(totalPlayers / cols);
  const col = index % cols;
  const row = Math.floor(index / cols);
  const baseX = (col - (cols - 1) / 2) * dx * 0.88;
  const baseY = (row - (rows - 1) / 2) * dy * 0.88;

  if (verticalPreferred) return { x: baseX * 0.9, y: baseY * 1.05 };
  return { x: baseX, y: baseY };
}

function resolvePlayerCollisions({
  nodes,
  minX,
  maxX,
  minY,
  maxY,
  minSepX,
  minSepY,
  anchorPull = 0.06,
  settleIterations = 80,
  strictIterations = 60,
}) {
  const next = nodes.map((node) => ({ ...node }));

  const clampNode = (node) => {
    node.x = clamp(node.x, minX, maxX);
    node.y = clamp(node.y, minY, maxY);
  };

  for (let step = 0; step < settleIterations; step += 1) {
    let moved = false;

    for (let i = 0; i < next.length; i += 1) {
      for (let j = i + 1; j < next.length; j += 1) {
        const a = next[i];
        const b = next[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;

        const overlapX = minSepX - Math.abs(dx);
        const overlapY = minSepY - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;

        moved = true;
        const dirX = dx === 0 ? ((i + j) % 2 === 0 ? -1 : 1) : Math.sign(dx);
        const dirY = dy === 0 ? ((i + j) % 2 === 0 ? -1 : 1) : Math.sign(dy);

        if (overlapX < overlapY) {
          const push = overlapX / 2 + 0.35;
          a.x -= dirX * push;
          b.x += dirX * push;
        } else {
          const push = overlapY / 2 + 0.35;
          a.y -= dirY * push;
          b.y += dirY * push;
        }
      }
    }

    for (let i = 0; i < next.length; i += 1) {
      const node = next[i];
      node.x += (node.anchorX - node.x) * anchorPull;
      node.y += (node.anchorY - node.y) * anchorPull;
      clampNode(node);
    }

    if (!moved && step > 20) break;
  }

  for (let step = 0; step < strictIterations; step += 1) {
    let moved = false;

    for (let i = 0; i < next.length; i += 1) {
      for (let j = i + 1; j < next.length; j += 1) {
        const a = next[i];
        const b = next[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const overlapX = minSepX - Math.abs(dx);
        const overlapY = minSepY - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;

        moved = true;
        const dirX = dx === 0 ? ((i + j) % 2 === 0 ? -1 : 1) : Math.sign(dx);
        const dirY = dy === 0 ? ((i + j) % 2 === 0 ? -1 : 1) : Math.sign(dy);

        if (overlapX < overlapY) {
          const push = overlapX / 2 + 0.25;
          a.x -= dirX * push;
          b.x += dirX * push;
        } else {
          const push = overlapY / 2 + 0.25;
          a.y -= dirY * push;
          b.y += dirY * push;
        }

        clampNode(a);
        clampNode(b);
      }
    }

    if (!moved) break;
  }

  return next;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePercent(value) {
  const n = toNumber(value, 0);
  return n <= 1 ? n * 100 : n;
}

function formatPercent(value, digits = 1) {
  return `${normalizePercent(value).toFixed(digits)}%`;
}

function formatPercentOrDash(value, digits = 1) {
  if (value === null || value === undefined || value === "") return "-";
  return formatPercent(value, digits);
}

function formatNumberOrDash(value, digits = 2) {
  if (value === null || value === undefined || value === "") return "-";
  return toNumber(value, 0).toFixed(digits);
}

function formatGeneratedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR");
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function toNumberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferBaselineValue(source, isPercent) {
  if (!source || typeof source !== "object") return null;

  const baselineCandidate = firstDefined(
    source.baselineValue,
    source.baseline,
    source.reference,
    source.referenceValue,
    source.leagueAverage,
    source.leagueAvg,
    source.average,
    source.avg,
    source.median,
    source.target
  );
  const baselineNumber = toNumberOrNull(baselineCandidate);
  if (baselineNumber === null) return null;
  return isPercent ? normalizePercent(baselineNumber) : baselineNumber;
}

function buildMetricItem({
  key,
  label,
  rawValue,
  isPercent = true,
  digits = 1,
  baselineSource = null,
  tooltip = "",
}) {
  const numeric = toNumberOrNull(rawValue);
  const valueNumber = numeric === null ? null : isPercent ? normalizePercent(numeric) : numeric;
  const valueText =
    valueNumber === null
      ? "-"
      : isPercent
      ? `${valueNumber.toFixed(digits)}%`
      : toNumber(valueNumber, 0).toFixed(digits);

  return {
    key,
    label,
    valueNumber,
    valueText,
    baselineValue: inferBaselineValue(baselineSource, isPercent),
    tooltip,
    isPercent,
  };
}

function renderHeaderWithTooltip(label, description) {
  return (
    <Tooltip title={description} arrow placement="top">
      <MDTypography
        {...uiTypography.tableText}
        sx={{
          textDecoration: "underline dotted",
          textUnderlineOffset: "2px",
          cursor: "help",
          display: "inline-block",
        }}
      >
        {label}
      </MDTypography>
    </Tooltip>
  );
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getNextInsightLayoutMode(current, isDesktopLayout) {
  const order = isDesktopLayout ? INSIGHT_LAYOUT_ORDER_DESKTOP : INSIGHT_LAYOUT_ORDER_MOBILE;
  const currentIndex = order.indexOf(current);
  if (currentIndex < 0 || currentIndex >= order.length - 1) {
    return order[order.length - 1];
  }
  return order[currentIndex + 1];
}

function clampToPitch(value, margin, fullSize) {
  if (!Number.isFinite(fullSize) || fullSize <= 0) return value;
  const min = Math.min(margin, fullSize / 2);
  const max = Math.max(fullSize - margin, min);
  return clamp(value, min, max);
}

function projectSlotToPitchPercent(base, playableBounds = PITCH_PLAYABLE_BOUNDS) {
  const sourceWidth = Math.max(1, SLOT_SOURCE_BOUNDS.maxX - SLOT_SOURCE_BOUNDS.minX);
  const sourceHeight = Math.max(1, SLOT_SOURCE_BOUNDS.maxY - SLOT_SOURCE_BOUNDS.minY);
  const nx = clamp((base.x - SLOT_SOURCE_BOUNDS.minX) / sourceWidth, 0, 1);
  const ny = clamp((base.y - SLOT_SOURCE_BOUNDS.minY) / sourceHeight, 0, 1);

  const mappedX = playableBounds.minX + nx * (playableBounds.maxX - playableBounds.minX);
  const mappedY = playableBounds.minY + ny * (playableBounds.maxY - playableBounds.minY);
  const scaledX = 50 + (mappedX - 50) * PITCH_LAYOUT_SCALE.x + PITCH_LAYOUT_SHIFT.x;
  const scaledY = 50 + (mappedY - 50) * PITCH_LAYOUT_SCALE.y + PITCH_LAYOUT_SHIFT.y;

  return {
    x: clamp(scaledX, playableBounds.minX, playableBounds.maxX),
    y: clamp(scaledY, playableBounds.minY, playableBounds.maxY),
  };
}

function SquadAnalysis() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isDesktopLayout = useMediaQuery("(min-width:1200px)");
  const [controller] = useMaterialUIController();
  const { darkMode } = controller;

  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState("");
  const [status, setStatus] = useState("idle");
  const [payload, setPayload] = useState(null);
  const [insightStatus, setInsightStatus] = useState("idle");
  const [insightPayload, setInsightPayload] = useState(null);
  const [selectedPlayerDetail, setSelectedPlayerDetail] = useState(null);
  const [playerPortraitIndex, setPlayerPortraitIndex] = useState(0);
  const topRowRef = useRef(null);
  const insightViewportRef = useRef(null);
  const insightContentRef = useRef(null);
  const insightViewportSizeRef = useRef({ width: 0, height: 0 });
  const lineupLayerRef = useRef(null);
  const lineupOffsetRef = useRef({ x: 0, y: 0 });
  const resizeRafRef = useRef(null);
  const [topRowHeight, setTopRowHeight] = useState(null);
  const [lineupVisualOffset, setLineupVisualOffset] = useState({ x: 0, y: 0 });
  const [insightLayoutMode, setInsightLayoutMode] = useState("full");
  const [insightViewportSize, setInsightViewportSize] = useState({ width: 0, height: 0 });
  const [insightTabIndex, setInsightTabIndex] = useState(0);
  const {
    elementRef: pitchWrapRef,
    width: pitchWrapWidth,
    height: pitchWrapHeight,
  } = useElementSize();
  const { elementRef: pitchRef, width: pitchWidth, height: pitchHeight } = useElementSize();

  useLayoutEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!isDesktopLayout) {
      setTopRowHeight(null);
      return undefined;
    }

    const updateTopRowHeight = () => {
      if (!topRowRef.current) return;
      const top = topRowRef.current.getBoundingClientRect().top;
      // Reserve extra space for content below top row (main table card) and footer.
      const belowReserve = 170;
      const available = window.innerHeight - top - belowReserve;
      const nextHeight = Math.max(TOP_ROW_MIN_HEIGHT, Math.min(available, TOP_ROW_MAX_HEIGHT));
      setTopRowHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    };

    const scheduleUpdate = () => {
      if (resizeRafRef.current) {
        window.cancelAnimationFrame(resizeRafRef.current);
      }
      resizeRafRef.current = window.requestAnimationFrame(() => {
        resizeRafRef.current = null;
        updateTopRowHeight();
      });
    };

    scheduleUpdate();
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      window.removeEventListener("resize", scheduleUpdate);
      if (resizeRafRef.current) {
        window.cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
    };
  }, [isDesktopLayout]);

  useEffect(() => {
    lineupOffsetRef.current = lineupVisualOffset;
  }, [lineupVisualOffset]);

  useEffect(() => {
    fetchSeasonsWithData()
      .then(({ seasons: availableSeasons, latestSeason }) => {
        setSeasons(availableSeasons);
        const seasonFromQuery = searchParams.get("season");
        const preferredSeason =
          seasonFromQuery && availableSeasons.includes(seasonFromQuery)
            ? seasonFromQuery
            : latestSeason;
        setSelectedSeason(preferredSeason);
      })
      .catch((error) => {
        console.error("Could not fetch season config:", error);
      });
  }, [searchParams]);

  useEffect(() => {
    if (!selectedSeason || !id) {
      setStatus("idle");
      setPayload(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setStatus("loading");
      const url = `/data/${selectedSeason}/user/${id}/analysis/squad_analysis_all.json`;
      try {
        const response = await fetch(url);
        if (cancelled) return;

        if (response.status === 404) {
          setStatus("pending");
          setPayload(null);
          return;
        }

        if (!response.ok) {
          throw new Error(`${url} ${response.status}`);
        }

        const data = await response.json();
        if (cancelled) return;
        setPayload(data);
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        console.error("Squad analysis fetch failed:", error);
        setStatus("error");
        setPayload(null);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [selectedSeason, id]);

  useEffect(() => {
    if (!selectedSeason || !id) {
      setInsightStatus("idle");
      setInsightPayload(null);
      return;
    }

    let cancelled = false;

    const loadInsight = async () => {
      setInsightStatus("loading");
      const url = `/data/${selectedSeason}/user/${id}/analysis/last200.json`;

      try {
        const response = await fetch(url);
        if (cancelled) return;

        if (response.status === 404) {
          setInsightStatus("pending");
          setInsightPayload(null);
          return;
        }

        if (!response.ok) {
          throw new Error(`${url} ${response.status}`);
        }

        const data = await response.json();
        if (cancelled) return;
        setInsightPayload(data);
        setInsightStatus("ready");
      } catch (error) {
        if (cancelled) return;
        console.error("Squad insight fetch failed:", error);
        setInsightStatus("error");
        setInsightPayload(null);
      }
    };

    loadInsight();

    return () => {
      cancelled = true;
    };
  }, [selectedSeason, id]);

  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const summary = payload?.summary || {};
  const scope = payload?.scope || {};
  const nickname = payload?.player?.nickname || "-";
  const metricBadgeText =
    toNumber(scope.actualMatches, 0) > 0
      ? `${toNumber(scope.actualMatches, 0)}경기`
      : selectedSeason
      ? `${selectedSeason} 시즌`
      : "Season";

  const handleOpenPlayerPage = useCallback((row) => {
    if (!row) return;
    const playerKey = row.playerKey || String(row.spId || "");
    if (!playerKey) return;
    setSelectedPlayerDetail(row);
    setPlayerPortraitIndex(0);
  }, []);

  const handleClosePlayerModal = useCallback(() => {
    setSelectedPlayerDetail(null);
  }, []);

  const advancedMetricGroups = useMemo(() => {
    const advanced = insightPayload?.advanced || {};
    const advancedStandard = insightPayload?.advancedStandard || {};

    const opening = advancedStandard.openingGoalConversion || {};
    const resilience = advancedStandard.resilienceFactor || {};
    const leadErosion = advancedStandard.leadErosionRate || {};
    const elite = advancedStandard.eliteOpponentEfficiency || {};
    const transition = advancedStandard.transitionVelocity || {};
    const phase1 = advancedStandard.phase1TurnoverRate || {};
    const flank = advancedStandard.flankReliance || {};
    const vertical = advancedStandard.verticalPenetrationYield || {};
    const concentration = advancedStandard.scoringRouteConcentration || {};
    const looseBall = advancedStandard.looseBallDominance || {};
    const lateConcession = advancedStandard.lateConcessionShare || {};
    const shotStopping = advancedStandard.shotStoppingImpact || {};
    const leakage = advancedStandard.highLeakageFrequency || {};

    const openingValue = firstDefined(opening.value, advanced.firstGoalWinRate);
    const resilienceValue = firstDefined(resilience.value, advanced.comebackWinRate);
    const leadErosionValue = firstDefined(leadErosion.value, advanced.concedeWhileLeadingRate);
    const eliteValue = firstDefined(elite.value, advanced.highPerformanceIndex?.value);

    const tempoValue = firstDefined(transition.value, advanced.tempo?.passesPerMinute);
    const phase1Value = firstDefined(phase1.value, advanced.buildUpBreakRate);
    const flankShotsValue = firstDefined(flank.shotsBased, advanced.flankRelianceShots);
    const flankAssistValue = firstDefined(
      flank.assistOriginBased,
      advanced.flankRelianceAssistOrigin
    );
    const verticalValue = firstDefined(vertical.value, advanced.centralPenetrationEfficiency);
    const concentrationValue = firstDefined(
      concentration.value,
      advanced.scoringRouteConcentration
    );

    const looseBallValue = firstDefined(looseBall.value, advanced.recoveryIntensity?.value);
    const lateConcessionValue = firstDefined(
      lateConcession.value,
      advanced.lateFocusCoefficient?.lateConcedeShare
    );
    const shotStoppingValue = firstDefined(shotStopping.value, advanced.gkDependencyRate);
    const leakageValue = firstDefined(leakage.value, advanced.concedeTwoPlusRate);

    return [
      {
        key: "game-management",
        title: "경기 흐름",
        variant: "percent",
        items: [
          buildMetricItem({
            key: "first-goal-win-rate",
            label: "선제골 후 승리율",
            rawValue: openingValue,
            isPercent: true,
            digits: 1,
            baselineSource: opening,
            tooltip: ADVANCED_METRIC_DESCRIPTIONS["선제골 후 승리율"],
          }),
          buildMetricItem({
            key: "resilience",
            label: "역전 회복력",
            rawValue: resilienceValue,
            isPercent: true,
            digits: 1,
            baselineSource: resilience,
            tooltip: ADVANCED_METRIC_DESCRIPTIONS["역전 회복력"],
          }),
          buildMetricItem({
            key: "lead-erosion",
            label: "리드 지키기",
            rawValue: leadErosionValue,
            isPercent: true,
            digits: 1,
            baselineSource: leadErosion,
            tooltip: ADVANCED_METRIC_DESCRIPTIONS["리드 지키기"],
          }),
          buildMetricItem({
            key: "elite-efficiency",
            label: "강팀 상대 효율",
            rawValue: eliteValue,
            isPercent: true,
            digits: 1,
            baselineSource: elite,
            tooltip: ADVANCED_METRIC_DESCRIPTIONS["강팀 상대 효율"],
          }),
        ],
      },
      {
        key: "offensive-tactics",
        title: "공격 패턴",
        variant: "mixed",
        items: [
          buildMetricItem({
            key: "tempo",
            label: "공격 템포",
            rawValue: tempoValue,
            isPercent: false,
            digits: 3,
            baselineSource: transition,
            tooltip: ADVANCED_METRIC_DESCRIPTIONS["공격 템포"],
          }),
          buildMetricItem({
            key: "phase1-turnover",
            label: "빌드업 실수율",
            rawValue: phase1Value,
            isPercent: true,
            digits: 1,
            baselineSource: phase1,
            tooltip: ADVANCED_METRIC_DESCRIPTIONS["빌드업 실수율"],
          }),
          buildMetricItem({
            key: "flank-shots",
            label: "측면 의존도(슈팅)",
            rawValue: flankShotsValue,
            isPercent: true,
            digits: 1,
            baselineSource: flank,
            tooltip: ADVANCED_METRIC_DESCRIPTIONS["측면 의존도(슈팅)"],
          }),
          buildMetricItem({
            key: "flank-assist",
            label: "측면 의존도(도움 기점)",
            rawValue: flankAssistValue,
            isPercent: true,
            digits: 1,
            baselineSource: flank,
            tooltip: ADVANCED_METRIC_DESCRIPTIONS["측면 의존도(도움 기점)"],
          }),
          buildMetricItem({
            key: "vertical-penetration",
            label: "중앙 침투 수율",
            rawValue: verticalValue,
            isPercent: true,
            digits: 1,
            baselineSource: vertical,
            tooltip: ADVANCED_METRIC_DESCRIPTIONS["중앙 침투 수율"],
          }),
          buildMetricItem({
            key: "route-concentration",
            label: "득점 루트 집중도",
            rawValue: concentrationValue,
            isPercent: true,
            digits: 1,
            baselineSource: concentration,
            tooltip: ADVANCED_METRIC_DESCRIPTIONS["득점 루트 집중도"],
          }),
        ],
      },
      {
        key: "defensive-solidity",
        title: "수비 패턴",
        variant: "percent",
        items: [
          buildMetricItem({
            key: "loose-ball",
            label: "볼 회수 우위",
            rawValue: looseBallValue,
            isPercent: true,
            digits: 1,
            baselineSource: looseBall,
            tooltip: ADVANCED_METRIC_DESCRIPTIONS["볼 회수 우위"],
          }),
          buildMetricItem({
            key: "late-concession",
            label: "후반 실점 비중",
            rawValue: lateConcessionValue,
            isPercent: true,
            digits: 1,
            baselineSource: lateConcession,
            tooltip: ADVANCED_METRIC_DESCRIPTIONS["후반 실점 비중"],
          }),
          buildMetricItem({
            key: "shot-stopping",
            label: "선방 기여율",
            rawValue: shotStoppingValue,
            isPercent: true,
            digits: 1,
            baselineSource: shotStopping,
            tooltip: ADVANCED_METRIC_DESCRIPTIONS["선방 기여율"],
          }),
          buildMetricItem({
            key: "high-leakage",
            label: "2실점+ 빈도",
            rawValue: leakageValue,
            isPercent: true,
            digits: 1,
            baselineSource: leakage,
            tooltip: ADVANCED_METRIC_DESCRIPTIONS["2실점+ 빈도"],
          }),
        ],
      },
    ];
  }, [insightPayload]);

  const insightSummaryGroup = useMemo(() => {
    const metricsByLabel = new Map();
    advancedMetricGroups.forEach((group) => {
      group.items.forEach((item) => {
        if (item?.label && !metricsByLabel.has(item.label)) {
          metricsByLabel.set(item.label, item);
        }
      });
    });

    return {
      key: "summary",
      title: "요약",
      variant: "percent",
      items: INSIGHT_SUMMARY_LABELS.map((label) => metricsByLabel.get(label)).filter(Boolean),
    };
  }, [advancedMetricGroups]);

  const insightTabs = useMemo(() => {
    const tabs = [];
    if (insightSummaryGroup.items.length > 0) {
      tabs.push(insightSummaryGroup);
    }
    return [...tabs, ...advancedMetricGroups];
  }, [advancedMetricGroups, insightSummaryGroup]);

  const insightQuickMetrics = useMemo(
    () =>
      insightSummaryGroup.items.slice(0, 4).map((item) => ({
        key: item.key || item.label,
        label: item.label,
        value: item.valueText || "-",
      })),
    [insightSummaryGroup.items]
  );

  useEffect(() => {
    if (insightTabIndex < insightTabs.length) return;
    setInsightTabIndex(0);
  }, [insightTabIndex, insightTabs.length]);

  const activeInsightTab = insightTabs[insightTabIndex] || insightTabs[0] || null;

  const insightLayoutConfig = useMemo(() => {
    if (insightLayoutMode === "compact") {
      return { density: "compact", columns: 3, rowGap: 0.6 };
    }
    if (insightLayoutMode === "ultra") {
      return { density: "ultra", columns: 3, rowGap: 0.5 };
    }
    return { density: "regular", columns: 2, rowGap: 0.7 };
  }, [insightLayoutMode]);

  const insightTabColumns = useMemo(() => {
    const width = insightViewportSize.width || 0;
    if (isDesktopLayout) {
      if (width >= 760) return 3;
      if (width >= 560) return 2;
      return 1;
    }
    return width >= 420 ? 2 : 1;
  }, [insightViewportSize.width, isDesktopLayout]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (insightStatus !== "ready") return undefined;

    let rafId = null;
    let observer;
    const baseMode = isDesktopLayout ? "full" : "compact";

    const measureViewport = () => {
      const viewportNode = insightViewportRef.current;
      if (!viewportNode) return;

      const nextSize = {
        width: Math.round(viewportNode.clientWidth),
        height: Math.round(viewportNode.clientHeight),
      };
      const prevSize = insightViewportSizeRef.current;
      const sizeChanged =
        Math.abs(nextSize.width - prevSize.width) > 2 ||
        Math.abs(nextSize.height - prevSize.height) > 2;

      if (sizeChanged || prevSize.width === 0 || prevSize.height === 0) {
        insightViewportSizeRef.current = nextSize;
        setInsightViewportSize(nextSize);
        setInsightLayoutMode(baseMode);
      }
    };

    const scheduleMeasure = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        measureViewport();
      });
    };

    scheduleMeasure();
    window.addEventListener("resize", scheduleMeasure);

    if (typeof ResizeObserver !== "undefined" && insightViewportRef.current) {
      observer = new ResizeObserver(scheduleMeasure);
      observer.observe(insightViewportRef.current);
    }

    return () => {
      window.removeEventListener("resize", scheduleMeasure);
      if (observer) observer.disconnect();
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
  }, [insightStatus, isDesktopLayout, topRowHeight]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (insightStatus !== "ready") return undefined;

    let rafId = null;
    rafId = window.requestAnimationFrame(() => {
      rafId = null;
      const viewportNode = insightViewportRef.current;
      const contentNode = insightContentRef.current;
      if (!viewportNode || !contentNode) return;

      const overflow = contentNode.scrollHeight - viewportNode.clientHeight;
      if (overflow <= 1) return;

      setInsightLayoutMode((prev) => {
        const next = getNextInsightLayoutMode(prev, isDesktopLayout);
        return next === prev ? prev : next;
      });
    });

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [
    activeInsightTab?.key,
    insightLayoutMode,
    insightStatus,
    insightTabs.length,
    isDesktopLayout,
    topRowHeight,
  ]);

  const bestEleven = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const appsDiff = toNumber(b.appearances, 0) - toNumber(a.appearances, 0);
      if (appsDiff !== 0) return appsDiff;
      return toNumber(b.attackPoint, 0) - toNumber(a.attackPoint, 0);
    });
    return sorted.slice(0, 11);
  }, [rows]);

  const pitchBoardMaxWidth = useMemo(() => {
    if (isDesktopLayout) {
      const fallbackWidth = 520;
      if (!pitchWrapWidth || !pitchWrapHeight) return fallbackWidth;
      const widthByHeight = Math.floor(pitchWrapHeight * 0.74);
      const fittedWidth = Math.min(pitchWrapWidth, widthByHeight);
      return clamp(fittedWidth, 280, fallbackWidth);
    }

    const fallbackWidth = 360;
    if (!pitchWrapWidth) return fallbackWidth;
    const widthByWrap = Math.floor(pitchWrapWidth * 0.98);
    const widthByHeight = pitchWrapHeight ? Math.floor(pitchWrapHeight * 0.7) : widthByWrap;
    return clamp(Math.min(widthByWrap, widthByHeight), 220, 430);
  }, [isDesktopLayout, pitchWrapHeight, pitchWrapWidth]);

  const chipSize = useMemo(() => {
    const width = pitchWidth || pitchWrapWidth || 420;
    const height = pitchHeight || Math.round((width * 4) / 3);

    const desiredSize = isDesktopLayout
      ? Math.min(width * 0.168, height * 0.126)
      : Math.min(width * 0.148, height * 0.112);
    const responsiveMin = isDesktopLayout
      ? clamp(Math.round(width * 0.14), 38, 60)
      : clamp(Math.round(width * 0.09), 32, 48);
    const responsiveMax = isDesktopLayout
      ? clamp(Math.round(width * 0.2), 78, 104)
      : clamp(Math.round(width * 0.16), 62, 82);

    return clamp(Math.round(desiredSize), responsiveMin, responsiveMax);
  }, [isDesktopLayout, pitchHeight, pitchWidth, pitchWrapWidth]);

  const pitchPlayers = useMemo(() => {
    const width = pitchWidth || 420;
    const height = pitchHeight || Math.round((width * 4) / 3);
    const chipHeight = Math.round(chipSize * 0.98);
    const spreadX = Math.max(16, Math.round(chipSize * 0.42));
    const spreadY = Math.max(12, Math.round(chipSize * 0.24));
    // Keep edge clearance adaptive to both chip scale and board scale.
    const adaptiveEdgePaddingX = Math.max(chipSize * 0.12, width * 0.02);
    const adaptiveEdgePaddingY = Math.max(chipHeight * 0.1, height * 0.015);
    const chipMarginX = chipSize / 2 + adaptiveEdgePaddingX;
    const chipMarginY = chipHeight / 2 + adaptiveEdgePaddingY;

    const dynamicMinX = clamp((chipMarginX / width) * 100 + 2.2, 8, 24);
    const dynamicMinY = clamp((chipMarginY / height) * 100 + 1.8, 8, 24);
    const dynamicPlayableBounds = {
      minX: dynamicMinX,
      maxX: 100 - dynamicMinX,
      minY: dynamicMinY,
      maxY: 100 - dynamicMinY,
    };

    const slotResolved = bestEleven.map((player) => {
      const displayPos = resolveDisplayPosition(player);
      const slotKey = resolveSlotKey(player, displayPos);
      const base = PITCH_SLOT_MAP[slotKey] || PITCH_SLOT_MAP.UNKNOWN;
      const projected = projectSlotToPitchPercent(base, dynamicPlayableBounds);

      return {
        ...player,
        displayPos,
        slotKey,
        projected,
      };
    });

    const slotTotals = slotResolved.reduce((acc, player) => {
      acc[player.slotKey] = (acc[player.slotKey] || 0) + 1;
      return acc;
    }, {});
    const slotSeen = {};

    const seeded = slotResolved.map((player) => {
      const index = slotSeen[player.slotKey] || 0;
      const totalPlayers = slotTotals[player.slotKey] || 1;
      slotSeen[player.slotKey] = index + 1;

      const offset = calculateSlotOffset(index, totalPlayers, player.slotKey, spreadX, spreadY);
      const anchorX = (player.projected.x / 100) * width + offset.x;
      const anchorY = (player.projected.y / 100) * height + offset.y;

      return {
        ...player,
        anchorX,
        anchorY,
        x: anchorX,
        y: anchorY,
      };
    });

    if (seeded.length === 0) return seeded;

    const boundMinX = chipMarginX;
    const boundMaxX = width - chipMarginX;
    const boundMinY = chipMarginY;
    const boundMaxY = height - chipMarginY;

    const seededClamped = seeded.map((player) => ({
      ...player,
      x: clamp(player.x, boundMinX, boundMaxX),
      y: clamp(player.y, boundMinY, boundMaxY),
    }));

    const minSeparationX = Math.max(chipSize * 0.94, spreadX * 1.32);
    const minSeparationY = Math.max(chipHeight * 0.9, spreadY * 1.38);

    const relaxed = resolvePlayerCollisions({
      nodes: seededClamped,
      minX: boundMinX,
      maxX: boundMaxX,
      minY: boundMinY,
      maxY: boundMaxY,
      minSepX: minSeparationX,
      minSepY: minSeparationY,
      anchorPull: 0.055,
    });

    const desiredTargetX = (width * PITCH_VISUAL_CENTER.x) / 100;
    const desiredTargetY = (height * PITCH_VISUAL_CENTER.y) / 100;
    const targetX = clamp(desiredTargetX, boundMinX, boundMaxX);
    const targetY = clamp(desiredTargetY, boundMinY, boundMaxY);

    const relaxedMinX = relaxed.reduce((acc, player) => Math.min(acc, player.x), Infinity);
    const relaxedMaxX = relaxed.reduce((acc, player) => Math.max(acc, player.x), -Infinity);
    const relaxedMinY = relaxed.reduce((acc, player) => Math.min(acc, player.y), Infinity);
    const relaxedMaxY = relaxed.reduce((acc, player) => Math.max(acc, player.y), -Infinity);
    const relaxedCenterX = (relaxedMinX + relaxedMaxX) / 2;
    const relaxedCenterY = (relaxedMinY + relaxedMaxY) / 2;

    const relaxedHalfSpanX = Math.max(
      relaxedCenterX - relaxedMinX,
      relaxedMaxX - relaxedCenterX,
      0.0001
    );
    const relaxedHalfSpanY = Math.max(
      relaxedCenterY - relaxedMinY,
      relaxedMaxY - relaxedCenterY,
      0.0001
    );
    const availableHalfSpanX = Math.max(0, Math.min(targetX - boundMinX, boundMaxX - targetX));
    const availableHalfSpanY = Math.max(0, Math.min(targetY - boundMinY, boundMaxY - targetY));
    const fitScale = Math.min(
      1,
      availableHalfSpanX / relaxedHalfSpanX,
      availableHalfSpanY / relaxedHalfSpanY
    );

    const fitted = relaxed.map((player) => ({
      ...player,
      x: clamp(targetX + (player.x - relaxedCenterX) * fitScale, boundMinX, boundMaxX),
      y: clamp(targetY + (player.y - relaxedCenterY) * fitScale, boundMinY, boundMaxY),
    }));

    const fittedMinX = fitted.reduce((acc, player) => Math.min(acc, player.x), Infinity);
    const fittedMaxX = fitted.reduce((acc, player) => Math.max(acc, player.x), -Infinity);
    const fittedMinY = fitted.reduce((acc, player) => Math.min(acc, player.y), Infinity);
    const fittedMaxY = fitted.reduce((acc, player) => Math.max(acc, player.y), -Infinity);
    const fittedCenterX = (fittedMinX + fittedMaxX) / 2;
    const fittedCenterY = (fittedMinY + fittedMaxY) / 2;

    const shiftWantedX = targetX - fittedCenterX;
    const shiftWantedY = targetY - fittedCenterY;
    const minShiftX = fitted.reduce(
      (acc, player) => Math.max(acc, boundMinX - player.x),
      -Infinity
    );
    const maxShiftX = fitted.reduce((acc, player) => Math.min(acc, boundMaxX - player.x), Infinity);
    const minShiftY = fitted.reduce(
      (acc, player) => Math.max(acc, boundMinY - player.y),
      -Infinity
    );
    const maxShiftY = fitted.reduce((acc, player) => Math.min(acc, boundMaxY - player.y), Infinity);
    const shiftX = clamp(shiftWantedX, minShiftX, maxShiftX);
    const shiftY = clamp(shiftWantedY, minShiftY, maxShiftY);

    const positioned = fitted.map((player) => ({
      ...player,
      px: clampToPitch(player.x + shiftX, chipMarginX, width),
      py: clampToPitch(player.y + shiftY, chipMarginY, height),
    }));

    const positionedMinX = positioned.reduce((acc, player) => Math.min(acc, player.px), Infinity);
    const positionedMaxX = positioned.reduce((acc, player) => Math.max(acc, player.px), -Infinity);
    const positionedMinY = positioned.reduce((acc, player) => Math.min(acc, player.py), Infinity);
    const positionedMaxY = positioned.reduce((acc, player) => Math.max(acc, player.py), -Infinity);
    const positionedCenterX = (positionedMinX + positionedMaxX) / 2;
    const positionedCenterY = (positionedMinY + positionedMaxY) / 2;

    const centerTargetX = width / 2;
    const centerTargetY = (height * PITCH_VISUAL_CENTER.y) / 100;
    const centerWantedShiftX = centerTargetX - positionedCenterX;
    const centerWantedShiftY = centerTargetY - positionedCenterY;

    const centerMinShiftX = positioned.reduce(
      (acc, player) => Math.max(acc, chipMarginX - player.px),
      -Infinity
    );
    const centerMaxShiftX = positioned.reduce(
      (acc, player) => Math.min(acc, width - chipMarginX - player.px),
      Infinity
    );
    const centerMinShiftY = positioned.reduce(
      (acc, player) => Math.max(acc, chipMarginY - player.py),
      -Infinity
    );
    const centerMaxShiftY = positioned.reduce(
      (acc, player) => Math.min(acc, height - chipMarginY - player.py),
      Infinity
    );

    const centerShiftX = clamp(centerWantedShiftX, centerMinShiftX, centerMaxShiftX);
    const centerShiftY = clamp(centerWantedShiftY, centerMinShiftY, centerMaxShiftY);
    if (Math.abs(centerShiftX) < 0.01 && Math.abs(centerShiftY) < 0.01) {
      // continue to hard-center pass below
    } else {
      positioned.forEach((player) => {
        player.px = clampToPitch(player.px + centerShiftX, chipMarginX, width);
        player.py = clampToPitch(player.py + centerShiftY, chipMarginY, height);
      });
    }

    // Hard-center refinement: align final rendered bbox center to pitch center.
    // Use a softer margin than chipMargin so translation is not over-constrained.
    const hardMarginX = chipSize / 2 + Math.max(2, width * 0.005);
    const hardMarginY = chipHeight / 2 + Math.max(2, height * 0.005);
    const hardTargetX = width / 2;
    const hardTargetY = (height * PITCH_VISUAL_CENTER.y) / 100;
    let hardCentered = positioned;

    for (let pass = 0; pass < 3; pass += 1) {
      const minX = hardCentered.reduce((acc, player) => Math.min(acc, player.px), Infinity);
      const maxX = hardCentered.reduce((acc, player) => Math.max(acc, player.px), -Infinity);
      const minY = hardCentered.reduce((acc, player) => Math.min(acc, player.py), Infinity);
      const maxY = hardCentered.reduce((acc, player) => Math.max(acc, player.py), -Infinity);
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const dx = hardTargetX - centerX;
      const dy = hardTargetY - centerY;

      if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) break;

      hardCentered = hardCentered.map((player) => ({
        ...player,
        px: clampToPitch(player.px + dx, hardMarginX, width),
        py: clampToPitch(player.py + dy, hardMarginY, height),
      }));
    }

    const finalMinX = hardCentered.reduce((acc, player) => Math.min(acc, player.px), Infinity);
    const finalMaxX = hardCentered.reduce((acc, player) => Math.max(acc, player.px), -Infinity);
    const finalMinY = hardCentered.reduce((acc, player) => Math.min(acc, player.py), Infinity);
    const finalMaxY = hardCentered.reduce((acc, player) => Math.max(acc, player.py), -Infinity);
    const finalCenterX = (finalMinX + finalMaxX) / 2;
    const finalCenterY = (finalMinY + finalMaxY) / 2;

    // Force exact visual centering on the rendered result (single rigid translation).
    const forceCenterDx = width / 2 - finalCenterX;
    const forceCenterDy = (height * PITCH_VISUAL_CENTER.y) / 100 - finalCenterY;

    return hardCentered.map((player) => ({
      ...player,
      px: player.px + forceCenterDx,
      py: player.py + forceCenterDy,
    }));
  }, [bestEleven, chipSize, pitchHeight, pitchWidth]);

  const lineupBounds = useMemo(() => {
    if (!pitchPlayers.length) return null;
    const minX = pitchPlayers.reduce((acc, player) => Math.min(acc, player.px), Infinity);
    const maxX = pitchPlayers.reduce((acc, player) => Math.max(acc, player.px), -Infinity);
    const minY = pitchPlayers.reduce((acc, player) => Math.min(acc, player.py), Infinity);
    const maxY = pitchPlayers.reduce((acc, player) => Math.max(acc, player.py), -Infinity);
    return {
      minX,
      maxX,
      minY,
      maxY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    };
  }, [pitchPlayers]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return undefined;

    if (!pitchPlayers.length) {
      lineupOffsetRef.current = { x: 0, y: 0 };
      setLineupVisualOffset((prev) => (prev.x === 0 && prev.y === 0 ? prev : { x: 0, y: 0 }));
      return undefined;
    }

    let rafId = null;
    let observer;

    const scheduleMeasure = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        rafId = null;

        const pitchNode = pitchRef.current;
        const lineupNode = lineupLayerRef.current;
        if (!pitchNode || !lineupNode) return;

        const chipNodes = lineupNode.querySelectorAll("[data-lineup-chip='1']");
        if (!chipNodes.length) return;

        const pitchRect = pitchNode.getBoundingClientRect();
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        chipNodes.forEach((node) => {
          const rect = node.getBoundingClientRect();
          minX = Math.min(minX, rect.left);
          maxX = Math.max(maxX, rect.right);
          minY = Math.min(minY, rect.top);
          maxY = Math.max(maxY, rect.bottom);
        });

        if (
          !Number.isFinite(minX) ||
          !Number.isFinite(maxX) ||
          !Number.isFinite(minY) ||
          !Number.isFinite(maxY)
        ) {
          return;
        }

        const currentOffset = lineupOffsetRef.current;
        const baseMinX = minX - currentOffset.x;
        const baseMaxX = maxX - currentOffset.x;
        const baseMinY = minY - currentOffset.y;
        const baseMaxY = maxY - currentOffset.y;

        const targetCenterX = pitchRect.left + pitchRect.width / 2;
        const targetCenterY = pitchRect.top + (pitchRect.height * PITCH_VISUAL_CENTER.y) / 100;
        const baseCenterX = (baseMinX + baseMaxX) / 2;
        const baseCenterY = (baseMinY + baseMaxY) / 2;

        const wantedOffsetX = targetCenterX - baseCenterX;
        const wantedOffsetY = targetCenterY - baseCenterY;

        const minAllowedOffsetX = pitchRect.left - baseMinX;
        const maxAllowedOffsetX = pitchRect.right - baseMaxX;
        const minAllowedOffsetY = pitchRect.top - baseMinY;
        const maxAllowedOffsetY = pitchRect.bottom - baseMaxY;

        const nextOffset = {
          x: clamp(wantedOffsetX, minAllowedOffsetX, maxAllowedOffsetX),
          y: clamp(wantedOffsetY, minAllowedOffsetY, maxAllowedOffsetY),
        };

        lineupOffsetRef.current = nextOffset;
        setLineupVisualOffset((prev) =>
          Math.abs(prev.x - nextOffset.x) < 0.05 && Math.abs(prev.y - nextOffset.y) < 0.05
            ? prev
            : nextOffset
        );
      });
    };

    scheduleMeasure();
    window.addEventListener("resize", scheduleMeasure);

    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(scheduleMeasure);
      if (pitchRef.current) observer.observe(pitchRef.current);
      if (lineupLayerRef.current) observer.observe(lineupLayerRef.current);
    }

    return () => {
      window.removeEventListener("resize", scheduleMeasure);
      if (observer) observer.disconnect();
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
  }, [pitchPlayers, pitchRef]);

  useEffect(() => {
    if (!selectedPlayerDetail) return;
    const selectedKey = String(
      selectedPlayerDetail.playerKey || selectedPlayerDetail.spId || selectedPlayerDetail.id || ""
    );
    const matched = rows.find(
      (row) => String(row.playerKey || row.spId || row.id || "") === selectedKey
    );
    if (!matched) {
      setSelectedPlayerDetail(null);
      return;
    }
    if (matched !== selectedPlayerDetail) {
      setSelectedPlayerDetail(matched);
    }
  }, [rows, selectedPlayerDetail]);

  const modalPortraitUrls = useMemo(() => {
    if (!selectedPlayerDetail) return [];
    const token =
      selectedPlayerDetail.spId || selectedPlayerDetail.playerKey || selectedPlayerDetail.id || "";
    return buildPlayerPortraitUrls(token);
  }, [selectedPlayerDetail]);

  useEffect(() => {
    setPlayerPortraitIndex(0);
  }, [modalPortraitUrls.join("|")]);

  const modalPortraitUrl = modalPortraitUrls[playerPortraitIndex] || "";
  const modalPlayerTitle =
    selectedPlayerDetail?.playerName || selectedPlayerDetail?.name || "선수 상세";

  const modalPlayerTableData = useMemo(() => {
    if (!selectedPlayerDetail) return { columns: [], rows: [] };

    const winRateSource =
      selectedPlayerDetail.playerWinRate !== undefined &&
      selectedPlayerDetail.playerWinRate !== null
        ? selectedPlayerDetail.playerWinRate
        : selectedPlayerDetail.winRate;

    const detailRows = [
      { label: "선수", value: selectedPlayerDetail.playerName || selectedPlayerDetail.name || "-" },
      {
        label: "포지션",
        value: selectedPlayerDetail.positionName || selectedPlayerDetail.position || "-",
      },
      {
        label: "시즌",
        value: selectedPlayerDetail.seasonName || selectedPlayerDetail.seasonId || "-",
      },
      { label: "출전", value: `${toNumber(selectedPlayerDetail.appearances, 0)}` },
      { label: "승률", value: formatPercentOrDash(winRateSource, 1) },
      {
        label: "승/무/패",
        value: `${toNumber(selectedPlayerDetail?.record?.w, 0)} / ${toNumber(
          selectedPlayerDetail?.record?.d,
          0
        )} / ${toNumber(selectedPlayerDetail?.record?.l, 0)}`,
      },
      { label: "공격포인트", value: `${toNumber(selectedPlayerDetail.attackPoint, 0)}` },
      { label: "골", value: `${toNumber(selectedPlayerDetail.goal, 0)}` },
      { label: "어시스트", value: `${toNumber(selectedPlayerDetail.assist, 0)}` },
      { label: "공격력", value: formatNumberOrDash(selectedPlayerDetail.attackPower, 2) },
      { label: "수비력", value: formatNumberOrDash(selectedPlayerDetail.defensePower, 2) },
      { label: "기대득점률", value: formatPercentOrDash(selectedPlayerDetail.expectedGoalRate, 1) },
      { label: "패스성공률", value: formatPercentOrDash(selectedPlayerDetail.passSuccessRate, 1) },
      {
        label: "드리블성공률",
        value: formatPercentOrDash(selectedPlayerDetail.dribbleSuccessRate, 1),
      },
      {
        label: "가로채기성공",
        value: formatPercentOrDash(selectedPlayerDetail.interceptPerGame, 1),
      },
      {
        label: "태클성공률",
        value: formatPercentOrDash(selectedPlayerDetail.tackleSuccessRate, 1),
      },
      {
        label: "공중볼성공률",
        value: formatPercentOrDash(selectedPlayerDetail.aerialSuccessRate, 1),
      },
      { label: "선방력", value: formatPercentOrDash(selectedPlayerDetail.savePerGame, 1) },
      { label: "슈팅방어율", value: formatPercentOrDash(selectedPlayerDetail.shotDefenseRate, 1) },
      {
        label: "중거리 슈팅 비율",
        value: formatPercentOrDash(selectedPlayerDetail.longShotAttemptRate, 1),
      },
      {
        label: "중거리 유효슈팅률",
        value: formatPercentOrDash(selectedPlayerDetail.longShotSelectionEfficiency, 1),
      },
      {
        label: "중거리 득점 점유율",
        value: formatPercentOrDash(selectedPlayerDetail.longShotGoalShare, 1),
      },
    ];

    return {
      columns: [
        { Header: "항목", accessor: "metric", align: "left" },
        { Header: "값", accessor: "value", align: "center" },
      ],
      rows: detailRows.map((row) => ({
        metric: <MDTypography {...uiTypography.tableTextStrong}>{row.label}</MDTypography>,
        value: <MDTypography {...uiTypography.tableText}>{row.value}</MDTypography>,
      })),
    };
  }, [selectedPlayerDetail]);

  const tableData = useMemo(
    () => ({
      columns: [
        { Header: "포지션", accessor: "position", align: "center" },
        { Header: "시즌", accessor: "season", align: "center" },
        { Header: "선수명", accessor: "name", align: "left" },
        { Header: "출전", accessor: "appearances", align: "center" },
        { Header: "승률", accessor: "winRate", align: "center" },
        { Header: "공격력", accessor: "attackPower", align: "center" },
        { Header: "수비력", accessor: "defensePower", align: "center" },
        { Header: "기대득점률", accessor: "expectedGoalRate", align: "center" },
        { Header: "공격포인트", accessor: "attackPoint", align: "center" },
        { Header: "골", accessor: "goal", align: "center" },
        { Header: "어시", accessor: "assist", align: "center" },
        { Header: "패스성공률", accessor: "passSuccessRate", align: "center" },
        { Header: "드리블성공률", accessor: "dribbleSuccessRate", align: "center" },
        { Header: "가로채기성공", accessor: "interceptPerGame", align: "center" },
        { Header: "태클성공률", accessor: "tackleSuccessRate", align: "center" },
        { Header: "공중볼성공률", accessor: "aerialSuccessRate", align: "center" },
        { Header: "선방력", accessor: "savePerGame", align: "center" },
        { Header: "슈팅방어율", accessor: "shotDefenseRate", align: "center" },
      ],
      rows: rows.map((row) => ({
        position: (
          <MDTypography {...uiTypography.tableTextStrong}>
            {row.positionName || row.position || "-"}
          </MDTypography>
        ),
        season: (
          <MDBox display="flex" justifyContent="center" alignItems="center" minHeight="22px">
            {row.seasonImg ? (
              <MDBox
                component="img"
                src={row.seasonImg}
                alt={row.seasonName || row.seasonId || "season"}
                sx={{
                  width: "26px",
                  height: "26px",
                  objectFit: "contain",
                }}
              />
            ) : (
              <MDTypography {...uiTypography.tableText}>
                {row.seasonName || row.seasonId || "-"}
              </MDTypography>
            )}
          </MDBox>
        ),
        name: (
          <MDBox
            component="button"
            type="button"
            onClick={() => handleOpenPlayerPage(row)}
            sx={{
              border: 0,
              background: "transparent",
              padding: 0,
              color: "inherit",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <MDTypography
              {...uiTypography.tableTextStrong}
              sx={({ palette }) => ({
                textDecoration: "underline",
                textDecorationColor: palette.grey[500],
                textUnderlineOffset: "2px",
                "&:hover": { color: palette.info.main },
              })}
            >
              {row.name || row.playerName || `SPID ${row.spId}`}
            </MDTypography>
          </MDBox>
        ),
        appearances: (
          <MDTypography {...uiTypography.tableText}>{toNumber(row.appearances, 0)}</MDTypography>
        ),
        winRate: (
          <MDTypography {...uiTypography.tableText}>
            {formatPercentOrDash(
              row.playerWinRate !== undefined && row.playerWinRate !== null
                ? row.playerWinRate
                : row.winRate,
              1
            )}
          </MDTypography>
        ),
        attackPower: (
          <MDTypography {...uiTypography.tableText}>
            {toNumber(row.attackPower, 0).toFixed(2)}
          </MDTypography>
        ),
        defensePower: (
          <MDTypography {...uiTypography.tableText}>
            {toNumber(row.defensePower, 0).toFixed(2)}
          </MDTypography>
        ),
        expectedGoalRate: (
          <MDTypography {...uiTypography.tableText}>
            {formatPercentOrDash(row.expectedGoalRate, 1)}
          </MDTypography>
        ),
        attackPoint: (
          <MDTypography {...uiTypography.tableText}>{toNumber(row.attackPoint, 0)}</MDTypography>
        ),
        goal: <MDTypography {...uiTypography.tableText}>{toNumber(row.goal, 0)}</MDTypography>,
        assist: <MDTypography {...uiTypography.tableText}>{toNumber(row.assist, 0)}</MDTypography>,
        passSuccessRate: (
          <MDTypography {...uiTypography.tableText}>
            {formatPercentOrDash(row.passSuccessRate, 1)}
          </MDTypography>
        ),
        dribbleSuccessRate: (
          <MDTypography {...uiTypography.tableText}>
            {formatPercentOrDash(row.dribbleSuccessRate, 1)}
          </MDTypography>
        ),
        interceptPerGame: (
          <MDTypography {...uiTypography.tableText}>
            {formatPercentOrDash(row.interceptPerGame, 1)}
          </MDTypography>
        ),
        aerialSuccessRate: (
          <MDTypography {...uiTypography.tableText}>
            {formatPercentOrDash(row.aerialSuccessRate, 1)}
          </MDTypography>
        ),
        tackleSuccessRate: (
          <MDTypography {...uiTypography.tableText}>
            {formatPercentOrDash(row.tackleSuccessRate, 1)}
          </MDTypography>
        ),
        savePerGame: (
          <MDTypography {...uiTypography.tableText}>
            {formatPercentOrDash(row.savePerGame, 1)}
          </MDTypography>
        ),
        shotDefenseRate: (
          <MDTypography {...uiTypography.tableText}>
            {formatPercentOrDash(row.shotDefenseRate, 1)}
          </MDTypography>
        ),
      })),
    }),
    [handleOpenPlayerPage, rows]
  );

  const longShotTableData = useMemo(
    () => ({
      columns: [
        { Header: "선수명", accessor: "name", align: "left" },
        { Header: "포지션", accessor: "position", align: "center" },
        { Header: "출전", accessor: "appearances", align: "center" },
        {
          Header: renderHeaderWithTooltip("중거리 슈팅 비율", "중거리 슈팅 수 / 전체 슈팅 수"),
          accessor: "longShotAttemptRate",
          align: "center",
        },
        {
          Header: renderHeaderWithTooltip(
            "중거리 유효슈팅률",
            "중거리 유효슈팅 수 / 중거리 슈팅 수"
          ),
          accessor: "longShotSelectionEfficiency",
          align: "center",
        },
        {
          Header: renderHeaderWithTooltip("중거리 득점 점유율", "중거리 득점 수 / 전체 득점 수"),
          accessor: "longShotGoalShare",
          align: "center",
        },
      ],
      rows: rows.map((row) => ({
        name: (
          <MDTypography {...uiTypography.tableTextStrong}>
            {row.name || `SPID ${row.spId}`}
          </MDTypography>
        ),
        position: (
          <MDTypography {...uiTypography.tableText}>
            {row.positionName || row.position || "-"}
          </MDTypography>
        ),
        appearances: (
          <MDTypography {...uiTypography.tableText}>{toNumber(row.appearances, 0)}</MDTypography>
        ),
        longShotAttemptRate: (
          <MDTypography {...uiTypography.tableText}>
            {formatPercentOrDash(row.longShotAttemptRate, 1)}
          </MDTypography>
        ),
        longShotSelectionEfficiency: (
          <MDTypography {...uiTypography.tableText}>
            {formatPercentOrDash(row.longShotSelectionEfficiency, 1)}
          </MDTypography>
        ),
        longShotGoalShare: (
          <MDTypography {...uiTypography.tableText}>
            {formatPercentOrDash(row.longShotGoalShare, 1)}
          </MDTypography>
        ),
      })),
    }),
    [rows]
  );

  return (
    <DashboardLayout>
      <DashboardNavbar pageTitle="스쿼드 분석" />
      <MDBox py={{ xs: 2, md: 3 }}>
        <Grid container spacing={{ xs: 2, md: 3 }}>
          <Grid item xs={12}>
            <MDBox
              display="flex"
              justifyContent="space-between"
              alignItems={{ xs: "stretch", sm: "center" }}
              flexDirection={{ xs: "column", sm: "row" }}
              gap={1.5}
              mb={2}
            >
              <MDBox display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
                <MDTypography {...uiTypography.sectionSub}>시즌</MDTypography>
                <Select value={selectedSeason} onChange={(e) => setSelectedSeason(e.target.value)}>
                  {seasons.map((season) => (
                    <MenuItem key={season} value={season}>
                      {season} 시즌
                    </MenuItem>
                  ))}
                </Select>
              </MDBox>
              <MDBox
                display="flex"
                gap={1}
                flexWrap="wrap"
                justifyContent={{ xs: "flex-end", sm: "flex-start" }}
              >
                {/* 감독모드 인사이트 임시 비활성화
                <MDButton
                  component={Link}
                  to={`/dashboard/${id}/analysis${
                    selectedSeason ? `?season=${encodeURIComponent(selectedSeason)}` : ""
                  }`}
                  variant="outlined"
                  color="info"
                  size="small"
                  sx={navActionSx}
                >
                  세부 분석
                </MDButton>
                */}
                <MDButton
                  component={Link}
                  to={`/dashboard/${id}${
                    selectedSeason ? `?season=${encodeURIComponent(selectedSeason)}` : ""
                  }`}
                  variant="outlined"
                  color="info"
                  size="small"
                  sx={navActionSx}
                >
                  대시보드
                </MDButton>
              </MDBox>
            </MDBox>
          </Grid>
        </Grid>

        <MDBox
          ref={topRowRef}
          mb={3}
          sx={{
            position: "relative",
            minHeight: { lg: TOP_ROW_MIN_HEIGHT },
            height: { xs: "auto", lg: topRowHeight ? `${topRowHeight}px` : "calc(100vh - 360px)" },
          }}
        >
          <MDBox
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", lg: "5fr 7fr" },
              gap: 1.5,
              height: "100%",
              minHeight: 0,
              alignItems: "stretch",
            }}
          >
            <MDBox
              sx={{
                height: { xs: "auto", lg: "100%" },
                minHeight: 0,
                display: "flex",
              }}
            >
              <Card
                sx={{
                  height: "100%",
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 0,
                }}
              >
                <MDBox p={1.25} pb={0.5}>
                  <MDTypography {...uiTypography.sectionTitle}>베스트 11 포지션 맵</MDTypography>
                  <MDTypography {...uiTypography.sectionSub}>
                    출전 기준 상위 11명 (클릭 시 선수 페이지)
                  </MDTypography>
                </MDBox>
                <MDBox
                  ref={pitchWrapRef}
                  px={1}
                  pb={1}
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    overflow: "hidden",
                  }}
                >
                  {status === "ready" && pitchPlayers.length > 0 ? (
                    <MDBox sx={{ width: "100%" }}>
                      <PitchBoard ref={pitchRef} maxWidth={pitchBoardMaxWidth} aspectRatio="3 / 4">
                        <MDBox
                          ref={lineupLayerRef}
                          sx={{
                            position: "absolute",
                            inset: 0,
                            transform: `translate(${lineupVisualOffset.x}px, ${lineupVisualOffset.y}px)`,
                            transformOrigin: "center center",
                            pointerEvents: "none",
                          }}
                        >
                          {pitchPlayers.map((player) => (
                            <MDBox
                              key={
                                player.playerKey ||
                                player.spId ||
                                `${player.displayPos}-${player.px}-${player.py}`
                              }
                              data-lineup-chip="1"
                              sx={{
                                position: "absolute",
                                left: `${player.px}px`,
                                top: `${player.py}px`,
                                transform: "translate(-50%, -50%)",
                                zIndex: 2,
                                pointerEvents: "auto",
                              }}
                            >
                              <PlayerChip
                                playerName={
                                  player.name || player.playerName || `SPID ${player.spId}`
                                }
                                displayPos={player.displayPos}
                                tokenSize={chipSize}
                                playerImageUrls={buildPlayerPortraitUrls(
                                  player.spId || player.playerKey || player.id
                                )}
                                onClick={() => handleOpenPlayerPage(player)}
                              />
                            </MDBox>
                          ))}
                        </MDBox>
                      </PitchBoard>
                    </MDBox>
                  ) : (
                    <MDTypography {...uiTypography.status}>
                      {status === "loading" && "스쿼드 데이터 로딩 중..."}
                      {status === "pending" && "스쿼드 데이터 준비 중"}
                      {status === "error" && "스쿼드 데이터 로드 실패"}
                      {(status === "idle" || (status === "ready" && pitchPlayers.length === 0)) &&
                        "표시할 베스트 11 데이터가 없습니다."}
                    </MDTypography>
                  )}
                </MDBox>
              </Card>
            </MDBox>

            <MDBox
              sx={{
                height: { xs: "auto", lg: "100%" },
                minHeight: 0,
                display: "flex",
              }}
            >
              <Card
                sx={{
                  height: "100%",
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 0,
                }}
              >
                <MDBox p={1.25} pb={0.5}>
                  <MDTypography {...uiTypography.sectionTitle}>지표 한눈에</MDTypography>
                  <MDTypography {...uiTypography.sectionSub}>팀 세부 지표 (시즌 분석)</MDTypography>
                </MDBox>
                <MDBox
                  px={1}
                  pb={1}
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {insightStatus === "ready" && insightQuickMetrics.length > 0 && (
                    <MDBox
                      mb={0.8}
                      sx={{
                        display: "grid",
                        gridTemplateColumns: {
                          xs: "repeat(2, minmax(0, 1fr))",
                          md: "repeat(4, minmax(0, 1fr))",
                        },
                        gap: 0.6,
                      }}
                    >
                      {insightQuickMetrics.map((item) => (
                        <MDBox
                          key={item.key}
                          sx={({ palette }) => {
                            const isDarkTheme = darkMode || palette.mode === "dark";
                            return {
                              border: `1px solid ${
                                isDarkTheme ? "rgba(255,255,255,0.12)" : palette.grey[300]
                              }`,
                              borderRadius: "8px",
                              px: 0.9,
                              py: 0.7,
                              minHeight: 52,
                              backgroundColor: isDarkTheme
                                ? "rgba(255,255,255,0.04)"
                                : palette.grey[100],
                              color: isDarkTheme ? palette.text.main : palette.dark.main,
                            };
                          }}
                        >
                          <MDTypography {...uiTypography.metaLabel} color="inherit">
                            {item.label}
                          </MDTypography>
                          <MDTypography
                            {...uiTypography.metaValue}
                            color="inherit"
                            display="block"
                            mt={0.1}
                          >
                            {item.value}
                          </MDTypography>
                        </MDBox>
                      ))}
                    </MDBox>
                  )}
                  {insightStatus === "loading" && (
                    <MDTypography {...uiTypography.status}>
                      팀 세부지표를 불러오는 중...
                    </MDTypography>
                  )}
                  {insightStatus === "pending" && (
                    <MDTypography {...uiTypography.status}>팀 세부지표 데이터 준비 중</MDTypography>
                  )}
                  {insightStatus === "error" && (
                    <MDTypography {...uiTypography.status}>팀 세부지표 로드 실패</MDTypography>
                  )}
                  {insightStatus === "ready" && (
                    <MDBox
                      ref={insightViewportRef}
                      sx={{
                        flex: 1,
                        minHeight: 0,
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      {insightLayoutMode === "tabs" ? (
                        <MDBox
                          ref={insightContentRef}
                          sx={{
                            display: "flex",
                            flexDirection: "column",
                            rowGap: 0.5,
                          }}
                        >
                          <Tabs
                            value={insightTabIndex}
                            onChange={(_, nextIndex) => setInsightTabIndex(nextIndex)}
                            variant="scrollable"
                            scrollButtons="auto"
                            allowScrollButtonsMobile
                            sx={{
                              minHeight: 32,
                              "& .MuiTabs-indicator": {
                                height: "2px",
                              },
                              "& .MuiTab-root": {
                                minHeight: 32,
                                py: 0.35,
                                px: 1.0,
                                fontSize: "0.72rem",
                                fontWeight: 700,
                              },
                            }}
                          >
                            {insightTabs.map((tab) => (
                              <Tab key={tab.key} label={tab.title} />
                            ))}
                          </Tabs>

                          {activeInsightTab ? (
                            <FmMetricPanel
                              title={activeInsightTab.title}
                              items={activeInsightTab.items}
                              variant={
                                activeInsightTab.variant === "mixed"
                                  ? "float"
                                  : activeInsightTab.variant
                              }
                              badgeText={metricBadgeText}
                              density="ultra"
                              columns={insightTabColumns}
                            />
                          ) : (
                            <MDTypography {...uiTypography.status}>
                              표시할 지표가 없습니다.
                            </MDTypography>
                          )}
                        </MDBox>
                      ) : (
                        <MDBox
                          ref={insightContentRef}
                          sx={{
                            display: "grid",
                            rowGap: insightLayoutConfig.rowGap,
                          }}
                        >
                          {advancedMetricGroups.map((group) => (
                            <MDBox key={group.key}>
                              <FmMetricPanel
                                title={group.title}
                                items={group.items}
                                variant={group.variant === "mixed" ? "float" : group.variant}
                                badgeText={metricBadgeText}
                                density={insightLayoutConfig.density}
                                columns={insightLayoutConfig.columns}
                              />
                            </MDBox>
                          ))}
                        </MDBox>
                      )}
                    </MDBox>
                  )}
                </MDBox>
              </Card>
            </MDBox>
          </MDBox>
        </MDBox>

        <Dialog
          open={Boolean(selectedPlayerDetail)}
          onClose={handleClosePlayerModal}
          maxWidth="md"
          fullWidth
          scroll="paper"
          PaperProps={{
            sx: ({ palette }) => {
              const isDarkTheme = darkMode || palette.mode === "dark";
              return {
                backgroundColor: isDarkTheme ? palette.background.card : palette.background.paper,
                color: isDarkTheme ? palette.text.main : palette.text.primary,
                backgroundImage: "none",
                "& .MuiDialogContent-dividers": {
                  borderColor: isDarkTheme ? "rgba(255,255,255,0.12)" : palette.grey[300],
                },
                "& .MuiTableCell-root": {
                  borderColor: isDarkTheme ? "rgba(255,255,255,0.08) !important" : undefined,
                },
                "& .MuiTableCell-root, & .MuiTableCell-root *": {
                  color: isDarkTheme ? `${palette.text.main} !important` : undefined,
                },
                "& .MuiSvgIcon-root": {
                  color: isDarkTheme ? `${palette.text.main} !important` : undefined,
                },
              };
            },
          }}
        >
          {selectedPlayerDetail && (
            <>
              <DialogTitle sx={{ pb: 1 }}>
                <MDBox display="flex" justifyContent="space-between" alignItems="center" gap={1.5}>
                  <MDTypography {...uiTypography.sectionTitle} color="inherit">
                    {modalPlayerTitle} - 선수 상세 지표
                  </MDTypography>
                  <MDButton
                    variant="outlined"
                    color="info"
                    size="small"
                    onClick={handleClosePlayerModal}
                  >
                    닫기
                  </MDButton>
                </MDBox>
                <MDTypography {...uiTypography.sectionSub} color="inherit" display="block">
                  데이터 생성 시각: {formatGeneratedAt(payload?.generatedAt)}
                </MDTypography>
              </DialogTitle>
              <DialogContent dividers>
                <MDBox
                  sx={({ palette }) => {
                    const isDarkTheme = darkMode || palette.mode === "dark";
                    return {
                      width: "100%",
                      minHeight: 158,
                      borderRadius: "12px",
                      border: `1px solid ${
                        isDarkTheme ? "rgba(255,255,255,0.14)" : palette.grey[300]
                      }`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      px: 2,
                      py: 1.5,
                      gap: 2,
                      background: isDarkTheme
                        ? "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)"
                        : `linear-gradient(135deg, ${palette.grey[100]} 0%, ${palette.white.main} 100%)`,
                      color: isDarkTheme ? palette.text.main : palette.dark.main,
                    };
                  }}
                >
                  <MDBox
                    sx={({ palette }) => {
                      const isDarkTheme = darkMode || palette.mode === "dark";
                      const forcedColor = isDarkTheme
                        ? `${palette.common.white} !important`
                        : `${palette.dark.main} !important`;
                      return {
                        color: forcedColor,
                        "&, & *": {
                          color: forcedColor,
                        },
                      };
                    }}
                  >
                    <MDTypography variant="h5" fontWeight="medium" color="inherit">
                      {modalPlayerTitle}
                    </MDTypography>
                    <MDTypography {...uiTypography.sectionSub} color="inherit" display="block">
                      {selectedPlayerDetail.positionName || selectedPlayerDetail.position || "-"} ·{" "}
                      {selectedPlayerDetail.seasonName || selectedPlayerDetail.seasonId || "-"}
                    </MDTypography>
                    <MDTypography {...uiTypography.sectionSub} color="inherit" display="block">
                      출전 {toNumber(selectedPlayerDetail.appearances, 0)}경 · 승률{" "}
                      {formatPercentOrDash(
                        selectedPlayerDetail.playerWinRate !== undefined &&
                          selectedPlayerDetail.playerWinRate !== null
                          ? selectedPlayerDetail.playerWinRate
                          : selectedPlayerDetail.winRate,
                        1
                      )}
                    </MDTypography>
                  </MDBox>
                  <MDBox
                    sx={({ palette }) => {
                      const isDarkTheme = darkMode || palette.mode === "dark";
                      return {
                        width: 120,
                        height: 120,
                        borderRadius: "10px",
                        border: `1px solid ${
                          isDarkTheme ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)"
                        }`,
                        bgcolor: isDarkTheme ? "rgba(255,255,255,0.03)" : "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        flexShrink: 0,
                      };
                    }}
                  >
                    {modalPortraitUrl ? (
                      <MDBox
                        component="img"
                        src={modalPortraitUrl}
                        alt={modalPlayerTitle}
                        loading="lazy"
                        onError={() =>
                          setPlayerPortraitIndex((prev) =>
                            prev + 1 < modalPortraitUrls.length ? prev + 1 : prev
                          )
                        }
                        sx={{
                          width: "92%",
                          height: "92%",
                          objectFit: "contain",
                          display: "block",
                        }}
                      />
                    ) : (
                      <MDTypography {...uiTypography.metaLabel}>이미지 없음</MDTypography>
                    )}
                  </MDBox>
                </MDBox>
                <MDBox mt={2}>
                  <DataTable
                    table={modalPlayerTableData}
                    isSorted={false}
                    entriesPerPage={false}
                    showTotalEntries={false}
                    showAllEntries
                    noEndBorder
                    dense={!isDesktopLayout}
                  />
                </MDBox>
              </DialogContent>
            </>
          )}
        </Dialog>

        <Card>
          <MDBox p={2}>
            <MDTypography {...uiTypography.pageTitle}>
              {nickname} - FC온라인 감독경기 스쿼드 분석
            </MDTypography>
            <MDBox
              mt={1}
              sx={{
                display: "grid",
                rowGap: 0.35,
              }}
            >
              <MDTypography
                {...uiTypography.tableText}
                sx={{ lineHeight: 1.6, wordBreak: "keep-all", letterSpacing: "0.01em" }}
              >
                데이터 생성 시각: {formatGeneratedAt(payload?.generatedAt)}
              </MDTypography>
              <MDTypography
                {...uiTypography.tableText}
                sx={{ lineHeight: 1.6, wordBreak: "keep-all", letterSpacing: "0.01em" }}
              >
                시즌 내 분석 경기 수: {toNumber(scope.actualMatches, 0)}경
              </MDTypography>
              <MDTypography
                {...uiTypography.tableText}
                sx={{ lineHeight: 1.6, wordBreak: "keep-all", letterSpacing: "0.01em" }}
              >
                집계 선수 수: {toNumber(summary.uniquePlayers, 0)}명
              </MDTypography>
            </MDBox>
          </MDBox>

          <MDBox px={2} pb={2}>
            {status === "loading" && (
              <MDTypography {...uiTypography.status}>
                스쿼드 분석 데이터를 불러오는 중...
              </MDTypography>
            )}
            {status === "pending" && (
              <MDTypography {...uiTypography.status}>스쿼드 분석 데이터 준비 중</MDTypography>
            )}
            {status === "error" && (
              <MDTypography {...uiTypography.status}>스쿼드 분석 데이터 로드 실패</MDTypography>
            )}
            {status === "ready" && rows.length === 0 && (
              <MDTypography {...uiTypography.status}>
                표시할 스쿼드 분석 데이터가 없습니다.
              </MDTypography>
            )}
            {status === "ready" && rows.length > 0 && (
              <DataTable
                table={tableData}
                isSorted
                entriesPerPage={false}
                showTotalEntries={false}
                showAllEntries
                noEndBorder
                dense={!isDesktopLayout}
              />
            )}
          </MDBox>
        </Card>

        {status === "ready" && rows.length > 0 && (
          <MDBox mt={3}>
            <Card>
              <MDBox p={2}>
                <MDTypography {...uiTypography.sectionTitle}>중거리 보조 지표</MDTypography>
                <MDTypography {...uiTypography.sectionSub} display="block">
                  메인 스쿼드 지표와 분리된 보조 통계
                </MDTypography>
              </MDBox>
              <MDBox px={2} pb={2}>
                <DataTable
                  table={longShotTableData}
                  isSorted
                  entriesPerPage={false}
                  showTotalEntries={false}
                  showAllEntries
                  noEndBorder
                  dense={!isDesktopLayout}
                />
              </MDBox>
            </Card>
          </MDBox>
        )}
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default SquadAnalysis;
