import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Box, Button, Menu, MenuItem, Typography } from "@mui/material";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import { getPassage } from "./api";
import {
  STEPS,
  getStep,
  stepForRoute,
  type StepNavState,
} from "./steps";

export interface RacetrackProps {
  token: string | null;
  nav: StepNavState;
}

export default function Racetrack({ token, nav }: RacetrackProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const viewedStep = stepForRoute(location.pathname);
  const [passageMenuAnchor, setPassageMenuAnchor] = useState<null | HTMLElement>(null);
  const [currentStep, setCurrentStep] = useState<number | undefined>();

  const { passageId, passageReference, projectName, projectId } = nav;
  const sectionPassages = nav.sectionPassages ?? [];

  useEffect(() => {
    if (!token || !passageId) return;
    getPassage(token, passageId).then(({ passage }) => setCurrentStep(passage.current_step))
  }, [token, passageId]);

  if (!viewedStep) return null;
  const viewedStepId = viewedStep.id;
  const viewedTitle = viewedStep.title;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        pb: 1,
        px: 2,
      }}
    >
      <Box
        sx={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          width: "100%",
        }}
      >
        {/* Passage dropdown — always a flex item; sits on top on large screens */}
        <Box sx={{ flexShrink: 0, position: "relative", zIndex: 1, mr: 1 }}>
          <Button
            size="small"
            endIcon={<ArrowDropDownIcon />}
            sx={{
              whiteSpace: "nowrap",
              minWidth: "auto",
            }}
            onClick={(e) => setPassageMenuAnchor(e.currentTarget)}
          >
            {passageReference}
          </Button>
          <Menu
            anchorEl={passageMenuAnchor}
            open={Boolean(passageMenuAnchor)}
            onClose={() => setPassageMenuAnchor(null)}
          >
            {sectionPassages.map((p) => (
              <MenuItem
                key={p.id}
                selected={p.id === passageId}
                onClick={() => {
                  setPassageMenuAnchor(null);
                  if (p.id !== passageId) {
                    const state: StepNavState = {
                      passageId: p.id,
                      passageReference: p.reference,
                      projectName,
                      projectId,
                      speaker: p.speaker,
                      sectionPassages,
                    };
                    navigate(getStep(p.current_step).route, { state });
                  }
                }}
              >
                {p.reference}
              </MenuItem>
            ))}
          </Menu>
        </Box>

        {/* Parallelograms
            - Small screens: flex item starting at dropdown edge, scrolls right
            - Large screens: absolutely spans full row width (behind dropdown) */}
        <Box
          sx={{
            overflowX: "auto",
            display: "flex",
            flex: { xs: 1, md: "none" },
            justifyContent: { xs: "flex-start", md: "center" },
            position: { md: "absolute" },
            left: { md: 0 },
            right: { md: 0 },
          }}
        >
          {STEPS.map((step) => {
            const isViewed = step.id === viewedStepId;
            const color = isViewed
              ? "#111"
              : currentStep != null && step.id < currentStep
                ? "#888"
                : "#ccc";
            return (
              <Box
                key={step.id}
                onClick={
                  isViewed
                    ? undefined
                    : () => navigate(step.route, { state: nav })
                }
                sx={{
                  flex: "0 0 80px",
                  height: 30,
                  bgcolor: color,
                  mr: -0.25,
                  clipPath: "polygon(10% 0%, 100% 0%, 90% 100%, 0% 100%)",
                  cursor: isViewed ? "default" : "pointer",
                }}
              />
            );
          })}
        </Box>

        {/* Spacer gives the row its height on large screens (absolute children don't contribute) */}
        <Box sx={{ height: 30, flex: 1, display: { xs: "none", md: "block" } }} />
      </Box>
      <Typography sx={{ mt: 1, fontWeight: 500 }}>{viewedTitle}</Typography>
    </Box>
  );
}
