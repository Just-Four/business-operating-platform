import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CANVAS_PLAIN, SESSIONS, TECH_TERM, sessionByKey } from "@/lib/programme";
import { guidanceFor } from "@/lib/guidance";
import { CANVAS_BOXES, gradeOf, type EvidenceStrength } from "@/lib/framework";
import { addEvidence, approveCheckpoint, deleteEvidence, finishSession, saveCanvas, saveDiagnosis } from "../../actions";
import Notice from "@/components/Notice";
import CanvasBoard from "@/components/CanvasBoard";

const GRADE_TONE: Record<string, { tone: string; text: string }> = {
  proven: { tone: "go", text: "Proven" },
  supported: { tone: "wait", text: "Supported" },
  assumption: { tone: "stop", text: "Assumption" },
  empty: { tone: "quiet", text: "Empty" },
};

function FinishForm({ id, sessionKey, label = "Finish session" }: { id: string; sessionKey: string; label?: string }) {
  return (
    <form action={finishSession}>
      <input type="hidden" name="business_id" value={id} />
      <input type="hidden" name="session_key" value={sessionKey} />
      <button className="btn">{label}</button>
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
  const session = sessionByKey(key);
  if (!session) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: biz }, { data: row }, { data: me }, { data: canvas }, { data: evidence }, { data: diag }] = await Promise.all([
    supabase.from("businesses").select("name, model, stage").eq("id", id).single(),
    supabase.from("programme_sessions").select("scheduled_on, completed_at, approved_at").eq("business_id", id).eq("key", key).maybeSingle(),
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

  const guide = guidanceFor(biz?.model);
  const answers: Record<string, string> = {};
  for (const r of canvas ?? []) answers[r.box] = r.answer ?? "";
  const ev = evidence ?? [];
  const prev = SESSIONS.find((s) => s.seq === session.seq - 1);
  const next = SESSIONS.find((s) => s.seq === session.seq + 1);
  const isChair = me?.role === "chairman";
  const here = `/b/${id}/s/${key}`;

  return (
    <div className="max-w-3xl">
      <Notice error={error} saved={saved} />
      <p className="hint">
        Session {session.seq} of {SESSIONS.length}, about {session.minutes} minutes
        {row?.scheduled_on ? `, planned for ${row.scheduled_on}` : ""}
        {row?.completed_at ? ", done" : ""}
      </p>
      <h1 className="text-4xl font-bold leading-tight sm:text-5xl">{session.title}</h1>

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
            <p className="font-semibold">This session is in the next build.</p>
            <p className="hint mt-1">Everything up to here is ready to work through now.</p>
          </div>
        )}

        {key === "commit" && (
          <div className="card p-6">
            <p>
              Choose a date for each session and the day the chairman signs the plan off. Then commit to them. Treat them
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

        {key === "checkpoint_1" && (
          <div className="space-y-6">
            <div className="card p-5">
              <h2 className="text-xl font-bold">What the chairman is checking</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">
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
              <p className="tag" data-tone="go">Approved by the chairman</p>
            ) : isChair ? (
              <div className="flex flex-wrap items-center gap-3">
                <form action={approveCheckpoint}>
                  <input type="hidden" name="business_id" value={id} />
                  <input type="hidden" name="session_key" value={key} />
                  <button className="btn">Approve checkpoint</button>
                </form>
                <span className="hint">Approve once the challenges above have been answered.</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <FinishForm id={id} sessionKey={key} label="Carry on while I wait" />
                <span className="hint">
                  The chairman reviews this before the plan can be signed off. You can keep going in the meantime; later
                  work will be marked as not yet reviewed.
                </span>
              </div>
            )}
          </div>
        )}

        {session.part && key !== "diagnosis" && (
          <div className="card p-5">
            <p>
              Work through the {session.part === "launch" ? "launch plan" : "direction"} screen, then come back here and
              finish the session.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/b/${id}/${session.part}?session=${key}`} className="btn btn-secondary">
                Open the {session.part === "launch" ? "launch plan" : "direction"} screen
              </Link>
              <FinishForm id={id} sessionKey={key} />
            </div>
          </div>
        )}
      </div>

      <nav className="mt-12 flex justify-between border-t border-[var(--line)] pt-4 text-sm" aria-label="Sessions">
        {prev ? <Link href={`/b/${id}/s/${prev.key}`} className="hover:underline">Previous: {prev.title}</Link> : <span />}
        {next ? <Link href={`/b/${id}/s/${next.key}`} className="hover:underline">Next: {next.title}</Link> : <span />}
      </nav>
    </div>
  );
}
