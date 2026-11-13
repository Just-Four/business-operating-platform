import type { SupabaseClient } from "@supabase/supabase-js";
import { PARTS, ROUTES, type Stage } from "@/lib/framework";
import { CLAUDE_STALE_MINUTES } from "@/lib/process";
import { DESIGN_SESSIONS, PLAN_SESSIONS, SESSIONS, sessionTitle } from "@/lib/programme";
import { MOMENTS, storyCount, type StoryRow } from "@/lib/story";
import type { BusinessProgress } from "@/lib/progress";

// ---------- What needs someone now ----------

export type NeedKind = "check" | "approve" | "challenge" | "stuck" | "claude" | "person" | "working" | "agent";

export type Need = {
  taskId: string;
  kind: NeedKind;
  title: string;
  line: string; // what is going on, in one line
  label: string; // what the button says
  href: string;
  acts: boolean; // false when nothing can be done yet (someone else is working on it)
  who: string | null;
  test?: boolean; // a test set from the review
  seq?: number;
};

const ORDER: NeedKind[] = ["check", "approve", "challenge", "stuck", "claude", "person", "working", "agent"];
const OPEN = ["queued", "in_progress", "blocked", "awaiting_approval", "awaiting_review", "failed", "escalated"];

export async function getNeeds(supabase: SupabaseClient, businessId: string): Promise<Need[]> {
  const [{ data: tasks }, { data: roles }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, status, route, role_id, needs_approval, approved_at, updated_at, rejections, process_run_id, created_at, source_review_id, source_challenge, due_date, kind")
      .eq("business_id", businessId)
      .in("status", OPEN)
      .order("created_at")
      .limit(500),
    supabase.from("roles").select("id, name").eq("business_id", businessId),
  ]);
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const needs: Need[] = (tasks ?? []).map((t) => {
    const test = t.kind === "test";
    const challenge = t.kind === "challenge";
    const routeLabel = ROUTES[t.route]?.label ?? t.route;
    const inProcess = !!t.process_run_id;
    let kind: NeedKind;
    let line: string;
    let label: string;
    let acts = true;
    if (challenge) {
      kind = "challenge";
      line = "The review raised this. Say what you'll do about it. It takes one press.";
      label = "Answer this";
    } else if (t.status === "awaiting_review") {
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
      line = test
        ? `A test you set from your review${t.due_date ? `, due ${t.due_date}` : ""}. Do it, then say what happened.`
        : inProcess
          ? "A person does this step, then records the result."
          : "A person does this.";
      label = test ? "Record the result" : inProcess ? "Do this step" : "Do this task";
      // A test takes days. It only becomes the next thing to do once it is due.
      if (test && t.due_date && t.due_date > today) acts = false;
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
      test,
      seq: (t.source_challenge as number | null) ?? 0,
    };
  });
  return needs.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || (a.seq ?? 0) - (b.seq ?? 0));
}

// ---------- The five stages ----------

export type StageKey = "design" | "build" | "plan" | "run" | "review";
export type Row = { title: string; detail: string; href: string; tag?: { tone: string; text: string } };
export type StageInfo = {
  key: StageKey;
  num: number;
  title: string;
  purpose: string;
  ends: string;
  state: "done" | "now" | "ahead";
  tagText?: string;
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
  design: {
    num: 1,
    title: "Design",
    purpose: "What is the business? Who pays, why they'd choose you, what stands in the way and where it's going.",
    ends: "Ends with the business on one page, showing what's proven and what's still assumed.",
  },
  build: {
    num: 2,
    title: "Build",
    purpose: "How will it work, and who will do it? Follow one customer through the business, say who is in the team, then write the work that repeats as steps.",
    ends: "You have enough to plan once the customer's journey is described and someone is in the team. Processes keep being added as the work happens.",
  },
  plan: {
    num: 3,
    title: "Plan",
    purpose: "What will this year deliver, and what will it cost? The battles you must win, where sales will come from, the numbers and this quarter's priorities.",
    ends: "Ends with a plan that has been reviewed and locked.",
  },
  run: {
    num: 4,
    title: "Run",
    purpose: "People and AI do the steps. You approve, check results and deal with what's stuck.",
    ends: "This doesn't end: it's the business working day to day.",
  },
  review: {
    num: 5,
    title: "Review",
    purpose: "Is it working? Look at the numbers and the plan on a fixed rhythm, and change what isn't working.",
    ends: "Each review ends with decisions that go back into the design, the plan and the processes.",
  },
};

const DESIGN_PARTS = [1, 2, 3];
const YEAR_PARTS = [4, 5, 6];

const TAG: Record<string, { tone: string; text: string }> = {
  complete: { tone: "go", text: "Complete" },
  partial: { tone: "wait", text: "Started" },
  empty: { tone: "quiet", text: "Not started" },
};

