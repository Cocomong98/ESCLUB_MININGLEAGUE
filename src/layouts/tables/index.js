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
import { useState, useEffect, useMemo } from "react";

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
  const [sortConfig, setSortConfig] = useState({ key: "rank", direction: "asc" });
  const [hasSortedOnce, setHasSortedOnce] = useState(false);

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

  const parseNumberValue = (value) => {
    if (typeof value === "number") return value;
    if (value === null || value === undefined) return 0;
    const normalized = String(value).replace(/[% ,]/g, "").trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const parseClubValue = (value) => {
    if (typeof value === "number") return value;
    if (value === null || value === undefined) return 0;

    const text = String(value).trim();
    if (!text) return 0;

    if (text.includes("조")) {
      const numericMatch = text.match(/(\d+(?:\.\d+)?)/);
      if (!numericMatch) return text.includes("미만") ? 999999999999 : 0;
      const trillionValue = Number(numericMatch[1]) * 1000000000000;
      return text.includes("미만") ? Math.max(trillionValue - 1, 0) : trillionValue;
    }

    return parseNumberValue(text);
  };

  const getSortValue = (player, sortKey) => {
    switch (sortKey) {
      case "rank":
        return parseNumberValue(player.순위);
      case "win_rate":
        return parseNumberValue(player.승률);
      case "games":
        return parseNumberValue(player.판수);
      case "mining":
        return parseNumberValue(player["채굴 효율"]);
      case "growth":
        return parseNumberValue(player["성장력"]);
      case "value":
        return parseClubValue(player["구단 가치"] ?? player.구단가치);
      default:
        return 0;
    }
  };

  const handleSort = (key) => {
    setHasSortedOnce(true);
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "asc" };
    });
  };

  const renderSortHeader = (label, key) => {
    const isActive = sortConfig.key === key;
    return (
      <MDBox
        component="button"
        type="button"
        onClick={() => handleSort(key)}
        sx={{
          border: 0,
          background: "transparent",
          padding: 0,
          cursor: "pointer",
          userSelect: "none",
          display: "inline-flex",
          alignItems: "center",
          color: "inherit",
          fontSize: "inherit",
          fontFamily: "inherit",
          fontWeight: "inherit",
          lineHeight: "inherit",
          outline: "none",
        }}
      >
        <MDBox component="span">{label}</MDBox>
        {hasSortedOnce && isActive && (
          <MDBox
            component="span"
            sx={{
              ml: 0.5,
              display: "inline-flex",
              color: "inherit",
              fontSize: "inherit",
              fontFamily: "inherit",
              fontWeight: 700,
              lineHeight: "inherit",
            }}
          >
            {sortConfig.direction === "asc" ? "▲" : "▼"}
          </MDBox>
        )}
      </MDBox>
    );
  };

  const renderStaticHeader = (label) => (
    <MDBox
      component="span"
      sx={{
        color: "inherit",
        fontSize: "inherit",
        fontFamily: "inherit",
        fontWeight: "inherit",
        lineHeight: "inherit",
      }}
    >
      {label}
    </MDBox>
  );

  const sortedResults = useMemo(() => {
    const results = [...newTableData.results];
    results.sort((a, b) => {
      const diff = getSortValue(a, sortConfig.key) - getSortValue(b, sortConfig.key);
      if (diff !== 0) return sortConfig.direction === "asc" ? diff : -diff;
      return parseNumberValue(a.순위) - parseNumberValue(b.순위);
    });
    return results;
  }, [newTableData.results, sortConfig]);

  const allColumns = [
    { Header: renderSortHeader("순위", "rank"), accessor: "rank", align: "center" },
    { Header: renderStaticHeader("구단주"), accessor: "owner", width: "25%", align: "left" },
    { Header: renderStaticHeader("전적"), accessor: "record", align: "center" },
    { Header: renderSortHeader("승률", "win_rate"), accessor: "win_rate", align: "center" },
    { Header: renderSortHeader("판수", "games"), accessor: "games", align: "center" },
    { Header: renderSortHeader("채굴 효율", "mining"), accessor: "mining", align: "center" },
    { Header: renderSortHeader("성장력", "growth"), accessor: "growth", align: "center" },
    { Header: renderSortHeader("구단 가치", "value"), accessor: "value", align: "center" },
  ];

  const columns = isMobile
    ? allColumns.filter((col) => ["rank", "owner", "mining"].includes(col.accessor))
    : allColumns;

  const rows = sortedResults.map((player) => ({
    rank: (
      <MDTypography variant="body2" color="text" fontWeight="medium">
        {player.순위}
      </MDTypography>
    ),
    owner: (
      <Link
        to={`/dashboard/${player.player_id}?season=${encodeURIComponent(selectedSeason)}`}
        style={{ color: "inherit", textDecoration: "none" }}
      >
        <MDTypography variant="body2" color="text" fontWeight="medium" sx={{ cursor: "pointer" }}>
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
    growth: (
      <MDTypography variant="body2" color="text" fontWeight="medium">
        {Number(player["성장력"]) > 0 ? `+${player["성장력"]}` : player["성장력"] ?? "-"}
      </MDTypography>
    ),
    value: (
      <MDTypography variant="body2" color="text">
        {player["구단 가치"] ?? player.구단가치 ?? "-"}
      </MDTypography>
    ),
  }));

  return (
    <DashboardLayout>
      <DashboardNavbar pageTitle="시즌 순위표" />
      <MDBox pt={isMobile ? 4 : 6} pb={isMobile ? 2 : 3}>
        <MDBox mb={isMobile ? 2 : 4} display="flex" alignItems="center">
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

        <Grid container spacing={isMobile ? 0.75 : 3}>
          <Grid item xs={3} md={3}>
            <DefaultInfoCard
              icon="military_tech"
              title="채굴왕"
              description={newTableData.mining_king.구단주명 || "---"}
              value={newTableData.mining_king["지난 시즌 채굴 효율"] || "0"}
              compactMobile={isMobile}
            />
          </Grid>
          <Grid item xs={3} md={3}>
            <DefaultInfoCard
              icon="emoji_events"
              title="승률왕"
              description={newTableData.win_rate_king.구단주명 || "---"}
              value={newTableData.win_rate_king["지난 시즌 승률"] || "0%"}
              compactMobile={isMobile}
            />
          </Grid>
          <Grid item xs={3} md={3}>
            <DefaultInfoCard
              icon="casino"
              title="판수왕"
              description={newTableData.game_count_king.구단주명 || "---"}
              value={newTableData.game_count_king["지난 시즌 판수"] || "0"}
              compactMobile={isMobile}
            />
          </Grid>
          <Grid item xs={3} md={3}>
            <DefaultInfoCard
              icon="balance"
              title="승부왕"
              description={newTableData.draw_king.구단주명 || "---"}
              value={newTableData.draw_king["지난 시즌 무"] || "0"}
              compactMobile={isMobile}
            />
          </Grid>
        </Grid>

        <Grid container spacing={3} mt={isMobile ? 2 : 4}>
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
