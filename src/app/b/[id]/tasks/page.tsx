import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addTask, updateTask, createAgentKey, revokeAgentKey } from "../actions";
import Notice from "@/components/Notice";
import { ROUTES } from "@/lib/framework";

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
};

const STATUS: Record<string, { label: string; tone: string }> = {
  queued: { label: "Queued", tone: "quiet" },
  in_progress: { label: "In progress", tone: "wait" },
  blocked: { label: "Blocked", tone: "stop" },
  awaiting_approval: { label: "Waiting for approval", tone: "wait" },
  done: { label: "Done", tone: "go" },
  failed: { label: "Failed", tone: "stop" },
  escalated: { label: "Handed to fallback", tone: "stop" },
  cancelled: { label: "Cancelled", tone: "quiet" },
};

function when(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function day(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function Act({ id, task, action, label, quiet }: { id: string; task: string; action: string; label: string; quiet?: boolean }) {
  return (
    <form action={updateTask}>
      <input type="hidden" name="business_id" value={id} />
      <input type="hidden" name="task_id" value={task} />
      <input type="hidden" name="action" value={action} />
      <button className={quiet ? "btn btn-secondary" : "btn"}>{label}</button>
    </form>
  );
}

export default async function TasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; role?: string; newkey?: string }>;
}) {
  const { id } = await params;
  const { error, saved, role, newkey } = await searchParams;
  const supabase = await createClient();
  let tq = supabase.from("tasks").select("*").eq("business_id", id).order("due_date", { ascending: true, nullsFirst: false }).order("created_at");
  if (role) tq = tq.eq("role_id", role);
  const [{ data: roles }, { data: tasks }, { data: events }, { data: keys }] = await Promise.all([
    supabase.from("roles").select("id, name, route").eq("business_id", id).eq("active", true).order("created_at"),
    tq,
    supabase.from("task_events").select("task_id, event, actor, detail, created_at").eq("business_id", id).order("created_at", { ascending: false }).limit(500),
    supabase.from("agent_keys").select("id, label, route, key_hint, created_at, revoked_at").eq("business_id", id).order("created_at"),
  ]);
  const all = (tasks ?? []) as Task[];
  const roleName = (rid: string | null) => roles?.find((r) => r.id === rid)?.name ?? "No role";
  const closed = ["done", "cancelled"];
  const approval = all.filter((t) => t.needs_approval && !t.approved_at && !closed.includes(t.status));
  const attention = all.filter((t) => ["blocked", "failed", "escalated"].includes(t.status) && !approval.includes(t));
  const active = all.filter((t) => ["queued", "in_progress"].includes(t.status) && !approval.includes(t));
  const finished = all.filter((t) => closed.includes(t.status)).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 15);
  const today = new Date().toISOString().slice(0, 10);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const Card = ({ t }: { t: Task }) => {
    const history = (events ?? []).filter((e) => e.task_id === t.id);
    const overdue = t.due_date && t.due_date < today && !closed.includes(t.status);
    const waiting = t.needs_approval && !t.approved_at;
    return (
      <article className="card p-4">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold leading-snug">{t.title}</h3>
            <p className="hint">
              {roleName(t.role_id)}
              {t.due_date ? `, due ${day(t.due_date)}` : ""}
              {t.claimed_by ? `, picked up by ${t.claimed_by}` : ""}
              {t.attempts > 1 ? `, ${t.attempts} attempts` : ""}
              {Number(t.cost) > 0 ? `, cost ${Number(t.cost).toLocaleString("en-GB", { maximumFractionDigits: 2 })}` : ""}
            </p>
          </div>
          {overdue && <span className="tag" data-tone="stop">Overdue</span>}
          <span className="tag" data-tone="quiet">{ROUTES[t.route]?.label ?? t.route}</span>
          <span className="tag" data-tone={waiting ? "wait" : STATUS[t.status]?.tone}>{waiting ? "Needs approval" : STATUS[t.status]?.label ?? t.status}</span>
        </div>
        {t.detail && <p className="mt-3 whitespace-pre-line text-sm">{t.detail}</p>}
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
        {t.status === "escalated" && t.fallback_route && (
          <p className="mt-3 text-sm">The first route couldn&apos;t finish this, so it has moved to {ROUTES[t.route]?.label ?? t.route}.</p>
        )}
        {!closed.includes(t.status) && (
          <div className="mt-4 flex flex-wrap items-end gap-2">
            {waiting && <Act id={id} task={t.id} action="approve" label="Approve" />}
            {!waiting && t.route === "person" && t.status !== "in_progress" && <Act id={id} task={t.id} action="start" label="Start" quiet />}
            {!waiting && (
              <form action={updateTask} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="business_id" value={id} />
                <input type="hidden" name="task_id" value={t.id} />
                <input type="hidden" name="action" value="done" />
                <input className="input w-64" name="result" aria-label="What was done" placeholder="What was done" />
                <button className="btn">Mark done</button>
              </form>
            )}
            {["blocked", "failed", "escalated"].includes(t.status) && <Act id={id} task={t.id} action="requeue" label="Put back in the queue" quiet />}
            {t.status !== "blocked" && !waiting && <Act id={id} task={t.id} action="block" label="Blocked" quiet />}
            <Act id={id} task={t.id} action="cancel" label="Cancel" quiet />
          </div>
        )}
        {history.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-[var(--muted)]">History ({history.length})</summary>
            <ol className="mt-2 space-y-1">
              {history.map((e, i) => (
                <li key={i}>
                  <span className="text-[var(--muted)]">{when(e.created_at)}</span> {e.actor}: {e.event}
                  {e.detail ? `, ${e.detail}` : ""}
                </li>
              ))}
            </ol>
          </details>
        )}
      </article>
    );
  };

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

  const liveKeys = (keys ?? []).filter((k) => !k.revoked_at);

  return (
    <div className="max-w-4xl">
      <Notice error={error} saved={saved} />
      <p className="hint">Run</p>
      <h1 className="text-4xl font-bold leading-none sm:text-5xl">Tasks</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">
        Work handed to a person, an AI agent or an automation. Each task follows its role&apos;s route. If that route
        fails, it moves to the fallback. Anything that touches an approval gate waits here until someone approves it.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link className="tag" data-tone={role ? "quiet" : "go"} href={`/b/${id}/tasks`}>All roles</Link>
        {(roles ?? []).map((r) => (
          <Link key={r.id} className="tag" data-tone={role === r.id ? "go" : "quiet"} href={`/b/${id}/tasks?role=${r.id}`}>
            {r.name}
          </Link>
        ))}
      </div>

      <details className="card mt-6 p-0" open={all.length === 0}>
        <summary className="cursor-pointer p-4 font-semibold">Add a task</summary>
        <form action={addTask} className="space-y-4 border-t border-[var(--line)] p-4">
          <input type="hidden" name="business_id" value={id} />
          {role && <input type="hidden" name="return_to" value={`/b/${id}/tasks?role=${role}`} />}
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
              <label className="label" htmlFor="role_id">Role</label>
              <select className="input" id="role_id" name="role_id" defaultValue={role ?? roles?.[0]?.id ?? ""}>
                {(roles ?? []).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
                <option value="">No role</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="route">Route</label>
              <select className="input" id="route" name="route" defaultValue="">
                <option value="">Use the role&apos;s route</option>
                {Object.entries(ROUTES).map(([k, r]) => (
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

      {all.length === 0 && <p className="mt-6 text-[var(--muted)]">No tasks yet.</p>}
      <Section title="Needs your approval" hint="Nothing happens on these until someone approves." items={approval} />
      <Section title="Needs attention" hint="Blocked, failed or handed to the fallback route." items={attention} />
      <Section title="In the queue" hint="Waiting to be picked up, or being worked on." items={active} />
      <Section title="Finished" hint="The most recent 15." items={finished} />

      <section id="agents" className="mt-12 border-t border-[var(--line)] pt-8">
        <h2 className="display text-2xl font-bold">Connect an agent or automation</h2>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          Give each agent its own key. It can only see and report on tasks for its route in this business. Revoke a key
          and the agent is cut off straight away.
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
              <li key={k.id} className="card flex flex-wrap items-center gap-3 p-3">
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

        <form action={createAgentKey} className="card mt-4 grid gap-4 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <input type="hidden" name="business_id" value={id} />
          <div>
            <label className="label" htmlFor="label">Name</label>
            <input className="input" id="label" name="label" required placeholder="Sales agent" />
          </div>
          <div>
            <label className="label" htmlFor="agent_route">Route it works</label>
            <select className="input" id="agent_route" name="route" defaultValue="grok_bot">
              {Object.entries(ROUTES)
                .filter(([k]) => k !== "person")
                .map(([k, r]) => (
                  <option key={k} value={k}>{r.label}</option>
                ))}
            </select>
          </div>
          <button className="btn">Create key</button>
        </form>

        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-semibold">Setup details for the agent</summary>
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
            <p className="hint">A task reported as failed moves to its fallback route automatically.</p>
          </div>
        </details>
      </section>
    </div>
  );
}
