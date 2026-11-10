import { CHECKS, PEOPLE_QUESTIONS, RESPONSES, tally, type CheckpointReview } from "@/lib/ai";

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

export default function AiReviewCard({
  review,
  createdAt,
  responses,
}: {
  review: CheckpointReview;
  createdAt: string;
  responses?: Record<string, string> | null;
}) {
  const r = READY[review.readiness] ?? READY.nearly;
  const checks = review.checks ?? [];
  const t = tally(checks);
  const byId = new Map(checks.map((c) => [c.id, c]));

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
          {checks.length ? ", founding version of the reviewer" : ""}
        </p>
      </div>

      {checks.length > 0 && (
        <div className="border-b border-[var(--line)] p-5">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <p>
              <span className="display text-3xl font-bold">{t.critPassed}</span>
              <span className="text-[var(--muted)]"> of {t.critTotal} critical checks met</span>
            </p>
            <p>
              <span className="display text-3xl font-bold">{t.restPassed}</span>
              <span className="text-[var(--muted)]"> of {t.restTotal} other checks met</span>
            </p>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold">See every check and what it was based on</summary>
            <ul className="mt-3 divide-y divide-[var(--line)] text-sm">
              {CHECKS.map((c) => {
                const res = byId.get(c.id);
                const ok = res?.result === "yes";
                return (
                  <li key={c.id} className="grid gap-2 py-3 sm:grid-cols-[6.5rem_1fr]">
                    <span>
                      <span className="tag" data-tone={ok ? "go" : c.critical ? "stop" : "wait"}>{ok ? "Met" : "Not met"}</span>
                    </span>
                    <span>
                      <span className="font-semibold">{c.question}</span>
                      <span className="hint block">
                        {c.method}
                        {c.critical ? ", critical" : ""}
                        {c.computed ? ", worked out from your evidence grades" : ""}
                      </span>
                      {res?.quote && <span className="mt-1 block border-l-2 border-[var(--line)] pl-2 italic">&ldquo;{res.quote}&rdquo;</span>}
                      {res?.reason && <span className="mt-1 block">{res.reason}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </details>
        </div>
      )}

      {review.challenges.length > 0 && (
        <ol className="divide-y divide-[var(--line)]">
          {review.challenges.map((c, i) => (
            <li key={i} className="grid gap-3 p-5 sm:grid-cols-[2rem_1fr]">
              <span className="display text-2xl font-bold text-[var(--muted)]">{i + 1}</span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-semibold">{c.area}</h4>
                  <span className="tag" data-tone={SEV[c.severity]?.tone}>{SEV[c.severity]?.text}</span>
                  {responses?.[String(i)] && <span className="tag" data-tone="quiet">You: {RESPONSES[responses[String(i)]]}</span>}
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

      {checks.length > 0 && (
        <div className="border-t border-[var(--line)] p-5">
          <h4 className="font-semibold">Questions only you can answer</h4>
          <p className="hint mt-1">The AI can&apos;t judge these from a written plan. Answer them honestly to yourself, or to whoever reviews your plan.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {PEOPLE_QUESTIONS.map((q) => <li key={q}>{q}</li>)}
          </ul>
        </div>
      )}

      <p className="border-t border-[var(--line)] bg-[var(--paper)] p-5 text-sm">
        This review checks your plan for gaps, contradictions and beliefs you haven&apos;t proven. It does not predict
        whether the business will succeed. That depends on how the plan is carried out, on the market, and on things no
        plan can foresee.
      </p>
    </div>
  );
}
