import PropTypes from "prop-types";

import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toNumberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getBarValue(item, variant) {
  const isPercent = item.isPercent ?? variant === "percent";
  const current = toNumberOrNull(item.valueNumber);
  if (current === null) return 0;

  if (isPercent) return clamp(current, 0, 100);

  const baseline = toNumberOrNull(item.baselineValue);
  if (baseline !== null && baseline > 0) return clamp((current / baseline) * 100, 0, 100);
  return clamp(current * 10, 0, 100);
}

function getDelta(item, variant) {
  const isPercent = item.isPercent ?? variant === "percent";
  const current = toNumberOrNull(item.valueNumber);
  const baseline = toNumberOrNull(item.baselineValue);
  if (current === null || baseline === null) return null;

  const diff = current - baseline;
  if (Math.abs(diff) < 0.001) return { text: "= 0.0", tone: "neutral" };

  const abs = Math.abs(diff).toFixed(1);
  if (diff > 0) {
    return { text: `▲ ${abs}${isPercent ? "p" : ""}`, tone: "up" };
  }
  return { text: `▼ ${abs}${isPercent ? "p" : ""}`, tone: "down" };
}

const DENSITY_PRESETS = {
  regular: {
    panelRadius: "16px",
    panelShadow: "0 10px 24px rgba(0,0,0,0.28)",
    panelPx: 1.6,
    panelPt: 1.4,
    panelPb: 1.5,
    headerMb: 1.25,
    titleSize: "0.95rem",
    badgePx: 0.8,
    badgePy: 0.24,
    badgeSize: "0.66rem",
    gridGap: 1.3,
    itemPx: 1.15,
    itemPy: 0.95,
    itemMinHeight: "84px",
    labelSize: "0.77rem",
    valueSize: "1.18rem",
    deltaSize: "0.7rem",
    barMt: 0.85,
    barHeight: "6px",
  },
  compact: {
    panelRadius: "14px",
    panelShadow: "0 8px 18px rgba(0,0,0,0.24)",
    panelPx: 1.2,
    panelPt: 1.05,
    panelPb: 1.1,
    headerMb: 0.9,
    titleSize: "0.86rem",
    badgePx: 0.62,
    badgePy: 0.18,
    badgeSize: "0.6rem",
    gridGap: 0.75,
    itemPx: 0.8,
    itemPy: 0.66,
    itemMinHeight: "62px",
    labelSize: "0.68rem",
    valueSize: "1.02rem",
    deltaSize: "0.63rem",
    barMt: 0.55,
    barHeight: "4px",
  },
  ultra: {
    panelRadius: "12px",
    panelShadow: "0 7px 16px rgba(0,0,0,0.22)",
    panelPx: 1.0,
    panelPt: 0.88,
    panelPb: 0.9,
    headerMb: 0.72,
    titleSize: "0.8rem",
    badgePx: 0.5,
    badgePy: 0.14,
    badgeSize: "0.56rem",
    gridGap: 0.58,
    itemPx: 0.66,
    itemPy: 0.52,
    itemMinHeight: "50px",
    labelSize: "0.63rem",
    valueSize: "0.92rem",
    deltaSize: "0.58rem",
    barMt: 0.42,
    barHeight: "3px",
  },
};

function resolveDensity(density, compact) {
  if (density && DENSITY_PRESETS[density]) return density;
  return compact ? "compact" : "regular";
}

function resolveColumns(columns, density) {
  if (Number.isFinite(columns)) return clamp(Math.round(columns), 1, 3);
  return density === "regular" ? 2 : 3;
}

