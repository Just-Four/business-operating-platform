import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Notice from "@/components/Notice";
import { savePriority, removePriority, addKeyResult, updateKeyResult, pastePriorities, addTask } from "../actions";

type Priority = {
  id: string;
  number: number;
  objective: string;
  must_win_battle_id: string | null;
  owner_role_id: string | null;
  due_date: string | null;
};
type Result = { id: string; priority_id: string; description: string; target: number | null; unit: string | null; current_value: number | null; due_date: string | null };

const TASK_STATUS: Record<string, { label: string; tone: string }> = {
  queued: { label: "Queued", tone: "quiet" },
  in_progress: { label: "In progress", tone: "wait" },
  blocked: { label: "Blocked", tone: "stop" },
  awaiting_approval: { label: "Waiting for approval", tone: "wait" },
  done: { label: "Done", tone: "go" },
  failed: { label: "Failed", tone: "stop" },
  escalated: { label: "Handed to fallback", tone: "stop" },
  cancelled: { label: "Cancelled", tone: "quiet" },
};

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addMonths(start: string, n: number) {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return iso(d);
}
function lastDay(start: string) {
  const d = new Date(`${addMonths(start, 3)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return iso(d);
}
function day(s: string | null, year = false) {
  return s ? new Date(`${s}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" }) : "";
}
function fmt(n: number | null, unit?: string | null) {
  if (n === null || n === undefined) return "–";
  const v = Number(n).toLocaleString("en-GB", { maximumFractionDigits: 2 });
  if (!unit) return v;
  return unit === "%" ? `${v}%` : unit.length <= 1 ? `${unit}${v}` : `${v} ${unit}`;
}

export default async function QuarterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; session?: string; q?: string }>;
}) {
  const { id } = await params;
  const { error, saved, session, q } = await searchParams;
  const supabase = await createClient();
  const today = iso(new Date());

  const [{ data: cycles }, { data: roles }] = await Promise.all([
    supabase.from("plan_cycles").select("id, start_date, end_date").eq("business_id", id).order("start_date", { ascending: false }).limit(1),
    supabase.from("roles").select("id, name").eq("business_id", id).eq("active", true).order("created_at"),
  ]);
  const cycle = cycles?.[0];

  // The quarters on offer: the plan year's four, plus the run-up if the plan year hasn't started.
  let quarters: { start: string; label: string }[];
  if (cycle) {
    quarters = [0, 3, 6, 9].map((n, i) => ({ start: addMonths(cycle.start_date, n), label: `Quarter ${i + 1}` }));
    if (today < cycle.start_date) quarters.unshift({ start: addMonths(cycle.start_date, -3), label: "Run-up" });
  } else {
    const now = new Date();
    const qs = iso(new Date(Date.UTC(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)));
    quarters = [
      { start: qs, label: "This quarter" },
      { start: addMonths(qs, 3), label: "Next quarter" },
    ];
  }
  const current = quarters.find((x) => x.start === q) ?? quarters.find((x) => x.start <= today && today <= lastDay(x.start)) ?? quarters[0];
  const quarter = current.start;
  const back = `/b/${id}/quarter?q=${quarter}${session ? `&session=${session}` : ""}`;

  const [{ data: battles }, { data: priorities }] = await Promise.all([
    cycle ? supabase.from("must_win_battles").select("id, number, title").eq("plan_cycle_id", cycle.id).order("number") : Promise.resolve({ data: [] as { id: string; number: number; title: string }[] }),
    supabase.from("quarterly_priorities").select("*").eq("business_id", id).eq("quarter_start", quarter).order("number"),
  ]);
  const ps = (priorities ?? []) as Priority[];
  const ids = ps.map((p) => p.id);
  const [{ data: results }, { data: tasks }] = ids.length
    ? await Promise.all([
        supabase.from("key_results").select("*").in("priority_id", ids).order("updated_at"),
        supabase.from("tasks").select("id, priority_id, title, status, due_date").in("priority_id", ids).order("created_at"),
      ])
    : [{ data: [] }, { data: [] }];
  const rs = (results ?? []) as Result[];
  const battleFor = (bid: string | null) => (battles ?? []).find((b) => b.id === bid);
  const uncovered = (battles ?? []).filter((b) => !ps.some((p) => p.must_win_battle_id === b.id));

  return (
    <div className="max-w-4xl">
      <Notice error={error} saved={saved} />
      {session && (
        <p className="mb-4 rounded border border-[var(--line)] bg-white p-3 text-sm">
          You&apos;re in a planning session.{" "}
          <Link href={`/b/${id}/s/${session}`} className="font-semibold underline underline-offset-4">Back to the session</Link>
        </p>
      )}
      <p className="hint">Part 6</p>
      <h1 className="text-4xl font-bold leading-none sm:text-5xl">This quarter</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">
        A year is too long to steer by. Pick the three to five things that must get done in the next three months, give
        each one an owner and a number that shows it&apos;s done, then break it into tasks.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {quarters.map((x) => (
          <Link key={x.start} href={`/b/${id}/quarter?q=${x.start}${session ? `&session=${session}` : ""}`} className="tag" data-tone={x.start === quarter ? "go" : "quiet"} aria-current={x.start === quarter ? "page" : undefined}>
            {x.label}: {day(x.start)} to {day(lastDay(x.start), true)}
          </Link>
        ))}
      </div>
      {!cycle && (
        <p className="hint mt-3">
          No year plan yet, so these are calendar quarters.{" "}
          <Link className="underline underline-offset-4" href={`/b/${id}/year`}>Set up the year plan</Link> to tie priorities to your Must-Win Battles.
        </p>
      )}
      {current.label === "Run-up" && <p className="hint mt-3">The plan year hasn&apos;t started. Use the run-up for what must be in place before day one.</p>}

      {(battles ?? []).length > 0 && ps.length > 0 && uncovered.length > 0 && (
        <div className="mt-4 rounded border-l-4 border-[var(--wait)] bg-white p-4 text-sm">
          <p className="font-semibold">
            {uncovered.length === 1 ? "One Must-Win Battle has" : `${uncovered.length} Must-Win Battles have`} no priority this quarter
          </p>
          <p className="mt-1">{uncovered.map((b) => `${b.number}. ${b.title}`).join("  ")}</p>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {ps.map((p) => {
          const mine = rs.filter((r) => r.priority_id === p.id);
          const myTasks = (tasks ?? []).filter((t) => t.priority_id === p.id);
          const battle = battleFor(p.must_win_battle_id);
          const owner = roles?.find((r) => r.id === p.owner_role_id)?.name;
          return (
            <article key={p.id} className="card p-0">
              <div className="flex flex-wrap items-start gap-x-4 gap-y-2 p-5">
                <span className="display text-3xl font-bold leading-none text-[var(--muted)]">{p.number}</span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold leading-snug">{p.objective}</h2>
                  <p className="hint">
                    {[owner ? `Owned by ${owner}` : "No owner yet", p.due_date ? `due ${day(p.due_date, true)}` : "", battle ? `for battle ${battle.number}` : "not tied to a battle"].filter(Boolean).join(", ")}
                  </p>
                </div>
              </div>

              <div className="border-t border-[var(--line)] p-5">
                <h3 className="text-sm font-semibold">How you&apos;ll know it&apos;s done</h3>
                {mine.length === 0 && <p className="hint mt-1">No number yet. Without one, &quot;done&quot; is a matter of opinion.</p>}
                <ul className="mt-2 space-y-3">
                  {mine.map((r) => {
                    const pct = r.target && r.current_value !== null ? Math.max(0, Math.min(100, (Number(r.current_value) / Number(r.target)) * 100)) : null;
                    return (
                      <li key={r.id} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                        <div>
                          <p className="text-sm">
                            {r.description}
                            {r.target !== null && <span className="text-[var(--muted)]">: target {fmt(r.target, r.unit)}</span>}
                          </p>
                          {r.target !== null && (
                            <div className="mt-1 flex items-center gap-2">
                              <div className="h-2 w-40 overflow-hidden rounded bg-[var(--line)]" role="img" aria-label={pct === null ? "No progress entered" : `${pct.toFixed(0)}% of target`}>
                                <div className="h-full" style={{ width: `${pct ?? 0}%`, background: pct !== null && pct >= 100 ? "var(--go)" : "var(--wait)" }} />
                              </div>
                              <span className="hint">{pct === null ? "nothing entered" : `${fmt(r.current_value, r.unit)} so far`}</span>
                            </div>
                          )}
                        </div>
                        <form action={updateKeyResult} className="flex items-center gap-2">
                          <input type="hidden" name="business_id" value={id} />
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="return_to" value={back} />
                          <input className="input w-24" name="current_value" inputMode="decimal" aria-label={`Where ${r.description} stands now`} placeholder="Now" defaultValue={r.current_value ?? ""} />
                          <button className="btn btn-secondary">Update</button>
                          <button name="remove" value="1" className="text-sm text-[var(--muted)] underline underline-offset-4" aria-label={`Remove ${r.description}`}>Remove</button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer font-semibold">Add a number</summary>
                  <form action={addKeyResult} className="mt-2 grid gap-3 sm:grid-cols-[1fr_7rem_7rem_auto] sm:items-end">
                    <input type="hidden" name="business_id" value={id} />
                    <input type="hidden" name="priority_id" value={p.id} />
                    <input type="hidden" name="return_to" value={back} />
                    <div>
                      <label className="label" htmlFor={`kr-${p.id}`}>What gets counted</label>
                      <input className="input" id={`kr-${p.id}`} name="description" required placeholder="Written statements of need received" />
                    </div>
                    <div>
                      <label className="label" htmlFor={`krt-${p.id}`}>Target</label>
                      <input className="input" id={`krt-${p.id}`} name="target" inputMode="decimal" />
                    </div>
                    <div>
                      <label className="label" htmlFor={`kru-${p.id}`}>Unit</label>
                      <input className="input" id={`kru-${p.id}`} name="unit" placeholder="%, homes" />
                    </div>
                    <button className="btn btn-secondary">Add</button>
                  </form>
                </details>
              </div>

              <div className="border-t border-[var(--line)] p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold">Tasks</h3>
                  {myTasks.length > 0 && <Link className="text-sm underline underline-offset-4" href={`/b/${id}/tasks`}>Open the task list</Link>}
                </div>
                {myTasks.length === 0 && <p className="hint mt-1">No tasks yet. Add the first thing someone has to do.</p>}
                <ul className="mt-2 space-y-1 text-sm">
                  {myTasks.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-2">
                      <span className="tag" data-tone={TASK_STATUS[t.status]?.tone}>{TASK_STATUS[t.status]?.label ?? t.status}</span>
                      <span>{t.title}</span>
                      {t.due_date && <span className="hint">due {day(t.due_date)}</span>}
                    </li>
                  ))}
                </ul>
                <form action={addTask} className="mt-3 grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
                  <input type="hidden" name="business_id" value={id} />
                  <input type="hidden" name="priority_id" value={p.id} />
                  <input type="hidden" name="role_id" value={p.owner_role_id ?? ""} />
                  <input type="hidden" name="return_to" value={back} />
                  <div>
                    <label className="label" htmlFor={`t-${p.id}`}>New task</label>
                    <input className="input" id={`t-${p.id}`} name="title" required />
                  </div>
                  <div>
                    <label className="label" htmlFor={`td-${p.id}`}>Due</label>
                    <input className="input" id={`td-${p.id}`} name="due_date" type="date" />
                  </div>
                  <button className="btn btn-secondary">Add task</button>
                </form>
                <p className="hint mt-2">The task goes to the priority&apos;s owner and follows that role&apos;s route.</p>
              </div>

              <details className="border-t border-[var(--line)]">
                <summary className="cursor-pointer p-4 text-sm font-semibold">Edit this priority</summary>
                <div className="p-5 pt-0">
                  <PriorityForm id={id} quarter={quarter} cycle={cycle?.id} back={back} priority={p} battles={battles ?? []} roles={roles ?? []} />
                  <form action={removePriority} className="mt-3">
                    <input type="hidden" name="business_id" value={id} />
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="return_to" value={back} />
                    <button className="text-sm text-[var(--muted)] underline underline-offset-4">Remove this priority</button>
                  </form>
                </div>
              </details>
            </article>
          );
        })}
      </div>

      {ps.length < 5 ? (
        <details className="card mt-4 p-0" open={ps.length === 0}>
          <summary className="cursor-pointer p-4 font-semibold">Add a priority</summary>
          <div className="border-t border-[var(--line)] p-5">
            <PriorityForm id={id} quarter={quarter} cycle={cycle?.id} back={back} battles={battles ?? []} roles={roles ?? []} />
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer font-semibold">Paste several at once</summary>
              <form action={pastePriorities} className="mt-2 space-y-2">
                <input type="hidden" name="business_id" value={id} />
                <input type="hidden" name="quarter_start" value={quarter} />
                {cycle && <input type="hidden" name="plan_cycle_id" value={cycle.id} />}
                <input type="hidden" name="return_to" value={back} />
                <p className="hint">
                  Copy the rows from a table in a document or spreadsheet and paste them here. One per line, columns in
                  this order: priority, what gets counted, target, unit, due date.
                </p>
                <textarea className="input min-h-28 font-mono text-xs" name="rows" required aria-label="Rows to add" />
                <button className="btn btn-secondary">Add these</button>
              </form>
            </details>
          </div>
        </details>
      ) : (
        <p className="hint mt-4">Five is the limit for one quarter. More than that and nothing is a priority.</p>
      )}
    </div>
  );
}

function PriorityForm({
  id,
  quarter,
  cycle,
  back,
  priority,
  battles,
  roles,
}: {
  id: string;
  quarter: string;
  cycle?: string;
  back: string;
  priority?: Priority;
  battles: { id: string; number: number; title: string }[];
  roles: { id: string; name: string }[];
}) {
  const p = priority?.id ?? "new";
  return (
    <form action={savePriority} className="space-y-4">
      <input type="hidden" name="business_id" value={id} />
      <input type="hidden" name="quarter_start" value={quarter} />
      {cycle && <input type="hidden" name="plan_cycle_id" value={cycle} />}
      {priority && <input type="hidden" name="id" value={priority.id} />}
      <input type="hidden" name="return_to" value={back} />
      <div>
        <label className="label" htmlFor={`${p}-objective`}>The priority</label>
        <p className="hint mb-2">One outcome you can finish in three months, starting with a verb.</p>
        <input className="input" id={`${p}-objective`} name="objective" required defaultValue={priority?.objective ?? ""} />
      </div>
      {!priority && (
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem_8rem]">
          <div>
            <label className="label" htmlFor="new-result">The number that shows it&apos;s done</label>
            <input className="input" id="new-result" name="result" placeholder="Written statements of need received" />
          </div>
          <div>
            <label className="label" htmlFor="new-target">Target</label>
            <input className="input" id="new-target" name="target" inputMode="decimal" />
          </div>
          <div>
            <label className="label" htmlFor="new-unit">Unit</label>
            <input className="input" id="new-unit" name="unit" placeholder="%, homes" />
          </div>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor={`${p}-battle`}>Which battle it serves</label>
          <select className="input" id={`${p}-battle`} name="must_win_battle_id" defaultValue={priority?.must_win_battle_id ?? ""}>
            <option value="">None</option>
            {battles.map((b) => (
              <option key={b.id} value={b.id}>
                {b.number}. {b.title.length > 48 ? `${b.title.slice(0, 48)}…` : b.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`${p}-owner`}>Owned by</label>
          <select className="input" id={`${p}-owner`} name="owner_role_id" defaultValue={priority?.owner_role_id ?? ""}>
            <option value="">No role yet</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`${p}-due`}>Due</label>
          <input className="input" id={`${p}-due`} name="due_date" type="date" defaultValue={priority?.due_date ?? ""} />
        </div>
      </div>
      <button className="btn">{priority ? "Save priority" : "Add priority"}</button>
    </form>
  );
}
