import Link from "next/link";
import { CHECKS, PEOPLE_QUESTIONS, RESPONSES, tally, type CheckpointReview } from "@/lib/ai";
import type { TestTask } from "@/lib/challenges";
import { answerChallenge } from "@/app/b/[id]/actions";

const ANSWER_HELP: Record<string, string> = {
  fixed: "You've changed the plan to deal with it.",
  testing: "Sets the test below as a task for you, due in a week.",
  accepted: "Adds it to your list of risks.",
  ignored: "You don't think it matters. Kept with the review.",
};

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
  answer,
  tests,
}: {
  review: CheckpointReview;
  createdAt: string;
  responses?: Record<string, string> | null;
  // When given, each challenge can be answered with one press.
  answer?: { businessId: string; reviewId: string; returnTo: string };
  tests?: Record<string, TestTask>;
}) {
  const unanswered = review.challenges.filter((_, i) => !responses?.[String(i)]).length;
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

      {review.challenges.length > 0 && answer && (
        <div id="challenges" className="scroll-mt-6 border-b border-[var(--line)] bg-[var(--paper)] p-5">
          <h4 className="font-semibold">
            {unanswered === 0
              ? `All ${review.challenges.length} challenges answered.`
              : `${unanswered} of ${review.challenges.length} challenges still ${unanswered === 1 ? "needs" : "need"} an answer.`}
          </h4>
          <p className="hint mt-1">
            Answer each one with one press. &ldquo;Will test it&rdquo; sets the test as a task. &ldquo;Accept the risk&rdquo; adds it to
            your risks. Disagreeing is allowed. You can change an answer later.
          </p>
        </div>
      )}
      {review.challenges.length > 0 && (
        <ol className="divide-y divide-[var(--line)]">
          {review.challenges.map((c, i) => (
            <li key={i} id={`challenge-${i}`} className="grid scroll-mt-6 gap-3 p-5 sm:grid-cols-[2rem_1fr]">
              <span className="display text-2xl font-bold text-[var(--muted)]">{i + 1}</span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-semibold">{c.area}</h4>
                  <span className="tag" data-tone={SEV[c.severity]?.tone}>{SEV[c.severity]?.text}</span>
                  {responses?.[String(i)] ? <span className="tag" data-tone="quiet">You: {RESPONSES[responses[String(i)]]}</span> : answer ? <span className="tag" data-tone="wait">Needs an answer</span> : null}
                </div>
                <p className="mt-1">{c.problem}</p>
                <p className="mt-3 font-semibold">{c.question}</p>
                <p className="mt-2 rounded border-l-4 border-[var(--go)] bg-[var(--go-tint)] px-3 py-2 text-sm">
                  <span className="font-semibold">Smallest test: </span>
                  {c.smallest_test}
                </p>
                {tests?.[String(i)] && answer && (
                  <p className="mt-2 text-sm">
                    {tests[String(i)].status === "done" ? (
                      <>
                        <span className="tag" data-tone={tests[String(i)].test_passed === false ? "stop" : tests[String(i)].test_passed ? "go" : "quiet"}>
                          {tests[String(i)].test_passed === false ? "Tested: did not pass" : tests[String(i)].test_passed ? "Tested: passed" : "Test done"}
                        </span>{" "}
                        {tests[String(i)].result}
                      </>
                    ) : (
                      <>
                        This test is set as a task{tests[String(i)].due_date ? `, due ${tests[String(i)].due_date}` : ""}.{" "}
                      </>
                    )}{" "}
                    <Link className="font-semibold underline underline-offset-4" href={`/b/${answer.businessId}/tasks?task=${tests[String(i)].id}`}>
                      Open the task
                    </Link>
                  </p>
                )}
                {answer && (
                  <form action={answerChallenge} className="mt-3">
                    <input type="hidden" name="business_id" value={answer.businessId} />
                    <input type="hidden" name="review_id" value={answer.reviewId} />
                    <input type="hidden" name="index" value={i} />
                    <input type="hidden" name="return_to" value={answer.returnTo} />
                    <p className="hint mb-2">{responses?.[String(i)] ? "Your answer. Press another to change it." : "Your answer:"}</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(RESPONSES).map(([k, v]) => (
                        <button
                          key={k}
                          name="response"
                          value={k}
                          title={ANSWER_HELP[k]}
                          aria-pressed={responses?.[String(i)] === k}
                          className={responses?.[String(i)] === k ? "btn" : "btn btn-secondary"}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </form>
                )}
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
