import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addTask, updateTask, createAgentKey, revokeAgentKey } from "../actions";
import { approveResult, runWithClaude, sendBack } from "../process-actions";
import Notice from "@/components/Notice";
import AutoRefresh from "@/components/AutoRefresh";
import PendingButton from "@/components/PendingButton";
import StepStrip from "@/components/StepStrip";
import { ROUTES } from "@/lib/framework";
import { CLAUDE_STALE_MINUTES, stepState } from "@/lib/process";

export const maxDuration = 300;

type Task = {
  id: string;
  role_id: string | null;
  title: string;
  detail: string | null;
  route: string;
  fallback_route: string | null;
  status: string;
  needs_approval: boolean;
  approved_at: string | null;
  due_date: string | null;
  attempts: number;
  result: string | null;
  result_link: string | null;
  cost: number;
  claimed_by: string | null;
  updated_at: string;
  process_run_id: string | null;
  process_step_id: string | null;
  step_seq: number | null;
  review_required: boolean;
  review_note: string | null;
  rejections: number;
};

const STATUS: Record<string, { label: string; tone: string }> = {
  queued: { label: "Waiting to be done", tone: "quiet" },
  in_progress: { label: "Being done", tone: "wait" },
  blocked: { label: "Blocked", tone: "stop" },
  awaiting_approval: { label: "Waiting for approval", tone: "wait" },
  awaiting_review: { label: "Result to check", tone: "wait" },
  done: { label: "Done", tone: "go" },
  failed: { label: "Failed", tone: "stop" },
  escalated: { label: "Handed on", tone: "stop" },
  cancelled: { label: "Cancelled", tone: "quiet" },
};

