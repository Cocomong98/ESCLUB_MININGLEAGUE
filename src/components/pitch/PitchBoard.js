import { forwardRef } from "react";
import PropTypes from "prop-types";

import Box from "@mui/material/Box";

const PitchBoard = forwardRef(function PitchBoard({ children, maxWidth, aspectRatio }, ref) {
  return (
    <Box display="flex" justifyContent="center" width="100%">
      <Box
        ref={ref}
        sx={{
          position: "relative",
          width: "100%",
          maxWidth: `${maxWidth}px`,
          margin: "0 auto",
          aspectRatio,
          borderRadius: "16px",
          overflow: "hidden",
          border: "1px solid rgba(223,255,239,0.28)",
          boxShadow: "0 18px 34px rgba(0,0,0,0.42)",
          backgroundImage: `
            radial-gradient(circle at 50% 30%, rgba(255,255,255,0.08), rgba(0,0,0,0.18) 70%),
            repeating-linear-gradient(
              90deg,
              rgba(255,255,255,0.06) 0 48px,
              rgba(0,0,0,0.00) 48px 96px
            ),
            linear-gradient(180deg, #1f6f4c 0%, #15543a 100%)
          `,
          backgroundBlendMode: "screen, normal, normal",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            pointerEvents: "none",
            opacity: 0.86,
          }}
        >
          <Box
            component="svg"
            viewBox="0 0 100 150"
            preserveAspectRatio="none"
            sx={{ width: "100%", height: "100%", display: "block" }}
            aria-hidden="true"
          >
            <g
              fill="none"
              stroke="rgba(255,255,255,0.35)"
              strokeWidth="0.92"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="5" y="5" width="90" height="140" />
              <line x1="5" y1="75" x2="95" y2="75" />
              <circle cx="50" cy="75" r="11.5" />

              <rect x="20" y="5" width="60" height="20" />
              <rect x="33" y="5" width="34" height="8.5" />
              <circle cx="50" cy="21" r="0.6" fill="rgba(255,255,255,0.55)" stroke="none" />
              <path d="M40 21 A10 10 0 0 0 60 21" />

              <rect x="20" y="125" width="60" height="20" />
              <rect x="33" y="136.5" width="34" height="8.5" />
              <circle cx="50" cy="129" r="0.6" fill="rgba(255,255,255,0.55)" stroke="none" />
              <path d="M40 129 A10 10 0 0 1 60 129" />
            </g>
            <circle cx="50" cy="75" r="0.7" fill="rgba(255,255,255,0.52)" />
          </Box>
        </Box>

        <Box sx={{ position: "absolute", inset: 0, zIndex: 2 }}>{children}</Box>
      </Box>
    </Box>
  );
});

PitchBoard.propTypes = {
  children: PropTypes.node,
  maxWidth: PropTypes.number,
  aspectRatio: PropTypes.string,
};

PitchBoard.defaultProps = {
  children: null,
  maxWidth: 520,
  aspectRatio: "3 / 4",
};

export default PitchBoard;
