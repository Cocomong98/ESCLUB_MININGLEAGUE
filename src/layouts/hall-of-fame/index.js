import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";

// @mui material components
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

// Utils
import { fetchSeasonsWithData } from "utils/seasonUtils";
import { uiTypography } from "utils/uiTypography";

const KING_DEFS = [
  {
    key: "mining_king",
    title: "채굴왕",
    valueKeys: ["지난 시즌 채굴 효율", "채굴 효율"],
    metricLabel: "채굴 효율",
  },
  {
    key: "win_rate_king",
    title: "승률왕",
    valueKeys: ["지난 시즌 승률", "승률"],
    metricLabel: "승률",
  },
  {
    key: "game_count_king",
    title: "판수왕",
    valueKeys: ["지난 시즌 판수", "판수"],
    metricLabel: "판수",
  },
  {
    key: "draw_king",
    title: "승부왕",
    valueKeys: ["지난 시즌 무", "무"],
    metricLabel: "무승부",
  },
];

function seasonSortKey(season) {
  const [yearText, partText] = String(season || "").split("-");
  const year = Number(yearText) || 0;
  const part = Number(partText) || 0;
  return year * 100 + part;
}

function firstDefinedValue(source, keys) {
  if (!source || !keys) return null;
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function normalizeKing(source, def) {
  return {
    managerName: source?.구단주명 || source?.name || "-",
    playerId: String(source?.player_id || source?.playerId || source?.아이디 || ""),
    metricLabel: def.metricLabel,
    metricValue: firstDefinedValue(source, def.valueKeys),
  };
}

function normalizeSeasonRecord(season, payload) {
  const kings = {};
  for (const def of KING_DEFS) {
    kings[def.key] = normalizeKing(payload?.[def.key], def);
  }
  return {
    season,
    kings,
  };
}

function KingCell({ king, season }) {
  const displayValue =
    king.metricValue === null || king.metricValue === undefined ? "-" : king.metricValue;

  return (
    <MDBox
      sx={{
        p: 1,
        borderRadius: "10px",
        border: "1px solid",
        borderColor: "rgba(148,163,184,0.24)",
        backgroundColor: "rgba(248,250,252,0.8)",
        lineHeight: 1.35,
      }}
    >
      {king.playerId ? (
        <Link
          to={`/dashboard/${king.playerId}?season=${encodeURIComponent(season)}`}
          style={{ color: "inherit", textDecoration: "none" }}
        >
          <MDTypography
            {...uiTypography.tableTextStrong}
            sx={{ "&:hover": { color: "info.main" } }}
          >
            {king.managerName}
          </MDTypography>
        </Link>
      ) : (
        <MDTypography {...uiTypography.tableTextStrong}>{king.managerName}</MDTypography>
      )}
      <MDTypography {...uiTypography.metaLabel} display="block" mt={0.2}>
        {king.metricLabel}
      </MDTypography>
      <MDTypography {...uiTypography.metaValue} color="dark" display="block" mt={0.2}>
        {displayValue}
      </MDTypography>
    </MDBox>
  );
}

KingCell.propTypes = {
  king: PropTypes.shape({
    managerName: PropTypes.string,
    playerId: PropTypes.string,
    metricLabel: PropTypes.string,
    metricValue: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }).isRequired,
  season: PropTypes.string.isRequired,
};

function MobileKingCell({ king, season, title }) {
  const displayValue =
    king.metricValue === null || king.metricValue === undefined ? "-" : king.metricValue;

  return (
    <MDBox
      p={1}
      borderRadius="md"
      sx={{
        height: "100%",
        border: "1px solid rgba(148,163,184,0.24)",
        backgroundColor: ({ palette }) => palette.grey[100],
      }}
    >
      <MDTypography variant="caption" fontWeight="bold" color="text" display="block" mb={0.35}>
        {title}
      </MDTypography>
      {king.playerId ? (
        <Link
          to={`/dashboard/${king.playerId}?season=${encodeURIComponent(season)}`}
          style={{ color: "inherit", textDecoration: "none" }}
        >
          <MDTypography {...uiTypography.tableTextStrong} display="block">
            {king.managerName}
          </MDTypography>
        </Link>
      ) : (
        <MDTypography {...uiTypography.tableTextStrong} display="block">
          {king.managerName}
        </MDTypography>
      )}
      <MDTypography {...uiTypography.metaLabel} display="block">
        {king.metricLabel}
      </MDTypography>
      <MDTypography {...uiTypography.metaValue} color="dark" display="block" mt={0.25}>
        {displayValue}
      </MDTypography>
    </MDBox>
  );
}

MobileKingCell.propTypes = {
  king: PropTypes.shape({
    managerName: PropTypes.string,
    playerId: PropTypes.string,
    metricLabel: PropTypes.string,
    metricValue: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }).isRequired,
  season: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
};

function HallOfFame() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadHallOfFame() {
      try {
        setLoading(true);
        const { seasons } = await fetchSeasonsWithData();
        const cacheBuster = Date.now();

        const loaded = await Promise.all(
          seasons.map(async (season) => {
            try {
              const response = await fetch(
                `/data/${season}/current_crawl_display_data.json?t=${cacheBuster}`
              );
              if (!response.ok) return null;
              const payload = await response.json();
              return normalizeSeasonRecord(season, payload);
            } catch (error) {
              return null;
            }
          })
        );

        if (!cancelled) setRecords(loaded.filter(Boolean));
      } catch (error) {
        if (!cancelled) setRecords([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadHallOfFame();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleRecords = useMemo(() => {
    return [...records].sort((a, b) => {
      const diff = seasonSortKey(a.season) - seasonSortKey(b.season);
      return -diff;
    });
  }, [records]);

  const columns = [
    { Header: "시즌", accessor: "season", align: "center" },
    { Header: "채굴왕", accessor: "miningKing", align: "left" },
    { Header: "승률왕", accessor: "winRateKing", align: "left" },
    { Header: "판수왕", accessor: "gameCountKing", align: "left" },
    { Header: "승부왕", accessor: "drawKing", align: "left" },
  ];

  const rows = visibleRecords.map((record) => ({
    season: (
      <MDTypography {...uiTypography.metaValue} color="text">
        {record.season}
      </MDTypography>
    ),
    miningKing: <KingCell king={record.kings.mining_king} season={record.season} />,
    winRateKing: <KingCell king={record.kings.win_rate_king} season={record.season} />,
    gameCountKing: <KingCell king={record.kings.game_count_king} season={record.season} />,
    drawKing: <KingCell king={record.kings.draw_king} season={record.season} />,
  }));

  const mobileColumns = [
    { Header: "시즌", accessor: "season", align: "center" },
    { Header: "지표", accessor: "kings", align: "left" },
  ];

  const mobileRows = visibleRecords.map((record) => ({
    season: <MDTypography {...uiTypography.tableTextStrong}>{record.season}</MDTypography>,
    kings: (
      <MDBox
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 0.75,
        }}
      >
        {KING_DEFS.map((def) => (
          <MobileKingCell
            key={`${record.season}-${def.key}`}
            king={record.kings[def.key]}
            season={record.season}
            title={def.title}
          />
        ))}
      </MDBox>
    ),
  }));

  const tableColumns = isMobile ? mobileColumns : columns;
  const tableRows = isMobile ? mobileRows : rows;

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={isMobile ? 3.5 : 6} pb={isMobile ? 2 : 3}>
        <MDBox mb={isMobile ? 3 : 6}>
          <MDTypography {...uiTypography.pageTitle}>명예의 전당</MDTypography>
          <MDTypography {...uiTypography.sectionSub}>
            시즌 {visibleRecords.length}개 기준, 지표별 1위 기록
          </MDTypography>
        </MDBox>

        <Card sx={{ mt: 1 }}>
          <MDBox
            mx={2}
            mt={-2}
            py={2}
            px={2}
            variant="gradient"
            bgColor="info"
            borderRadius="lg"
            coloredShadow="info"
          >
            <MDTypography {...uiTypography.sectionTitle} color="white">
              시즌별 최고 순위
            </MDTypography>
          </MDBox>

          <MDBox pt={3}>
            {loading ? (
              <MDTypography {...uiTypography.status} textAlign="center" py={3} display="block">
                명예의 전당 데이터를 불러오는 중...
              </MDTypography>
            ) : rows.length > 0 ? (
              <DataTable
                table={{ columns: tableColumns, rows: tableRows }}
                isSorted={false}
                entriesPerPage={false}
                showTotalEntries={false}
                showAllEntries
                noEndBorder
                dense={isMobile}
              />
            ) : (
              <MDTypography {...uiTypography.status} textAlign="center" py={3} display="block">
                표시할 시즌 데이터가 없습니다.
              </MDTypography>
            )}
          </MDBox>
        </Card>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default HallOfFame;
