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

// prop-types is library for typechecking of props
import PropTypes from "prop-types";

// @mui material components
import Card from "@mui/material/Card";
import Divider from "@mui/material/Divider";
import Icon from "@mui/material/Icon";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";

function DefaultInfoCard({ color, icon, title, description, value, compactMobile }) {
  return (
    <Card>
      <MDBox
        p={{ xs: compactMobile ? 1 : 2, md: 2 }}
        mx={{ xs: compactMobile ? 1 : 3, md: 3 }}
        display="flex"
        justifyContent="center"
      >
        <MDBox
          display="grid"
          justifyContent="center"
          alignItems="center"
          bgColor={color}
          color="white"
          width={{ xs: compactMobile ? "2.2rem" : "3rem", md: "4rem" }}
          height={{ xs: compactMobile ? "2.2rem" : "3rem", md: "4rem" }}
          shadow="md"
          borderRadius="lg"
          variant="gradient"
        >
          <Icon sx={{ fontSize: { xs: compactMobile ? "1.1rem" : "1.5rem", md: "2rem" } }}>
            {icon}
          </Icon>
        </MDBox>
      </MDBox>
      <MDBox
        pb={{ xs: compactMobile ? 1 : 2, md: 2 }}
        px={{ xs: compactMobile ? 1 : 2, md: 2 }}
        textAlign="center"
        lineHeight={1.2}
      >
        <MDTypography
          variant="h6"
          fontWeight="medium"
          textTransform="capitalize"
          sx={{ fontSize: { xs: compactMobile ? "0.66rem" : "0.75rem", sm: "1rem" } }}
        >
          {title}
        </MDTypography>
        {description && (
          <MDTypography
            variant="caption"
            color="text"
            fontWeight="regular"
            sx={{ fontSize: { xs: compactMobile ? "0.58rem" : "0.65rem", sm: "0.75rem" } }}
          >
            {description}
          </MDTypography>
        )}
        {description && !value ? null : <Divider sx={{ my: compactMobile ? 0.5 : 1 }} />}
        {value && (
          <MDTypography
            variant="h5"
            fontWeight="medium"
            sx={{ fontSize: { xs: compactMobile ? "0.72rem" : "0.875rem", sm: "1.25rem" } }}
          >
            {value}
          </MDTypography>
        )}
      </MDBox>
    </Card>
  );
}

// Setting default values for the props of DefaultInfoCard
DefaultInfoCard.defaultProps = {
  color: "info",
  value: "",
  description: "",
  compactMobile: false,
};

// Typechecking props for the DefaultInfoCard
DefaultInfoCard.propTypes = {
  color: PropTypes.oneOf(["primary", "secondary", "info", "success", "warning", "error", "dark"]),
  icon: PropTypes.node.isRequired,
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  compactMobile: PropTypes.bool,
};

export default DefaultInfoCard;
