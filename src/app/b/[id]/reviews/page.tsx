import Link from "next/link";
import NextPart from "@/components/NextPart";
import { createClient } from "@/lib/supabase/server";
import Notice from "@/components/Notice";
import { saveReview, addDecision, addTask } from "../actions";
import { ragOf, weekStart } from "@/lib/framework";

const BATTLE_STATUS: Record<string, { label: string; tone: string }> = {
  on_track: { label: "On track", tone: "go" },
  at_risk: { label: "At risk", tone: "wait" },
  off_track: { label: "Off track", tone: "stop" },
  won: { label: "Won", tone: "go" },
  lost: { label: "Lost", tone: "stop" },
};

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function shiftMonth(s: string, n: number) {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return iso(d);
}
function monthName(s: string) {
  return new Date(`${s}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}
function day(s: string | null) {
  return s ? new Date(`${s}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "";
}

export default async function ReviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; m?: string }>;
}) {
  const { id } = await params;
  const { error, saved, m } = await searchParams;
  const supabase = await createClient();
  const now = new Date();
  const thisMonth = iso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)));
  const month = m && /^\d{4}-\d{2}-01$/.test(m) ? m : thisMonth;
  const monthEnd = shiftMonth(month, 1);
  const today = iso(now);
  const back = `/b/${id}/reviews?m=${month}`;
  const isNow = month === thisMonth;

  const [{ data: review }, { data: cycles }, { data: measures }, { data: roles }, { data: tasks }, { data: risks }, { data: milestones }, { data: history }] = await Promise.all([
    supabase.from("reviews").select("*").eq("business_id", id).eq("kind", "monthly").eq("period_start", month).maybeSingle(),
    supabase.from("plan_cycles").select("id").eq("business_id", id).order("start_date", { ascending: false }).limit(1),
    supabase.from("measures").select("id, name, target, better_when, unit").eq("business_id", id).eq("active", true),
    supabase.from("roles").select("id, name").eq("business_id", id).eq("active", true).order("created_at"),
    supabase.from("tasks").select("id, title, status, due_date, updated_at, needs_approval, approved_at").eq("business_id", id),
    supabase.from("risks").select("risk, status, response").eq("business_id", id).eq("status", "triggered"),
    supabase.from("milestones").select("name, due_date, status").eq("business_id", id).order("sequence"),
    supabase.from("reviews").select("period_start, status").eq("business_id", id).eq("kind", "monthly").order("period_start", { ascending: false }).limit(12),
  ]);
  const cycle = cycles?.[0];
  const [{ data: battles }, { data: priorities }, { data: readings }, { data: decisions }] = await Promise.all([
    cycle ? supabase.from("must_win_battles").select("number, title, status, kpi, target").eq("plan_cycle_id", cycle.id).order("number") : Promise.resolve({ data: [] as { number: number; title: string; status: string; kpi: string | null; target: string | null }[] }),
    supabase.from("quarterly_priorities").select("id, number, objective, quarter_start").eq("business_id", id).lte("quarter_start", shiftMonth(month, 0)).gte("quarter_start", shiftMonth(month, -2)).order("number"),
    supabase.from("measure_readings").select("measure_id, period_start, value").eq("business_id", id).gte("period_start", weekStart(new Date(`${month}T12:00:00Z`))).lt("period_start", monthEnd).order("period_start", { ascending: false }),
    review ? supabase.from("decisions").select("id, question, decision, status, decided_on").eq("review_id", review.id).order("updated_at") : Promise.resolve({ data: [] as { id: string; question: string; decision: string | null; status: string; decided_on: string | null }[] }),
  ]);
  const prIds = (priorities ?? []).map((p) => p.id);
  const { data: results } = prIds.length ? await supabase.from("key_results").select("priority_id, description, target, current_value, unit").in("priority_id", prIds) : { data: [] };

  let content: Record<string, string | null> = {};
  try {
    content = review?.content ? JSON.parse(review.content) : {};
  } catch {
    content = {};
  }

  // Scorecards: the latest reading in the month for each measure
  const latest = (measures ?? []).map((ms) => {
    const r = (readings ?? []).find((x) => x.measure_id === ms.id);
    return { ...ms, value: r ? Number(r.value) : null, rag: ragOf(r ? Number(r.value) : null, ms.target, ms.better_when) };
  });
  const red = latest.filter((x) => x.rag === "red");
  const amber = latest.filter((x) => x.rag === "amber");
  const noReading = latest.filter((x) => x.rag === "none");

  const all = tasks ?? [];
  const doneInMonth = all.filter((t) => t.status === "done" && t.updated_at >= month && t.updated_at < monthEnd);
  const stuck = all.filter((t) => ["blocked", "failed", "escalated"].includes(t.status));
  const overdue = all.filter((t) => t.due_date && t.due_date < today && !["done", "cancelled"].includes(t.status));
  const waiting = all.filter((t) => (t.needs_approval && !t.approved_at && !["done", "cancelled"].includes(t.status)) || t.status === "awaiting_review");
  const lateMilestones = (milestones ?? []).filter((x) => x.due_date && x.due_date < today && x.status !== "met");
  const offBattles = (battles ?? []).filter((x) => ["at_risk", "off_track", "lost"].includes(x.status));
  const nothing = !(measures ?? []).length && !(battles ?? []).length && !all.length && !(priorities ?? []).length;

  return (
    <div className="max-w-4xl">
      <Notice error={error} saved={saved} />
      <p className="hint">Stage 5: Review</p>
      <h1 className="text-4xl font-bold leading-none sm:text-5xl">Monthly review</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">
        Once a month, stop and look at the whole business on one page. What moved, what slipped, what you learned, and
        what you&apos;ll change. Write it down, because next month you won&apos;t remember what you decided or why.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link className="btn btn-secondary" href={`/b/${id}/reviews?m=${shiftMonth(month, -1)}`}>Previous month</Link>
        <p className="display text-xl font-bold">{monthName(month)}</p>
        {month < thisMonth && <Link className="btn btn-secondary" href={`/b/${id}/reviews?m=${shiftMonth(month, 1)}`}>Next month</Link>}
        {review?.status === "held" && <span className="tag" data-tone="go">Held {day(review.held_on)}</span>}
      </div>

      <section className="mt-8">
        <h2 className="display text-2xl font-bold">Where things stand</h2>
        <p className="hint">
          Pulled from the rest of the platform. {isNow ? "" : "Scorecards and finished tasks are for this month; battles, priorities and open tasks show today's position."}
        </p>
        {nothing ? (
          <div className="card mt-3 p-4">
            <p className="font-semibold">Nothing to pull in yet</p>
            <p className="hint mt-1">
              This fills itself in once the business has battles, priorities, scorecards or tasks. You can still write the review underneath.
            </p>
          </div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="card p-4">
              <h3 className="font-semibold">Scorecards</h3>
              {(measures ?? []).length === 0 ? (
                <p className="hint mt-1">No measures set up.</p>
              ) : (
                <>
                  <p className="mt-1 text-sm">
                    {red.length} off target, {amber.length} close, {noReading.length} with no number this month.
                  </p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {red.map((x) => (
                      <li key={x.id}>
                        <span className="tag mr-2" data-tone="stop">Off target</span>
                        {x.name}: {x.value} against {x.target}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <Link className="mt-2 inline-block text-sm underline underline-offset-4" href={`/b/${id}/scorecards`}>Open scorecards</Link>
            </div>
            <div className="card p-4">
              <h3 className="font-semibold">Must-Win Battles</h3>
              {(battles ?? []).length === 0 ? (
                <p className="hint mt-1">None set.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {(battles ?? []).map((x) => (
                    <li key={x.number}>
                      <span className="tag mr-2" data-tone={BATTLE_STATUS[x.status]?.tone}>{BATTLE_STATUS[x.status]?.label}</span>
                      {x.number}. {x.title}
                    </li>
                  ))}
                </ul>
              )}
              <p className="hint mt-2">{offBattles.length ? "Change a battle's status on the year plan if it has moved." : "Statuses are set by you on the year plan. Are they still true?"}</p>
              <Link className="mt-1 inline-block text-sm underline underline-offset-4" href={`/b/${id}/year#battles`}>Open the year plan</Link>
            </div>
            <div className="card p-4">
              <h3 className="font-semibold">This quarter&apos;s priorities</h3>
              {(priorities ?? []).length === 0 ? (
                <p className="hint mt-1">None set for this quarter.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {(priorities ?? []).map((p) => {
                    const mine = (results ?? []).filter((r) => r.priority_id === p.id);
                    return (
                      <li key={p.id}>
                        {p.number}. {p.objective}
                        <span className="hint block">
                          {mine.length
                            ? mine.map((r) => `${r.description}: ${r.current_value ?? "nothing entered"}${r.target !== null ? ` of ${r.target}` : ""}${r.unit === "%" ? "%" : ""}`).join("; ")
                            : "No number set"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Link className="mt-2 inline-block text-sm underline underline-offset-4" href={`/b/${id}/quarter`}>Open this quarter</Link>
            </div>
            <div className="card p-4">
              <h3 className="font-semibold">Tasks</h3>
              <p className="mt-1 text-sm">
                {doneInMonth.length} finished this month. {stuck.length} stuck, {overdue.length} overdue, {waiting.length} waiting for approval.
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {[...stuck, ...overdue.filter((t) => !stuck.includes(t))].slice(0, 6).map((t) => (
                  <li key={t.id}>
                    <span className="tag mr-2" data-tone="stop">{stuck.includes(t) ? "Stuck" : "Overdue"}</span>
                    {t.title}
                  </li>
                ))}
              </ul>
              <Link className="mt-2 inline-block text-sm underline underline-offset-4" href={`/b/${id}/tasks`}>Open tasks</Link>
            </div>
            {(risks ?? []).length > 0 && (
              <div className="card p-4" style={{ borderLeft: "6px solid var(--stop)" }}>
                <h3 className="font-semibold">Risks that are happening</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {(risks ?? []).map((r, i) => (
                    <li key={i}>
                      {r.risk}
                      <span className="hint block">You said you would: {r.response || "nothing written"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {lateMilestones.length > 0 && (
              <div className="card p-4" style={{ borderLeft: "6px solid var(--wait)" }}>
                <h3 className="font-semibold">Launch milestones past their date</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {lateMilestones.map((x, i) => (
                    <li key={i}>{x.name}, due {day(x.due_date)}</li>
                  ))}
                </ul>
                <Link className="mt-2 inline-block text-sm underline underline-offset-4" href={`/b/${id}/launch`}>Open the launch plan</Link>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="display text-2xl font-bold">What you make of it</h2>
        <form action={saveReview} className="card mt-3 space-y-4 p-5">
          <input type="hidden" name="business_id" value={id} />
          <input type="hidden" name="period_start" value={month} />
          <input type="hidden" name="return_to" value={back} />
          {[
            { k: "went_well", label: "What went well, and why", hint: "The why matters: it tells you what to repeat." },
            { k: "went_badly", label: "What slipped, and why", hint: "Name the cause, not just the number that was missed." },
            { k: "lesson", label: "The one thing you learned", hint: "If you could tell last month's you one thing, what would it be?" },
            { k: "change", label: "What you'll do differently next month", hint: "" },
          ].map((f) => (
            <div key={f.k}>
              <label className="label" htmlFor={f.k}>{f.label}</label>
              {f.hint && <p className="hint mb-2">{f.hint}</p>}
              <textarea className="input min-h-20" id={f.k} name={f.k} defaultValue={content[f.k] ?? ""} />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary">Save as a draft</button>
            <button className="btn" name="held" value="1">{review?.status === "held" ? "Save the review" : "Save and mark the review held"}</button>
          </div>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="display text-2xl font-bold">Decisions</h2>
        <p className="hint">Anything decided in the review, so there&apos;s a record of what was agreed and when.</p>
        {(decisions ?? []).length > 0 && (
          <ul className="card mt-3 divide-y divide-[var(--line)] p-0 text-sm">
            {(decisions ?? []).map((d) => (
              <li key={d.id} className="p-4">
                <p className="font-semibold">{d.question}</p>
                <p className="mt-1">{d.decision || "Still open"}</p>
                {d.decided_on && <p className="hint mt-1">Decided {day(d.decided_on)}</p>}
              </li>
            ))}
          </ul>
        )}
        <form action={addDecision} className="card mt-3 grid gap-4 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <input type="hidden" name="business_id" value={id} />
          <input type="hidden" name="period_start" value={month} />
          <input type="hidden" name="return_to" value={back} />
          <div>
            <label className="label" htmlFor="question">The question</label>
            <input className="input" id="question" name="question" required />
          </div>
          <div>
            <label className="label" htmlFor="decision">What was decided</label>
            <input className="input" id="decision" name="decision" placeholder="Leave blank if still open" />
          </div>
          <button className="btn btn-secondary">Record</button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="display text-2xl font-bold">Actions</h2>
        <p className="hint">Each action becomes a task for the role you pick, so it shows up in the task list and can&apos;t be forgotten.</p>
        <form action={addTask} className="card mt-3 grid gap-4 p-4 sm:grid-cols-[1fr_12rem_10rem_auto] sm:items-end">
          <input type="hidden" name="business_id" value={id} />
          <input type="hidden" name="detail" value={`From the ${monthName(month)} review`} />
          <input type="hidden" name="return_to" value={back} />
          <div>
            <label className="label" htmlFor="title">Action</label>
            <input className="input" id="title" name="title" required />
          </div>
          <div>
            <label className="label" htmlFor="role_id">Who</label>
            <select className="input" id="role_id" name="role_id" defaultValue={roles?.[0]?.id ?? ""}>
              {(roles ?? []).map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
              <option value="">No role</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="due_date">By</label>
            <input className="input" id="due_date" name="due_date" type="date" />
          </div>
          <button className="btn btn-secondary">Add action</button>
        </form>
        <Link className="mt-2 inline-block text-sm underline underline-offset-4" href={`/b/${id}/tasks`}>Open the task list</Link>
      </section>

      {(history ?? []).length > 0 && (
        <section className="mt-10">
          <h2 className="display text-xl font-bold">Past reviews</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {(history ?? []).map((h) => (
              <Link key={h.period_start} className="tag" data-tone={h.status === "held" ? "go" : "quiet"} href={`/b/${id}/reviews?m=${h.period_start}`}>
                {monthName(h.period_start)}
                {h.status === "held" ? "" : " (draft)"}
              </Link>
            ))}
          </div>
        </section>
      )}
      <NextPart businessId={id} slug="reviews" />
    </div>
  );
}
