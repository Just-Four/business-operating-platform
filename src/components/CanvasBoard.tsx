"use client";

import { useMemo, useState } from "react";
import { CANVAS_BOXES } from "@/lib/framework";

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

type Row = { answer: string; evidence: string };

export default function CanvasBoard({
  businessId,
  initial,
  action,
}: {
  businessId: string;
  initial: Record<string, Row>;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [rows, setRows] = useState<Record<string, Row>>(() => {
    const out: Record<string, Row> = {};
    for (const b of CANVAS_BOXES) out[b.key] = initial[b.key] ?? { answer: "", evidence: "" };
    return out;
  });
  const [dirty, setDirty] = useState(false);

  const counts = useMemo(() => {
    let filled = 0;
    let evidence = 0;
    for (const b of CANVAS_BOXES) {
      if (rows[b.key].answer.trim()) {
        filled++;
        if (rows[b.key].evidence.trim()) evidence++;
      }
    }
    return { filled, evidence, assumptions: filled - evidence };
  }, [rows]);

  function update(key: string, field: keyof Row, value: string) {
    setRows((r) => ({ ...r, [key]: { ...r[key], [field]: value } }));
    setDirty(true);
  }

  return (
    <form action={action} onSubmit={() => setDirty(false)}>
      <input type="hidden" name="business_id" value={businessId} />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
        <span className="tag" data-tone="go">
          {counts.evidence} backed by evidence
        </span>
        <span className="tag" data-tone="wait">
          {counts.assumptions} still assumptions
        </span>
        <span className="tag" data-tone="quiet">
          {9 - counts.filled} empty
        </span>
      </div>

      <div className="canvas-board">
        {CANVAS_BOXES.map((box) => {
          const row = rows[box.key];
          const state = !row.answer.trim() ? "empty" : row.evidence.trim() ? "evidence" : "assumption";
          return (
            <div key={box.key} className="tile" data-state={state} style={{ gridArea: AREA[box.key] }}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <label htmlFor={`${box.key}_answer`} className="display font-bold leading-tight">
                  {box.title}
                </label>
                {state === "evidence" && (
                  <span className="tag" data-tone="go">
                    Evidence
                  </span>
                )}
                {state === "assumption" && (
                  <span className="tag" data-tone="wait">
                    Assumption
                  </span>
                )}
              </div>
              <p className="hint mt-1 mb-2 leading-snug">{box.question}</p>
              <textarea
                id={`${box.key}_answer`}
                name={`${box.key}_answer`}
                className="tile-area"
                value={row.answer}
                onChange={(e) => update(box.key, "answer", e.target.value)}
              />
              <input
                name={`${box.key}_evidence`}
                aria-label={`Evidence for ${box.title}`}
                className="tile-evidence"
                placeholder="Evidence"
                value={row.evidence}
                onChange={(e) => update(box.key, "evidence", e.target.value)}
              />
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-0 mt-6 flex flex-wrap items-center gap-4 border-t border-[var(--line)] bg-[var(--paper)] py-4">
        <button className="btn">Save business model</button>
        <span className="hint">
          {dirty ? "You have unsaved changes." : "Boxes without evidence become assumptions to test in the launch plan."}
        </span>
      </div>
    </form>
  );
}
