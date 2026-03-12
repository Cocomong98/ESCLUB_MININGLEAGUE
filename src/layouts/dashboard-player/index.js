import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { MenuItem, Select } from "@mui/material";

import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDTypography from "components/MDTypography";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import DataTable from "examples/Tables/DataTable";

import { fetchSeasonsWithData } from "utils/seasonUtils";
import { buildPlayerPortraitUrls } from "utils/playerImageUtils";
import { uiTypography } from "utils/uiTypography";

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

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePercent(value) {
  const n = toNumber(value, 0);
  return n <= 1 ? n * 100 : n;
}

function formatPercentOrDash(value, digits = 1) {
  if (value === null || value === undefined || value === "") return "-";
  return `${normalizePercent(value).toFixed(digits)}%`;
}

function formatNumberOrDash(value, digits = 2) {
  if (value === null || value === undefined || value === "") return "-";
  return toNumber(value, 0).toFixed(digits);
}

function formatGeneratedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR");
}

function SquadPlayerDetail() {
  const { id, playerKey } = useParams();
  const [searchParams] = useSearchParams();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState("");
  const [status, setStatus] = useState("idle");
  const [payload, setPayload] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [portraitIndex, setPortraitIndex] = useState(0);

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

  useEffect(() => {
    if (!selectedSeason || !id) {
      setStatus("idle");
      setPayload(null);
      setSelectedPlayer(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setStatus("loading");
      const url = `/data/${selectedSeason}/user/${id}/analysis/squad_analysis_all.json`;
      try {
        const response = await fetch(url);
        if (cancelled) return;

        if (response.status === 404) {
          setStatus("pending");
          setPayload(null);
          setSelectedPlayer(null);
          return;
        }

        if (!response.ok) {
          throw new Error(`${url} ${response.status}`);
        }

        const data = await response.json();
        if (cancelled) return;

        const rows = Array.isArray(data?.rows) ? data.rows : [];
        const keyToken = String(playerKey || "");
        const found = rows.find((row) => String(row.playerKey || row.spId || "") === keyToken);

        setPayload(data);
        if (!found) {
          setSelectedPlayer(null);
          setStatus("not_found");
          return;
        }

        setSelectedPlayer(found);
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        console.error("Squad player detail fetch failed:", error);
        setStatus("error");
        setPayload(null);
        setSelectedPlayer(null);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [selectedSeason, id, playerKey]);

  const portraitUrls = useMemo(() => {
    const token =
      selectedPlayer?.spId || selectedPlayer?.playerKey || selectedPlayer?.id || playerKey || "";
    return buildPlayerPortraitUrls(token);
  }, [playerKey, selectedPlayer]);

  useEffect(() => {
    setPortraitIndex(0);
  }, [portraitUrls.join("|")]);

  const portraitUrl = portraitUrls[portraitIndex] || "";

  const tableData = useMemo(() => {
    if (!selectedPlayer) {
      return { columns: [], rows: [] };
    }

    const rows = [
      { label: "선수", value: selectedPlayer.playerName || selectedPlayer.name || "-" },
      { label: "포지션", value: selectedPlayer.positionName || selectedPlayer.position || "-" },
      { label: "시즌", value: selectedPlayer.seasonName || selectedPlayer.seasonId || "-" },
      { label: "출전", value: `${toNumber(selectedPlayer.appearances, 0)}` },
      {
        label: "승률",
        value: formatPercentOrDash(
          selectedPlayer.playerWinRate !== undefined && selectedPlayer.playerWinRate !== null
            ? selectedPlayer.playerWinRate
            : selectedPlayer.winRate,
          1
        ),
      },
      {
        label: "승/무/패",
        value: `${toNumber(selectedPlayer?.record?.w, 0)} / ${toNumber(
          selectedPlayer?.record?.d,
          0
        )} / ${toNumber(selectedPlayer?.record?.l, 0)}`,
      },
      { label: "공격포인트", value: `${toNumber(selectedPlayer.attackPoint, 0)}` },
      { label: "골", value: `${toNumber(selectedPlayer.goal, 0)}` },
      { label: "어시스트", value: `${toNumber(selectedPlayer.assist, 0)}` },
      { label: "공격력", value: formatNumberOrDash(selectedPlayer.attackPower, 2) },
      { label: "수비력", value: formatNumberOrDash(selectedPlayer.defensePower, 2) },
      { label: "기대득점률", value: formatPercentOrDash(selectedPlayer.expectedGoalRate, 1) },
      { label: "패스성공률", value: formatPercentOrDash(selectedPlayer.passSuccessRate, 1) },
      { label: "드리블성공률", value: formatPercentOrDash(selectedPlayer.dribbleSuccessRate, 1) },
      { label: "가로채기성공", value: formatPercentOrDash(selectedPlayer.interceptPerGame, 1) },
      { label: "태클성공률", value: formatPercentOrDash(selectedPlayer.tackleSuccessRate, 1) },
      { label: "공중볼성공률", value: formatPercentOrDash(selectedPlayer.aerialSuccessRate, 1) },
      { label: "선방력", value: formatPercentOrDash(selectedPlayer.savePerGame, 1) },
      { label: "슈팅방어율", value: formatPercentOrDash(selectedPlayer.shotDefenseRate, 1) },
      {
        label: "중거리 슈팅 비율",
        value: formatPercentOrDash(selectedPlayer.longShotAttemptRate, 1),
      },
      {
        label: "중거리 유효슈팅률",
        value: formatPercentOrDash(selectedPlayer.longShotSelectionEfficiency, 1),
      },
      {
        label: "중거리 득점 점유율",
        value: formatPercentOrDash(selectedPlayer.longShotGoalShare, 1),
      },
    ];

    return {
      columns: [
        { Header: "항목", accessor: "metric", align: "left" },
        { Header: "값", accessor: "value", align: "center" },
      ],
      rows: rows.map((row) => ({
        metric: <MDTypography {...uiTypography.tableTextStrong}>{row.label}</MDTypography>,
        value: <MDTypography {...uiTypography.tableText}>{row.value}</MDTypography>,
      })),
    };
  }, [selectedPlayer]);

  const quickMetrics = useMemo(() => {
    if (!selectedPlayer) return [];
    const winRateSource =
      selectedPlayer.playerWinRate !== undefined && selectedPlayer.playerWinRate !== null
        ? selectedPlayer.playerWinRate
        : selectedPlayer.winRate;
    return [
      {
        label: "출전",
        value: `${toNumber(selectedPlayer.appearances, 0)}경`,
      },
      {
        label: "승률",
        value: formatPercentOrDash(winRateSource, 1),
      },
      {
        label: "공격포인트",
        value: `${toNumber(selectedPlayer.attackPoint, 0)}`,
      },
      {
        label: "기대득점률",
        value: formatPercentOrDash(selectedPlayer.expectedGoalRate, 1),
      },
      {
        label: "패스성공률",
        value: formatPercentOrDash(selectedPlayer.passSuccessRate, 1),
      },
      {
        label: "태클성공률",
        value: formatPercentOrDash(selectedPlayer.tackleSuccessRate, 1),
      },
    ];
  }, [selectedPlayer]);

  const title = selectedPlayer?.playerName || selectedPlayer?.name || "선수 상세";

  return (
    <DashboardLayout>
      <DashboardNavbar pageTitle={title} />
      <MDBox py={{ xs: 2, md: 3 }}>
        <Grid container spacing={{ xs: 2, md: 3 }}>
          <Grid item xs={12}>
            <MDBox
              display="flex"
              justifyContent="space-between"
              alignItems={{ xs: "stretch", sm: "center" }}
              flexDirection={{ xs: "column", sm: "row" }}
              gap={1.5}
              mb={2}
            >
              <MDBox display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
                <MDTypography {...uiTypography.sectionSub}>시즌</MDTypography>
                <Select value={selectedSeason} onChange={(e) => setSelectedSeason(e.target.value)}>
                  {seasons.map((season) => (
                    <MenuItem key={season} value={season}>
                      {season} 시즌
                    </MenuItem>
                  ))}
                </Select>
              </MDBox>
              <MDBox
                display="flex"
                gap={1}
                flexWrap="wrap"
                justifyContent={{ xs: "flex-end", sm: "flex-start" }}
              >
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
                  스쿼드 분석으로
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

        <Card>
          <MDBox p={2}>
            <MDTypography {...uiTypography.sectionTitle}>{title} - 선수 상세 지표</MDTypography>
            <MDTypography {...uiTypography.sectionSub} display="block">
              데이터 생성 시각: {formatGeneratedAt(payload?.generatedAt)}
            </MDTypography>
          </MDBox>
          {status === "ready" && selectedPlayer && (
            <MDBox px={2} pb={1}>
              <MDBox
                sx={({ palette }) => ({
                  width: "100%",
                  minHeight: 158,
                  borderRadius: "12px",
                  border: `1px solid ${palette.grey[300]}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  px: 2,
                  py: 1.5,
                  gap: 2,
                  background: `linear-gradient(135deg, ${palette.grey[100]} 0%, ${palette.white.main} 100%)`,
                })}
              >
                <MDBox>
                  <MDTypography {...uiTypography.sectionTitle}>{title}</MDTypography>
                  <MDTypography {...uiTypography.sectionSub} display="block">
                    {selectedPlayer.positionName || selectedPlayer.position || "-"} ·{" "}
                    {selectedPlayer.seasonName || selectedPlayer.seasonId || "-"}
                  </MDTypography>
                  <MDTypography {...uiTypography.sectionSub} display="block">
                    출전 {toNumber(selectedPlayer.appearances, 0)}경 · 승률{" "}
                    {formatPercentOrDash(
                      selectedPlayer.playerWinRate !== undefined &&
                        selectedPlayer.playerWinRate !== null
                        ? selectedPlayer.playerWinRate
                        : selectedPlayer.winRate,
                      1
                    )}
                  </MDTypography>
                </MDBox>
                <MDBox
                  sx={{
                    width: 120,
                    height: 120,
                    borderRadius: "10px",
                    border: "1px solid rgba(0,0,0,0.08)",
                    bgcolor: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    flexShrink: 0,
                  }}
                >
                  {portraitUrl ? (
                    <MDBox
                      component="img"
                      src={portraitUrl}
                      alt={title}
                      loading="lazy"
                      onError={() =>
                        setPortraitIndex((prev) =>
                          prev + 1 < portraitUrls.length ? prev + 1 : prev
                        )
                      }
                      sx={{
                        width: "92%",
                        height: "92%",
                        objectFit: "contain",
                        display: "block",
                      }}
                    />
                  ) : (
                    <MDTypography {...uiTypography.metaLabel}>이미지 없음</MDTypography>
                  )}
                </MDBox>
              </MDBox>
              <MDBox
                mt={1}
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "repeat(2, minmax(0, 1fr))",
                    md: "repeat(3, minmax(0, 1fr))",
                  },
                  gap: 0.8,
                }}
              >
                {quickMetrics.map((item) => (
                  <MDBox
                    key={item.label}
                    sx={({ palette }) => ({
                      border: `1px solid ${palette.grey[300]}`,
                      borderRadius: "10px",
                      px: 1.1,
                      py: 0.8,
                      backgroundColor: palette.grey[100],
                    })}
                  >
                    <MDTypography {...uiTypography.metaLabel}>{item.label}</MDTypography>
                    <MDTypography {...uiTypography.metaValue} display="block" mt={0.15}>
                      {item.value}
                    </MDTypography>
                  </MDBox>
                ))}
              </MDBox>
            </MDBox>
          )}
          <MDBox px={2} pb={2}>
            {status === "loading" && (
              <MDTypography {...uiTypography.status}>
                선수 지표 데이터를 불러오는 중...
              </MDTypography>
            )}
            {status === "pending" && (
              <MDTypography {...uiTypography.status}>선수 지표 데이터 준비 중</MDTypography>
            )}
            {status === "error" && (
              <MDTypography {...uiTypography.status}>선수 지표 데이터 로드 실패</MDTypography>
            )}
            {status === "not_found" && (
              <MDTypography {...uiTypography.status}>
                해당 선수 키에 매칭되는 데이터가 없습니다.
              </MDTypography>
            )}
            {status === "ready" && selectedPlayer && (
              <DataTable
                table={tableData}
                isSorted={false}
                entriesPerPage={false}
                showTotalEntries={false}
                showAllEntries
                noEndBorder
                dense={isMobile}
              />
            )}
          </MDBox>
        </Card>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default SquadPlayerDetail;
