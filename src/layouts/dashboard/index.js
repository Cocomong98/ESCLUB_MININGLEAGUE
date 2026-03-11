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

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";

// @mui material components
import Grid from "@mui/material/Grid";
import { Select, MenuItem } from "@mui/material";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDTypography from "components/MDTypography";

// Material Dashboard 2 React example components
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import ReportsBarChart from "examples/Charts/BarCharts/ReportsBarChart";
import ReportsLineChart from "examples/Charts/LineCharts/ReportsLineChart";
import ComplexStatisticsCard from "examples/Cards/StatisticsCards/ComplexStatisticsCard";
import { fetchSeasonsWithData } from "utils/seasonUtils";

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

function Dashboard() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState("");
  const [currentSeason, setCurrentSeason] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [cardData, setCardData] = useState({
    rank: { title: "순위", count: 0, percentage: { color: "", amount: "", label: "" } },
    mining: { title: "채굴파워", count: 0, percentage: { color: "", amount: "", label: "" } },
    winRate: { title: "승률", count: "0%", percentage: { color: "", amount: "", label: "" } },
    games: { title: "판수", count: 0, percentage: { color: "", amount: "", label: "" } },
  });
  const [rankChartData, setRankChartData] = useState({ labels: [], datasets: { data: [] } });
  const [miningChartData, setMiningChartData] = useState({ labels: [], datasets: { data: [] } });
  const [winRateChartData, setWinRateChartData] = useState({ labels: [], datasets: { data: [] } });
  const [winRateYAxis, setWinRateYAxis] = useState({});

  // 시즌 정보 불러오기
  useEffect(() => {
    fetchSeasonsWithData()
      .then(({ seasons: availableSeasons, latestSeason, currentSeason: seasonInProgress }) => {
        setSeasons(availableSeasons);
        const seasonFromQuery = searchParams.get("season");
        const preferredSeason =
          seasonFromQuery && availableSeasons.includes(seasonFromQuery)
            ? seasonFromQuery
            : latestSeason;
        setSelectedSeason(preferredSeason);
        setCurrentSeason(seasonInProgress);
      })
      .catch((error) => {
        console.error("Could not fetch season config:", error);
      });
  }, [searchParams]);

  const generateRecentDates = (numDays, endDayOffset = 0) => {
    const dates = [];
    for (let i = 0; i < numDays; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i - endDayOffset);
      const year = String(d.getFullYear()).slice(2);
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      dates.unshift(`${year}${month}${day}`);
    }
    return dates;
  };

  const generateDatesFromEndDate = (endDate, numDays) => {
    const dates = [];
    const endYear = parseInt(endDate.slice(0, 2), 10) + 2000;
    const endMonth = parseInt(endDate.slice(2, 4), 10) - 1;
    const endDay = parseInt(endDate.slice(4, 6), 10);

    for (let i = 0; i < numDays; i++) {
      const d = new Date(endYear, endMonth, endDay);
      d.setDate(d.getDate() - i);
      const year = String(d.getFullYear()).slice(2);
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      dates.unshift(`${year}${month}${day}`);
    }
    return dates;
  };

  const fetchChartData = useCallback(
    async (dates, season) => {
      try {
        const promises = dates.map((date) =>
          fetch(`/data/${season}/user/${id}/${id}_${date}.json`)
            .then((res) => {
              if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
              return res.json();
            })
            .then((data) => ({ date, data: data[0] }))
            .catch(() => ({ date, data: null }))
        );

        const fetchedDataWithNulls = await Promise.all(promises);
        const validFetchedData = fetchedDataWithNulls.filter((item) => item.data);

        let latestData = null;
        let prevData = null;

        if (validFetchedData.length > 0) {
          latestData = validFetchedData[validFetchedData.length - 1].data;
          if (validFetchedData.length > 1) {
            prevData = validFetchedData[validFetchedData.length - 2].data;
          }
        }

        if (latestData) {
          setOwnerName(latestData.구단주명);
          const rankDiff = prevData ? prevData.순위 - latestData.순위 : 0;
          let rankPercentage = { color: "info", amount: "-", label: "유지" };
          if (rankDiff > 0)
            rankPercentage = { color: "success", amount: `+${rankDiff}`, label: "상승" };
          else if (rankDiff < 0)
            rankPercentage = { color: "error", amount: rankDiff, label: "하락" };

          const miningDiff = prevData ? latestData["채굴 효율"] - prevData["채굴 효율"] : 0;
          let miningPercentage = { color: "info", amount: "0", label: "" };
          if (miningDiff > 0)
            miningPercentage = { color: "success", amount: `+${miningDiff}`, label: "" };
          else if (miningDiff < 0)
            miningPercentage = { color: "error", amount: miningDiff, label: "" };

          const winRateDiff = prevData
            ? (parseFloat(latestData.승률) - parseFloat(prevData.승률)).toFixed(1)
            : 0;
          let winRatePercentage = { color: "info", amount: "0%", label: "" };
          if (winRateDiff > 0)
            winRatePercentage = { color: "success", amount: `+${winRateDiff}%`, label: "" };
          else if (winRateDiff < 0)
            winRatePercentage = { color: "error", amount: `${winRateDiff}%`, label: "" };

          const gamesDiff = prevData ? latestData.판수 - prevData.판수 : 0;
          let gamesPercentage = { color: "info", amount: "0", label: "" };
          if (gamesDiff > 0)
            gamesPercentage = { color: "success", amount: `+${gamesDiff}`, label: "" };
          else if (gamesDiff < 0)
            gamesPercentage = { color: "error", amount: gamesDiff, label: "" };

          setCardData({
            rank: { title: "순위", count: latestData.순위, percentage: rankPercentage },
            mining: {
              title: "채굴파워",
              count: latestData["채굴 효율"],
              percentage: miningPercentage,
            },
            winRate: { title: "승률", count: latestData.승률, percentage: winRatePercentage },
            games: { title: "판수", count: latestData.판수, percentage: gamesPercentage },
          });
        } else {
          setOwnerName("데이터 없음");
        }

        const chartLabels = fetchedDataWithNulls.map(
          (item) => `${item.date.slice(2, 4)}/${item.date.slice(4, 6)}`
        );
        setRankChartData({
          labels: chartLabels,
          datasets: {
            label: "순위",
            data: fetchedDataWithNulls.map((item) => (item.data ? item.data.순위 : null)),
          },
        });

        const miningDataPoints = [];
        for (let i = 1; i < fetchedDataWithNulls.length; i++) {
          if (fetchedDataWithNulls[i].data && fetchedDataWithNulls[i - 1].data) {
            miningDataPoints.push(
              fetchedDataWithNulls[i].data["채굴 효율"] -
                fetchedDataWithNulls[i - 1].data["채굴 효율"]
            );
          } else miningDataPoints.push(null);
        }
        setMiningChartData({
          labels: chartLabels.slice(1),
          datasets: { label: "일일 채굴량", data: miningDataPoints },
        });

        const winRateDataPoints = fetchedDataWithNulls.map((item) =>
          item.data ? parseFloat(item.data.승률.replace("%", "")) : null
        );
        setWinRateChartData({
          labels: chartLabels,
          datasets: { label: "승률", data: winRateDataPoints },
        });

        const cleanWinRateData = winRateDataPoints.filter((point) => point !== null);
        if (cleanWinRateData.length > 0) {
          setWinRateYAxis({
            min: Math.min(...cleanWinRateData) - 0.3,
            max: Math.max(...cleanWinRateData) + 0.3,
            ticks: { display: false },
            grid: { display: false },
          });
        }
      } catch (error) {
        console.error("Error fetching date specific data:", error);
      }
    },
    [id]
  );

  useEffect(() => {
    if (!selectedSeason || !id) return;

    const loadData = async () => {
      try {
        const isCurrentSeason = selectedSeason === currentSeason;
        let dates = generateRecentDates(5, 0);

        if (!isCurrentSeason) {
          const manifestRes = await fetch(`/data/${selectedSeason}/manifest.json`);
          const manifest = manifestRes.ok ? await manifestRes.json() : {};
          if (manifest && manifest.endDate) {
            dates = generateDatesFromEndDate(manifest.endDate, 5);
          }
        }

        fetchChartData(dates, selectedSeason);
      } catch (e) {
        console.error("Failed to load season data", e);
      }
    };
    loadData();
  }, [id, selectedSeason, currentSeason, fetchChartData]);

  return (
    <DashboardLayout>
      <DashboardNavbar pageTitle={ownerName} />
      <MDBox py={3}>
        <MDBox mb={3} display="flex" justifyContent="space-between" alignItems="center" gap={1.5}>
          <Select value={selectedSeason} onChange={(e) => setSelectedSeason(e.target.value)}>
            {seasons.map((season) => (
              <MenuItem key={season} value={season}>
                {season} 시즌
              </MenuItem>
            ))}
          </Select>
          <MDBox display="flex" gap={1}>
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
              세부 분석 보기
            </MDButton>
            */}
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
              스쿼드 분석 보기
            </MDButton>
          </MDBox>
        </MDBox>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6} lg={3}>
            <MDBox mb={1.5}>
              <ComplexStatisticsCard
                color="dark"
                icon="emoji_events"
                title={cardData.rank.title}
                count={cardData.rank.count}
                percentage={cardData.rank.percentage}
              />
            </MDBox>
          </Grid>
          <Grid item xs={12} md={6} lg={3}>
            <MDBox mb={1.5}>
              <ComplexStatisticsCard
                icon="bolt"
                title={cardData.mining.title}
                count={cardData.mining.count}
                percentage={cardData.mining.percentage}
              />
            </MDBox>
          </Grid>
          <Grid item xs={12} md={6} lg={3}>
            <MDBox mb={1.5}>
              <ComplexStatisticsCard
                color="success"
                icon="percent"
                title={cardData.winRate.title}
                count={cardData.winRate.count}
                percentage={cardData.winRate.percentage}
              />
            </MDBox>
          </Grid>
          <Grid item xs={12} md={6} lg={3}>
            <MDBox mb={1.5}>
              <ComplexStatisticsCard
                color="primary"
                icon="sports_esports"
                title={cardData.games.title}
                count={cardData.games.count}
                percentage={cardData.games.percentage}
              />
            </MDBox>
          </Grid>
        </Grid>
        <MDBox mt={4.5}>
          <Grid container spacing={{ xs: 4, md: 3 }}>
            <Grid item xs={12} md={6} lg={4}>
              <ReportsLineChart
                color="dark"
                title="순위 변동"
                description={
                  <>
                    (<strong>{cardData.rank.percentage.amount}</strong>)
                    {cardData.rank.percentage.label}
                  </>
                }
                date="updated just now"
                chart={rankChartData}
                yAxis={{
                  min: -1,
                  max: 40,
                  reverse: true,
                  ticks: { stepSize: 10, color: "#ffffff" },
                }}
              />
            </Grid>
            <Grid item xs={12} md={6} lg={4}>
              <ReportsBarChart
                color="info"
                title="채굴 성장력"
                description="일일 채굴 효율 증가량"
                date="last 5 days"
                chart={miningChartData}
                yAxis={{ max: 500, ticks: { stepSize: 100, color: "#ffffff" } }}
              />
            </Grid>
            <Grid item xs={12} md={6} lg={4}>
              <ReportsLineChart
                color="success"
                title="승률 변동"
                description="지난 5일간의 승률 변동 추이"
                date="just updated"
                chart={winRateChartData}
                yAxis={winRateYAxis}
              />
            </Grid>
          </Grid>
        </MDBox>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default Dashboard;
