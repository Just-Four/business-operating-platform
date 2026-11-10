"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  EVIDENCE_KINDS,
  STRENGTH_LABEL,
  isStale,
  type EvidenceStrength,
} from "@/lib/framework";

export type EvidenceItem = {
  id: string;
  subject_key: string;
  kind: string;
  strength: EvidenceStrength;
  summary: string;
  source: string | null;
  evidence_date: string;
  link: string | null;
};

type Action = (formData: FormData) => Promise<{ error: string | null }>;

const TONE: Record<EvidenceStrength, string> = { strong: "go", medium: "wait", weak: "quiet" };

export default function EvidencePanel({
  businessId,
  subjectType,
  subjectKey,
  title,
  claim,
  items,
  onClose,
  addAction,
  deleteAction,
}: {
  businessId: string;
  subjectType: string;
  subjectKey: string;
  title: string;
  claim: string;
  items: EvidenceItem[];
  onClose: () => void;
  addAction: Action;
  deleteAction: Action;
}) {
  const [kind, setKind] = useState("written_commitment");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const today = new Date().toISOString().slice(0, 10);
  const selected = EVIDENCE_KINDS.find((k) => k.key === kind)!;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const sorted = [...items].sort((a, b) => {
    const rank = { strong: 0, medium: 1, weak: 2 };
    return rank[a.strength] - rank[b.strength] || b.evidence_date.localeCompare(a.evidence_date);
  });

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(31,42,68,0.45)]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ev-title"
        className="h-full w-full max-w-xl overflow-y-auto bg-[var(--surface)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="hint">Evidence for</p>
            <h2 id="ev-title" className="text-3xl font-bold leading-tight">
              {title}
            </h2>
          </div>
          <button ref={closeRef} type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>

        {claim.trim() ? (
          <blockquote className="mt-4 whitespace-pre-line border-l-4 border-[var(--line)] pl-3 text-sm">{claim}</blockquote>
        ) : (
          <p className="hint mt-4">Write the answer on the board first, then back it up here.</p>
        )}

        <h3 className="mt-8 text-lg font-bold">What backs this up</h3>
        {sorted.length === 0 && (
          <p className="hint mt-1">Nothing yet. Until there is, this box is an assumption to test in the launch plan.</p>
        )}
        <ul className="mt-2 space-y-2">
          {sorted.map((it) => {
            const k = EVIDENCE_KINDS.find((x) => x.key === it.kind);
            const stale = isStale(it.strength, it.evidence_date);
            return (
              <li key={it.id} className="rounded border border-[var(--line)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tag" data-tone={TONE[it.strength]}>
                    {STRENGTH_LABEL[it.strength]}
                  </span>
                  <span className="text-sm font-semibold">{k?.label ?? it.kind}</span>
                  <span className="hint">{it.evidence_date}</span>
                  {stale && (
                    <span className="tag" data-tone="stop">
                      Out of date
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm">{it.summary}</p>
                {(it.source || it.link) && (
                  <p className="hint mt-1">
                    {it.source}
                    {it.source && it.link ? ", " : ""}
                    {it.link && (
                      <a href={it.link} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                        open document
                      </a>
                    )}
                  </p>
                )}
                <form
                  className="mt-2"
                  action={(fd) =>
                    start(async () => {
                      const res = await deleteAction(fd);
                      setError(res.error);
                    })
                  }
                >
                  <input type="hidden" name="business_id" value={businessId} />
                  <input type="hidden" name="id" value={it.id} />
                  <button className="text-sm text-[var(--stop)] underline-offset-2 hover:underline" disabled={pending}>
                    Remove
                  </button>
                </form>
              </li>
            );
          })}
        </ul>

        <h3 className="mt-8 text-lg font-bold">Add evidence</h3>
        {error && <p className="mt-2 rounded bg-[var(--stop-tint)] p-2 text-sm text-[var(--stop)]">{error}</p>}
        <form
          ref={formRef}
          className="mt-3 space-y-3"
          action={(fd) =>
            start(async () => {
              const res = await addAction(fd);
              setError(res.error);
              if (!res.error) formRef.current?.reset();
            })
          }
        >
          <input type="hidden" name="business_id" value={businessId} />
          <input type="hidden" name="subject_type" value={subjectType} />
          <input type="hidden" name="subject_key" value={subjectKey} />

          <fieldset>
            <legend className="label">What kind of evidence is it?</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {EVIDENCE_KINDS.map((k) => (
                <label
                  key={k.key}
                  className={`flex cursor-pointer items-start gap-2 rounded border p-2 text-sm ${kind === k.key ? "border-[var(--ink)] bg-[var(--paper)]" : "border-[var(--line)]"}`}
                >
                  <input
                    type="radio"
                    name="kind"
                    value={k.key}
                    checked={kind === k.key}
                    onChange={() => setKind(k.key)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-semibold">{k.label}</span>
                    <span className="hint block leading-snug">{k.example}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="hint mt-2">
              This counts as <strong>{STRENGTH_LABEL[selected.strength].toLowerCase()}</strong> evidence.
              {selected.strength === "weak" && " On its own it won't move the box off assumption."}
            </p>
          </fieldset>

          <div>
            <label className="label" htmlFor="ev-summary">What it shows</label>
            <textarea
              id="ev-summary"
              name="summary"
              required
              rows={2}
              className="input"
              placeholder="e.g. Jones Engineering confirmed 12 beds in Luleå from March"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="ev-source">Who or where it came from</label>
              <input id="ev-source" name="source" className="input" placeholder="Name, company or report" />
            </div>
            <div>
              <label className="label" htmlFor="ev-date">Dated</label>
              <input id="ev-date" name="evidence_date" type="date" defaultValue={today} className="input" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="ev-link">Link to the document</label>
            <input id="ev-link" name="link" type="url" className="input" placeholder="Drive, email or website link" />
          </div>
          <button className="btn" disabled={pending}>
            {pending ? "Adding…" : "Add evidence"}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
}
