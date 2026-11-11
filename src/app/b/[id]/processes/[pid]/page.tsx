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

function StepForm({ businessId, processId, step, roles, returnTo }: { businessId: string; processId: string; step?: Step; roles: Role[]; returnTo: string }) {
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
        <input className="input" id={`${p}-title`} name="title" required defaultValue={step?.title ?? ""} placeholder="Find the sites and the main contractor on each" />
      </div>
      <div>
        <label className="label" htmlFor={`${p}-instructions`}>How it is done</label>
        <p className="hint mb-2">The method. This can change without changing what the step must produce.</p>
        <textarea className="input min-h-20" id={`${p}-instructions`} name="instructions" defaultValue={step?.instructions ?? ""} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${p}-result`}>The result it must produce</label>
          <textarea className="input min-h-20" id={`${p}-result`} name="result" defaultValue={step?.result ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor={`${p}-standard`}>The standard it must meet</label>
          <textarea className="input min-h-20" id={`${p}-standard`} name="standard" defaultValue={step?.standard ?? ""} />
        </div>
      </div>

      <fieldset className="rounded border border-[var(--line)] p-3">
        <legend className="px-1 text-sm font-semibold">Who or what does it</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor={`${p}-role`}>Whose job it is</label>
            <select className="input" id={`${p}-role`} name="role_id" defaultValue={step?.role_id ?? ""}>
              <option value="">No role</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`${p}-route`}>Done by</label>
            <select className="input" id={`${p}-route`} name="route" defaultValue={step?.route ?? "person"}>
              {Object.entries(ROUTES).map(([k, r]) => (
                <option key={k} value={k}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`${p}-fallback`}>If it can&apos;t, hand to</label>
            <select className="input" id={`${p}-fallback`} name="fallback_route" defaultValue={step?.fallback_route ?? ""}>
              <option value="">Default (a person)</option>
              {Object.entries(ROUTES).map(([k, r]) => (
                <option key={k} value={k}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="review_required" value="1" className="h-4 w-4" defaultChecked={step?.review_required ?? false} />
            A person checks the result before the next step starts
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="can_search" value="1" className="h-4 w-4" defaultChecked={step?.can_search ?? false} />
            An AI doing this step may search the web
          </label>
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold">Not sure who should do it? Answer four questions</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
        </details>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <div>
          <label className="label" htmlFor={`${p}-minutes`}>Minutes</label>
          <input className="input" id={`${p}-minutes`} name="minutes" inputMode="numeric" defaultValue={step?.minutes ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor={`${p}-reason`}>Why are you changing it? (kept in the history)</label>
          <input className="input" id={`${p}-reason`} name="reason" />
        </div>
      </div>
      <button className="btn">{step ? "Save step" : "Add step"}</button>
    </form>
  );
}

export default async function ProcessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; pid: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id, pid } = await params;
  const { error, saved } = await searchParams;
  const supabase = await createClient();
  const { data: proc } = await supabase.from("processes").select("*").eq("id", pid).eq("business_id", id).maybeSingle();
  if (!proc) notFound();
  const [{ data: stepRows }, { data: roleRows }, { data: runRows }, { data: versions }] = await Promise.all([
    supabase.from("process_steps").select("*").eq("process_id", pid).order("seq"),
    supabase.from("roles").select("id, name").eq("business_id", id).eq("active", true).order("created_at"),
    supabase.from("process_runs").select("id, subject, status, version, started_at, finished_at").eq("process_id", pid).order("started_at", { ascending: false }).limit(8),
    supabase.from("process_versions").select("version, reason, changed_by_email, created_at").eq("process_id", pid).order("version", { ascending: false }).limit(30),
  ]);
  const steps = (stepRows ?? []) as Step[];
  const roles = (roleRows ?? []) as Role[];
  const runs = runRows ?? [];
  const runIds = runs.map((r) => r.id);
  const { data: runTasks } = runIds.length
    ? await supabase.from("tasks").select("process_run_id, process_step_id, status").in("process_run_id", runIds)
    : { data: [] as { process_run_id: string; process_step_id: string | null; status: string }[] };
  const roleName = (rid: string | null) => roles.find((r) => r.id === rid)?.name;
  const here = `/b/${id}/processes/${pid}`;

  return (
    <div className="max-w-4xl">
      <Notice error={error} saved={saved} />
      <p className="hint">
        <Link href={`/b/${id}/processes`} className="underline underline-offset-4">Processes</Link>
      </p>
      <h1 className="text-4xl font-bold leading-none sm:text-5xl">{proc.name}</h1>
      <p className="hint mt-2">
        Version {proc.version}
        {versions?.[0] ? `, last changed ${when(versions[0].created_at)}${versions[0].changed_by_email ? ` by ${versions[0].changed_by_email}` : ""}` : ""}
      </p>

      <details className="card mt-6 p-0" open={!proc.purpose && !proc.outcome}>
        <summary className="cursor-pointer p-4 font-semibold">What this process is for</summary>
        <form action={saveProcess} className="space-y-4 border-t border-[var(--line)] p-4">
          <input type="hidden" name="business_id" value={id} />
          <input type="hidden" name="process_id" value={pid} />
          <input type="hidden" name="return_to" value={here} />
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
              <label className="label" htmlFor="trigger_text">What starts it?</label>
              <textarea className="input min-h-20" id="trigger_text" name="trigger_text" defaultValue={proc.trigger_text ?? ""} />
            </div>
            <div>
              <label className="label" htmlFor="outcome">The result it must produce</label>
              <textarea className="input min-h-20" id="outcome" name="outcome" defaultValue={proc.outcome ?? ""} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="owner_role_id">Who owns it</label>
              <select className="input" id="owner_role_id" name="owner_role_id" defaultValue={proc.owner_role_id ?? ""}>
                <option value="">No owner yet</option>
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

      <section className="mt-8">
        <h2 className="display text-2xl font-bold">The steps</h2>
        <p className="hint">
          In order. Each step has a result and a standard that stay fixed; how it&apos;s done and who does it can change.
        </p>
        {steps.length === 0 && <p className="mt-3 text-[var(--muted)]">No steps yet. Add the first one below, or paste several at once.</p>}
        <div className="mt-3 space-y-3">
          {steps.map((s) => (
            <details key={s.id} className="card p-0" open={steps.length <= 4}>
              <summary className="cursor-pointer p-4">
                <span className="font-semibold">
                  {s.seq}. {s.title}
                </span>
                <span className="ml-2 inline-flex flex-wrap gap-1.5 align-middle">
                  <span className="tag" data-tone="quiet">{ROUTES[s.route]?.label ?? s.route}</span>
                  {roleName(s.role_id) && <span className="tag" data-tone="quiet">{roleName(s.role_id)}</span>}
                  {s.review_required && <span className="tag" data-tone="wait">Checked by a person</span>}
                  {s.can_search && <span className="tag" data-tone="quiet">May search the web</span>}
                </span>
              </summary>
              <div className="space-y-4 border-t border-[var(--line)] p-4">
                <StepForm businessId={id} processId={pid} step={s} roles={roles} returnTo={here} />
                <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-4">
                  {["up", "down"].map((dir) => (
                    <form key={dir} action={moveStep}>
                      <input type="hidden" name="business_id" value={id} />
                      <input type="hidden" name="process_id" value={pid} />
                      <input type="hidden" name="return_to" value={here} />
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
                    <input type="hidden" name="return_to" value={here} />
                    <input type="hidden" name="id" value={s.id} />
                    <button className="btn btn-secondary">Remove this step</button>
                  </form>
                </div>
              </div>
            </details>
          ))}
        </div>

        <details className="card mt-4 p-0" open={steps.length === 0}>
          <summary className="cursor-pointer p-4 font-semibold">Add a step</summary>
          <div className="border-t border-[var(--line)] p-4">
            <StepForm businessId={id} processId={pid} roles={roles} returnTo={here} />
          </div>
        </details>

        <details className="card mt-3 p-0">
          <summary className="cursor-pointer p-4 font-semibold">Paste several steps at once</summary>
          <form action={pasteSteps} className="space-y-3 border-t border-[var(--line)] p-4">
            <input type="hidden" name="business_id" value={id} />
            <input type="hidden" name="process_id" value={pid} />
            <input type="hidden" name="return_to" value={here} />
            <p className="hint">One step on each line: title | result | standard. Copying rows from a spreadsheet also works. You can set who does each step afterwards.</p>
            <textarea className="input min-h-28" name="pasted" aria-label="Steps to paste" />
            <button className="btn">Add these steps</button>
          </form>
        </details>
      </section>

      <section id="run" className="mt-10 border-t border-[var(--line)] pt-8">
        <h2 className="display text-2xl font-bold">Run this process</h2>
        <p className="hint">
          Starting a run creates the first step&apos;s task. Each finished step creates the next one from the procedure as it
          is at that moment.
        </p>
        {steps.length === 0 ? (
          <p className="mt-3 text-[var(--muted)]">Add a step first.</p>
        ) : (
          <form action={startRun} className="card mt-3 space-y-4 p-4">
            <input type="hidden" name="business_id" value={id} />
            <input type="hidden" name="process_id" value={pid} />
            <div>
              <label className="label" htmlFor="subject">What is this run about?</label>
              <input className="input" id="subject" name="subject" placeholder="Gävle sites, December 2026" />
            </div>
            <div>
              <label className="label" htmlFor="brief">What should whoever does it start from?</label>
              <p className="hint mb-2">Names, places, what you already know. Anything an AI does reads this.</p>
              <textarea className="input min-h-24" id="brief" name="brief" />
            </div>
            <PendingButton label="Start a run" pending="Starting..." />
          </form>
        )}

        {runs.length > 0 && (
          <ul className="mt-4 space-y-3">
            {runs.map((r) => {
              const items = steps.map((s) => ({
                n: s.seq,
                title: s.title,
                state: stepState((runTasks ?? []).find((t) => t.process_run_id === r.id && t.process_step_id === s.id)?.status),
              }));
              return (
                <li key={r.id} className="card p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="min-w-0 flex-1 font-semibold">{r.subject ?? "Untitled run"}</span>
                    <span className="tag" data-tone={r.status === "complete" ? "go" : r.status === "running" ? "wait" : "quiet"}>
                      {r.status === "complete" ? "Complete" : r.status === "running" ? "Running" : "Stopped"}
                    </span>
                    <span className="hint">Version {r.version}, started {when(r.started_at)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <StepStrip items={items} />
                    <Link className="text-sm underline underline-offset-4" href={`/b/${id}/tasks?run=${r.id}`}>Open its tasks</Link>
                    {r.status === "running" && (
                      <form action={stopRun}>
                        <input type="hidden" name="business_id" value={id} />
                        <input type="hidden" name="process_id" value={pid} />
                        <input type="hidden" name="run_id" value={r.id} />
                        <input type="hidden" name="return_to" value={`${here}#run`} />
                        <button className="text-sm text-[var(--muted)] underline underline-offset-4">Stop this run</button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <details className="mt-10 text-sm">
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
    </div>
  );
}
