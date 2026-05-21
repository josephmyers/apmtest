import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import {
  getPassage,
  getSectionPassages,
  type Passage,
  type SectionPassage,
} from "./api";
import { type StepNavState } from "./steps";

interface PassageContextValue {
  /** Server-loaded passage. */
  passage: Passage | undefined;
  /** First-incomplete step. Undefined until the passage fetch resolves. */
  currentStep: number | undefined;
  /** Update PassageContext with currentStep change */
  setCurrentStep: (newCurrentStep: number) => void;
  /** Sibling passages in the same section. */
  sectionPassages: SectionPassage[];
}

const PassageContext = createContext<PassageContextValue | undefined>(undefined);

export function PassageProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const state = (useLocation().state ?? {}) as StepNavState;
  const passageId = state.passageId;

  const [currentStep, setCurrentStepState] = useState<number | undefined>();
  const [passage, setPassage] = useState<Passage | undefined>();
  const [sectionPassages, setSectionPassages] = useState<SectionPassage[]>(() => [
    { id: passageId, reference: state.passageReference ?? "", current_step: 0 },
  ]);

  useEffect(() => {
    if (!token || !passageId) return;
    getPassage(token, passageId).then(({ passage }) => {
      setPassage(passage);
      setCurrentStepState(passage.current_step);
    });
  }, [token, passageId]);

  useEffect(() => {
    if (!token || !passageId) return;
    getSectionPassages(token, passageId).then(({ sectionPassages }) => {
      setSectionPassages(sectionPassages);
    });
  }, [token, passageId]);

  const setCurrentStep = useCallback(
    (n: number) => {
      setCurrentStepState(n);
      setPassage((p) => (p ? { ...p, current_step: n } : p));
      setSectionPassages((list) =>
        list.map((p) => (p.id === passageId ? { ...p, current_step: n } : p)),
      );
    },
    [passageId],
  );

  return (
    <PassageContext.Provider
      value={{ passage, currentStep, setCurrentStep, sectionPassages }}
    >
      {children}
    </PassageContext.Provider>
  );
}

export function usePassage() {
  const ctx = useContext(PassageContext);
  if (!ctx) throw new Error("usePassage must be used within PassageProvider");
  return ctx;
}
