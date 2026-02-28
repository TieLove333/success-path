export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

export type LlmIntent =
  | "route_next_step"
  | "build_step_plan"
  | "need_help"
  | "what_next";

export type UserInput = {
  type?: "text" | "action";
  text?: string;
  value?: string;
};

export type ProgressState = {
  completedTaskIds?: string[];
  completedStepIds?: string[];
};

export type AvailableStep = {
  id: string;
  moduleId?: string;
  order?: number;
  title?: string;
  outcome?: string;
  [key: string]: JsonValue | undefined;
};

export type StepSpecTask = {
  id?: string;
  title?: string;
  required?: boolean;
  subtasks?: Array<{ id?: string; label?: string; required?: boolean }>;
};

export type StepSpec = {
  id?: string;
  title?: string;
  label?: string;
  outcome?: string;
  tasks?: StepSpecTask[];
  [key: string]: JsonValue | undefined;
};

export type LlmRequestBody = {
  intent?: LlmIntent;
  userInput?: UserInput;
  activeStepId?: string | null;
  progress?: ProgressState | null;
  stepSpec?: StepSpec | null;
  availableSteps?: AvailableStep[];
  diagnostic?: {
    answers?: Array<{ questionId?: string; answer: string }>;
  } | null;
};

export type RenderPlanArtifact =
  | {
      id?: string;
      kind: "step_hero";
      headline?: string;
      stepTitle?: string;
      badge?: string;
      promiseLine?: string;
      icon?: string;
      data?: Record<string, JsonValue>;
    }
  | {
      id?: string;
      kind: "task_card";
      taskId?: string;
      title?: string;
      instructions?: string;
      examples?: string[];
      links?: Array<{ label: string; url: string }>;
      required?: boolean;
      subtasks?: Array<{ id: string; label: string; required?: boolean }>;
      data?: Record<string, JsonValue>;
    }
  | {
      id?: string;
      kind: "next_actions";
      actions?: Array<{
        id: string;
        label: string;
        value: string;
        style?: "primary" | "secondary";
      }>;
      data?: Record<string, JsonValue>;
    }
  | {
      id?: string;
      kind: "resource_links" | "template";
      data?: Record<string, JsonValue>;
    }
  | {
      id?: string;
      kind: string;
      [key: string]: JsonValue | undefined;
    };

export type RenderPlan = {
  messages?: Array<{ id?: string; role: "assistant"; content: string }>;
  artifacts?: RenderPlanArtifact[];
  selection?: { selectedStepId?: string | null };
};
