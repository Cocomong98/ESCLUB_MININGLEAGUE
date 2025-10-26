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

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";

// Material Dashboard 2 React example components
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import DataTable from "examples/Tables/DataTable";

// Data
import authorsTableData from "layouts/tables/data/authorsTableData";

// Card
import DefaultInfoCard from "examples/Cards/InfoCards/DefaultInfoCard";

function Tables() {
  const { columns: pColumns, rows: pRows } = authorsTableData();

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const allColumns = [
    { Header: "순위", accessor: "rank", align: "center" },
    { Header: "구단주", accessor: "owner", width: "25%", align: "left" },
    { Header: "전적", accessor: "record", align: "center" },
    { Header: "승률", accessor: "win_rate", align: "center" },
    { Header: "판수", accessor: "games", align: "center" },
    { Header: "채굴 효율", accessor: "mining", align: "center" },
    { Header: "구단 가치", accessor: "value", align: "center" },
  ];

  const mobileColumns = allColumns.filter((column) =>
    ["rank", "owner", "mining"].includes(column.accessor)
  );

  const columns = isMobile ? mobileColumns : allColumns;

  const [newTableData, setNewTableData] = useState({
    results: [],
    mining_king: {},
    win_rate_king: {},
    game_count_king: {},
    draw_king: {},
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        // ✅ 수정된 부분: 현재 시간을 쿼리 스트링으로 추가
        const timestamp = new Date().getTime();
        const response = await fetch(`/data/current_crawl_display_data.json?t=${timestamp}`);
        const data = await response.json();
        setNewTableData(data);
      } catch (error) {
        console.error("Error fetching current_crawl_display_data:", error);
      }
    };
    fetchData();
  }, []); // 의존성 배열에 빈 배열을 유지하여 컴포넌트 마운트 시 한 번만 실행

  const rows = newTableData.results.map((player) => ({
    rank: (
      <MDTypography component="a" href="#" variant="body2" color="text" fontWeight="medium">
        {player.순위}
      </MDTypography>
    ),
    owner: (
      <Link to={`/dashboard/${player.player_id}`}>
        <MDTypography variant="body2" color="text" fontWeight="medium">
          {player.구단주명}
        </MDTypography>
      </Link>
    ),
    record: (
      <MDTypography component="a" href="#" variant="body2" color="text" fontWeight="medium">
        {player.승}승 {player.무}무 {player.패}패
      </MDTypography>
    ),
    win_rate: (
      <MDTypography component="a" href="#" variant="body2" color="text" fontWeight="medium">
        {player.승률}
      </MDTypography>
    ),
    games: (
      <MDTypography component="a" href="#" variant="body2" color="text" fontWeight="medium">
        {player.판수}
      </MDTypography>
    ),
    mining: (
      <MDTypography component="a" href="#" variant="body2" color="text" fontWeight="medium">
        {player["채굴 효율"]}
      </MDTypography>
    ),
    value: (
      <MDTypography component="a" href="#" variant="body2" color="text" fontWeight="medium">
        {player["구단 가치"]}
      </MDTypography>
    ),
  }));

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3}>
          <Grid item xs={3} md={3}>
            <DefaultInfoCard
              icon="military_tech"
              title="채굴왕"
              description={newTableData.mining_king.name}
              value={newTableData.mining_king["지난 시즌 채굴 효율"]}
            />
          </Grid>
          <Grid item xs={3} md={3}>
            <DefaultInfoCard
              icon="emoji_events"
              title="승률왕"
              description={newTableData.win_rate_king.name}
              value={newTableData.win_rate_king["지난 시즌 승률"]}
            />
          </Grid>
          <Grid item xs={3} md={3}>
            <DefaultInfoCard
              icon="casino"
              title="판수왕"
              description={newTableData.game_count_king.name}
              value={newTableData.game_count_king["지난 시즌 판수"]}
            />
          </Grid>
          <Grid item xs={3} md={3}>
            <DefaultInfoCard
              icon="balance"
              title="승부왕"
              description={newTableData.draw_king.name}
              value={newTableData.draw_king["지난 시즌 무"]}
            />
          </Grid>
        </Grid>
        {/* 현재 시즌 순위 */}
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
                  시즌 순위
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
                    데이터를 불러오는 중이거나 데이터가 없습니다.
                  </MDTypography>
                )}
              </MDBox>
            </Card>
          </Grid>
          {/* <Grid item xs={12}>
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
                  Projects Table
                </MDTypography>
              </MDBox>
              <MDBox pt={3}>
                <DataTable
                  table={{ columns: pColumns, rows: pRows }}
                  isSorted={false}
                  entriesPerPage={false}
                  showTotalEntries={false}
                  noEndBorder
                />
              </MDBox>
            </Card>
          </Grid> */}
        </Grid>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default Tables;
