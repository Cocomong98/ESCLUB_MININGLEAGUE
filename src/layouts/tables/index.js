/**
=========================================================
* Material Dashboard 2 React - v2.2.0
=========================================================
* Product Page: https://www.creative-tim.com/product/material-dashboard-react
* Copyright 2023 Creative Tim (https://www.creative-tim.com)
Coded by www.creative-tim.com
 =========================================================
* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
*/

import { Link } from "react-router-dom";
import { useState, useEffect } from "react";

// @mui material components
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { Select, MenuItem } from "@mui/material";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";

// Material Dashboard 2 React example components
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import DataTable from "examples/Tables/DataTable";
import DefaultInfoCard from "examples/Cards/InfoCards/DefaultInfoCard";
import { fetchSeasonsWithData } from "utils/seasonUtils";

function Tables() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState("");
  const [newTableData, setNewTableData] = useState({
    results: [],
    mining_king: {},
    win_rate_king: {},
    game_count_king: {},
    draw_king: {},
  });

  // 1. 시즌 설정 로드
  useEffect(() => {
    fetchSeasonsWithData()
      .then(({ seasons: availableSeasons, latestSeason }) => {
        setSeasons(availableSeasons);
        setSelectedSeason(latestSeason);
      })
      .catch((err) => console.error("Config load error:", err));
  }, []);

  // 2. 시즌 변경 시 데이터 로드
  useEffect(() => {
    if (!selectedSeason) return;
    const fetchData = async () => {
      try {
        const timestamp = new Date().getTime();
        const response = await fetch(
          `/data/${selectedSeason}/current_crawl_display_data.json?t=${timestamp}`
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        setNewTableData(data);
      } catch (error) {
        console.error("Error fetching ranking data:", error);
        setNewTableData({
          results: [],
          mining_king: {},
          win_rate_king: {},
          game_count_king: {},
          draw_king: {},
        });
      }
    };
    fetchData();
  }, [selectedSeason]);

  const allColumns = [
    { Header: "순위", accessor: "rank", align: "center" },
    { Header: "구단주", accessor: "owner", width: "25%", align: "left" },
    { Header: "전적", accessor: "record", align: "center" },
    { Header: "승률", accessor: "win_rate", align: "center" },
    { Header: "판수", accessor: "games", align: "center" },
    { Header: "채굴 효율", accessor: "mining", align: "center" },
    { Header: "구단 가치", accessor: "value", align: "center" },
  ];

  const columns = isMobile
    ? allColumns.filter((col) => ["rank", "owner", "mining"].includes(col.accessor))
    : allColumns;

  const rows = newTableData.results.map((player) => ({
    rank: (
      <MDTypography variant="body2" color="text" fontWeight="medium">
        {player.순위}
      </MDTypography>
    ),
    owner: (
      <Link to={`/dashboard/${player.player_id}?season=${encodeURIComponent(selectedSeason)}`}>
        <MDTypography
          variant="body2"
          color="text"
          fontWeight="medium"
          sx={{ cursor: "pointer", "&:hover": { color: "info.main" } }}
        >
          {player.구단주명}
        </MDTypography>
      </Link>
    ),
    record: (
      <MDTypography variant="body2" color="text">
        {player.승}승 {player.무}무 {player.패}패
      </MDTypography>
    ),
    win_rate: (
      <MDTypography variant="body2" color="text">
        {player.승률}
      </MDTypography>
    ),
    games: (
      <MDTypography variant="body2" color="text">
        {player.판수}
      </MDTypography>
    ),
    mining: (
      <MDTypography variant="body2" color="text" fontWeight="bold">
        {player["채굴 효율"]}
      </MDTypography>
    ),
    value: (
      <MDTypography variant="body2" color="text">
        {player["구단 가치"]}
      </MDTypography>
    ),
  }));

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <MDBox mb={4} display="flex" alignItems="center">
          <MDTypography variant="h6" fontWeight="medium" mr={2}>
            시즌 데이터 조회:
          </MDTypography>
          <Select
            value={selectedSeason}
            onChange={(e) => setSelectedSeason(e.target.value)}
            sx={{ height: "40px" }}
          >
            {seasons.map((s) => (
              <MenuItem key={s} value={s}>
                {s} 시즌
              </MenuItem>
            ))}
          </Select>
        </MDBox>

        <Grid container spacing={3}>
          <Grid item xs={6} md={3}>
            <DefaultInfoCard
              icon="military_tech"
              title="채굴왕"
              description={newTableData.mining_king.구단주명 || "---"}
              value={newTableData.mining_king["지난 시즌 채굴 효율"] || "0"}
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <DefaultInfoCard
              icon="emoji_events"
              title="승률왕"
              description={newTableData.win_rate_king.구단주명 || "---"}
              value={newTableData.win_rate_king["지난 시즌 승률"] || "0%"}
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <DefaultInfoCard
              icon="casino"
              title="판수왕"
              description={newTableData.game_count_king.구단주명 || "---"}
              value={newTableData.game_count_king["지난 시즌 판수"] || "0"}
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <DefaultInfoCard
              icon="balance"
              title="승부왕"
              description={newTableData.draw_king.구단주명 || "---"}
              value={newTableData.draw_king["지난 시즌 무"] || "0"}
            />
          </Grid>
        </Grid>

        <Grid container spacing={3} mt={3}>
          <Grid item xs={12}>
            <Card>
              <MDBox
                mx={2}
                mt={-3}
                py={3}
                px={2}
                variant="gradient"
                bgColor="info"
                borderRadius="lg"
                coloredShadow="info"
              >
                <MDTypography variant="h6" color="white">
                  {selectedSeason} 시즌 순위
                </MDTypography>
              </MDBox>
              <MDBox pt={3}>
                {newTableData.results.length > 0 ? (
                  <DataTable
                    table={{ columns, rows }}
                    isSorted={false}
                    entriesPerPage={false}
                    showTotalEntries={false}
                    showAllEntries={true}
                    noEndBorder
                  />
                ) : (
                  <MDTypography variant="h6" color="text" textAlign="center" py={3}>
                    데이터를 불러오는 중입니다...
                  </MDTypography>
                )}
              </MDBox>
            </Card>
          </Grid>
        </Grid>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default Tables;