function getGridTemplateColumns(columns) {
  if (columns <= 1) return "1fr";
  if (columns === 2) {
    return { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" };
  }
  return {
    xs: "1fr",
    sm: "repeat(2, minmax(0, 1fr))",
    md: "repeat(3, minmax(0, 1fr))",
  };
}

function FmMetricPanel({ title, items, variant, badgeText, compact, density, columns }) {
  const resolvedDensity = resolveDensity(density, compact);
  const preset = DENSITY_PRESETS[resolvedDensity];
  const resolvedColumns = resolveColumns(columns, resolvedDensity);

  return (
    <Box
      sx={{
        background: "rgba(12,18,30,0.92)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: preset.panelRadius,
        boxShadow: preset.panelShadow,
        px: preset.panelPx,
        pt: preset.panelPt,
        pb: preset.panelPb,
      }}
    >
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={preset.headerMb}>
        <Typography
          sx={{
            color: "#f8fafc",
            fontSize: preset.titleSize,
            fontWeight: 700,
          }}
        >
          {title}
        </Typography>
        <Box
          sx={{
            px: preset.badgePx,
            py: preset.badgePy,
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.16)",
            backgroundColor: "rgba(255,255,255,0.04)",
          }}
        >
          <Typography
            sx={{
              color: "rgba(226,232,240,0.9)",
              fontSize: preset.badgeSize,
              lineHeight: 1.1,
            }}
          >
            {badgeText}
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          display: "grid",
          gap: preset.gridGap,
          gridTemplateColumns: getGridTemplateColumns(resolvedColumns),
        }}
      >
        {items.map((item) => {
          const delta = getDelta(item, variant);
          const bar = getBarValue(item, variant);

          return (
            <Box key={item.key || item.label}>
              <Box
                sx={{
                  px: preset.itemPx,
                  py: preset.itemPy,
                  borderRadius: "10px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  backgroundColor: "rgba(255,255,255,0.03)",
                  minHeight: preset.itemMinHeight,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                {item.tooltip ? (
                  <Tooltip title={item.tooltip} arrow placement="top">
                    <Typography
                      sx={{
                        color: "rgba(203,213,225,0.9)",
                        fontSize: preset.labelSize,
                        lineHeight: 1.2,
                        textDecoration: "underline dotted",
                        textUnderlineOffset: "2px",
                        display: "inline-block",
                        cursor: "help",
                      }}
                    >
                      {item.label}
                    </Typography>
                  </Tooltip>
                ) : (
                  <Typography
                    sx={{
                      color: "rgba(203,213,225,0.9)",
                      fontSize: preset.labelSize,
                      lineHeight: 1.2,
                    }}
                  >
                    {item.label}
                  </Typography>
                )}

                <Box display="flex" alignItems="baseline" justifyContent="space-between" mt={0.22}>
                  <Typography
                    sx={{
                      color: "#f8fafc",
                      fontSize: preset.valueSize,
                      fontWeight: 700,
                      lineHeight: 1.05,
                    }}
                  >
                    {item.valueText || "-"}
                  </Typography>
                  {delta ? (
                    <Typography
                      sx={{
                        color:
                          delta.tone === "up"
                            ? "rgba(134,239,172,0.95)"
                            : delta.tone === "down"
                            ? "rgba(252,165,165,0.95)"
                            : "rgba(203,213,225,0.8)",
                        fontSize: preset.deltaSize,
                        fontWeight: 700,
                        lineHeight: 1.1,
                      }}
                    >
                      {delta.text}
                    </Typography>
                  ) : null}
                </Box>

                <LinearProgress
                  variant="determinate"
                  value={bar}
                  sx={({ palette }) => ({
                    mt: preset.barMt,
                    height: preset.barHeight,
                    borderRadius: "999px",
                    backgroundColor: "rgba(255,255,255,0.08)",
                    "& .MuiLinearProgress-bar": {
                      borderRadius: "999px",
                      backgroundColor: palette.info.main,
                    },
                  })}
                />
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

FmMetricPanel.propTypes = {
  title: PropTypes.string.isRequired,
  items: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string,
      label: PropTypes.string.isRequired,
      valueText: PropTypes.string,
      valueNumber: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
      baselineValue: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
      tooltip: PropTypes.string,
      isPercent: PropTypes.bool,
    })
  ),
  variant: PropTypes.oneOf(["percent", "float"]),
  badgeText: PropTypes.string,
  compact: PropTypes.bool,
  density: PropTypes.oneOf(["regular", "compact", "ultra"]),
  columns: PropTypes.number,
};

FmMetricPanel.defaultProps = {
  items: [],
  variant: "percent",
  badgeText: "Season",
  compact: false,
  density: undefined,
  columns: undefined,
};

export default FmMetricPanel;
