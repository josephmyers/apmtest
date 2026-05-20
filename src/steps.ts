/**
 * Progressive workflow steps for a passage.
 *
 * A passage's `current_step` is the first *incomplete* step (1-based id).
 * Step pages let the user freely browse with Previous/Next without changing
 * progress; `current_step` only advances when the user checks Step Complete.
 */

export interface StepDef {
  /** 1-based step id, stored in passages.current_step. */
  id: number;
  title: string;
  route: string;
}

export const STEPS: StepDef[] = [
  { id: 1, title: "Record", route: "/record" },
  { id: 2, title: "Community Test Q&A Prep", route: "/qa-prep" },
];

export const FIRST_STEP = STEPS[0];
export const LAST_STEP = STEPS[STEPS.length - 1];

export function stepForRoute(pathname: string): StepDef | undefined {
  return STEPS.find((s) => s.route === pathname);
}

export function getStep(currentStep: number): StepDef {
  if (currentStep <= FIRST_STEP.id) return FIRST_STEP;
  if (currentStep >= LAST_STEP.id) return LAST_STEP;
  return getStepById(currentStep) ?? FIRST_STEP;
}

export function isFirstStep(id: number): boolean {
  return id <= FIRST_STEP.id;
}

export function isLastStep(id: number): boolean {
  return id >= LAST_STEP.id;
}

export function nextStep(id: number): StepDef | null {
  return getStepById(id + 1) ?? null;
}

export function prevStep(id: number): StepDef | null {
  return getStepById(id - 1) ?? null;
}

function getStepById(id: number): StepDef | undefined {
  return STEPS.find((s) => s.id === id);
}

/** Navigation state shared by every step page (Record, Q&A Prep, ...). */
export interface StepNavState {
  passageId: number;
  passageReference: string;
  projectName: string;
  projectId?: number;
  speaker?: string | null;
  sectionPassages?: {
    id: number;
    reference: string;
    speaker: string | null;
    current_step: number;
  }[];
}
