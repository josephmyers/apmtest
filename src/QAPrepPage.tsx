import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Backdrop, Box, CircularProgress, Typography } from "@mui/material";
import { useAuth } from "./AuthContext";
import { useSnackbar } from "./useSnackbar";
import PageHeader from "./PageHeader";
import StepFooter from "./StepFooter";
import { PassageProvider, usePassage } from "./PassageContext";
import { fetchAudio, listPassageVersions, type PassageVersion } from "./api";
import { type StepNavState } from "./steps";

/**
 * Thin wrapper that keys PassageProvider on passageId so its state resets
 * whenever the user switches passages.
 */
export default function QAPrepPage() {
  const location = useLocation();
  const state = (location.state ?? {}) as StepNavState;
  return (
    <PassageProvider key={state.passageId}>
      <QAPrepPageInner />
    </PassageProvider>
  );
}

function QAPrepPageInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();
  const { passage } = usePassage();
  const { setSnackMsg, snackbarElement } = useSnackbar();
  const nav = location.state as StepNavState;
  const projectId = nav?.projectId;

  const [, setPassageAudio] = useState<{ blob: Blob; version: PassageVersion } | null>(null);
  const [audioInitialized, setAudioInitialized] = useState(false);

  useEffect(() => {
    if (!token || !passage) return;
    Promise.all([
      fetchAudio(token, passage.id),
      listPassageVersions(token, passage.id),
    ]).then(([blob, { versions }]) => {
      if (!blob) {
        setAudioInitialized(true);
        return;
      }
      const version = versions.find((v) => v.audioKey === passage.audioKey)!;
      setPassageAudio({ blob, version });
      setAudioInitialized(true);
    });
  }, [token, passage]);

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
      <Backdrop
        open={!audioInitialized}
        sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
      >
        <CircularProgress color="inherit" />
      </Backdrop>

      <PageHeader
        leftIcon="back"
        onLeftClick={() => navigate(projectId ? `/projects/${projectId}` : "/projects")}
        title={nav?.projectName ?? ""}
        racetrack
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

      <StepFooter canComplete onError={setSnackMsg} />

      {snackbarElement}
    </Box>
  );
}