function when(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function day(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function Act({ id, task, action, label, returnTo }: { id: string; task: string; action: string; label: string; returnTo: string }) {
  return (
    <form action={updateTask}>
      <input type="hidden" name="business_id" value={id} />
      <input type="hidden" name="task_id" value={task} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="return_to" value={returnTo} />
      <button className="btn btn-secondary">{label}</button>
    </form>
  );
}

export default async function TasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; role?: string; newkey?: string; run?: string; task?: string; started?: string; moved?: string }>;
}) {
  const { id } = await params;
  const { error, saved, role, newkey, run, task, started, moved } = await searchParams;
  const supabase = await createClient();
  let tq = supabase.from("tasks").select("*").eq("business_id", id).order("due_date", { ascending: true, nullsFirst: false }).order("created_at");
  if (task) tq = tq.eq("id", task);
  else if (role) tq = tq.eq("role_id", role);
  else if (run) tq = tq.eq("process_run_id", run);
  const [{ data: roles }, { data: tasks }, { data: events }, { data: keys }] = await Promise.all([
    supabase.from("roles").select("id, name, route").eq("business_id", id).eq("active", true).order("created_at"),
    tq,
    supabase.from("task_events").select("task_id, event, actor, detail, created_at").eq("business_id", id).order("created_at", { ascending: false }).limit(500),
    supabase.from("agent_keys").select("id, label, route, key_hint, created_at, revoked_at").eq("business_id", id).order("created_at"),
  ]);
  const all = (tasks ?? []) as Task[];
  const focus = task ? all[0] : undefined;
  const runId = focus?.process_run_id ?? run ?? null;
  const { data: runInfo } = runId
    ? await supabase.from("process_runs").select("id, subject, process_id, status").eq("id", runId).eq("business_id", id).maybeSingle()
    : { data: null };
  const [{ data: proc }, { data: procSteps }, { data: runTasks }] = runInfo
    ? await Promise.all([
        supabase.from("processes").select("id, name").eq("id", runInfo.process_id).maybeSingle(),
        supabase.from("process_steps").select("id, seq, title").eq("process_id", runInfo.process_id).order("seq"),
        supabase.from("tasks").select("process_step_id, status").eq("process_run_id", runInfo.id),
      ])
    : [{ data: null }, { data: [] as { id: string; seq: number; title: string }[] }, { data: [] as { process_step_id: string | null; status: string }[] }];
  const strip = (procSteps ?? []).map((s) => ({
    n: s.seq,
    title: s.title,
    state: stepState((runTasks ?? []).find((t) => t.process_step_id === s.id && t.status !== "cancelled")?.status),
  }));

  const roleName = (rid: string | null) => roles?.find((r) => r.id === rid)?.name ?? "No role";
  const closed = ["done", "cancelled"];
  const liveKeys = (keys ?? []).filter((k) => !k.revoked_at);
  const connected = new Set(liveKeys.map((k) => k.route));
  const toCheck = all.filter((t) => t.status === "awaiting_review");
  const approval = all.filter((t) => t.needs_approval && !t.approved_at && !closed.includes(t.status));
  const attention = all.filter((t) => ["blocked", "failed", "escalated"].includes(t.status) && !approval.includes(t));
  const active = all.filter((t) => ["queued", "in_progress"].includes(t.status) && !approval.includes(t));
  const now = Date.now();
  const claudeWorking = (t: Task) => t.route === "claude" && t.status === "in_progress" && now - new Date(t.updated_at).getTime() < CLAUDE_STALE_MINUTES * 60_000;
  const anyWorking = all.some(claudeWorking);
  const here = `/b/${id}/tasks${task ? `?task=${task}` : run ? `?run=${run}` : role ? `?role=${role}` : ""}`;
  const finished = all.filter((t) => closed.includes(t.status)).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 15);
  const today = new Date().toISOString().slice(0, 10);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const Card = ({ t, big }: { t: Task; big?: boolean }) => {
    const history = (events ?? []).filter((e) => e.task_id === t.id);
    const overdue = t.due_date && t.due_date < today && !closed.includes(t.status);
    const waiting = t.needs_approval && !t.approved_at;
    const working = claudeWorking(t);
    const open = !closed.includes(t.status);
    const stuck = ["blocked", "failed", "escalated"].includes(t.status);
    const toClaude = t.route === "claude" && open && !working && !waiting && t.status !== "awaiting_review";
    const toPerson = t.route === "person" && open && !waiting && t.status !== "awaiting_review";
    const toAgent = !["claude", "person"].includes(t.route) && open && !waiting && t.status !== "awaiting_review";
    const routeLabel = ROUTES[t.route]?.label ?? t.route;
    return (
      <article className={`card ${big ? "p-6" : "p-4"}`} id={`task-${t.id}`}>
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            {big ? <h1 className="text-3xl font-bold leading-tight">{t.title}</h1> : <h3 className="text-lg font-semibold leading-snug">{t.title}</h3>}
            <p className="hint">
              {roleName(t.role_id)}
              {t.due_date ? `, due ${day(t.due_date)}` : ""}
              {t.claimed_by ? `, picked up by ${t.claimed_by}` : ""}
              {!big && t.step_seq ? `, step ${t.step_seq} of a process` : ""}
              {t.attempts > 1 ? `, ${t.attempts} attempts` : ""}
              {Number(t.cost) > 0 ? `, cost ${Number(t.cost).toLocaleString("en-GB", { maximumFractionDigits: 2 })}` : ""}
            </p>
          </div>
          {overdue && <span className="tag" data-tone="stop">Overdue</span>}
          <span className="tag" data-tone="quiet">{routeLabel}</span>
          <span className="tag" data-tone={waiting ? "wait" : STATUS[t.status]?.tone}>{waiting ? "Needs approval" : STATUS[t.status]?.label ?? t.status}</span>
        </div>
        {t.detail && <p className="mt-3 whitespace-pre-line text-sm">{t.detail}</p>}
        {t.status === "queued" && t.review_note && (
          <div className="mt-3 rounded border border-[var(--wait)] bg-[var(--wait-tint)] p-3 text-sm">
            <p className="font-semibold">Sent back{t.rejections > 1 ? ` (${t.rejections} times)` : ""}</p>
            <p className="whitespace-pre-line">{t.review_note}</p>
          </div>
        )}
        {t.result && (
          <div className="mt-3 rounded border border-[var(--line)] bg-[var(--paper)] p-3 text-sm">
            <p className="font-semibold">Result</p>
            <p className="whitespace-pre-line">{t.result}</p>
            {t.result_link && (
              <a className="mt-1 inline-block underline underline-offset-4" href={t.result_link} target="_blank" rel="noreferrer">
                Open the work
              </a>
            )}
          </div>
        )}
        {t.status === "escalated" && t.fallback_route && <p className="mt-3 text-sm">The first way of doing this didn&apos;t work, so it has been handed to {routeLabel}.</p>}

        {/* The one thing to do */}
        {open && (
          <div className="mt-4 border-t border-[var(--line)] pt-4">
            <p className="hint mb-1">What to do now</p>
            {working && (
              <p className="rounded bg-[var(--wait-tint)] p-3 text-sm">
                <span className="font-semibold">Nothing. Claude is working on this.</span> It usually takes a minute or two. The result appears here by itself, ready for you to check.
              </p>
            )}
            {waiting && (
              <div className="space-y-3">
                <p className="text-sm font-semibold">This waits for approval. Nobody starts it until you say so.</p>
                <form action={updateTask}>
                  <input type="hidden" name="business_id" value={id} />
                  <input type="hidden" name="task_id" value={t.id} />
                  <input type="hidden" name="action" value="approve" />
                  <input type="hidden" name="return_to" value={here} />
                  <button className="btn">Approve</button>
                </form>
              </div>
            )}
            {t.status === "awaiting_review" && (
              <div className="space-y-3">
                <p className="text-sm font-semibold">
                  Read the result against the standard. Approve it and the next step starts by itself. If it isn&apos;t right, say what to fix and send it back.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <form action={approveResult}>
                    <input type="hidden" name="business_id" value={id} />
                    <input type="hidden" name="task_id" value={t.id} />
                    <input type="hidden" name="return_to" value={here} />
                    <PendingButton label="Approve result" pending="Approving..." />
                  </form>
                  <form action={sendBack} className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
                    <input type="hidden" name="business_id" value={id} />
                    <input type="hidden" name="task_id" value={t.id} />
                    <input type="hidden" name="return_to" value={here} />
                    <input className="input min-w-48 flex-1" name="note" required aria-label="What needs fixing" placeholder="What needs fixing" />
                    <button className="btn btn-secondary">Send back</button>
                  </form>
                </div>
              </div>
            )}
            {toClaude && (
              <div className="space-y-3">
                <p className="text-sm font-semibold">
                  {t.status === "failed"
                    ? "Claude couldn't finish this. The reason is in the result above. Try again, or do it yourself under Other options."
                    : t.rejections > 0
                      ? "Claude tries again, using your note above."
                      : `Claude does this step. Press the button and wait a minute or two${t.review_required ? "; the result comes back here for you to check" : ""}.`}
                </p>
                <form action={runWithClaude}>
                  <input type="hidden" name="business_id" value={id} />
                  <input type="hidden" name="task_id" value={t.id} />
                  <input type="hidden" name="return_to" value={here} />
                  <PendingButton label={t.rejections > 0 ? "Run with Claude again" : t.status === "failed" ? "Try Claude again" : "Run with Claude"} pending="Starting..." />
                </form>
              </div>
            )}
            {toPerson && (
              <form action={updateTask} className="space-y-3">
                <input type="hidden" name="business_id" value={id} />
                <input type="hidden" name="task_id" value={t.id} />
                <input type="hidden" name="action" value="done" />
                <input type="hidden" name="return_to" value={here} />
                <p className="text-sm font-semibold">
                  {stuck ? "This is stuck. " : ""}
                  This one is done by a person. Do it, write or paste the result here, then mark it done.
                  {t.process_run_id ? " The next step starts by itself." : ""}
                </p>
                <textarea className="input min-h-24" name="result" aria-label="The result" placeholder="The result, or what was done" />
                <PendingButton label="Mark done" pending="Saving..." />
              </form>
            )}
            {toAgent && (
              <p className="rounded bg-[var(--paper)] p-3 text-sm">
                <span className="font-semibold">Nothing yet. This is waiting for {routeLabel} to pick it up.</span>{" "}
                {connected.has(t.route)
                  ? "It reports back here when it has finished."
                  : `No ${routeLabel} is connected to this business, so it will wait here. Connect one at the bottom of the Tasks page, or mark it done yourself under Other options.`}
              </p>
            )}
            {t.status !== "awaiting_review" && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-[var(--muted)]">Other options</summary>
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  {!toPerson && !waiting && (
                    <form action={updateTask} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="business_id" value={id} />
                      <input type="hidden" name="task_id" value={t.id} />
                      <input type="hidden" name="action" value="done" />
                      <input type="hidden" name="return_to" value={here} />
                      <input className="input w-64" name="result" aria-label="What was done" placeholder="What was done" />
                      <button className="btn btn-secondary">Mark done by hand</button>
                    </form>
                  )}
                  {stuck && <Act id={id} task={t.id} action="requeue" label="Put back to be done" returnTo={here} />}
                  {t.status !== "blocked" && !waiting && <Act id={id} task={t.id} action="block" label="Mark as blocked" returnTo={here} />}
                  <Act id={id} task={t.id} action="cancel" label="Cancel this task" returnTo={here} />
                </div>
              </details>
            )}
          </div>
        )}
        {history.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-[var(--muted)]">History ({history.length})</summary>
            <ol className="mt-2 space-y-1">
              {history.map((e, i) => (
                <li key={i}>
                  <span className="text-[var(--muted)]">{when(e.created_at)}</span> {e.actor}: {e.event}
                  {e.detail ? `, ${e.detail.length > 240 ? `${e.detail.slice(0, 240)}...` : e.detail}` : ""}
                </li>
              ))}
            </ol>
          </details>
        )}
      </article>
    );
  };

  // ---------- One task on its own ----------
  if (task) {
    return (
      <div className="max-w-3xl">
        {anyWorking && <AutoRefresh />}
        <Notice error={error} saved={saved} />
        <p className="hint">
          <Link href={`/b/${id}/dashboard`} className="underline underline-offset-4">Dashboard</Link>
          {proc ? (
            <>
              {" / "}
              <Link href={`/b/${id}/processes/${proc.id}`} className="underline underline-offset-4">{proc.name}</Link>
            </>
          ) : (
            <>
              {" / "}
              <Link href={`/b/${id}/tasks`} className="underline underline-offset-4">Tasks</Link>
            </>
          )}
        </p>
        {started && (
          <p className="mt-3 rounded bg-[var(--go-tint)] p-3 text-sm">
            <span className="font-semibold">The run has started.</span> This is its first step. Each step you finish brings up the next one.
          </p>
        )}
        {moved && (
          <p className="mt-3 rounded bg-[var(--go-tint)] p-3 text-sm">
            <span className="font-semibold">Done. This is the next step.</span>
          </p>
        )}
        {!focus ? (
          <div className="card mt-4 p-6">
            <h1 className="text-2xl font-bold">That task wasn&apos;t found</h1>
            <Link className="btn mt-4" href={`/b/${id}/dashboard`}>Back to the dashboard</Link>
          </div>
        ) : (
          <>
            {runInfo && strip.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="text-sm font-semibold">
                  Step {focus.step_seq} of {strip.length}
                  {runInfo.subject ? `, ${runInfo.subject}` : ""}
                </span>
                <StepStrip items={strip} />
              </div>
            )}
            <div className="mt-4">
              <Card t={focus} big />
            </div>
            {closed.includes(focus.status) && (
              <p className="mt-4 text-sm">
                This one is finished.{" "}
                <Link className="underline underline-offset-4" href={`/b/${id}/dashboard`}>Back to the dashboard</Link>
              </p>
            )}
          </>
        )}
      </div>
    );
  }

  // ---------- The full list ----------
  const Section = ({ title, hint, items }: { title: string; hint: string; items: Task[] }) =>
    items.length ? (
      <section className="mt-8">
        <h2 className="display text-2xl font-bold">
          {title} <span className="text-[var(--muted)]">{items.length}</span>
        </h2>
        <p className="hint">{hint}</p>
        <div className="mt-3 space-y-3">
          {items.map((t) => (
            <Card key={t.id} t={t} />
          ))}
        </div>
      </section>
    ) : null;

  return (
    <div className="max-w-4xl">
      <Notice error={error} saved={saved} />
      {anyWorking && <AutoRefresh />}
      <p className="hint">Stage 4: Run</p>
      <h1 className="text-4xl font-bold leading-none sm:text-5xl">Tasks</h1>
      {run && (
        <p className="mt-2 text-sm">
          Showing one run{proc ? ` of ${proc.name}` : ""}
          {runInfo?.subject ? `: ${runInfo.subject}` : ""}.{" "}
          <Link className="underline underline-offset-4" href={`/b/${id}/tasks`}>Show all tasks</Link>
        </p>
      )}
      <p className="mt-3 max-w-2xl text-[var(--muted)]">
        Every piece of work in the business, open and finished. Most tasks are created by a process when it runs. Each one
        says what to do now. To see only what needs you, use the <Link className="underline underline-offset-4" href={`/b/${id}/dashboard`}>dashboard</Link>.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link className="tag" data-tone={role ? "quiet" : "go"} href={`/b/${id}/tasks`}>Everyone</Link>
        {(roles ?? []).map((r) => (
          <Link key={r.id} className="tag" data-tone={role === r.id ? "go" : "quiet"} href={`/b/${id}/tasks?role=${r.id}`}>
            {r.name}
          </Link>
        ))}
      </div>

      {all.length === 0 && (
        <div className="card mt-6 p-4">
          <p className="font-semibold">No tasks yet.</p>
          <p className="hint mt-1">Tasks appear here when a process runs. You can also add a one-off task below.</p>
          <Link className="btn mt-3" href={`/b/${id}/processes`}>Go to processes</Link>
        </div>
      )}
      <Section title="Results to check" hint="The work is done. Approve it to start the next step, or send it back with what to fix." items={toCheck} />
      <Section title="Needs your approval" hint="Nothing happens on these until someone approves." items={approval} />
      <Section title="Stuck" hint="Blocked, failed or handed on." items={attention} />
      <Section title="To be done" hint="Waiting to be done, or being done now." items={active} />
      <Section title="Finished" hint="The most recent 15." items={finished} />

      <details className="card mt-10 p-0">
        <summary className="cursor-pointer p-4 font-semibold">Add a one-off task</summary>
        <form action={addTask} className="space-y-4 border-t border-[var(--line)] p-4">
          <input type="hidden" name="business_id" value={id} />
          {role && <input type="hidden" name="return_to" value={`/b/${id}/tasks?role=${role}`} />}
          <p className="hint">For work that isn&apos;t part of a process. Work that repeats belongs in a process.</p>
          <div>
            <label className="label" htmlFor="title">Task</label>
            <input className="input" id="title" name="title" required placeholder="Draft follow-up emails for this week's enquiries" />
          </div>
          <div>
            <label className="label" htmlFor="detail">Detail</label>
            <p className="hint mb-2">What good looks like, and where to put the result.</p>
            <textarea className="input min-h-20" id="detail" name="detail" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="role_id">Whose job it is</label>
              <select className="input" id="role_id" name="role_id" defaultValue={role ?? roles?.[0]?.id ?? ""}>
                {(roles ?? []).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
                <option value="">No role</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="route">Done by</label>
              <select className="input" id="route" name="route" defaultValue="">
                <option value="">Whatever the role normally uses</option>
                {Object.entries(ROUTES)
                  .filter(([k]) => ["person", "claude"].includes(k) || connected.has(k))
                  .map(([k, r]) => (
                    <option key={k} value={k}>{r.label}</option>
                  ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="due_date">Due</label>
              <input className="input" id="due_date" name="due_date" type="date" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="needs_approval" value="1" className="h-4 w-4" />
            Needs approval before anyone starts it
          </label>
          <button className="btn">Add task</button>
        </form>
      </details>

      <details id="agents" className="card mt-3 p-0" open={!!newkey}>
        <summary className="cursor-pointer p-4 font-semibold">Connect another AI agent or automation</summary>
        <div className="border-t border-[var(--line)] p-4">
          <p className="max-w-2xl text-sm text-[var(--muted)]">
            Claude is built in and needs nothing here. This is for connecting a separate agent or automation you run
            yourself. Give each one its own key. It can only see and report on its own tasks in this business. Revoke a key
            and it is cut off straight away.
          </p>

          {newkey && (
            <div className="mt-4 rounded border-2 border-[var(--go)] bg-[var(--go-tint)] p-4">
              <p className="font-semibold">Copy this key now. It won&apos;t be shown again.</p>
              <code className="mt-2 block break-all rounded bg-white p-3 text-sm">{newkey}</code>
            </div>
          )}

          {liveKeys.length > 0 && (
            <ul className="mt-4 space-y-2">
              {liveKeys.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center gap-3 rounded border border-[var(--line)] p-3">
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{k.label}</span>
                    <span className="hint block">
                      {ROUTES[k.route]?.label ?? k.route}, key ending {k.key_hint}, added {when(k.created_at)}
                    </span>
                  </span>
                  <form action={revokeAgentKey}>
                    <input type="hidden" name="business_id" value={id} />
                    <input type="hidden" name="id" value={k.id} />
                    <button className="btn btn-secondary">Revoke</button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <form action={createAgentKey} className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <input type="hidden" name="business_id" value={id} />
            <div>
              <label className="label" htmlFor="label">Name</label>
              <input className="input" id="label" name="label" required placeholder="Sales agent" />
            </div>
            <div>
              <label className="label" htmlFor="agent_route">What kind it is</label>
              <select className="input" id="agent_route" name="route" defaultValue="grok_bot">
                {Object.entries(ROUTES)
                  .filter(([k]) => !["person", "claude"].includes(k))
                  .map(([k, r]) => (
                    <option key={k} value={k}>{r.label}</option>
                  ))}
              </select>
            </div>
            <button className="btn">Create key</button>
          </form>

          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-semibold">Setup details to give the agent</summary>
            <div className="mt-3 space-y-3">
              <p>Give the agent these, plus its key. It makes three calls: list its tasks, claim one, report the result.</p>
              <pre className="overflow-x-auto rounded bg-[var(--ink)] p-4 text-xs leading-relaxed text-white">{`Address: ${url}/rest/v1/rpc/
Header apikey: ${pub}

List tasks    POST agent_list_tasks   {"p_key": "AGENT_KEY"}
Claim a task  POST agent_claim_task   {"p_key": "AGENT_KEY", "p_task": "TASK_ID"}
Report back   POST agent_report_task  {"p_key": "AGENT_KEY", "p_task": "TASK_ID",
                                       "p_status": "done" | "failed" | "blocked",
                                       "p_result": "what was done",
                                       "p_link": "link to the work (optional)",
                                       "p_cost": 0}`}</pre>
              <p className="hint">A task reported as failed is handed on automatically.</p>
            </div>
          </details>
        </div>
      </details>
    </div>
  );
}
