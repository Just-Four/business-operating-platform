import type { SupabaseClient } from "@supabase/supabase-js";
import { PARTS, ROUTES, type Stage } from "@/lib/framework";
import { CLAUDE_STALE_MINUTES } from "@/lib/process";
import { SESSIONS, sessionTitle } from "@/lib/programme";
import type { BusinessProgress } from "@/lib/progress";

// ---------- What needs someone now ----------

export type NeedKind = "check" | "approve" | "stuck" | "claude" | "person" | "working" | "agent";

export type Need = {
  taskId: string;
  kind: NeedKind;
  title: string;
  line: string; // what is going on, in one line
  label: string; // what the button says
  href: string;
  acts: boolean; // false when nothing can be done yet (someone else is working on it)
  who: string | null;
};

const ORDER: NeedKind[] = ["check", "approve", "stuck", "claude", "person", "working", "agent"];
const OPEN = ["queued", "in_progress", "blocked", "awaiting_approval", "awaiting_review", "failed", "escalated"];

export async function getNeeds(supabase: SupabaseClient, businessId: string): Promise<Need[]> {
  const [{ data: tasks }, { data: roles }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, status, route, role_id, needs_approval, approved_at, updated_at, rejections, process_run_id, created_at")
      .eq("business_id", businessId)
      .in("status", OPEN)
      .order("created_at")
      .limit(500),
    supabase.from("roles").select("id, name").eq("business_id", businessId),
  ]);
  const now = Date.now();
  const needs: Need[] = (tasks ?? []).map((t) => {
    const routeLabel = ROUTES[t.route]?.label ?? t.route;
    const inProcess = !!t.process_run_id;
    let kind: NeedKind;
    let line: string;
    let label: string;
    let acts = true;
    if (t.status === "awaiting_review") {
      kind = "check";
      line = "The work is done. Check it before the next step starts.";
      label = "Check this result";
    } else if (t.needs_approval && !t.approved_at) {
      kind = "approve";
      line = "Nobody starts this until you approve it.";
      label = "Approve or hold";
    } else if (["blocked", "failed", "escalated"].includes(t.status)) {
      kind = "stuck";
      line = t.status === "failed" ? "This failed." : t.status === "blocked" ? "This is blocked." : "The first way of doing this didn't work, so it was handed on.";
      label = t.route === "claude" ? "Try again" : "Sort this out";
    } else if (t.route === "claude") {
      const working = t.status === "in_progress" && now - new Date(t.updated_at).getTime() < CLAUDE_STALE_MINUTES * 60_000;
      if (working) {
        kind = "working";
        line = "Claude is working on this now.";
        label = "Watch";
        acts = false;
      } else {
        kind = "claude";
        line = t.rejections > 0 ? "Sent back. Claude can try again with your note." : "Claude does this step when you press the button.";
        label = t.rejections > 0 ? "Run Claude again" : "Run Claude on this";
      }
    } else if (t.route === "person") {
      kind = "person";
      line = inProcess ? "A person does this step, then records the result." : "A person does this.";
      label = inProcess ? "Do this step" : "Do this task";
    } else {
      kind = "agent";
      line = `Waiting for ${routeLabel} to pick this up.`;
      label = "Open";
      acts = false;
    }
    return {
      taskId: t.id,
      kind,
      title: t.title,
      line,
      label,
      href: `/b/${businessId}/tasks?task=${t.id}`,
      acts,
      who: (roles ?? []).find((r) => r.id === t.role_id)?.name ?? null,
    };
  });
  return needs.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

// ---------- The four stages ----------

export type StageKey = "plan" | "build" | "run" | "review";
export type Row = { title: string; detail: string; href: string; tag?: { tone: string; text: string } };
export type StageInfo = {
  key: StageKey;
  num: number;
  title: string;
  purpose: string;
  ends: string;
  state: "done" | "now" | "ahead";
  summary: string;
  action: { label: string; href: string } | null;
  rows: Row[];
};
export type Journey = {
  stages: StageInfo[];
  next: { stage: string; title: string; why: string; label: string; href: string };
  guided: boolean;
  locked: boolean;
};

export const STAGE_TEXT: Record<StageKey, { num: number; title: string; purpose: string; ends: string }> = {
  plan: {
    num: 1,
    title: "Plan",
    purpose: "Say what the business is, where it's going and what this year has to deliver.",
    ends: "Ends with a plan that has been reviewed and locked.",
  },
  build: {
    num: 2,
    title: "Build",
    purpose: "Turn the plan into the work that repeats. Each process is written once as steps, with who or what does each step.",
    ends: "Ends with each important process written down and tried once.",
  },
  run: {
    num: 3,
    title: "Run",
    purpose: "People and AI do the steps. You approve, check results and deal with what's stuck.",
    ends: "This doesn't end: it's the business working day to day.",
  },
  review: {
    num: 4,
    title: "Review",
    purpose: "Look at the numbers and the plan on a fixed rhythm, and change what isn't working.",
    ends: "Each review ends with decisions that go back into the plan and the processes.",
  },
};

