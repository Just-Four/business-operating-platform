import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Notice from "@/components/Notice";
import PendingButton from "@/components/PendingButton";
import StepStrip from "@/components/StepStrip";
import { ROUTES } from "@/lib/framework";
import { QUESTIONS, parseAssessment, stepState, suggestRoute } from "@/lib/process";
import { moveStep, pasteSteps, removeStep, saveProcess, saveStep, startRun, stopRun } from "../../process-actions";

export const maxDuration = 300;

type Step = {
  id: string;
  seq: number;
  title: string;
  instructions: string | null;
  result: string | null;
  standard: string | null;
  minutes: number | null;
  role_id: string | null;
  route: string;
  fallback_route: string | null;
  review_required: boolean;
  can_search: boolean;
  assessment: unknown;
};
type Role = { id: string; name: string };

function when(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Only offer what works here today: a person, Claude, and any agent this business has connected.
function routeOptions(connected: Set<string>, current?: string | null) {
  return Object.entries(ROUTES).filter(([k]) => ["person", "claude"].includes(k) || connected.has(k) || k === current);
}

function StepForm({
  businessId,
  processId,
  step,
  roles,
  returnTo,
  connected,
}: {
  businessId: string;
  processId: string;
  step?: Step;
  roles: Role[];
  returnTo: string;
  connected: Set<string>;
}) {
  const p = step?.id ?? "new";
  const a = parseAssessment(step?.assessment);
  const suggestion = suggestRoute(a);
  return (
    <form action={saveStep} className="space-y-4">
      <input type="hidden" name="business_id" value={businessId} />
      <input type="hidden" name="process_id" value={processId} />
      <input type="hidden" name="return_to" value={returnTo} />
      {step && <input type="hidden" name="id" value={step.id} />}
      <div>
        <label className="label" htmlFor={`${p}-title`}>What happens in this step?</label>
        <input className="input" id={`${p}-title`} name="title" required defaultValue={step?.title ?? ""} placeholder="Find three suppliers and what each one charges" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${p}-result`}>What must exist when it&apos;s done?</label>
          <textarea className="input min-h-20" id={`${p}-result`} name="result" defaultValue={step?.result ?? ""} placeholder="A list of three suppliers, each with a price and a web address" />
        </div>
        <div>
          <label className="label" htmlFor={`${p}-standard`}>How do you know it&apos;s good enough?</label>
          <textarea className="input min-h-20" id={`${p}-standard`} name="standard" defaultValue={step?.standard ?? ""} placeholder="Every price has a source. Nothing is guessed." />
        </div>
      </div>
      <div>
        <label className="label" htmlFor={`${p}-instructions`}>How to do it (optional)</label>
        <textarea className="input min-h-20" id={`${p}-instructions`} name="instructions" defaultValue={step?.instructions ?? ""} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${p}-route`}>Who or what does it?</label>
          <select className="input" id={`${p}-route`} name="route" defaultValue={step?.route ?? "person"}>
            {routeOptions(connected, step?.route).map(([k, r]) => (
              <option key={k} value={k}>{r.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`${p}-role`}>Whose job is it?</label>
          <select className="input" id={`${p}-role`} name="role_id" defaultValue={step?.role_id ?? ""}>
            <option value="">Nobody yet</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="review_required" value="1" className="h-4 w-4" defaultChecked={step?.review_required ?? false} />
          A person checks the result before the next step starts (recommended when an AI does the step)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="can_search" value="1" className="h-4 w-4" defaultChecked={step?.can_search ?? false} />
          If an AI does this step, it may search the web
        </label>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-[var(--muted)]">More settings</summary>
        <div className="mt-3 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={`${p}-fallback`}>If it can&apos;t be done that way, hand it to</label>
              <select className="input" id={`${p}-fallback`} name="fallback_route" defaultValue={step?.fallback_route ?? ""}>
                <option value="">A person</option>
                {routeOptions(connected, step?.fallback_route)
                  .filter(([k]) => k !== "person")
                  .map(([k, r]) => (
                    <option key={k} value={k}>{r.label}</option>
                  ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor={`${p}-minutes`}>Minutes it usually takes</label>
              <input className="input" id={`${p}-minutes`} name="minutes" inputMode="numeric" defaultValue={step?.minutes ?? ""} />
            </div>
          </div>
          <div>
            <p className="font-semibold">Not sure who should do it? Answer four questions</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {QUESTIONS.map((q) => (
                <div key={q.key}>
                  <label className="label" htmlFor={`${p}-a-${q.key}`}>{q.question}</label>
                  <select className="input" id={`${p}-a-${q.key}`} name={`a_${q.key}`} defaultValue={a[q.key] ?? ""}>
                    <option value="">Not answered</option>
                    {q.options.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {suggestion && (
              <p className="mt-3 rounded bg-[var(--paper)] p-3">
                <span className="font-semibold">Suggestion: </span>
                {suggestion.text}
              </p>
            )}
          </div>
          {step && (
            <div>
              <label className="label" htmlFor={`${p}-reason`}>Why are you changing it? (kept in the history)</label>
              <input className="input" id={`${p}-reason`} name="reason" />
            </div>
          )}
        </div>
      </details>
      <button className="btn">{step ? "Save this step" : "Add this step"}</button>
    </form>
  );
}

export default async function ProcessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; pid: string }>;
  searchParams: Promise<{ error?: string; saved?: string; edit?: string }>;
}) {
  const { id, pid } = await params;
  const { error, saved, edit } = await searchParams;
  const supabase = await createClient();
  const { data: proc } = await supabase.from("processes").select("*").eq("id", pid).eq("business_id", id).maybeSingle();
  if (!proc) notFound();
  const [{ data: stepRows }, { data: roleRows }, { data: runRows }, { data: versions }, { data: keys }] = await Promise.all([
    supabase.from("process_steps").select("*").eq("process_id", pid).order("seq"),
    supabase.from("roles").select("id, name").eq("business_id", id).eq("active", true).order("created_at"),
    supabase.from("process_runs").select("id, subject, status, version, started_at, finished_at").eq("process_id", pid).order("started_at", { ascending: false }).limit(8),
    supabase.from("process_versions").select("version, reason, changed_by_email, created_at").eq("process_id", pid).order("version", { ascending: false }).limit(30),
    supabase.from("agent_keys").select("route, revoked_at").eq("business_id", id),
  ]);
  const steps = (stepRows ?? []) as Step[];
  const roles = (roleRows ?? []) as Role[];
  const runs = runRows ?? [];
  const connected = new Set((keys ?? []).filter((k) => !k.revoked_at).map((k) => k.route));
  const runIds = runs.map((r) => r.id);
  const { data: runTasks } = runIds.length
    ? await supabase.from("tasks").select("id, process_run_id, process_step_id, status, created_at").in("process_run_id", runIds).order("created_at")
    : { data: [] as { id: string; process_run_id: string; process_step_id: string | null; status: string; created_at: string }[] };
  const roleName = (rid: string | null) => roles.find((r) => r.id === rid)?.name;
  const here = `/b/${id}/processes/${pid}`;
  const editing = edit === "1" || steps.length === 0;
  const editHere = `${here}?edit=1`;
  const crumbs = (
    <p className="hint">
      Stage 2: Build / <Link href={`/b/${id}/processes`} className="underline underline-offset-4">Processes</Link>
    </p>
  );

  // ---------- Changing the process ----------
  if (editing) {
    return (
      <div className="max-w-4xl">
        <Notice error={error} saved={saved} />
        {crumbs}
        <h1 className="text-4xl font-bold leading-none sm:text-5xl">{steps.length ? `Change: ${proc.name}` : proc.name}</h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          {steps.length
            ? "Change a step, add one or move them. A run already in progress picks up your changes from its next step."
            : "Now add the steps, in the order they happen. For each one, say what must exist when it's done and who or what does it. Three or four steps is enough to start."}
        </p>
        {steps.length > 0 && (
          <Link className="btn mt-4" href={here}>Done changing</Link>
        )}

        <section className="mt-8">
          <h2 className="display text-2xl font-bold">The steps</h2>
          <div className="mt-3 space-y-3">
            {steps.map((s) => (
              <details key={s.id} className="card p-0">
                <summary className="cursor-pointer p-4">
                  <span className="font-semibold">
                    {s.seq}. {s.title}
                  </span>
                  <span className="ml-2 inline-flex flex-wrap gap-1.5 align-middle">
                    <span className="tag" data-tone="quiet">{ROUTES[s.route]?.label ?? s.route}</span>
                    {roleName(s.role_id) && <span className="tag" data-tone="quiet">{roleName(s.role_id)}</span>}
                    {s.review_required && <span className="tag" data-tone="wait">Checked by a person</span>}
                  </span>
                  <span className="hint ml-2">Open to change</span>
                </summary>
                <div className="space-y-4 border-t border-[var(--line)] p-4">
                  <StepForm businessId={id} processId={pid} step={s} roles={roles} returnTo={editHere} connected={connected} />
                  <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-4">
                    {["up", "down"].map((dir) => (
                      <form key={dir} action={moveStep}>
                        <input type="hidden" name="business_id" value={id} />
                        <input type="hidden" name="process_id" value={pid} />
                        <input type="hidden" name="return_to" value={editHere} />
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="dir" value={dir} />
                        <button className="btn btn-secondary" disabled={(dir === "up" && s.seq === 1) || (dir === "down" && s.seq === steps.length)}>
                          {dir === "up" ? "Move up" : "Move down"}
                        </button>
                      </form>
                    ))}
                    <form action={removeStep}>
                      <input type="hidden" name="business_id" value={id} />
                      <input type="hidden" name="process_id" value={pid} />
                      <input type="hidden" name="return_to" value={editHere} />
                      <input type="hidden" name="id" value={s.id} />
                      <button className="btn btn-secondary">Remove this step</button>
                    </form>
                  </div>
                </div>
              </details>
            ))}
          </div>

          <details className="card mt-4 p-0" open={steps.length === 0}>
            <summary className="cursor-pointer p-4 font-semibold">{steps.length ? "Add another step" : "Add the first step"}</summary>
            <div className="border-t border-[var(--line)] p-4">
              <StepForm businessId={id} processId={pid} roles={roles} returnTo={editHere} connected={connected} />
            </div>
          </details>

          <details className="card mt-3 p-0">
            <summary className="cursor-pointer p-4 font-semibold">Or paste several steps at once</summary>
            <form action={pasteSteps} className="space-y-3 border-t border-[var(--line)] p-4">
              <input type="hidden" name="business_id" value={id} />
              <input type="hidden" name="process_id" value={pid} />
              <input type="hidden" name="return_to" value={editHere} />
              <p className="hint">One step on each line: what happens | what must exist when it&apos;s done | how you know it&apos;s good enough. Copying rows from a spreadsheet also works. You set who does each step afterwards.</p>
              <textarea className="input min-h-28" name="pasted" aria-label="Steps to paste" />
              <button className="btn">Add these steps</button>
            </form>
          </details>
        </section>

        <details className="card mt-8 p-0">
          <summary className="cursor-pointer p-4 font-semibold">Name, purpose and owner</summary>
          <form action={saveProcess} className="space-y-4 border-t border-[var(--line)] p-4">
            <input type="hidden" name="business_id" value={id} />
            <input type="hidden" name="process_id" value={pid} />
            <input type="hidden" name="return_to" value={editHere} />
            <div>
              <label className="label" htmlFor="name">Name</label>
              <input className="input" id="name" name="name" required defaultValue={proc.name} />
            </div>
            <div>
              <label className="label" htmlFor="purpose">What is it for?</label>
              <textarea className="input min-h-20" id="purpose" name="purpose" defaultValue={proc.purpose ?? ""} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="trigger_text">When does it need doing?</label>
                <textarea className="input min-h-20" id="trigger_text" name="trigger_text" defaultValue={proc.trigger_text ?? ""} />
              </div>
              <div>
                <label className="label" htmlFor="outcome">What must exist when the whole thing is done?</label>
                <textarea className="input min-h-20" id="outcome" name="outcome" defaultValue={proc.outcome ?? ""} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="owner_role_id">Who owns it</label>
                <select className="input" id="owner_role_id" name="owner_role_id" defaultValue={proc.owner_role_id ?? ""}>
                  <option value="">Nobody yet</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="reason">Why are you changing it? (kept in the history)</label>
                <input className="input" id="reason" name="reason" />
              </div>
            </div>
            <button className="btn">Save</button>
          </form>
        </details>

        <details className="mt-6 text-sm">
          <summary className="cursor-pointer font-semibold">History of changes ({versions?.length ?? 0})</summary>
          <ol className="mt-3 space-y-1">
            {(versions ?? []).map((v) => (
              <li key={v.version}>
                <span className="text-[var(--muted)]">{when(v.created_at)}</span> Version {v.version}
                {v.changed_by_email ? `, ${v.changed_by_email}` : ""}
                {v.reason ? `: ${v.reason}` : ""}
              </li>
            ))}
          </ol>
        </details>

        {steps.length > 0 && (
          <div className="mt-8 border-t border-[var(--line)] pt-6">
            <p className="text-sm font-semibold">Finished changing it?</p>
            <Link className="btn mt-2" href={here}>Done changing: go and run it</Link>
          </div>
        )}
      </div>
    );
  }

  // ---------- Reading and running the process ----------
  const live = runs.find((r) => r.status === "running");
  const liveOpen = live ? [...(runTasks ?? [])].reverse().find((t) => t.process_run_id === live.id && !["done", "cancelled"].includes(t.status)) : undefined;
  const stripFor = (runId: string) =>
    steps.map((s) => ({
      n: s.seq,
      title: s.title,
      state: stepState((runTasks ?? []).find((t) => t.process_run_id === runId && t.process_step_id === s.id && t.status !== "cancelled")?.status),
    }));

  return (
    <div className="max-w-4xl">
      <Notice error={error} saved={saved} />
      {crumbs}
      <div className="flex flex-wrap items-start gap-4">
        <h1 className="min-w-0 flex-1 text-4xl font-bold leading-none sm:text-5xl">{proc.name}</h1>
        <Link className="btn btn-secondary" href={editHere}>Change this process</Link>
      </div>
      {proc.purpose && <p className="mt-3 max-w-3xl text-[var(--muted)]">{proc.purpose}</p>}
      {(proc.outcome || proc.trigger_text) && (
        <dl className="mt-3 max-w-3xl space-y-1 text-sm">
          {proc.outcome && (
            <div>
              <dt className="inline font-semibold">When it&apos;s done: </dt>
              <dd className="inline">{proc.outcome}</dd>
            </div>
          )}
          {proc.trigger_text && (
            <div>
              <dt className="inline font-semibold">When it needs doing: </dt>
              <dd className="inline">{proc.trigger_text}</dd>
            </div>
          )}
        </dl>
      )}

      {live && (
        <section className="card mt-6 border-[var(--ink)] p-5" aria-label="Run in progress">
          <p className="hint">A run is in progress</p>
          <p className="display text-2xl font-bold">{live.subject ?? "Untitled run"}</p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <StepStrip items={stripFor(live.id)} />
            {liveOpen && <Link className="btn" href={`/b/${id}/tasks?task=${liveOpen.id}`}>Go to the current step</Link>}
          </div>
        </section>
      )}

      <section id="run" className="card mt-6 p-5">
        <h2 className="display text-2xl font-bold">{live ? "Start another run" : runs.length ? "Run it again" : "Run it for the first time"}</h2>
        <p className="hint">
          Starting a run takes you to step 1. Each step you finish brings up the next one, until the last step is done.
        </p>
        <form action={startRun} className="mt-4 space-y-4">
          <input type="hidden" name="business_id" value={id} />
          <input type="hidden" name="process_id" value={pid} />
          <div>
            <label className="label" htmlFor="subject">What is this run about?</label>
            <p className="hint mb-2">A short label so you can tell runs apart, such as a customer, a place or a month.</p>
            <input className="input" id="subject" name="subject" placeholder="March orders" />
          </div>
          <div>
            <label className="label" htmlFor="brief">What should whoever does it start from? (optional)</label>
            <p className="hint mb-2">Names, places, what you already know. Any AI doing a step reads this.</p>
            <textarea className="input min-h-24" id="brief" name="brief" />
          </div>
          <PendingButton label="Start a run" pending="Starting..." />
        </form>
      </section>

      <section className="mt-10">
        <h2 className="display text-2xl font-bold">The steps</h2>
        <p className="hint">Version {proc.version}. Each run follows these in order.</p>
        <ol className="mt-3 space-y-3">
          {steps.map((s) => (
            <li key={s.id} className="card p-4">
              <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                <span className="min-w-0 flex-1 font-semibold">
                  {s.seq}. {s.title}
                </span>
                <span className="tag" data-tone="quiet">{ROUTES[s.route]?.label ?? s.route}</span>
                {roleName(s.role_id) && (
                  <Link className="tag" data-tone="quiet" href={`/b/${id}/team`}>{roleName(s.role_id)}</Link>
                )}
                {s.review_required && <span className="tag" data-tone="wait">Checked by a person</span>}
              </div>
              {s.instructions && <p className="mt-2 whitespace-pre-line text-sm">{s.instructions}</p>}
              <dl className="mt-2 space-y-1 text-sm">
                {s.result && (
                  <div>
                    <dt className="inline font-semibold">When it&apos;s done: </dt>
                    <dd className="inline">{s.result}</dd>
                  </div>
                )}
                {s.standard && (
                  <div>
                    <dt className="inline font-semibold">Good enough when: </dt>
                    <dd className="inline">{s.standard}</dd>
                  </div>
                )}
              </dl>
            </li>
          ))}
        </ol>
      </section>

      {runs.length > 0 && (
        <section className="mt-10">
          <h2 className="display text-2xl font-bold">Runs so far</h2>
          <ul className="mt-3 space-y-3">
            {runs.map((r) => (
              <li key={r.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="min-w-0 flex-1 font-semibold">{r.subject ?? "Untitled run"}</span>
                  <span className="tag" data-tone={r.status === "complete" ? "go" : r.status === "running" ? "wait" : "quiet"}>
                    {r.status === "complete" ? "Finished" : r.status === "running" ? "In progress" : "Stopped"}
                  </span>
                  <span className="hint">Started {when(r.started_at)}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <StepStrip items={stripFor(r.id)} />
                  <Link className="text-sm underline underline-offset-4" href={`/b/${id}/tasks?run=${r.id}`}>See its steps and results</Link>
                  {r.status === "running" && (
                    <form action={stopRun}>
                      <input type="hidden" name="business_id" value={id} />
                      <input type="hidden" name="process_id" value={pid} />
                      <input type="hidden" name="run_id" value={r.id} />
                      <input type="hidden" name="return_to" value={here} />
                      <button className="text-sm text-[var(--muted)] underline underline-offset-4">Stop this run</button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
