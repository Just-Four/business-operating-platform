// Processes, procedures and who does each step.
// A process is a list of steps. Each step has a fixed result and standard; how it is done and who does it can change.

export type Assessment = {
  digital?: "yes" | "no";
  rules?: "clear" | "judgement";
  presence?: "yes" | "no";
  stakes?: "small" | "costly";
};

export const QUESTIONS: { key: keyof Assessment; question: string; options: { value: string; label: string }[] }[] = [
  {
    key: "digital",
    question: "Is everything this step needs and produces digital, and reachable by a tool?",
    options: [
      { value: "yes", label: "Yes, all digital" },
      { value: "no", label: "No, some is on paper or in person" },
    ],
  },
  {
    key: "rules",
    question: "Could you write the rules down, or does it take judgement?",
    options: [
      { value: "clear", label: "Clear rules" },
      { value: "judgement", label: "Takes judgement" },
    ],
  },
  {
    key: "presence",
    question: "Does it need someone physically there, or a personal relationship?",
    options: [
      { value: "no", label: "No" },
      { value: "yes", label: "Yes" },
    ],
  },
  {
    key: "stakes",
    question: "If it goes wrong, how bad and how hard to reverse?",
    options: [
      { value: "small", label: "Small, easy to put right" },
      { value: "costly", label: "Costly or hard to reverse" },
    ],
  },
];

export type Suggestion = { route: string; review: boolean; text: string };

// Returns a suggestion only when all four questions are answered.
export function suggestRoute(a: Assessment | null | undefined): Suggestion | null {
  if (!a || !a.digital || !a.rules || !a.presence || !a.stakes) return null;
  if (a.presence === "yes" || a.digital === "no") {
    return { route: "person", review: false, text: "A person: it needs someone there, or part of it isn't digital." };
  }
  if (a.rules === "clear") {
    return a.stakes === "costly"
      ? { route: "n8n", review: true, text: "An automation, with a person checking the result: the rules are clear but a mistake is costly." }
      : { route: "n8n", review: true, text: "An automation: clear rules and a small cost if it goes wrong. Check results until it has earned trust." };
  }
  return a.stakes === "costly"
    ? { route: "claude", review: true, text: "An AI assistant drafts and a person approves: it takes judgement and a mistake is costly." }
    : { route: "claude", review: true, text: "An AI assistant, with a person checking the result until it has earned trust: it takes judgement but a mistake is small." };
}

export function parseAssessment(raw: unknown): Assessment {
  const a = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, options: T[]) => (options.includes(v as T) ? (v as T) : undefined);
  return {
    digital: pick(a.digital, ["yes", "no"]),
    rules: pick(a.rules, ["clear", "judgement"]),
    presence: pick(a.presence, ["yes", "no"]),
    stakes: pick(a.stakes, ["small", "costly"]),
  };
}

export type StepState = "done" | "now" | "check" | "stuck" | "next" | "skipped";

// How a task's status shows on the step strip.
export function stepState(status: string | undefined): StepState {
  if (!status) return "next";
  if (status === "done") return "done";
  if (status === "awaiting_review") return "check";
  if (["blocked", "failed", "escalated"].includes(status)) return "stuck";
  if (status === "cancelled") return "skipped";
  return "now";
}

export const STEP_STATE_LABEL: Record<StepState, string> = {
  done: "Done",
  now: "Current step",
  check: "Result to check",
  stuck: "Stuck",
  next: "Not started",
  skipped: "Cancelled",
};

// A Claude step that started more than this long ago and never reported back is treated as lost.
export const CLAUDE_STALE_MINUTES = 8;