export function designParts(stage: Stage) {
  return PARTS.filter((p) => DESIGN_PARTS.includes(p.num) && p.built && p.stages[stage] !== "off");
}
export function yearParts(stage: Stage) {
  return PARTS.filter((p) => YEAR_PARTS.includes(p.num) && p.built && p.stages[stage] !== "off");
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
  const [{ data: sessions }, { data: cyc }, { data: processes }, { data: steps }, { data: runs }, { data: story }, { data: people }] = await Promise.all([
    guided
      ? supabase.from("programme_sessions").select("key, completed_at").eq("business_id", businessId)
      : Promise.resolve({ data: [] as { key: string; completed_at: string | null }[] }),
    supabase.from("plan_cycles").select("status").eq("business_id", businessId).order("start_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("processes").select("id, name").eq("business_id", businessId).order("created_at"),
    supabase.from("process_steps").select("process_id").eq("business_id", businessId),
    supabase.from("process_runs").select("process_id, status").eq("business_id", businessId),
    supabase.from("story_points").select("moment, what_happens, who, needs, process_id").eq("business_id", businessId),
    supabase.from("team_members").select("id").eq("business_id", businessId).eq("active", true),
  ]);
  const locked = cyc?.status === "approved";
  const keys = new Set((sessions ?? []).map((r) => r.key));
  const inProg = (list: string[]) => SESSIONS.filter((s) => list.includes(s.key) && (keys.size === 0 || keys.has(s.key)));
  const isDone = (key: string) => !!(sessions ?? []).find((r) => r.key === key)?.completed_at;
  const partRows = (parts: ReturnType<typeof designParts>): Row[] =>
    parts.map((p) => ({ title: p.title, detail: progress.detail[p.slug] ?? p.summary, href: `${base}/${p.slug}`, tag: TAG[progress.states[p.slug] ?? "empty"] }));

  // Design
  const dParts = designParts(stage);
  const dPartsDone = dParts.filter((p) => progress.states[p.slug] === "complete").length;
  const dNextPart = dParts.find((p) => progress.states[p.slug] !== "complete");
  const dSessions = inProg(DESIGN_SESSIONS);
  const dSessionsDone = dSessions.filter((s) => isDone(s.key)).length;
  const dNextSession = guided ? dSessions.find((s) => s.built && !isDone(s.key)) : undefined;
  const designDone = guided ? !dNextSession : !dNextPart;
  const designSummary = guided ? `${dSessionsDone} of ${dSessions.length} sessions done.` : `${dPartsDone} of ${dParts.length} parts complete.`;
  const designAction: StageInfo["action"] = guided
    ? dNextSession
      ? { label: `Continue: ${sessionTitle(dNextSession.key, biz.stage)}`, href: `${base}/s/${dNextSession.key}` }
      : { label: "Read it", href: `${base}/canvas` }
    : dNextPart
      ? { label: `Continue: ${dNextPart.title}`, href: `${base}/${dNextPart.slug}` }
      : { label: "Read it", href: `${base}/canvas` };

  // Build: an outline first (the customer's journey and who is in the team), then the processes.
  const storyN = storyCount(story as StoryRow[] | null);
  const nPeople = (people ?? []).length;
  const outlineDone = storyN === MOMENTS.length && nPeople > 0;
  const procs = processes ?? [];
  const stepCount = (pid: string) => (steps ?? []).filter((s) => s.process_id === pid).length;
  const runCount = (pid: string) => (runs ?? []).filter((r) => r.process_id === pid).length;
  const noSteps = procs.find((p) => stepCount(p.id) === 0);
  const untried = procs.find((p) => stepCount(p.id) > 0 && runCount(p.id) === 0);
  const tried = procs.filter((p) => runCount(p.id) > 0).length;
  const detailDone = procs.length > 0 && !noSteps && !untried;
  let buildAction: StageInfo["action"];
  if (storyN < MOMENTS.length) buildAction = { label: storyN ? "Finish how the business works" : "Say how the business works", href: `${base}/story` };
  else if (nPeople === 0) buildAction = { label: "Add yourself to the team", href: `${base}/people` };
  else if (procs.length === 0) buildAction = { label: "Write your first process", href: `${base}/processes` };
  else if (noSteps) buildAction = { label: `Add the steps to: ${noSteps.name}`, href: `${base}/processes/${noSteps.id}?edit=1` };
  else if (untried) buildAction = { label: `Try it once: ${untried.name}`, href: `${base}/processes/${untried.id}` };
  else buildAction = { label: "Write another process", href: `${base}/processes` };
  const procSummary = procs.length ? `${procs.length} process${procs.length === 1 ? "" : "es"} written, ${tried} tried.` : "No process written yet.";
  const buildSummary = `${storyN} of ${MOMENTS.length} moments of the customer's journey described. ${nPeople} ${nPeople === 1 ? "person" : "people"} in the team. ${procSummary}`;
  const buildStarted = storyN > 0 || nPeople > 0 || procs.length > 0;
  const buildState: StageInfo["state"] = outlineDone && (!locked || detailDone) ? "done" : buildStarted || designDone ? "now" : "ahead";
  const buildTag = buildState === "done" ? (detailDone ? "In use" : "Enough to plan") : undefined;
  const buildRows: Row[] = [
    {
      title: "How the business works",
      detail: storyN ? `${storyN} of ${MOMENTS.length} moments described` : "One customer, followed from first contact to coming back",
      href: `${base}/story`,
      tag: storyN === MOMENTS.length ? TAG.complete : storyN ? TAG.partial : TAG.empty,
    },
    { title: "Team", detail: nPeople ? `${nPeople} ${nPeople === 1 ? "person" : "people"}` : "The people. Add yourself first", href: `${base}/people`, tag: nPeople ? TAG.complete : TAG.empty },
    { title: "Processes", detail: procSummary, href: `${base}/processes`, tag: procs.length ? (detailDone ? TAG.complete : TAG.partial) : TAG.empty },
    { title: "Roles", detail: progress.detail.team ?? "Not started", href: `${base}/team`, tag: TAG[progress.states.team ?? "empty"] },
  ];

  // Plan
  const yParts = yearParts(stage);
  const yPartsDone = yParts.filter((p) => progress.states[p.slug] === "complete").length;
  const yNextPart = yParts.find((p) => progress.states[p.slug] !== "complete");
  const pSessions = inProg(PLAN_SESSIONS);
  const pSessionsDone = pSessions.filter((s) => isDone(s.key)).length;
  const pNextSession = guided ? pSessions.find((s) => s.built && !isDone(s.key)) : undefined;
  let planAction: StageInfo["action"];
  let planSummary: string;
  if (locked) {
    planSummary = "Locked. Open it to read it, or unlock it to change it.";
    planAction = { label: "Read the plan", href: `${base}/year` };
  } else if (guided) {
    planSummary = pSessions.length ? `${pSessionsDone} of ${pSessions.length} sessions done.` : "Not part of this programme. Open any part when you need it.";
    planAction = pNextSession
      ? { label: `Continue: ${sessionTitle(pNextSession.key, biz.stage)}`, href: `${base}/s/${pNextSession.key}` }
      : { label: "Lock the plan", href: `${base}/year#lock` };
  } else {
    planSummary = `${yPartsDone} of ${yParts.length} parts complete.`;
    planAction = yNextPart
      ? { label: `Continue: ${yNextPart.title}`, href: `${base}/${yNextPart.slug}` }
      : { label: "Have the plan reviewed, then lock it", href: `${base}/s/sign_off` };
  }
  const planStarted = guided ? pSessionsDone > 0 : yParts.some((p) => (progress.states[p.slug] ?? "empty") !== "empty");
  const planState: StageInfo["state"] = locked ? "done" : planStarted || (designDone && outlineDone) ? "now" : "ahead";

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
      : "Nothing is running yet. Running starts when a process has been written.";
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
    { key: "design", ...STAGE_TEXT.design, state: designDone ? "done" : "now", summary: designSummary, action: designAction, rows: partRows(dParts) },
    { key: "build", ...STAGE_TEXT.build, state: buildState, tagText: buildTag, summary: buildSummary, action: buildAction, rows: buildRows },
    { key: "plan", ...STAGE_TEXT.plan, state: planState, summary: planSummary, action: planAction, rows: partRows(yParts) },
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
  // Build is visited twice: an outline before the plan, the processes after it.
  let next: Journey["next"];
  if (acting[0]) {
    next = {
      stage: acting[0].kind === "challenge" ? "From your review" : acting[0].test ? "A test from your review" : "Stage 4 of 5: Run",
      title: acting[0].title,
      why: acting.length > 1 ? `${acting[0].line} ${acting.length - 1} more below.` : acting[0].line,
      label: acting[0].label,
      href: acting[0].href,
    };
  } else if (!designDone && !locked && designAction) {
    next = { stage: "Stage 1 of 5: Design", title: designAction.label.replace(/^Continue: /, ""), why: designSummary, label: "Continue", href: designAction.href };
  } else if (!outlineDone && buildAction) {
    next = {
      stage: "Stage 2 of 5: Build",
      title: buildAction.label,
      why:
        storyN < MOMENTS.length
          ? "Follow one customer from first hearing about you to coming back. It shows what the business has to do, before you put numbers on it."
          : "Add yourself first. At the start, you are the whole team.",
      label: "Go",
      href: buildAction.href,
    };
  } else if (!locked && planAction) {
    next = { stage: "Stage 3 of 5: Plan", title: planAction.label.replace(/^Continue: /, ""), why: planSummary, label: "Continue", href: planAction.href };
  } else if (!detailDone && buildAction) {
    next = {
      stage: "Stage 2 of 5: Build",
      title: buildAction.label,
      why: "The plan is locked. Now write the work that repeats as steps, with who or what does each one.",
      label: "Go",
      href: buildAction.href,
    };
  } else {
    next = {
      stage: "Stage 4 of 5: Run",
      title: "Nothing needs you right now",
      why: runnable ? "Start a run when the work comes round again." : runSummary,
      label: runnable ? "Start a run" : "Open the dashboard",
      href: runnable ? `${base}/processes` : `${base}/dashboard`,
    };
  }

  return { stages, next, guided, locked };
}
