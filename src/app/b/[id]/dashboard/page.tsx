import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import StepStrip from "@/components/StepStrip";
import AutoRefresh from "@/components/AutoRefresh";
import { stepState } from "@/lib/process";

type Task = {
  id: string;
  title: string;
  status: string;
  route: string;
  needs_approval: boolean;
  approved_at: string | null;
  process_run_id: string | null;
  process_step_id: string | null;
  step_seq: number | null;
  result: string | null;
  review_required: boolean;
  reviewed_at: string | null;
  rejections: number;
  updated_at: string;
};

function when(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function duration(ms: number) {
  const h = ms / 3_600_000;
  if (h < 1) return "under an hour";
  if (h < 36) return `about ${Math.round(h)} hours`;
  return `about ${Math.round(h / 24)} days`;
}

export default async function DashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: processes }, { data: stepRows }, { data: runRows }, { data: taskRows }] = await Promise.all([
    supabase.from("processes").select("id, name, version").eq("business_id", id).order("created_at"),
    supabase.from("process_steps").select("id, process_id, seq, title").eq("business_id", id).order("seq"),
    supabase.from("process_runs").select("id, process_id, subject, status, started_at, finished_at").eq("business_id", id).order("started_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("id, title, status, route, needs_approval, approved_at, process_run_id, process_step_id, step_seq, result, review_required, reviewed_at, rejections, updated_at")
      .eq("business_id", id)
      .limit(2000),
  ]);
  const tasks = (taskRows ?? []) as Task[];
  const runs = runRows ?? [];
  const steps = stepRows ?? [];
  const closed = ["done", "cancelled"];

  const toCheck = tasks.filter((t) => t.status === "awaiting_review");
  const toApprove = tasks.filter((t) => t.needs_approval && !t.approved_at && !closed.includes(t.status));
  const stuck = tasks.filter((t) => ["blocked", "failed", "escalated"].includes(t.status));
  const working = tasks.filter((t) => t.route === "claude" && t.status === "in_progress" && Date.now() - new Date(t.updated_at).getTime() < 8 * 60_000);
  const needs = toCheck.length + toApprove.length + stuck.length;

  return (
    <div className="max-w-5xl">
      {working.length > 0 && <AutoRefresh />}
      <p className="hint">Run</p>
      <h1 className="text-4xl font-bold leading-none sm:text-5xl">Dashboard</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">
        What is running, what is waiting for you, and whether the agents are earning trust. Each process shows where its latest run has got to.
      </p>

      <section className="mt-6" aria-label="Waiting for you">
        {needs === 0 ? (
          <div className="card p-4">
            <p className="font-semibold">Nothing is waiting for you.</p>
            {working.length > 0 && <p className="hint">Claude is working on {working.length} {working.length === 1 ? "step" : "steps"}.</p>}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Link href={`/b/${id}/tasks`} className="card block p-4 hover:bg-[#f7f8fa]">
              <span className="display block text-4xl font-bold">{toCheck.length}</span>
              <span className="font-semibold">Results to check</span>
              <span className="hint block">Done by an agent, waiting for your yes or no</span>
            </Link>
            <Link href={`/b/${id}/tasks`} className="card block p-4 hover:bg-[#f7f8fa]">
              <span className="display block text-4xl font-bold">{toApprove.length}</span>
              <span className="font-semibold">Waiting for approval to start</span>
              <span className="hint block">Tasks held at an approval gate</span>
            </Link>
            <Link href={`/b/${id}/tasks`} className="card block p-4 hover:bg-[#f7f8fa]">
              <span className="display block text-4xl font-bold" style={stuck.length ? { color: "var(--stop)" } : undefined}>{stuck.length}</span>
              <span className="font-semibold">Stuck</span>
              <span className="hint block">Blocked, failed or handed to the fallback</span>
            </Link>
          </div>
        )}
      </section>

      <section className="mt-10" aria-label="Processes">
        <h2 className="display text-2xl font-bold">Processes</h2>
        {(processes ?? []).length === 0 ? (
          <div className="card mt-3 p-4">
            <p className="font-semibold">No process has been written yet.</p>
            <p className="hint mt-1">Write one process as steps, run it, and its progress and results show here.</p>
            <Link className="btn mt-3" href={`/b/${id}/processes`}>Write a process</Link>
          </div>
        ) : (
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {(processes ?? []).map((p) => {
              const pSteps = steps.filter((s) => s.process_id === p.id);
              const pRuns = runs.filter((r) => r.process_id === p.id);
              const runIds = new Set(pRuns.map((r) => r.id));
              const pTasks = tasks.filter((t) => t.process_run_id && runIds.has(t.process_run_id));
              const latest = pRuns[0];
              const latestTasks = latest ? pTasks.filter((t) => t.process_run_id === latest.id) : [];
              const items = pSteps.map((s) => ({
                n: s.seq,
                title: s.title,
                state: stepState(latestTasks.find((t) => t.process_step_id === s.id)?.status),
              }));
              const finished = pRuns.filter((r) => r.status === "complete" && r.finished_at);
              const avgMs = finished.length ? finished.reduce((a, r) => a + (new Date(r.finished_at as string).getTime() - new Date(r.started_at).getTime()), 0) / finished.length : 0;
              const reviewed = pTasks.filter((t) => t.review_required && t.reviewed_at);
              const firstTime = reviewed.filter((t) => t.rejections === 0).length;
              const sentBack = pTasks.reduce((a, t) => a + t.rejections, 0);
              const lastDone = [...latestTasks].filter((t) => t.status === "done" && t.result).sort((a, b) => (b.step_seq ?? 0) - (a.step_seq ?? 0))[0];
              const hasStuck = latestTasks.some((t) => ["blocked", "failed", "escalated"].includes(t.status));
              return (
                <article key={p.id} className="card p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <h3 className="min-w-0 flex-1 text-lg font-semibold leading-snug">
                      <Link className="underline-offset-4 hover:underline" href={`/b/${id}/processes/${p.id}`}>{p.name}</Link>
                    </h3>
                    {latest && (
                      <span className="tag" data-tone={hasStuck ? "stop" : latest.status === "complete" ? "go" : latest.status === "running" ? "wait" : "quiet"}>
                        {hasStuck ? "Stuck" : latest.status === "complete" ? "Complete" : latest.status === "running" ? "Running" : "Stopped"}
                      </span>
                    )}
                  </div>
                  <p className="hint">Procedure version {p.version}, {pSteps.length} {pSteps.length === 1 ? "step" : "steps"}</p>

                  {!latest ? (
                    <p className="mt-3 text-sm">
                      Not run yet. <Link className="underline underline-offset-4" href={`/b/${id}/processes/${p.id}#run`}>Start a run</Link>
                    </p>
                  ) : (
                    <>
                      <p className="mt-3 text-sm">
                        Latest run{latest.subject ? `: ${latest.subject}` : ""}, started {when(latest.started_at)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <StepStrip items={items} />
                        <Link className="text-sm underline underline-offset-4" href={`/b/${id}/tasks?run=${latest.id}`}>Open the tasks</Link>
                      </div>
                    </>
                  )}

                  <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--line)] pt-3 text-sm">
                    <div>
                      <dt className="hint">Runs finished</dt>
                      <dd className="display text-2xl font-bold">{finished.length}</dd>
                      {finished.length > 0 && <dd className="hint">usually {duration(avgMs)}</dd>}
                    </div>
                    <div>
                      <dt className="hint">Agent steps right first time</dt>
                      <dd className="display text-2xl font-bold">{reviewed.length ? `${firstTime} of ${reviewed.length}` : "None yet"}</dd>
                    </div>
                    <div>
                      <dt className="hint">Sent back</dt>
                      <dd className="display text-2xl font-bold">{sentBack}</dd>
                    </div>
                  </dl>

                  {lastDone?.result && (
                    <div className="mt-3 rounded border border-[var(--line)] bg-[var(--paper)] p-3 text-sm">
                      <p className="font-semibold">Latest approved result: {lastDone.title}</p>
                      <p className="mt-1 whitespace-pre-line">{lastDone.result.length > 320 ? `${lastDone.result.slice(0, 320)}...` : lastDone.result}</p>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
      <p className="hint mt-8 max-w-2xl">
        &ldquo;Agent steps right first time&rdquo; counts steps an agent did that a person checked and approved without sending back.
        It shows how far an agent can be trusted on a step; it says nothing about how the business will do.
      </p>
    </div>
  );
}