const PLAN_PARTS = [1, 2, 3, 4, 5, 6];
const TAG: Record<string, { tone: string; text: string }> = {
  complete: { tone: "go", text: "Complete" },
  partial: { tone: "wait", text: "Started" },
  empty: { tone: "quiet", text: "Not started" },
};

export function planParts(stage: Stage) {
  return PARTS.filter((p) => PLAN_PARTS.includes(p.num) && p.built && p.stages[stage] !== "off");
}

export async function getJourney(
  supabase: SupabaseClient,
  businessId: string,
  biz: { stage: string | null; planning_route: string | null },
  progress: BusinessProgress,
  needs: Need[]
): Promise<Journey> {
  const stage = (biz.stage ?? "launch") as Stage;
  const base = `/b/${businessId}`;
  const guided = ["guided", "focused", "partial"].includes(biz.planning_route ?? "");
  const [{ data: sessions }, { data: cyc }, { data: processes }, { data: steps }, { data: runs }] = await Promise.all([
    guided
      ? supabase.from("programme_sessions").select("key, completed_at").eq("business_id", businessId)
      : Promise.resolve({ data: [] as { key: string; completed_at: string | null }[] }),
    supabase.from("plan_cycles").select("status").eq("business_id", businessId).order("start_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("processes").select("id, name").eq("business_id", businessId).order("created_at"),
    supabase.from("process_steps").select("process_id").eq("business_id", businessId),
    supabase.from("process_runs").select("process_id, status").eq("business_id", businessId),
  ]);
  const locked = cyc?.status === "approved";

  // Plan
  const parts = planParts(stage);
  const partsDone = parts.filter((p) => progress.states[p.slug] === "complete").length;
  const nextPart = parts.find((p) => progress.states[p.slug] !== "complete");
  const keys = new Set((sessions ?? []).map((r) => r.key));
  const prog = SESSIONS.filter((s) => keys.size === 0 || keys.has(s.key));
  const sessionsDone = prog.filter((s) => (sessions ?? []).find((r) => r.key === s.key)?.completed_at).length;
  const nextSession = guided ? prog.find((s) => s.built && !(sessions ?? []).find((r) => r.key === s.key)?.completed_at) : undefined;
  let planAction: StageInfo["action"];
  let planSummary: string;
  if (locked) {
    planSummary = "Locked. Open it to read it, or unlock it to change it.";
    planAction = { label: "Read the plan", href: `${base}/year` };
  } else if (guided) {
    planSummary = `${sessionsDone} of ${prog.length} planning sessions done.`;
    planAction = nextSession
      ? { label: `Continue: ${sessionTitle(nextSession.key, biz.stage)}`, href: `${base}/s/${nextSession.key}` }
      : { label: "Lock the plan", href: `${base}/year#lock` };
  } else {
    planSummary = `${partsDone} of ${parts.length} parts of the plan complete.`;
    planAction = nextPart
      ? { label: `Continue: ${nextPart.title}`, href: `${base}/${nextPart.slug}` }
      : { label: "Have the plan reviewed, then lock it", href: `${base}/s/sign_off` };
  }
  const planRows: Row[] = parts.map((p) => ({
    title: p.title,
    detail: progress.detail[p.slug] ?? p.summary,
    href: `${base}/${p.slug}`,
    tag: TAG[progress.states[p.slug] ?? "empty"],
  }));

  // Build
  const procs = processes ?? [];
  const stepCount = (pid: string) => (steps ?? []).filter((s) => s.process_id === pid).length;
  const runCount = (pid: string) => (runs ?? []).filter((r) => r.process_id === pid).length;
  const noSteps = procs.find((p) => stepCount(p.id) === 0);
  const untried = procs.find((p) => stepCount(p.id) > 0 && runCount(p.id) === 0);
  const tried = procs.filter((p) => runCount(p.id) > 0).length;
  let buildAction: StageInfo["action"];
  if (procs.length === 0) buildAction = { label: "Write your first process", href: `${base}/processes` };
  else if (noSteps) buildAction = { label: `Add the steps to: ${noSteps.name}`, href: `${base}/processes/${noSteps.id}?edit=1` };
  else if (untried) buildAction = { label: `Try it once: ${untried.name}`, href: `${base}/processes/${untried.id}` };
  else buildAction = { label: "Write another process", href: `${base}/processes` };
  const buildDone = procs.length > 0 && !noSteps && !untried;
  const buildSummary = procs.length
    ? `${procs.length} process${procs.length === 1 ? "" : "es"} written, ${tried} tried.`
    : "No process written yet.";
  const buildRows: Row[] = [
    { title: "Processes", detail: buildSummary, href: `${base}/processes`, tag: procs.length ? (buildDone ? TAG.complete : TAG.partial) : TAG.empty },
    { title: "Roles", detail: progress.detail.team ?? "Not started", href: `${base}/team`, tag: TAG[progress.states.team ?? "empty"] },
    { title: "Team", detail: "The people, and which roles each one holds", href: `${base}/people` },
  ];

  // Run
  const acting = needs.filter((n) => n.acts);
  const running = (runs ?? []).filter((r) => r.status === "running").length;
  const anyRuns = (runs ?? []).length > 0;
  const runnable = procs.find((p) => stepCount(p.id) > 0);
  const runAction: StageInfo["action"] = acting[0]
    ? { label: `${acting[0].label}: ${acting[0].title}`, href: acting[0].href }
    : runnable
      ? { label: "Start a run", href: `${base}/processes` }
      : null;
  const runSummary = acting.length
    ? `${acting.length} thing${acting.length === 1 ? "" : "s"} need${acting.length === 1 ? "s" : ""} you. ${running} run${running === 1 ? "" : "s"} in progress.`
    : anyRuns
      ? `Nothing needs you. ${running} run${running === 1 ? "" : "s"} in progress.`
      : "Nothing is running yet. Running starts when a process has been built.";
  const runRows: Row[] = [
    {
      title: "Dashboard",
      detail: acting.length ? `${acting.length} waiting for you` : "What needs you, and how each process is going",
      href: `${base}/dashboard`,
      tag: acting.length ? { tone: "wait", text: `${acting.length} waiting` } : undefined,
    },
    { title: "Tasks", detail: "Every piece of work, open and finished", href: `${base}/tasks` },
    { title: "Scorecards", detail: progress.detail.scorecards ?? "Not started", href: `${base}/scorecards`, tag: TAG[progress.states.scorecards ?? "empty"] },
  ];

  // Review
  const reviewRows: Row[] = [
    { title: "Meetings", detail: progress.detail.rhythm ?? "Not started", href: `${base}/rhythm`, tag: TAG[progress.states.rhythm ?? "empty"] },
    { title: "Monthly review", detail: progress.detail.reviews ?? "None held yet", href: `${base}/reviews`, tag: TAG[progress.states.reviews ?? "empty"] },
  ];
  const reviewAction: StageInfo["action"] =
    progress.states.rhythm === "empty" ? { label: "Set the meetings", href: `${base}/rhythm` } : { label: "Open the monthly review", href: `${base}/reviews` };

  const stages: StageInfo[] = [
    { key: "plan", ...STAGE_TEXT.plan, state: locked ? "done" : "now", summary: planSummary, action: planAction, rows: planRows },
    { key: "build", ...STAGE_TEXT.build, state: buildDone ? "done" : procs.length || locked ? "now" : "ahead", summary: buildSummary, action: buildAction, rows: buildRows },
    { key: "run", ...STAGE_TEXT.run, state: anyRuns ? "now" : "ahead", summary: runSummary, action: runAction, rows: runRows },
    {
      key: "review",
      ...STAGE_TEXT.review,
      state: progress.states.reviews && progress.states.reviews !== "empty" ? "now" : "ahead",
      summary: progress.detail.reviews ?? "None held yet",
      action: reviewAction,
      rows: reviewRows,
    },
  ];

  // The one thing to do next: work waiting comes first, then the earliest unfinished stage.
  let next: Journey["next"];
  if (acting[0]) {
    next = {
      stage: "Stage 3 of 4: Run",
      title: acting[0].title,
      why: acting.length > 1 ? `${acting[0].line} ${acting.length - 1} more below.` : acting[0].line,
      label: acting[0].label,
      href: acting[0].href,
    };
  } else if (!locked && planAction) {
    next = { stage: "Stage 1 of 4: Plan", title: planAction.label.replace(/^Continue: /, ""), why: planSummary, label: "Continue", href: planAction.href };
  } else if (!buildDone && buildAction) {
    next = { stage: "Stage 2 of 4: Build", title: buildAction.label, why: STAGE_TEXT.build.purpose, label: "Go", href: buildAction.href };
  } else {
    next = {
      stage: "Stage 3 of 4: Run",
      title: "Nothing needs you right now",
      why: runnable ? "Start a run when the work comes round again." : runSummary,
      label: runnable ? "Start a run" : "Open the dashboard",
      href: runnable ? `${base}/processes` : `${base}/dashboard`,
    };
  }

  return { stages, next, guided, locked };
}
