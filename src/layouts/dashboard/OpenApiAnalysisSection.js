import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import Divider from "@mui/material/Divider";
import Tooltip from "@mui/material/Tooltip";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip as ChartTooltip,
  Legend,
  Filler,
} from "chart.js";
import { Bar, Line, Pie, Scatter } from "react-chartjs-2";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import ComplexStatisticsCard from "examples/Cards/StatisticsCards/ComplexStatisticsCard";
// import DataTable from "examples/Tables/DataTable";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  ChartTooltip,
  Legend,
  Filler
);

const GOAL_TIME_BINS = [
  "0-15",
  "16-30",
  "31-45",
  "46-60",
  "61-75",
  "76-90",
  "91-105",
  "106-120",
  "120+",
];

const ADVANCED_METRIC_DESCRIPTIONS = {
  "선제골 후 승리율": "선제 득점한 경기에서 최종 승리한 비율",
  "역전 회복력": "선제 실점 경기에서 만회한 승점 효율",
  "리드 지키기": "리드한 경기에서 실점이 발생한 비율 (대체 정의)",
  "강팀 상대 효율": "상위 상대 구간 기준 승점 획득 효율",
  "공격 템포": "전방 패스 비율과 분당 패스 수를 결합한 지표",
  "빌드업 실수율": "전체 패스 시도 대비 실패 비율 (대체 정의)",
  "측면 의존도(슈팅)": "전체 슈팅 중 측면 발생 슈팅 비율",
  "측면 의존도(도움 기점)": "도움 위치 기준 측면 기점 비율",
  "중앙 침투 수율": "중앙 침투 시도 대비 중앙 득점 비율",
  "득점 루트 집중도": "최다 득점 루트 횟수 / 전체 득점 수",
  "볼 회수 우위": "상대 패스 대비 회수 (인터셉트 / 태클 / 차단) 밀도",
  "후반 실점 비중": "전체 실점 중 80분 이후 실점 비율",
  "선방 기여율": "피유효슈팅 대비 세이브 비율",
  "2실점+ 빈도": "2실점 이상 경기 비율",
};

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePercent(value) {
  const n = toNumber(value, 0);
  return n <= 1 ? n * 100 : n;
}

function formatPercent(value, digits = 1) {
  return `${normalizePercent(value).toFixed(digits)}%`;
}

function formatPercentOrDash(value, digits = 1) {
  if (value === null || value === undefined || value === "") return "-";
  return formatPercent(value, digits);
}

function formatFixed(value, digits = 2) {
  return toNumber(value, 0).toFixed(digits);
}

function clamp01(value) {
  const n = toNumber(value, 0);
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function formatGeneratedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR");
}

function matchLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(
    2,
    "0"
  )}`;
}

function normalizeMatchIdentity(row) {
  const item = row && typeof row === "object" ? row : {};
  const matchKey =
    typeof item.matchKey === "string" && item.matchKey
      ? item.matchKey
      : typeof item.matchId === "string"
      ? item.matchId
      : "";
  return { ...item, matchKey };
}

function OpenApiAnalysisSection({ season, playerId }) {
  const [state, setState] = useState({
    status: "idle",
    last200: null,
    shotEvents: null,
    playerUsage: null,
  });

  useEffect(() => {
    if (!season || !playerId) {
      setState({ status: "hidden", last200: null, shotEvents: null, playerUsage: null });
      return;
    }

    let cancelled = false;

    const load = async () => {
      setState((prev) => ({
        ...prev,
        status: "loading",
      }));

      const base = `/data/${season}/user/${playerId}/analysis`;
      const urls = {
        last200: `${base}/last200.json`,
        shotEvents: `${base}/shot_events_last200.json`,
        playerUsage: `${base}/player_usage_last200.json`,
      };

      const fetchJson = async (url) => {
        const response = await fetch(url);
        if (response.status === 404) return { status: "not_found" };
        if (!response.ok) throw new Error(`${url} ${response.status}`);
        const data = await response.json();
        return { status: "ok", data };
      };

      try {
        const [last200Res, shotEventsRes, playerUsageRes] = await Promise.all([
          fetchJson(urls.last200),
          fetchJson(urls.shotEvents),
          fetchJson(urls.playerUsage),
        ]);

        if (cancelled) return;

        if (
          last200Res.status === "not_found" ||
          shotEventsRes.status === "not_found" ||
          playerUsageRes.status === "not_found"
        ) {
          setState({
            status: "pending",
            last200: null,
            shotEvents: null,
            playerUsage: null,
          });
          return;
        }

        setState({
          status: "ready",
          last200: last200Res.data,
          shotEvents: shotEventsRes.data,
          playerUsage: playerUsageRes.data,
        });
      } catch (error) {
        if (cancelled) return;
        console.error("Open API analysis fetch failed:", error);
        setState({
          status: "hidden",
          last200: null,
          shotEvents: null,
          playerUsage: null,
        });
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [season, playerId]);

  const last200 = state.last200 || {};
  const shotEventsPayload = state.shotEvents || {};
  // const playerUsagePayload = state.playerUsage || {};
  const kpi = last200.kpi || {};
  const behavior = last200.behavior || {};
  const distributions = last200.distributions || {};
  const advanced = last200.advanced || {};
  const advancedStandard = last200.advancedStandard || {};
  const recentMatches = Array.isArray(last200.recentMatches)
    ? last200.recentMatches.map((row) => normalizeMatchIdentity(row))
    : [];
  const shotEvents = Array.isArray(shotEventsPayload.events)
    ? shotEventsPayload.events.map((row) => normalizeMatchIdentity(row))
    : [];
  // const topAppearance = Array.isArray(playerUsagePayload.topAppearance)
  //   ? playerUsagePayload.topAppearance
  //   : [];

  const goalTimeChart = useMemo(() => {
    const forRows = Array.isArray(distributions.goalTimeFor) ? distributions.goalTimeFor : [];
    const againstRows = Array.isArray(distributions.goalTimeAgainst)
      ? distributions.goalTimeAgainst
      : [];
    const forMap = new Map(forRows.map((row) => [String(row.bin), toNumber(row.count, 0)]));
    const againstMap = new Map(againstRows.map((row) => [String(row.bin), toNumber(row.count, 0)]));

    return {
      data: {
        labels: GOAL_TIME_BINS,
        datasets: [
          {
            label: "득점",
            data: GOAL_TIME_BINS.map((bin) => forMap.get(bin) || 0),
            backgroundColor: "rgba(76, 175, 80, 0.85)",
          },
          {
            label: "실점",
            data: GOAL_TIME_BINS.map((bin) => againstMap.get(bin) || 0),
            backgroundColor: "rgba(244, 67, 54, 0.85)",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top" },
        },
      },
    };
  }, [distributions.goalTimeAgainst, distributions.goalTimeFor]);

  const shotTypeChart = useMemo(() => {
    const rows = Array.isArray(distributions.shotType) ? distributions.shotType : [];
    const labels = rows.map((row) => String(row.name || row.type || "-"));
    const values = rows.map((row) => toNumber(row.count, 0));
    const colors = [
      "#1A73E8",
      "#43A047",
      "#F57C00",
      "#8E24AA",
      "#00ACC1",
      "#E53935",
      "#7CB342",
      "#5E35B1",
    ];
    return {
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: labels.map((_, idx) => colors[idx % colors.length]),
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
        },
      },
    };
  }, [distributions.shotType]);

  const shotMapChart = useMemo(() => {
    const myPoints = [];
    const oppPoints = [];
    shotEvents.forEach((event) => {
      const point = { x: clamp01(event.x), y: clamp01(event.y) };
      if (event.isMyShot) myPoints.push(point);
      else oppPoints.push(point);
    });
    return {
      data: {
        datasets: [
          {
            label: "내 슈팅",
            data: myPoints,
            backgroundColor: "rgba(33, 150, 243, 0.85)",
            pointRadius: 4,
          },
          {
            label: "상대 슈팅",
            data: oppPoints,
            backgroundColor: "rgba(239, 83, 80, 0.7)",
            pointRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            min: 0,
            max: 1,
          },
          y: {
            min: 0,
            max: 1,
          },
        },
        plugins: {
          legend: { position: "top" },
        },
      },
    };
  }, [shotEvents]);

  const trendChart = useMemo(() => {
    const labels = recentMatches.map((match) => matchLabel(match.dateKst));
    const gf = recentMatches.map((match) => toNumber(match.gf, 0));
    const ga = recentMatches.map((match) => toNumber(match.ga, 0));
    const passAcc = recentMatches.map((match) => normalizePercent(match.passAcc));
    const possession = recentMatches.map((match) => normalizePercent(match.possession));

    return {
      data: {
        labels,
        datasets: [
          {
            label: "득점",
            data: gf,
            borderColor: "#43A047",
            backgroundColor: "rgba(67, 160, 71, 0.2)",
            yAxisID: "y",
            tension: 0.35,
          },
          {
            label: "실점",
            data: ga,
            borderColor: "#E53935",
            backgroundColor: "rgba(229, 57, 53, 0.2)",
            yAxisID: "y",
            tension: 0.35,
          },
          {
            label: "패스 성공률(%)",
            data: passAcc,
            borderColor: "#1E88E5",
            backgroundColor: "rgba(30, 136, 229, 0.2)",
            yAxisID: "y1",
            tension: 0.35,
          },
          {
            label: "점유율(%)",
            data: possession,
            borderColor: "#FB8C00",
            backgroundColor: "rgba(251, 140, 0, 0.2)",
            yAxisID: "y1",
            tension: 0.35,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        scales: {
          y: {
            type: "linear",
            position: "left",
            beginAtZero: true,
          },
          y1: {
            type: "linear",
            position: "right",
            min: 0,
            max: 100,
            grid: {
              drawOnChartArea: false,
            },
          },
        },
      },
    };
  }, [recentMatches]);

  // const usageTable = useMemo(
  //   () => ({
  //     columns: [
  //       { Header: "선수", accessor: "name", align: "left" },
  //       { Header: "출전", accessor: "appearances", align: "center" },
  //       { Header: "평점", accessor: "rating", align: "center" },
  //       { Header: "주포지션", accessor: "position", align: "center" },
  //     ],
  //     rows: topAppearance.map((row) => ({
  //       name: (
  //         <MDTypography variant="caption" fontWeight="medium" color="text">
  //           {row.name || `SPID ${row.spId}`}
  //         </MDTypography>
  //       ),
  //       appearances: (
  //         <MDTypography variant="caption" color="text">
  //           {toNumber(row.appearanceCount, 0)}
  //         </MDTypography>
  //       ),
  //       rating: (
  //         <MDTypography variant="caption" color="text">
  //           {row.avgRating === null || row.avgRating === undefined
  //             ? "-"
  //             : formatFixed(row.avgRating, 2)}
  //         </MDTypography>
  //       ),
  //       position: (
  //         <MDTypography variant="caption" color="text">
  //           {row.primaryPositionName || row.primaryPosition || "-"}
  //         </MDTypography>
  //       ),
  //     })),
  //   }),
  //   [topAppearance]
  // );

  const advancedMetricGroups = useMemo(() => {
    const opening = advancedStandard.openingGoalConversion || {};
    const resilience = advancedStandard.resilienceFactor || {};
    const leadErosion = advancedStandard.leadErosionRate || {};
    const elite = advancedStandard.eliteOpponentEfficiency || {};
    const transition = advancedStandard.transitionVelocity || {};
    const phase1 = advancedStandard.phase1TurnoverRate || {};
    const flank = advancedStandard.flankReliance || {};
    const vertical = advancedStandard.verticalPenetrationYield || {};
    const concentration = advancedStandard.scoringRouteConcentration || {};
    const looseBall = advancedStandard.looseBallDominance || {};
    const lateConcession = advancedStandard.lateConcessionShare || {};
    const shotStopping = advancedStandard.shotStoppingImpact || {};
    const leakage = advancedStandard.highLeakageFrequency || {};

    return [
      {
        key: "game-management",
        title: "경기 흐름",
        items: [
          {
            label: "선제골 후 승리율",
            value: formatPercentOrDash(opening.value ?? advanced.firstGoalWinRate, 1),
            method: opening.method || "exact",
          },
          {
            label: "역전 회복력",
            value: formatPercentOrDash(resilience.value ?? advanced.comebackWinRate, 1),
            method: resilience.method || "exact",
          },
          {
            label: "리드 지키기",
            value: formatPercentOrDash(leadErosion.value ?? advanced.concedeWhileLeadingRate, 1),
            method: leadErosion.method || "proxy",
          },
          {
            label: "강팀 상대 효율",
            value: formatPercentOrDash(
              elite.value !== undefined ? elite.value : advanced.highPerformanceIndex?.value,
              1
            ),
            method: elite.method || "proxy",
          },
        ],
      },
      {
        key: "offensive-tactics",
        title: "공격 패턴",
        items: [
          {
            label: "공격 템포",
            value:
              transition.value !== undefined
                ? formatFixed(transition.value, 3)
                : advanced.tempo?.passesPerMinute !== undefined
                ? formatFixed(advanced.tempo?.passesPerMinute, 3)
                : "-",
            method: transition.method || "proxy",
          },
          {
            label: "빌드업 실수율",
            value: formatPercentOrDash(phase1.value ?? advanced.buildUpBreakRate, 1),
            method: phase1.method || "proxy",
          },
          {
            label: "측면 의존도(슈팅)",
            value: formatPercentOrDash(flank.shotsBased ?? advanced.flankRelianceShots, 1),
            method: flank.method || "proxy",
          },
          {
            label: "측면 의존도(도움 기점)",
            value: formatPercentOrDash(
              flank.assistOriginBased ?? advanced.flankRelianceAssistOrigin,
              1
            ),
            method: flank.method || "proxy",
          },
          {
            label: "중앙 침투 수율",
            value: formatPercentOrDash(vertical.value ?? advanced.centralPenetrationEfficiency, 1),
            method: vertical.method || "proxy",
          },
          {
            label: "득점 루트 집중도",
            value: formatPercentOrDash(
              concentration.value !== undefined
                ? concentration.value
                : advanced.scoringRouteConcentration !== undefined
                ? advanced.scoringRouteConcentration
                : undefined,
              1
            ),
            method: concentration.method || "exact",
          },
        ],
      },
      {
        key: "defensive-solidity",
        title: "수비 패턴",
        items: [
          {
            label: "볼 회수 우위",
            value: formatPercentOrDash(
              looseBall.value !== undefined ? looseBall.value : advanced.recoveryIntensity?.value,
              1
            ),
            method: looseBall.method || "proxy",
          },
          {
            label: "후반 실점 비중",
            value: formatPercentOrDash(
              lateConcession.value !== undefined
                ? lateConcession.value
                : advanced.lateFocusCoefficient?.lateConcedeShare,
              1
            ),
            method: lateConcession.method || "exact",
          },
          {
            label: "선방 기여율",
            value: formatPercentOrDash(shotStopping.value ?? advanced.gkDependencyRate, 1),
            method: shotStopping.method || "exact",
          },
          {
            label: "2실점+ 빈도",
            value: formatPercentOrDash(leakage.value ?? advanced.concedeTwoPlusRate, 1),
            method: leakage.method || "exact",
          },
        ],
      },
    ];
  }, [advanced, advancedStandard]);

  if (state.status === "hidden" || state.status === "idle") return null;

  if (state.status === "loading") {
    return (
      <Card>
        <MDBox p={3}>
          <MDTypography variant="h6">감독모드 경기 인사이트</MDTypography>
          <MDTypography variant="button" color="text">
            분석 데이터를 불러오는 중...
          </MDTypography>
        </MDBox>
      </Card>
    );
  }

  if (state.status === "pending") {
    return (
      <Card>
        <MDBox p={3}>
          <MDTypography variant="h6">감독모드 경기 인사이트</MDTypography>
          <MDTypography variant="button" color="text">
            분석 데이터 준비 중
          </MDTypography>
        </MDBox>
      </Card>
    );
  }

  return (
    <MDBox mt={5}>
      <MDBox mb={3}>
        <MDTypography variant="h6">감독모드 경기 인사이트</MDTypography>
        <MDTypography variant="button" color="text">
          데이터 생성 시각: {formatGeneratedAt(last200.generatedAt)}
        </MDTypography>
      </MDBox>

      <Grid container spacing={3}>
        {/* 요청 반영: 승률/평균 득실점 카드 임시 비노출 */}
        {/*
        <Grid item xs={12} md={6} lg={4}>
          <ComplexStatisticsCard
            color="success"
            icon="query_stats"
            title="승률"
            count={formatPercent(kpi.winRate, 1)}
            percentage={{
              color: "info",
              amount: `${toNumber(kpi.w, 0)}승`,
              label: `${toNumber(kpi.d, 0)}무 ${toNumber(kpi.l, 0)}패`,
            }}
          />
        </Grid>
        <Grid item xs={12} md={6} lg={4}>
          <ComplexStatisticsCard
            color="info"
            icon="sports_score"
            title="평균 득실점"
            count={`${formatFixed(kpi.avgGoalsFor, 2)} / ${formatFixed(kpi.avgGoalsAgainst, 2)}`}
            percentage={{ color: "info", amount: "득점/실점", label: "최근 분석 경기 기준" }}
          />
        </Grid>
        */}
        <Grid item xs={12} md={6} lg={4}>
          <ComplexStatisticsCard
            color="warning"
            icon="military_tech"
            title="선제골률"
            count={formatPercent(behavior.firstGoalRate, 1)}
            percentage={{
              color: "info",
              amount: "실점 선제율",
              label: formatPercent(behavior.concedeFirstRate, 1),
            }}
          />
        </Grid>
        <Grid item xs={12} md={6} lg={4}>
          <ComplexStatisticsCard
            color="primary"
            icon="sync_alt"
            title="패스 성공률"
            count={formatPercent(kpi.avgPassAcc, 1)}
            percentage={{ color: "info", amount: "최근 N경기", label: "평균" }}
          />
        </Grid>
        <Grid item xs={12} md={6} lg={4}>
          <ComplexStatisticsCard
            color="dark"
            icon="security"
            title="태클 성공률"
            count={formatPercent(kpi.avgTackleAcc, 1)}
            percentage={{ color: "info", amount: "최근 N경기", label: "평균" }}
          />
        </Grid>
      </Grid>

      <MDBox mt={4}>
        <Card>
          <MDBox p={2}>
            <MDTypography variant="h6">지표 한눈에</MDTypography>
          </MDBox>
          <Divider />
          <MDBox p={2}>
            {advancedMetricGroups.map((group, idx) => (
              <MDBox key={group.key} mt={idx === 0 ? 0 : 3}>
                <MDTypography variant="button" color="text" fontWeight="bold" sx={{ mb: 1.5 }}>
                  {group.title}
                </MDTypography>
                <Grid container spacing={2}>
                  {group.items.map((row) => (
                    <Grid item xs={12} sm={6} md={4} lg={3} key={`${group.key}-${row.label}`}>
                      <MDBox
                        p={1.5}
                        sx={({ borders: { borderRadius }, palette: { grey } }) => ({
                          border: `1px solid ${grey[300]}`,
                          borderRadius: borderRadius.lg,
                          minHeight: "94px",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                        })}
                      >
                        {ADVANCED_METRIC_DESCRIPTIONS[row.label] ? (
                          <Tooltip
                            title={ADVANCED_METRIC_DESCRIPTIONS[row.label]}
                            arrow
                            placement="top"
                          >
                            <MDTypography
                              variant="button"
                              color="text"
                              fontWeight="regular"
                              sx={{
                                textDecoration: "underline dotted",
                                textUnderlineOffset: "2px",
                                cursor: "help",
                                display: "inline-block",
                              }}
                            >
                              {row.label}
                            </MDTypography>
                          </Tooltip>
                        ) : (
                          <MDTypography variant="button" color="text" fontWeight="regular">
                            {row.label}
                          </MDTypography>
                        )}
                        <MDTypography variant="h6" color="dark">
                          {row.value}
                        </MDTypography>
                      </MDBox>
                    </Grid>
                  ))}
                </Grid>
              </MDBox>
            ))}
          </MDBox>
        </Card>
      </MDBox>

      <MDBox mt={4}>
        <Grid container spacing={3}>
          <Grid item xs={12} lg={6}>
            <Card sx={{ height: "100%" }}>
              <MDBox p={2}>
                <MDTypography variant="h6">골 시간대 분포</MDTypography>
                <MDTypography variant="button" color="text">
                  득점 vs 실점
                </MDTypography>
                <MDBox mt={2} height="18rem">
                  <Bar data={goalTimeChart.data} options={goalTimeChart.options} />
                </MDBox>
              </MDBox>
            </Card>
          </Grid>
          <Grid item xs={12} lg={6}>
            <Card sx={{ height: "100%" }}>
              <MDBox p={2}>
                <MDTypography variant="h6">슈팅 타입 분포</MDTypography>
                <MDTypography variant="button" color="text">
                  분석 데이터 기준
                </MDTypography>
                <MDBox mt={2} height="18rem">
                  <Pie data={shotTypeChart.data} options={shotTypeChart.options} />
                </MDBox>
              </MDBox>
            </Card>
          </Grid>
          <Grid item xs={12} lg={6}>
            <Card sx={{ height: "100%" }}>
              <MDBox p={2}>
                <MDTypography variant="h6">샷 맵</MDTypography>
                <MDTypography variant="button" color="text">
                  좌표 산포도 (0~1)
                </MDTypography>
                <MDBox mt={2} height="18rem">
                  <Scatter data={shotMapChart.data} options={shotMapChart.options} />
                </MDBox>
              </MDBox>
            </Card>
          </Grid>
          <Grid item xs={12} lg={6}>
            <Card sx={{ height: "100%" }}>
              <MDBox p={2}>
                <MDTypography variant="h6">최근 경기 추이</MDTypography>
                <MDTypography variant="button" color="text">
                  득실점 / 패스성공률 / 점유율
                </MDTypography>
                <MDBox mt={2} height="18rem">
                  <Line data={trendChart.data} options={trendChart.options} />
                </MDBox>
              </MDBox>
            </Card>
          </Grid>
        </Grid>
      </MDBox>

      {/* 요청 반영: TOP 출전 선수 영역 임시 비노출 */}
      {/*
      <MDBox mt={4}>
        <Card>
          <MDBox p={2}>
            <MDTypography variant="h6">TOP 출전 선수</MDTypography>
          </MDBox>
          <Divider />
          <MDBox px={1} pb={2}>
            {usageTable.rows.length > 0 ? (
              <DataTable
                table={usageTable}
                isSorted={false}
                entriesPerPage={false}
                showTotalEntries={false}
                showAllEntries
                noEndBorder
              />
            ) : (
              <MDBox p={2}>
                <MDTypography variant="button" color="text">
                  선수 사용 데이터가 없습니다.
                </MDTypography>
              </MDBox>
            )}
          </MDBox>
        </Card>
      </MDBox>
      */}
    </MDBox>
  );
}

OpenApiAnalysisSection.propTypes = {
  season: PropTypes.string,
  playerId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};

OpenApiAnalysisSection.defaultProps = {
  season: "",
  playerId: "",
};

export default OpenApiAnalysisSection;
