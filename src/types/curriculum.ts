export type StepMeta = {
  id: string;
  moduleId?: string;
  order?: number;
  title?: string;
  outcome?: string;
  [key: string]: unknown;
};

export type StepSpecTask = {
  id?: string;
  title?: string;
  required?: boolean;
  subtasks?: Array<{
    id?: string;
    label?: string;
    required?: boolean;
  }>;
};

export type StepSpecArtifact = {
  id?: string;
  kind?: string;
  data?: Record<string, unknown>;
};

export type StepSpec = {
  id: string;
  moduleId?: string;
  order?: number;
  title?: string;
  outcome?: string;
  tasks?: StepSpecTask[];
  artifacts?: StepSpecArtifact[];
  [key: string]: unknown;
};
