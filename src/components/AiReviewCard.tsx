import type { CheckpointReview } from "@/lib/ai";

const READY: Record<string, { tone: string; text: string }> = {
  ready: { tone: "go", text: "Ready for the next step" },
  nearly: { tone: "wait", text: "Nearly there" },
  not_yet: { tone: "stop", text: "Not ready yet" },
};
const SEV: Record<string, { tone: string; text: string }> = {
  critical: { tone: "stop", text: "Critical" },
  important: { tone: "wait", text: "Important" },
  minor: { tone: "quiet", text: "Minor" },
};

export default function AiReviewCard({ review, createdAt }: { review: CheckpointReview; createdAt: string }) {
  const r = READY[review.readiness] ?? READY.nearly;
  return (
    <div className="card overflow-hidden p-0">
      <div className="border-b border-[var(--line)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="display text-2xl font-bold">The AI&apos;s challenge</h3>
          <span className="tag" data-tone={r.tone}>{r.text}</span>
        </div>
        <p className="mt-3 text-lg leading-relaxed">{review.verdict}</p>
        <p className="hint mt-2">
          Reviewed {new Date(createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      {review.challenges.length > 0 && (
        <ol className="divide-y divide-[var(--line)]">
          {review.challenges.map((c, i) => (
            <li key={i} className="grid gap-3 p-5 sm:grid-cols-[2rem_1fr]">
              <span className="display text-2xl font-bold text-[var(--muted)]">{i + 1}</span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-semibold">{c.area}</h4>
                  <span className="tag" data-tone={SEV[c.severity]?.tone}>{SEV[c.severity]?.text}</span>
                </div>
                <p className="mt-1">{c.problem}</p>
                <p className="mt-3 font-semibold">{c.question}</p>
                <p className="mt-2 rounded border-l-4 border-[var(--go)] bg-[var(--go-tint)] px-3 py-2 text-sm">
                  <span className="font-semibold">Smallest test: </span>
                  {c.smallest_test}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="grid gap-5 border-t border-[var(--line)] p-5 sm:grid-cols-3">
        <div>
          <h4 className="font-semibold">Would sink the plan if wrong</h4>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {review.riskiest_assumptions.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
        <div>
          <h4 className="font-semibold">Doesn&apos;t add up</h4>
          {review.contradictions.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {review.contradictions.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          ) : (
            <p className="hint mt-2">No contradictions found.</p>
          )}
        </div>
        <div>
          <h4 className="font-semibold">Solid</h4>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {review.strengths.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      </div>
      <p className="border-t border-[var(--line)] bg-[var(--paper)] p-5 text-sm">
        This review checks your plan for gaps, contradictions and beliefs you haven&apos;t proven. It does not predict
        whether the business will succeed. That depends on how the plan is carried out, on the market, and on things no
        plan can foresee.
      </p>
    </div>
  );
}
