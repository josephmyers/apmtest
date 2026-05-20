import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Box, Button, Checkbox } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { getPassage, setPassageStep } from "./api";
import {
  isFirstStep,
  isLastStep,
  nextStep,
  prevStep,
  stepForRoute,
  type StepDef,
  type StepNavState,
} from "./steps";

interface StepFooterProps {
  token: string | null;
  /** Whether this step's completion criteria are met (drives highlight + enable). */
  canComplete: boolean;
  /** Passage context — also forwarded unchanged when moving between steps. */
  nav: StepNavState;
  /** Surface errors (e.g. setSnackMsg). */
  onError?: (msg: string) => void;
}

/**
 * Self-contained footer for step pages: Previous / Step Complete / Next.
 *
 * Owns the passage's progress: it loads `current_step` itself, persists
 * advancement on Step Complete, and handles step-to-step navigation. Step
 * pages pass only passage context — they never track `current_step`.
 * Previous is hidden on the first step, Next on the last.
 */
export default function StepFooter({
  token,
  canComplete,
  nav,
  onError,
}: StepFooterProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const viewedStep = stepForRoute(location.pathname);
  const [currentStep, setCurrentStep] = useState<number | undefined>();
  const passageId = nav.passageId;

  useEffect(() => {
    if (!token || !passageId) return;
    getPassage(token, passageId)
      .then(({ passage }) => setCurrentStep(passage.current_step))
      .catch((err) =>
        onError?.(err instanceof Error ? err.message : "Failed to load passage"),
      );
  }, [token, passageId, onError]);

  if (!viewedStep) return null;
  const viewedStepId = viewedStep.id;
  const isStepComplete = currentStep != null && currentStep > viewedStepId;

  async function handleToggleComplete() {
    if (!token) return;
    const target = isStepComplete ? viewedStepId : viewedStepId + 1;
    try {
      const { passage } = await setPassageStep(token, passageId, target);
      setCurrentStep(passage.current_step);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Failed to update step");
    }
  }

  function goToStep(target: StepDef) {
    navigate(target.route, { state: nav });
  }

  function handlePrevious() {
    const prev = prevStep(viewedStepId);
    if (prev) goToStep(prev);
  }

  function handleNext() {
    const next = nextStep(viewedStepId);
    if (next) goToStep(next);
  }

  return (
    <Box
      sx={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderTop: 1,
        borderColor: "divider",
        bgcolor: "#eee",
        px: 1,
        py: 1,
      }}
    >
      {!isFirstStep(viewedStepId) ? (
        <Button
          startIcon={<ChevronLeftIcon />}
          onClick={handlePrevious}
          sx={{px: "12px"}}
        >
          Previous
        </Button>
      ) : (
        <Box />
      )}

      <Button
        sx={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          whiteSpace: "nowrap",
        }}
        startIcon={
          <Checkbox
            size="small"
            checked={isStepComplete}
            sx={{ p: 0, "&.Mui-disabled": { color: "inherit" } }}
            disabled
          />
        }
        variant={canComplete && !isStepComplete ? "primary" : undefined}
        disabled={!isStepComplete && !canComplete}
        onClick={handleToggleComplete}
      >
        Step Complete
      </Button>

      {!isLastStep(viewedStepId) ? (
        <Button
          endIcon={<ChevronRightIcon />}
          onClick={handleNext}
          sx={{px: "12px"}}
        >
          Next
        </Button>
      ) : (
        <Box />
      )}
    </Box>
  );
}
