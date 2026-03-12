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
}) {
  const posText = String(displayPos || "N/A");
  const posLength = posText.length;
  const chipHeight = Math.round(tokenSize * 0.92);
  const innerPaddingX = Math.max(3, Math.round(tokenSize * 0.07));
  const innerPaddingY = Math.max(2, Math.round(tokenSize * 0.05));
  const posBadgeMinWidth =
    posLength >= 5
      ? Math.max(24, Math.round(tokenSize * 0.36))
      : Math.max(20, Math.round(tokenSize * 0.3));
  const posFontSizePx = Math.max(
    6,
    Math.min(
      10,
      tokenSize * (posLength >= 8 ? 0.078 : posLength >= 6 ? 0.086 : posLength >= 4 ? 0.093 : 0.1)
    )
  );
  const secondaryFontSizePx = Math.max(6, Math.min(9, tokenSize * 0.082));
  const secondaryMaxWidth = Math.max(20, Math.round(tokenSize * 0.36));
  const avatarSize = Math.max(18, Math.round(tokenSize * 0.34));
  const fallbackShirtSize = Math.max(14, Math.round(tokenSize * 0.2));
  const nameFontSizePx = Math.max(6, Math.min(10, tokenSize * 0.09));
  const [imageIndex, setImageIndex] = useState(0);
  const currentImageUrl = playerImageUrls[imageIndex] || "";
  const imageKey = playerImageUrls.join("|");

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
        borderRadius: "8px",
        background: "rgba(20,25,35,0.85)",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 6px 14px rgba(0,0,0,0.28)",
        backdropFilter: "blur(2px)",
        transition: "transform 130ms ease, box-shadow 130ms ease, border-color 130ms ease",
        "&:hover": {
          transform: "scale(1.02)",
          zIndex: 3,
          borderColor: "rgba(125,211,252,0.55)",
          boxShadow: "0 8px 18px rgba(0,0,0,0.34)",
        },
        "&.Mui-focusVisible": {
          outline: "1px solid rgba(125,211,252,0.75)",
          outlineOffset: "1px",
        },
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
        }}
      >
        <Box display="flex" alignItems="center" justifyContent="space-between" gap={0.6}>
          <Box
            sx={{
              minWidth: `${posBadgeMinWidth}px`,
              px: `${Math.max(3, Math.round(tokenSize * 0.05))}px`,
              py: `${Math.max(1, Math.round(tokenSize * 0.02))}px`,
              borderRadius: "5px",
              border: "1px solid rgba(255,255,255,0.14)",
              backgroundColor: "rgba(15,23,42,0.85)",
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
};

PlayerChip.defaultProps = {
  playerName: "",
  displayPos: "N/A",
  onClick: undefined,
  tokenSize: 108,
  highlight: false,
  secondaryText: "",
  playerImageUrls: [],
};

export default PlayerChip;
