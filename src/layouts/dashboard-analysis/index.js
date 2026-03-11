import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";

import Grid from "@mui/material/Grid";
import { MenuItem, Select } from "@mui/material";

import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDTypography from "components/MDTypography";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

import { fetchSeasonsWithData } from "utils/seasonUtils";
import OpenApiAnalysisSection from "layouts/dashboard/OpenApiAnalysisSection";

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

function DashboardAnalysis() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState("");

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

  return (
    <DashboardLayout>
      <DashboardNavbar pageTitle="감독모드 인사이트" />
      <MDBox py={3}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <MDBox
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              gap={1.5}
              mb={2}
            >
              <MDBox display="flex" alignItems="center" gap={1.5}>
                <MDTypography variant="button" color="text">
                  시즌
                </MDTypography>
                <Select value={selectedSeason} onChange={(e) => setSelectedSeason(e.target.value)}>
                  {seasons.map((season) => (
                    <MenuItem key={season} value={season}>
                      {season} 시즌
                    </MenuItem>
                  ))}
                </Select>
              </MDBox>
              <MDBox display="flex" gap={1}>
                <MDButton
                  component={Link}
                  to={`/dashboard/${id}/squad${
                    selectedSeason ? `?season=${encodeURIComponent(selectedSeason)}` : ""
                  }`}
                  variant="outlined"
                  color="info"
                  size="small"
                  sx={navActionSx}
                >
                  스쿼드 분석
                </MDButton>
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

        <OpenApiAnalysisSection season={selectedSeason} playerId={id} />
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default DashboardAnalysis;
