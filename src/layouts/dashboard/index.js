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

// disable-eslint

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

// @mui material components
import Grid from "@mui/material/Grid";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";

// Material Dashboard 2 React example components
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import ReportsBarChart from "examples/Charts/BarCharts/ReportsBarChart";
import ReportsLineChart from "examples/Charts/LineCharts/ReportsLineChart";
import ComplexStatisticsCard from "examples/Cards/StatisticsCards/ComplexStatisticsCard";

// Data
import reportsLineChartData from "layouts/dashboard/data/reportsLineChartData";

function Dashboard() {
  const { id } = useParams();
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

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Helper function to get dates in 'YYMMDD' format
        // endDayOffset: 0이면 오늘까지, 1이면 어제까지 계산
        const generateRecentDates = (numDays, endDayOffset = 0) => {
          const dates = [];
          for (let i = 0; i < numDays; i++) {
            const d = new Date();
            // i와 offset을 모두 빼서 기준일을 조정합니다.
            d.setDate(d.getDate() - i - endDayOffset);
            const year = String(d.getFullYear()).slice(2);
            const month = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            // Add to the beginning to keep ascending order (18, 19, 20, 21, 22)
            dates.unshift(`${year}${month}${day}`);
          }
          return dates;
        };

        try {
          // --- 1. 최신 데이터가 22일이므로, 1일 오프셋을 주어 5일치 (251018 ~ 251022) 날짜만 생성하도록 수정 ---
          const recentDates = generateRecentDates(5, 1);

          const promises = recentDates.map((date) =>
            fetch(`/data/user/${id}/${id}_${date}.json`)
              .then((res) => {
                if (!res.ok) {
                  // 파일이 없으면 404가 발생하며, 이는 정상적인 '데이터 없음' 상황으로 처리
                  throw new Error(`HTTP error! status: ${res.status} for date ${date}`);
                }
                return res.json();
              })
              .then((data) => ({ date, data: data[0] })) // 데이터와 날짜를 함께 저장
              .catch((error) => {
                console.warn(`Could not fetch data for ${date}:`, error);
                // 데이터 로드 실패 시, 날짜는 유지하고 데이터는 null로 반환하여 차트에서 공백으로 처리
                return { date, data: null };
              })
          );

          // Promise.all을 사용하고, 실패한 항목은 { date, data: null }로 처리됨
          const fetchedDataWithNulls = await Promise.all(promises);

          // 유효한 데이터만 필터링 (카드 데이터 계산용)
          const validFetchedData = fetchedDataWithNulls.filter((item) => item.data);

          // --- 2. 카드 데이터 (가장 최신 유효한 데이터 사용) ---
          let latestData = null;
          let prevData = null;

          if (validFetchedData.length > 0) {
            // 가장 최신 데이터는 validFetchedData의 마지막 요소
            latestData = validFetchedData[validFetchedData.length - 1].data;
            if (validFetchedData.length > 1) {
              // 그 직전 데이터는 prevData
              prevData = validFetchedData[validFetchedData.length - 2].data;
            }
          }

          if (latestData) {
            setOwnerName(latestData.구단주명);

            const rankDiff = prevData ? prevData.순위 - latestData.순위 : 0;
            let rankPercentage;
            if (rankDiff > 0) {
              rankPercentage = { color: "success", amount: `+${rankDiff}`, label: "상승" };
            } else if (rankDiff < 0) {
              rankPercentage = { color: "error", amount: rankDiff, label: "하락" };
            } else {
              rankPercentage = { color: "info", amount: "-", label: "유지" };
            }

            const miningDiff = prevData ? latestData["채굴 효율"] - prevData["채굴 효율"] : 0;
            let miningPercentage;
            if (miningDiff > 0) {
              miningPercentage = { color: "success", amount: `+${miningDiff}`, label: "" };
            } else if (miningDiff < 0) {
              miningPercentage = { color: "error", amount: miningDiff, label: "" };
            } else {
              miningPercentage = { color: "info", amount: "0", label: "" };
            }

            const winRateDiff = prevData
              ? (parseFloat(latestData.승률) - parseFloat(prevData.승률)).toFixed(1)
              : 0;
            let winRatePercentage;
            if (winRateDiff > 0) {
              winRatePercentage = { color: "success", amount: `+${winRateDiff}%`, label: "" };
            } else if (winRateDiff < 0) {
              winRatePercentage = { color: "error", amount: `${winRateDiff}%`, label: "" };
            } else {
              winRatePercentage = { color: "info", amount: "0%", label: "" };
            }

            const gamesDiff = prevData ? latestData.판수 - prevData.판수 : 0;
            let gamesPercentage;
            if (gamesDiff > 0) {
              gamesPercentage = { color: "success", amount: `+${gamesDiff}`, label: "" };
            } else if (gamesDiff < 0) {
              gamesPercentage = { color: "error", amount: gamesDiff, label: "" };
            } else {
              gamesPercentage = { color: "info", amount: "0", label: "" };
            }

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
            // Set default card data if no data is available
            setOwnerName("데이터 없음");
            setCardData({
              rank: {
                title: "순위",
                count: 0,
                percentage: { color: "info", amount: "-", label: "데이터 없음" },
              },
              mining: {
                title: "채굴파워",
                count: 0,
                percentage: { color: "info", amount: "0", label: "데이터 없음" },
              },
              winRate: {
                title: "승률",
                count: "0%",
                percentage: { color: "info", amount: "0%", label: "데이터 없음" },
              },
              games: {
                title: "판수",
                count: 0,
                percentage: { color: "info", amount: "0", label: "데이터 없음" },
              },
            });
          }

          // --- 3. Chart Data (5일치 데이터 포인트를 유지하며 null 허용) ---
          const chartDates = fetchedDataWithNulls.map((item) => item.date);
          const chartLabels = chartDates.map((date) => `${date.slice(2, 4)}/${date.slice(4, 6)}`);

          // 랭크 차트 데이터: 데이터가 없으면 null 사용
          const rankDataPoints = fetchedDataWithNulls.map((item) =>
            item.data ? item.data.순위 : null
          );
          setRankChartData({
            labels: chartLabels,
            datasets: { label: "순위", data: rankDataPoints },
          });

          // 채굴량 차트 데이터: 일일 증가량 계산
          const miningDataPoints = [];
          for (let i = 1; i < fetchedDataWithNulls.length; i++) {
            const currentItem = fetchedDataWithNulls[i];
            const prevItem = fetchedDataWithNulls[i - 1];

            if (currentItem.data && prevItem.data) {
              const diff = currentItem.data["채굴 효율"] - prevItem.data["채굴 효율"];
              miningDataPoints.push(diff);
            } else {
              miningDataPoints.push(null); // 데이터가 부족하면 null 처리
            }
          }
          // 채굴 차트의 레이블은 항상 데이터 포인트보다 1개 적음 (증가량은 두 날짜 사이의 값)
          const miningChartLabels = chartLabels.slice(1);

          setMiningChartData({
            labels: miningChartLabels,
            datasets: { label: "일일 채굴량", data: miningDataPoints },
          });

          // 승률 차트 데이터: 데이터가 없으면 null 사용
          const winRateDataPoints = fetchedDataWithNulls.map((item) =>
            item.data ? parseFloat(item.data.승률.replace("%", "")) : null
          );
          setWinRateChartData({
            labels: chartLabels,
            datasets: { label: "승률", data: winRateDataPoints },
          });

          const cleanWinRateData = winRateDataPoints.filter((point) => point !== null);
          if (cleanWinRateData.length > 0) {
            const minWinRate = Math.min(...cleanWinRateData);
            const maxWinRate = Math.max(...cleanWinRateData);

            setWinRateYAxis({
              min: minWinRate - 0.3,
              max: maxWinRate + 0.3,
              ticks: { display: false },
              grid: { display: false },
            });
          }
        } catch (error) {
          // 👈 내부 fetch 로직 try/catch
          console.error("Error fetching date specific data:", error);
          // 데이터가 없는 경우를 이미 처리했으므로, 여기서는 예상치 못한 오류만 로깅
        }
      } catch (globalError) {
        // 👈 전역 try/catch
        console.error("Global error during data fetch process:", globalError);
      }
    };

    fetchData();
  }, [id]);

  const { tasks } = reportsLineChartData;

  return (
    <DashboardLayout>
      <DashboardNavbar pageTitle={ownerName} />
      <MDBox py={3}>
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
          <Grid container spacing={3}>
            <Grid item xs={12} md={6} lg={4}>
              <MDBox mb={3}>
                <ReportsLineChart
                  color="dark"
                  title="순위 변동"
                  description={
                    <>
                      (<strong>{cardData.rank.percentage.amount}</strong>)
                      {cardData.rank.percentage.label}
                    </>
                  }
                  date="updated 4 min ago"
                  chart={rankChartData}
                  yAxis={{
                    min: -1,
                    max: 40,
                    reverse: true,
                    ticks: {
                      stepSize: 10,
                      color: "#ffffff",
                      callback: function (value) {
                        if (value === 0 || value === -1) {
                          return undefined;
                        }
                        return value;
                      },
                    },
                  }}
                />
              </MDBox>
            </Grid>
            <Grid item xs={12} md={6} lg={4}>
              <MDBox mb={3}>
                <ReportsBarChart
                  color="info"
                  title="채굴 성장력"
                  description="일일 채굴 효율 증가량"
                  date="last 5 days"
                  chart={miningChartData}
                  yAxis={{ max: 500, ticks: { stepSize: 100, color: "#ffffff" } }}
                />
              </MDBox>
            </Grid>
            <Grid item xs={12} md={6} lg={4}>
              <MDBox mb={3}>
                <ReportsLineChart
                  color="success"
                  title="승률 변동"
                  description="지난 5일간의 승률 변동 추이"
                  date="just updated"
                  chart={winRateChartData}
                  yAxis={winRateYAxis}
                />
              </MDBox>
            </Grid>
          </Grid>
        </MDBox>
        {/* <MDBox>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6} lg={8}>
              <Projects />
            </Grid>
            <Grid item xs={12} md={6} lg={4}>
              <OrdersOverview />
            </Grid>
          </Grid>
        </MDBox> */}
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default Dashboard;
