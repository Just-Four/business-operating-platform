import { STEP_STATE_LABEL, type StepState } from "@/lib/process";

const TONE: Record<StepState, string> = {
  done: "go",
  now: "wait",
  check: "wait",
  stuck: "stop",
  next: "quiet",
  skipped: "quiet",
};

// One mark per step of a process, showing where a run has got to.
export default function StepStrip({ items }: { items: { n: number; title: string; state: StepState }[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label="Steps">
      {items.map((s) => (
        <li key={s.n} title={`${s.n}. ${s.title}: ${STEP_STATE_LABEL[s.state]}`}>
          <span className="tag" data-tone={TONE[s.state]}>
            {s.n}
            {s.state === "done" ? " ✓" : s.state === "check" ? " ?" : s.state === "stuck" ? " !" : ""}
          </span>
          <span className="sr-only">
            {s.title}: {STEP_STATE_LABEL[s.state]}
          </span>
        </li>
      ))}
    </ol>
  );
}
