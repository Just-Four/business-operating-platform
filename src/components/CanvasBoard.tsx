"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CANVAS_BOXES, gradeOf, isStale, STRENGTH_LABEL, type Grade } from "@/lib/framework";
import EvidencePanel, { type EvidenceItem } from "./EvidencePanel";

const AREA: Record<string, string> = {
  key_partners: "kp",
  key_activities: "ka",
  key_resources: "kr",
  value_proposition: "vp",
  customer_relationships: "cr",
  channels: "ch",
  customer_segments: "cs",
  cost_structure: "co",
  revenue_streams: "rs",
};

const GRADE_TAG: Record<Exclude<Grade, "empty">, { tone: string; text: string }> = {
  proven: { tone: "go", text: "Proven" },
  supported: { tone: "wait", text: "Supported" },
  assumption: { tone: "stop", text: "Assumption" },
};

type EvAction = (formData: FormData) => Promise<{ error: string | null }>;

function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={3} {...props} />;
}

export default function CanvasBoard({
  businessId,
  initial,
  evidence,
  action,
  addEvidence,
  deleteEvidence,
}: {
  businessId: string;
  initial: Record<string, string>;
  evidence: EvidenceItem[];
  action: (formData: FormData) => void | Promise<void>;
  addEvidence: EvAction;
  deleteEvidence: EvAction;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const b of CANVAS_BOXES) out[b.key] = initial[b.key] ?? "";
    return out;
  });
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const close = useCallback(() => setOpen(null), []);

  const byBox = useMemo(() => {
    const m: Record<string, EvidenceItem[]> = {};
    for (const e of evidence) (m[e.subject_key] ??= []).push(e);
    return m;
  }, [evidence]);

  const grades = useMemo(() => {
    const g: Record<string, Grade> = {};
    for (const b of CANVAS_BOXES) g[b.key] = gradeOf(!!answers[b.key].trim(), byBox[b.key] ?? []);
    return g;
  }, [answers, byBox]);

  const counts = useMemo(() => {
    const c = { proven: 0, supported: 0, assumption: 0, empty: 0 };
    for (const b of CANVAS_BOXES) c[grades[b.key]]++;
    return c;
  }, [grades]);

  const openBox = CANVAS_BOXES.find((b) => b.key === open);

  return (
    <>
      <form action={action} onSubmit={() => setDirty(false)}>
        <input type="hidden" name="business_id" value={businessId} />

        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
          <span className="tag" data-tone="go">{counts.proven} proven</span>
          <span className="tag" data-tone="wait">{counts.supported} supported</span>
          <span className="tag" data-tone="stop">{counts.assumption} assumptions</span>
          <span className="tag" data-tone="quiet">{counts.empty} empty</span>
          <span className="hint ml-1">Proven needs strong evidence: a contract, a booking or payment, or our own trading data.</span>
        </div>

        <div className="canvas-board">
          {CANVAS_BOXES.map((box) => {
            const grade = grades[box.key];
            const items = byBox[box.key] ?? [];
            const best = items.find((i) => i.strength === "strong") ?? items.find((i) => i.strength === "medium") ?? items[0];
            const stale = items.filter((i) => isStale(i.strength, i.evidence_date)).length;
            return (
              <div key={box.key} className="tile" data-state={grade} style={{ gridArea: AREA[box.key] }}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <label htmlFor={`${box.key}_answer`} className="display font-bold leading-tight">
                    {box.title}
                  </label>
                  {grade !== "empty" && (
                    <span className="tag" data-tone={GRADE_TAG[grade].tone}>
                      {GRADE_TAG[grade].text}
                    </span>
                  )}
                </div>
                <p className="hint mt-1 mb-2 leading-snug">{box.question}</p>
                <AutoTextarea
                  id={`${box.key}_answer`}
                  name={`${box.key}_answer`}
                  placeholder="Write your answer here"
                  className="tile-area"
                  value={answers[box.key]}
                  onChange={(e) => {
                    setAnswers((a) => ({ ...a, [box.key]: e.target.value }));
                    setDirty(true);
                  }}
                />
                <button type="button" className="tile-evidence-row text-left" onClick={() => setOpen(box.key)}>
                  <span className="tile-evidence-label">Evidence</span>
                  <span className="min-w-0 flex-1 text-[12.5px] leading-snug">
                    {items.length === 0
                      ? "None yet"
                      : `${items.length} (best ${STRENGTH_LABEL[best!.strength].toLowerCase()})${stale ? `, ${stale} out of date` : ""}`}
                  </span>
                  <span aria-hidden="true" className="text-[var(--muted)]">+</span>
                </button>
              </div>
            );
          })}
        </div>

        <div className="sticky bottom-0 mt-6 flex flex-wrap items-center gap-4 border-t border-[var(--line)] bg-[var(--paper)] py-4">
          <button className="btn">Save business model</button>
          <span className="hint">
            {dirty ? "You have unsaved changes to the answers." : "Evidence saves as soon as you add it."}
          </span>
        </div>
      </form>

      {openBox && (
        <EvidencePanel
          businessId={businessId}
          subjectType="canvas"
          subjectKey={openBox.key}
          title={openBox.title}
          claim={answers[openBox.key]}
          items={byBox[openBox.key] ?? []}
          onClose={close}
          addAction={addEvidence}
          deleteAction={deleteEvidence}
        />
      )}
    </>
  );
}
