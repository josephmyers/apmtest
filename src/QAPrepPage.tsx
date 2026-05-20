import { useLocation, useNavigate } from "react-router-dom";
import { Box, Typography } from "@mui/material";
import { useAuth } from "./AuthContext";
import { useSnackbar } from "./useSnackbar";
import PageHeader from "./PageHeader";
import StepFooter from "./StepFooter";
import { type StepNavState } from "./steps";

/**
 * Thin wrapper that keys the real page on passageId so React fully
 * unmounts / remounts whenever the user switches passages.
 */
export default function QAPrepPage() {
  const location = useLocation();
  const state = (location.state ?? {}) as StepNavState;
  return <QAPrepPageInner key={state.passageId} />;
}

function QAPrepPageInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();
  const { setSnackMsg, snackbarElement } = useSnackbar();
  const state = (location.state ?? {}) as StepNavState;

  const projectId = state.projectId;
  const nav: StepNavState = {
    passageId: state.passageId ?? 0,
    passageReference: state.passageReference ?? "Unknown Passage",
    projectName: state.projectName ?? "",
    projectId,
    speaker: state.speaker ?? null,
    sectionPassages: state.sectionPassages ?? [],
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        "@supports (height: 100dvh)": {
          height: "100dvh",
        },
      }}
    >
      <PageHeader
        leftIcon="back"
        onLeftClick={() => navigate(projectId ? `/projects/${projectId}` : "/projects")}
        title={nav.projectName}
        racetrack={{ token, nav }}
      />

      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "auto",
        }}
      >
        <Typography variant="h5" color="text.secondary">
          Community Test Q&amp;A Prep — Coming Soon
        </Typography>
      </Box>

      <StepFooter
        token={token}
        canComplete
        nav={nav}
        onError={setSnackMsg}
      />

      {snackbarElement}
    </Box>
  );
}
