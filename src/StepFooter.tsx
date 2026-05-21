import { useLocation, useNavigate } from "react-router-dom";
import { Box, Button, Checkbox } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useAuth } from "./AuthContext";
import { usePassage } from "./PassageContext";
import { setPassageStep } from "./api";
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
  /** Whether this step's completion criteria are met (enables the button). */
  canComplete: boolean;
  /** Add conditions to the "primary" highlight. */
  isCompletePrimary?: boolean;
  /** Surface errors (e.g. setSnackMsg). */
  onError?: (msg: string) => void;
}

export default function StepFooter({ canComplete, isCompletePrimary, onError }: StepFooterProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();
  const { currentStep, setCurrentStep } = usePassage();
  const nav = location.state as StepNavState;
  const viewedStep = stepForRoute(location.pathname);

  if (!viewedStep) return null;
  const viewedStepId = viewedStep.id;
  const isStepComplete = currentStep != null && currentStep > viewedStepId;

  async function handleToggleComplete() {
    if (!token || !nav?.passageId) return;
    const target = isStepComplete ? viewedStepId : viewedStepId + 1;
    try {
      const { passage } = await setPassageStep(token, nav.passageId, target);
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
        variant={(isCompletePrimary && canComplete && !isStepComplete) ? "primary" : undefined}
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
