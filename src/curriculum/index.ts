import m1s01 from "./m1-s01.json";
import type { StepMeta, StepSpec } from "@/types/curriculum";

/**
 * Curriculum Index (v1)
 *
 * Purpose:
 * - Provide a single place to enumerate "available steps" for routing.
 * - Keep the router constrained: the LLM may only choose from these step IDs.
 *
 * Notes:
 * - For now we only have one fully-built step: m1.s01 (from the current demo).
 * - As we add more steps, import their JSON and append them to `steps`.
 */

export const curriculumVersion = "v1";

/**
 * Steps are represented by their machine spec JSON files.
 * Each entry should at minimum include:
 * - id
 * - moduleId
 * - order (within module)
 * - title
 * - outcome (short)
 */
export const steps: StepMeta[] = [
  {
    id: m1s01.step.id,
    moduleId: m1s01.step.moduleId,
    order: m1s01.step.order,
    title: m1s01.step.title,
    outcome: m1s01.step.outcome,
  },
];

/**
 * Convenience: map for fast lookups by stepId.
 */
export const stepsById = steps.reduce<Record<string, StepMeta>>((acc, step) => {
  acc[step.id] = step;
  return acc;
}, {});

/**
 * Full machine specs by id (for rendering / build_step_plan constraints).
 * Keep this server-safe; do not expose secrets in specs.
 */
export const stepSpecsById: Record<string, StepSpec> = {
  [m1s01.step.id]: m1s01.step,
};

/**
 * Helpers
 */
export function getAvailableSteps(): StepMeta[] {
  return steps;
}

export function getStepMeta(stepId: string): StepMeta | null {
  return stepsById[stepId] ?? null;
}

export function getStepSpec(stepId: string): StepSpec | null {
  return stepSpecsById[stepId] ?? null;
}
