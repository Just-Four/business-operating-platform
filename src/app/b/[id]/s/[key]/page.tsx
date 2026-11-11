import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CANVAS_PLAIN, LOOKBACK_MEASURES, LOOKBACK_SESSION, SESSIONS, TECH_TERM, sessionByKey, sessionTitle } from "@/lib/programme";
import { guidanceFor } from "@/lib/guidance";
import { CANVAS_BOXES, gradeOf, type EvidenceStrength } from "@/lib/framework";
import { addEvidence, deleteEvidence, recordReview, finishSession, saveCanvas, saveDiagnosis, saveLookback, runAiReview, acceptAiReview } from "../../actions";
import AiReviewCard from "@/components/AiReviewCard";
import PendingButton from "@/components/PendingButton";
import { RESPONSES, type CheckpointReview } from "@/lib/ai";

export const maxDuration = 60;

const PART_LABEL: Record<string, string> = { launch: "launch plan", direction: "direction", year: "This year", quarter: "This quarter", team: "Roles and team" };
import Notice from "@/components/Notice";
import CanvasBoard from "@/components/CanvasBoard";

const GRADE_TONE: Record<string, { tone: string; text: string }> = {
  proven: { tone: "go", text: "Proven" },
  supported: { tone: "wait", text: "Supported" },
  assumption: { tone: "stop", text: "Assumption" },
  empty: { tone: "quiet", text: "Empty" },
};

