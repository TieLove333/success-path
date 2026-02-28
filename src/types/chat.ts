import type { ReactNode } from "react";

export type ChoiceItem = {
  id: string;
  label: string;
};

export type DiagnosticQuestion = {
  id: string;
  text: string;
  choices: ChoiceItem[];
};

export type DiagnosticAnswer = {
  questionId?: string;
  answer: string;
};

export type ChatMessage = {
  role: "agent" | "user" | "question";
  text: string | ReactNode;
};

export type MissionTask = {
  id?: string;
  taskId?: string;
  label: string;
  completed: boolean;
};

export type MissionStep = {
  number: number;
  title: string;
  content: string | ReactNode;
  examples?: string[];
  tasks?: MissionTask[];
};

export type MissionData = {
  title: string;
  subtitle: string;
  steps: MissionStep[];
};
