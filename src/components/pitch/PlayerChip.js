import { useEffect, useState } from "react";
import PropTypes from "prop-types";

import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

function ShirtIcon({ size, highlight }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 64 64"
      sx={{
        width: `${size}px`,
        height: `${size}px`,
        display: "block",
      }}
      aria-hidden="true"
    >
      <path
        d="M20 10h24l9 9-8 10-6-4v29H25V25l-6 4-8-10 9-9z"
        fill={highlight ? "#60a5fa" : "#94a3b8"}
        fillOpacity="0.92"
        stroke="#e2e8f0"
        strokeWidth="2.2"
      />
    </Box>
  );
}

function PlayerChip({
  playerName,
  displayPos,
  onClick,
  tokenSize,
  highlight,
  secondaryText,
  playerImageUrls,
  debugBorder,
}) {
  const posText = String(displayPos || "N/A");
  const posLength = posText.length;
  const chipHeight = Math.round(tokenSize * 0.98);
  const innerPaddingX = Math.max(4, Math.round(tokenSize * 0.08));
  const innerPaddingY = Math.max(3, Math.round(tokenSize * 0.06));
  const posBadgeMinWidth =
    posLength >= 5
      ? Math.max(28, Math.round(tokenSize * 0.42))
      : Math.max(24, Math.round(tokenSize * 0.34));
  const posFontSizePx = Math.max(
    7,
    Math.min(
      11,
      tokenSize * (posLength >= 8 ? 0.083 : posLength >= 6 ? 0.09 : posLength >= 4 ? 0.097 : 0.105)
    )
  );
  const secondaryFontSizePx = Math.max(7, Math.min(10, tokenSize * 0.09));
  const secondaryMaxWidth = Math.max(24, Math.round(tokenSize * 0.42));
  const avatarSize = Math.max(20, Math.round(tokenSize * 0.4));
  const fallbackShirtSize = Math.max(16, Math.round(tokenSize * 0.24));
  const nameFontSizePx = Math.max(7, Math.min(11, tokenSize * 0.1));
  const [imageIndex, setImageIndex] = useState(0);
  const currentImageUrl = playerImageUrls[imageIndex] || "";
  const imageKey = playerImageUrls.join("|");
  const debugOutline = debugBorder ? "1px solid rgba(255, 0, 0, 0.95)" : undefined;

  useEffect(() => {
    setImageIndex(0);
  }, [imageKey]);

  return (
    <ButtonBase
      onClick={onClick}
      focusRipple
      sx={{
        width: `${tokenSize}px`,
        height: `${chipHeight}px`,
        borderRadius: "10px",
        background: "rgba(20,25,35,0.85)",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 8px 18px rgba(0,0,0,0.35)",
        backdropFilter: "blur(2px)",
        transition: "transform 130ms ease, box-shadow 130ms ease, border-color 130ms ease",
        "&:hover": {
          transform: "scale(1.03)",
          zIndex: 3,
          borderColor: "rgba(125,211,252,0.55)",
          boxShadow: "0 10px 22px rgba(0,0,0,0.42)",
        },
        "&.Mui-focusVisible": {
          outline: "2px solid rgba(125,211,252,0.75)",
          outlineOffset: "2px",
        },
        outline: debugOutline,
      }}
      aria-label={`${posText} ${playerName || ""}`.trim()}
    >
      <Box
        sx={{
          width: "100%",
          height: "100%",
          px: `${innerPaddingX}px`,
          py: `${innerPaddingY}px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          outline: debugOutline,
        }}
      >
        <Box display="flex" alignItems="center" justifyContent="space-between" gap={0.6}>
          <Box
            sx={{
              minWidth: `${posBadgeMinWidth}px`,
              px: `${Math.max(3, Math.round(tokenSize * 0.05))}px`,
              py: `${Math.max(1, Math.round(tokenSize * 0.02))}px`,
              borderRadius: "6px",
              border: "1px solid rgba(255,255,255,0.18)",
              backgroundColor: "rgba(15,23,42,0.85)",
              outline: debugOutline,
            }}
          >
            <Typography
              sx={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                whiteSpace: "nowrap",
                fontWeight: 700,
                letterSpacing: "0.02em",
                lineHeight: 1.1,
                color: "#e2e8f0",
                fontSize: `${posFontSizePx}px`,
              }}
            >
              {posText}
            </Typography>
          </Box>
          {secondaryText ? (
            <Typography
              variant="caption"
              sx={{
                color: "rgba(226,232,240,0.82)",
                fontSize: `${secondaryFontSizePx}px`,
                lineHeight: 1,
                whiteSpace: "nowrap",
                maxWidth: `${secondaryMaxWidth}px`,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {secondaryText}
            </Typography>
          ) : null}
        </Box>

        <Box display="flex" justifyContent="center" alignItems="center" sx={{ mt: 0.2, mb: 0.2 }}>
          {currentImageUrl ? (
            <Box
              component="img"
              src={currentImageUrl}
              alt={playerName || "player"}
              loading="lazy"
              onError={() =>
                setImageIndex((prev) => (prev + 1 < playerImageUrls.length ? prev + 1 : prev))
              }
              sx={{
                width: `${avatarSize}px`,
                height: `${avatarSize}px`,
                display: "block",
                objectFit: "contain",
                filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.35))",
              }}
            />
          ) : (
            <ShirtIcon size={fallbackShirtSize} highlight={highlight} />
          )}
        </Box>

        <Tooltip title={playerName || "-"} arrow placement="top">
          <Typography
            variant="caption"
            sx={{
              display: "block",
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontWeight: 600,
              letterSpacing: "0.01em",
              color: "#f8fafc",
              lineHeight: 1.1,
              fontSize: `${nameFontSizePx}px`,
            }}
          >
            {playerName || "-"}
          </Typography>
        </Tooltip>
      </Box>
    </ButtonBase>
  );
}

ShirtIcon.propTypes = {
  size: PropTypes.number.isRequired,
  highlight: PropTypes.bool,
};

ShirtIcon.defaultProps = {
  highlight: false,
};

PlayerChip.propTypes = {
  playerName: PropTypes.string,
  displayPos: PropTypes.string,
  onClick: PropTypes.func,
  tokenSize: PropTypes.number,
  highlight: PropTypes.bool,
  secondaryText: PropTypes.string,
  playerImageUrls: PropTypes.arrayOf(PropTypes.string),
  debugBorder: PropTypes.bool,
};

PlayerChip.defaultProps = {
  playerName: "",
  displayPos: "N/A",
  onClick: undefined,
  tokenSize: 108,
  highlight: false,
  secondaryText: "",
  playerImageUrls: [],
  debugBorder: false,
};

export default PlayerChip;