function FinishForm({ id, sessionKey, label = "Finish session", quiet = false }: { id: string; sessionKey: string; label?: string; quiet?: boolean }) {
  return (
    <form action={finishSession}>
      <input type="hidden" name="business_id" value={id} />
      <input type="hidden" name="session_key" value={sessionKey} />
      <button className={quiet ? "btn btn-secondary" : "btn"}>{label}</button>
    </form>
  );
}

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; key: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id, key } = await params;
  const { error, saved } = await searchParams;
  const baseSession = sessionByKey(key);
  if (!baseSession) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isCheckpoint = key === "checkpoint_1" || key === "sign_off";
  const { data: aiReview } = isCheckpoint
    ? await supabase.from("ai_reviews").select("id, content, created_at, responses").eq("business_id", id).eq("kind", "checkpoint").eq("session_key", key).order("created_at", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  const [{ data: biz }, { data: row }, { data: me }, { data: canvas }, { data: evidence }, { data: diag }] = await Promise.all([
    supabase.from("businesses").select("name, model, stage, currency, planning_route").eq("id", id).single(),
    supabase.from("programme_sessions").select("scheduled_on, completed_at, approved_at, review_type, reviewer_name, reviewer_role, review_notes").eq("business_id", id).eq("key", key).maybeSingle(),
    supabase.from("memberships").select("role").eq("business_id", id).eq("user_id", user?.id ?? "").maybeSingle(),
    supabase.from("canvas_boxes").select("box, answer").eq("business_id", id),
    supabase
      .from("evidence")
      .select("id, subject_key, kind, strength, summary, source, evidence_date, link")
      .eq("business_id", id)
      .eq("subject_type", "canvas"),
    supabase
      .from("diagnoses")
      .select("id, diagnosis, guiding_policy, coordinated_actions")
      .eq("business_id", id)
      .eq("is_current", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const lookbackMode = key === "launch_path" && !!biz?.stage && biz.stage !== "launch";
  const session = lookbackMode
    ? { ...baseSession, title: LOOKBACK_SESSION.title, minutes: LOOKBACK_SESSION.minutes, why: LOOKBACK_SESSION.why, skipCost: LOOKBACK_SESSION.skipCost, output: LOOKBACK_SESSION.output, part: undefined }
    : baseSession;
  const { data: lookback } = lookbackMode
    ? await supabase.from("lookbacks").select("*").eq("business_id", id).order("updated_at", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  const lbItems: { measure: string; budget: string | null; actual: string | null; timing: string | null; cause: string | null }[] =
    lookback?.items ?? [];
  const guide = guidanceFor(biz?.model);
  const answers: Record<string, string> = {};
  for (const r of canvas ?? []) answers[r.box] = r.answer ?? "";
  const ev = evidence ?? [];
  const { data: progKeys } = await supabase.from("programme_sessions").select("key").eq("business_id", id);
  const inProg = new Set((progKeys ?? []).map((r) => r.key));
  const visible = SESSIONS.filter((s) => inProg.size === 0 || inProg.has(s.key));
  const prev = [...visible].reverse().find((s) => s.seq < session.seq);
  const next = visible.find((s) => s.seq > session.seq);
  const here = `/b/${id}/s/${key}`;
  // Businesses that went straight to the board aren't on a programme, so session numbers mean nothing to them.
  const standalone = biz?.planning_route === "board";

  return (
    <div className="max-w-3xl">
      <Notice error={error} saved={saved} />
      {standalone ? (
        <p className="hint">{isCheckpoint ? "Plan review" : "Guided step"}</p>
      ) : (
        <p className="hint">
          Session {visible.findIndex((s) => s.key === key) + 1} of {visible.length}, about {session.minutes} minutes
          {row?.scheduled_on ? `, planned for ${row.scheduled_on}` : ""}
          {row?.completed_at ? ", done" : ""}
        </p>
      )}
      <h1 className="text-4xl font-bold leading-tight sm:text-5xl">{standalone && key === "sign_off" ? "Get the plan challenged" : session.title}</h1>
      {isCheckpoint && !row?.approved_at && (
        <p className="mt-4">
          <a href="#review-options" className="btn">Go straight to the review</a>
        </p>
      )}

      <section className="mt-6 border-l-4 border-[var(--wait)] bg-[var(--surface)] p-5" aria-label="Why this matters">
        <h2 className="text-lg font-bold">Why this matters</h2>
        <p className="mt-1">{session.why}</p>
        {session.skipCost && <p className="mt-3 text-[var(--muted)]">{session.skipCost}</p>}
        <p className="mt-3 text-sm">
          <span className="font-semibold">By the end you&apos;ll have:</span> {session.output}
        </p>
      </section>

      <div className="mt-8">
        {!session.built && (
          <div className="card p-6">
            <p className="font-semibold">This session isn&apos;t available yet.</p>
            <p className="hint mt-1">Everything up to here is ready to work through now.</p>
          </div>
        )}

        {key === "commit" && (
          <div className="card p-6">
            <p>
              Choose a date for each session and the day the plan should be signed off. Then commit to them. Treat them
              like meetings with someone you respect.
            </p>
            <Link href={`/b/${id}/programme`} className="btn mt-4">
              Set my dates
            </Link>
          </div>
        )}

        {session.boxes && (
          <form action={saveCanvas} className="space-y-6">
            <input type="hidden" name="business_id" value={id} />
            <input type="hidden" name="session_key" value={key} />
            <input type="hidden" name="return_to" value={here} />
            {session.boxes.map((b) => (
              <div key={b} className="card p-5">
                <label htmlFor={b} className="display block text-xl font-bold">
                  {CANVAS_PLAIN[b].question}
                </label>
                <p className="hint mt-1">
                  {CANVAS_PLAIN[b].help} <span className="text-[#8a93a3]">({TECH_TERM[b]})</span>
                </p>
                <textarea id={b} name={`${b}_answer`} rows={4} className="input mt-3" placeholder={guide.canvas[b]} defaultValue={answers[b] ?? ""} />
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-secondary">Save and carry on later</button>
              <button className="btn" name="finish" value="1">
                Save and finish session
              </button>
            </div>
          </form>
        )}

        {key === "evidence" && (
          <div className="space-y-6">
            <div className="card p-5">
              <p>
                Go through each box and click <strong>Evidence</strong> at the bottom. Add what you actually have: a signed
                contract, an order, an email, your own figures. Be strict. A conversation is weak; a signature is strong.
              </p>
              <p className="hint mt-2">
                Whatever stays red is an assumption. That&apos;s fine at this stage: those become the things you test first.
              </p>
            </div>
            <CanvasBoard
              businessId={id}
              initial={answers}
              evidence={ev}
              examples={guide.canvas}
              returnTo={here}
              action={saveCanvas}
              addEvidence={addEvidence}
              deleteEvidence={deleteEvidence}
            />
            <FinishForm id={id} sessionKey={key} />
          </div>
        )}

        {key === "diagnosis" && (
          <form action={saveDiagnosis} className="space-y-6">
            <input type="hidden" name="business_id" value={id} />
            <input type="hidden" name="session_key" value={key} />
            <input type="hidden" name="return_to" value={here} />
            {diag?.id && <input type="hidden" name="id" value={diag.id} />}
            <div className="card p-5">
              <label htmlFor="diagnosis" className="display block text-xl font-bold">
                What&apos;s the one thing most likely to stop this working?
              </label>
              <p className="hint mt-1">
                Be specific, for example {guide.diagnosis} <span className="text-[#8a93a3]">(Diagnosis)</span>
              </p>
              <textarea id="diagnosis" name="diagnosis" rows={3} className="input mt-3" defaultValue={diag?.diagnosis ?? ""} />
            </div>
            <div className="card p-5">
              <label htmlFor="guiding_policy" className="display block text-xl font-bold">
                So what&apos;s your approach to it, and what won&apos;t you do?
              </label>
              <p className="hint mt-1">
                One or two sentences. Saying what you won&apos;t do is what makes it a choice.{" "}
                <span className="text-[#8a93a3]">(Guiding policy)</span>
              </p>
              <textarea id="guiding_policy" name="guiding_policy" rows={3} className="input mt-3" defaultValue={diag?.guiding_policy ?? ""} />
            </div>
            <div className="card p-5">
              <label htmlFor="coordinated_actions" className="display block text-xl font-bold">
                Which three to five actions, done together, carry that out?
              </label>
              <p className="hint mt-1">
                One per line. They should support each other, not be a wish list.{" "}
                <span className="text-[#8a93a3]">(Coordinated actions)</span>
              </p>
              <textarea
                id="coordinated_actions"
                name="coordinated_actions"
                rows={5}
                className="input mt-3"
                defaultValue={(diag?.coordinated_actions ?? []).join("\n")}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-secondary">Save and carry on later</button>
              <button className="btn" name="finish" value="1">
                Save and finish session
              </button>
            </div>
          </form>
        )}

        {isCheckpoint && (
          <div className="space-y-6">
            {key === "sign_off" && (
              <div className="card p-5">
                <h2 className="text-xl font-bold">The whole plan, one last time</h2>
                <p className="mt-2 text-sm">
                  This review covers everything: the business model, diagnosis, direction, the year&apos;s battles and
                  numbers, and this quarter&apos;s priorities. Read these through before you ask for the challenge.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link className="btn btn-secondary" href={`/b/${id}/year`}>Open the year plan</Link>
                  <Link className="btn btn-secondary" href={`/b/${id}/quarter`}>Open this quarter</Link>
                </div>
              </div>
            )}
            <div className="card p-5">
              <h2 className="text-xl font-bold">The questions to be challenged on</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {key === "sign_off" && <li>Do the battles answer the obstacle, and does each have an owner and a number?</li>}
                {key === "sign_off" && <li>Could you still pay the bills if sales only reached the promise?</li>}
                <li>Is it clear exactly who pays, and could you find them?</li>
                <li>Would they really choose this over what they do today?</li>
                <li>Does the money add up at a realistic volume?</li>
                <li>Is the diagnosis a real obstacle, or just a goal like &quot;growth&quot;?</li>
                <li>Which assumptions are most dangerous if they&apos;re wrong?</li>
              </ul>
            </div>
            <div className="card divide-y divide-[var(--line)]">
              {CANVAS_BOXES.map((b) => {
                const grade = gradeOf(
                  !!(answers[b.key] ?? "").trim(),
                  ev.filter((e) => e.subject_key === b.key) as { strength: EvidenceStrength; evidence_date: string }[]
                );
                return (
                  <div key={b.key} className="grid gap-2 p-4 sm:grid-cols-[12rem_1fr_auto]">
                    <span className="font-semibold">{CANVAS_PLAIN[b.key].question}</span>
                    <span className="whitespace-pre-line text-sm">{answers[b.key] || "—"}</span>
                    <span className="tag self-start" data-tone={GRADE_TONE[grade].tone}>{GRADE_TONE[grade].text}</span>
                  </div>
                );
              })}
              <div className="grid gap-2 p-4 sm:grid-cols-[12rem_1fr]">
                <span className="font-semibold">Biggest obstacle</span>
                <span className="text-sm">{diag?.diagnosis || "—"}</span>
              </div>
              <div className="grid gap-2 p-4 sm:grid-cols-[12rem_1fr]">
                <span className="font-semibold">Approach</span>
                <span className="text-sm">{diag?.guiding_policy || "—"}</span>
              </div>
            </div>
            {row?.approved_at ? (
              <div className="card border-[var(--go)] p-5">
                <p className="tag" data-tone="go">Reviewed</p>
                <p className="mt-2 text-sm">
                  {row.review_type === "ai" ? "Reviewed by AI" : `Reviewed by ${row.reviewer_name ?? "someone else"}${row.reviewer_role ? ` (${row.reviewer_role})` : ""}`}
                  {row.approved_at ? ` on ${String(row.approved_at).slice(0, 10)}` : ""}.
                </p>
                {row.review_notes && <p className="mt-2 whitespace-pre-line text-sm text-[var(--muted)]">{row.review_notes}</p>}
              </div>
            ) : null}
            {row?.approved_at ? (
              <form id="ai-review" action={runAiReview} className="card flex flex-wrap items-center justify-between gap-3 p-5">
                <input type="hidden" name="business_id" value={id} />
                <input type="hidden" name="session_key" value={key} />
                <p className="text-sm">
                  {aiReview ? "Changed the plan since? Get a fresh challenge." : "Get the AI's challenge as well. It takes about half a minute."}
                </p>
                <PendingButton label={aiReview ? "Run the AI review again" : "Run the AI review"} pending="Reviewing your plan…" className="btn btn-secondary" />
              </form>
            ) : null}
            {row?.approved_at && aiReview ? (
              <AiReviewCard review={aiReview.content as CheckpointReview} createdAt={aiReview.created_at} responses={aiReview.responses as Record<string, string>} />
            ) : null}
            {row?.approved_at ? null : (
              <div className="space-y-4">
                <h2 id="review-options" className="scroll-mt-6 text-2xl font-bold">How do you want it challenged?</h2>
                <form action={recordReview} className="card space-y-4 p-5">
                  <input type="hidden" name="business_id" value={id} />
                  <input type="hidden" name="session_key" value={key} />
                  <div>
                    <h3 className="display text-xl font-bold">Run it by someone else</h3>
                    <p className="hint mt-1">
                      Show the summary above to someone whose judgement you trust: a business partner, mentor, adviser,
                      investor, lender or board member. Ask them the questions above, then record what they said.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label" htmlFor="reviewer_name">Who reviewed it</label>
                      <input id="reviewer_name" name="reviewer_name" required className="input" />
                    </div>
                    <div>
                      <label className="label" htmlFor="reviewer_role">Their role</label>
                      <select id="reviewer_role" name="reviewer_role" className="input" defaultValue="Mentor or adviser">
                        <option>Business partner</option>
                        <option>Mentor or adviser</option>
                        <option>Investor or lender</option>
                        <option>Board member or chair</option>
                        <option>Accountant</option>
                        <option>Other</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="label" htmlFor="review_notes">What did they challenge, and what did you change?</label>
                    <textarea id="review_notes" name="review_notes" required rows={4} className="input" />
                  </div>
                  <button className="btn">Record the review and carry on</button>
                </form>

                <div id="ai-review" className="card space-y-4 p-5">
                  <div>
                    <h3 className="display text-xl font-bold">Have the AI review it</h3>
                    <p className="hint mt-1">
                      The AI reads everything you&apos;ve written and challenges it: vague answers, parts that contradict each
                      other, numbers that don&apos;t add up, and the riskiest things you haven&apos;t proven. For each challenge
                      it suggests the smallest test you could run this week. It takes about half a minute.
                    </p>
                  </div>
                  <form action={runAiReview}>
                    <input type="hidden" name="business_id" value={id} />
                    <input type="hidden" name="session_key" value={key} />
                    <PendingButton
                      label={aiReview ? "Run the AI review again" : "Run the AI review"}
                      pending="Reviewing your plan…"
                      className={aiReview ? "btn btn-secondary" : "btn"}
                    />
                  </form>
                </div>
                {aiReview && (
                  <>
                    <AiReviewCard review={aiReview.content as CheckpointReview} createdAt={aiReview.created_at} responses={aiReview.responses as Record<string, string>} />
                    <form action={acceptAiReview} className="card space-y-4 p-5">
                      <input type="hidden" name="business_id" value={id} />
                      <input type="hidden" name="session_key" value={key} />
                      <input type="hidden" name="review_id" value={aiReview.id} />
                      <div>
                        <h3 className="display text-xl font-bold">Your response</h3>
                        <p className="hint mt-1">
                          Say what you&apos;ll do about each challenge. Disagreeing is allowed: it&apos;s how the reviewer
                          learns which challenges matter.
                        </p>
                      </div>
                      {(aiReview.content as CheckpointReview).challenges.map((c, i) => (
                        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_15rem] sm:items-center">
                          <label htmlFor={`resp_${i}`} className="text-sm">
                            <span className="font-semibold">{i + 1}. {c.area}</span>
                          </label>
                          <select id={`resp_${i}`} name={`resp_${i}`} required className="input" defaultValue="">
                            <option value="" disabled>Choose</option>
                            {Object.entries(RESPONSES).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                      <label className="label" htmlFor="ai_notes">What will you change or test first?</label>
                      <textarea id="ai_notes" name="review_notes" required rows={3} className="input" />
                      <button className="btn">Mark the checkpoint reviewed and carry on</button>
                    </form>
                  </>
                )}

                {!standalone && (
                  <div className="flex flex-wrap items-center gap-3">
                    <FinishForm id={id} sessionKey={key} label="Carry on and review later" quiet />
                    <span className="hint">The plan can&apos;t be signed off until this has been reviewed.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}


        {lookbackMode && (
          <form action={saveLookback} className="space-y-6">
            <input type="hidden" name="business_id" value={id} />
            <input type="hidden" name="session_key" value={key} />
            <input type="hidden" name="return_to" value={here} />
            <div className="card p-5">
              <label htmlFor="period_label" className="label">Which period are you looking back on?</label>
              <input id="period_label" name="period_label" className="input w-auto" defaultValue={lookback?.period_label ?? "Last year"} />
            </div>
            <div className="card overflow-x-auto p-5">
              <h2 className="display text-xl font-bold">Where did the numbers land?</h2>
              <p className="hint mt-1">
                Fill in what you can. Leave a budget blank if you didn&apos;t set one; that&apos;s a lesson in itself.
                ({biz?.currency ?? "GBP"} unless marked %)
              </p>
              <table className="mt-4 w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="pb-2 font-semibold">Measure</th>
                    <th className="pb-2 font-semibold">Budget</th>
                    <th className="pb-2 font-semibold">Actual</th>
                    <th className="pb-2 font-semibold">Timing or permanent?</th>
                    <th className="pb-2 font-semibold">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {LOOKBACK_MEASURES.map((m, i) => {
                    const it = lbItems.find((x) => x.measure === m);
                    return (
                      <tr key={m} className="border-t border-[var(--line)]">
                        <td className="py-2 pr-3 font-medium">
                          <input type="hidden" name="measure" value={m} />
                          {m}
                        </td>
                        <td className="py-2 pr-2"><input name={`budget_${i}`} inputMode="decimal" className="input py-1" defaultValue={it?.budget ?? ""} aria-label={`${m} budget`} /></td>
                        <td className="py-2 pr-2"><input name={`actual_${i}`} inputMode="decimal" className="input py-1" defaultValue={it?.actual ?? ""} aria-label={`${m} actual`} /></td>
                        <td className="py-2 pr-2">
                          <select name={`timing_${i}`} className="input min-w-[8.5rem] py-1" defaultValue={it?.timing ?? ""} aria-label={`${m} timing or permanent`}>
                            <option value="">—</option>
                            <option value="timing">Timing</option>
                            <option value="permanent">Permanent</option>
                          </select>
                        </td>
                        <td className="py-2"><input name={`cause_${i}`} className="input py-1" defaultValue={it?.cause ?? ""} aria-label={`${m} cause`} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="hint mt-3">
                Timing means it will catch up (a delayed contract). Permanent means it won&apos;t (a lost customer).
              </p>
            </div>
            {[
              ["furthest_wrong", "Which assumption was furthest wrong: volume, price, timing or cost?", lookback?.furthest_wrong],
              ["lost_why", "Why did you lose the customers or deals you lost?", lookback?.lost_why],
              ["least_profitable", "Which product, customer or site made the least money, and why?", lookback?.least_profitable],
              ["no_payback", "What did you spend that didn't pay back?", lookback?.no_payback],
            ].map(([name, q, val]) => (
              <div key={name as string} className="card p-5">
                <label htmlFor={name as string} className="display block text-lg font-bold">{q}</label>
                <textarea id={name as string} name={name as string} rows={2} className="input mt-3" defaultValue={(val as string) ?? ""} />
              </div>
            ))}
            <div className="card border-[var(--wait)] p-5">
              <label htmlFor="biggest_lesson" className="display block text-xl font-bold">The biggest lesson, in one sentence</label>
              <p className="hint mt-1">It becomes a rule when you build next year&apos;s numbers.</p>
              <textarea id="biggest_lesson" name="biggest_lesson" rows={2} className="input mt-3" defaultValue={lookback?.biggest_lesson ?? ""} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-secondary">Save and carry on later</button>
              <button className="btn" name="finish" value="1">Save and finish session</button>
            </div>
          </form>
        )}
        {session.part && key !== "diagnosis" && (
          <div className="card p-5">
            <p>
              Work through the {PART_LABEL[session.part] ?? session.part} screen, then come back here and
              finish the session.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/b/${id}/${session.part}?session=${key}${key === "numbers" ? "#numbers" : key === "battles" ? "#battles" : key === "lock" ? "#lock" : ""}`} className="btn btn-secondary">
                Open the {PART_LABEL[session.part] ?? session.part} screen
              </Link>
              {key === "quarter" && (
                <Link href={`/b/${id}/scorecards?session=${key}`} className="btn btn-secondary">
                  Open scorecards
                </Link>
              )}
              <FinishForm id={id} sessionKey={key} />
            </div>
          </div>
        )}
      </div>

      <nav className={`mt-12 justify-between border-t border-[var(--line)] pt-4 text-sm ${standalone ? "hidden" : "flex"}`} aria-label="Sessions">
        {prev ? <Link href={`/b/${id}/s/${prev.key}`} className="hover:underline">Previous: {sessionTitle(prev.key, biz?.stage)}</Link> : <span />}
        {next ? <Link href={`/b/${id}/s/${next.key}`} className="hover:underline">Next: {sessionTitle(next.key, biz?.stage)}</Link> : <span />}
      </nav>
    </div>
  );
}
