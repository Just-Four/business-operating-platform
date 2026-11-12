"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { CLAUDE_STALE_MINUTES, parseAssessment } from "@/lib/process";
import { CLAUDE_LABEL, finishClaudeTask } from "@/lib/agent";
import { afterStepPath } from "@/lib/next-step";
import { MOMENTS } from "@/lib/story";
import { FUNCTION_NAMES, MOMENT_FUNCTION } from "@/lib/functions";

const ROUTE_KEYS = ["person", "grok_bot", "claude", "n8n", "cheap_model"];

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  const s = v === null ? "" : String(v).trim();
  return s.length ? s : null;
}

function fnName(formData: FormData) {
  const s = str(formData, "function");
  return s && FUNCTION_NAMES.includes(s) ? s : null;
}

function route(formData: FormData, key: string) {
  const s = str(formData, key);
  return s && ROUTE_KEYS.includes(s) ? s : null;
}

function back(formData: FormData, businessId: string, fallbackPath: string, error?: string): never {
  revalidatePath(`/b/${businessId}`, "layout");
  const returnTo = str(formData, "return_to");
  const base = returnTo && returnTo.startsWith(`/b/${businessId}`) ? returnTo : `/b/${businessId}/${fallbackPath}`;
  const [path, hash] = base.split("#");
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${error ? `error=${encodeURIComponent(error)}` : "saved=1"}${hash ? `#${hash}` : ""}`);
}

// Keeps every change: who, when, why, and what the procedure looked like afterwards.
async function snapshot(supabase: SupabaseClient, processId: string, bump: boolean, reason: string | null) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: p } = await supabase.from("processes").select("*").eq("id", processId).single();
  if (!p) return;
  const { data: steps } = await supabase.from("process_steps").select("*").eq("process_id", processId).order("seq");
  const version = bump ? p.version + 1 : p.version;
  if (bump) await supabase.from("processes").update({ version }).eq("id", processId);
  await supabase.from("process_versions").insert({
    business_id: p.business_id,
    process_id: processId,
    version,
    reason,
    changed_by: user?.id ?? null,
    changed_by_email: user?.email ?? null,
    snapshot: {
      process: { name: p.name, purpose: p.purpose, trigger_text: p.trigger_text, outcome: p.outcome, owner_role_id: p.owner_role_id, function: p.function },
      steps: (steps ?? []).map((s) => ({
        seq: s.seq,
        title: s.title,
        instructions: s.instructions,
        result: s.result,
        standard: s.standard,
        minutes: s.minutes,
        role_id: s.role_id,
        route: s.route,
        fallback_route: s.fallback_route,
        review_required: s.review_required,
        can_search: s.can_search,
        assessment: s.assessment,
      })),
    },
  });
}

async function renumber(supabase: SupabaseClient, processId: string) {
  const { data: steps } = await supabase.from("process_steps").select("id, seq").eq("process_id", processId).order("seq");
  let n = 1;
  for (const s of steps ?? []) {
    if (s.seq !== n) await supabase.from("process_steps").update({ seq: n }).eq("id", s.id);
    n += 1;
  }
}

// ---------- How the business works ----------

export async function saveStory(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const rows = MOMENTS.map((m) => ({
    business_id: businessId,
    moment: m.key,
    what_happens: str(formData, `what_${m.key}`),
    who: str(formData, `who_${m.key}`),
    needs: str(formData, `needs_${m.key}`),
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("story_points").upsert(rows, { onConflict: "business_id,moment" });
  back(formData, businessId, "story", error?.message);
}

// One moment of the customer's journey becomes a process, ready for its steps.
export async function storyToProcess(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const moment = String(formData.get("moment"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const name = str(formData, "name");
  if (!name) back(formData, businessId, "story", "Give the process a name.");
  const { data: point } = await supabase.from("story_points").select("what_happens").eq("business_id", businessId).eq("moment", moment).maybeSingle();
  const id = randomUUID();
  const { error } = await supabase
    .from("processes")
    .insert({ id, business_id: businessId, name, purpose: point?.what_happens ?? null, function: MOMENT_FUNCTION[moment] ?? null, created_by: user?.id ?? null });
  if (error) back(formData, businessId, "story", error.message);
  await snapshot(supabase, id, false, "Created from how the business works");
  await supabase.from("story_points").update({ process_id: id }).eq("business_id", businessId).eq("moment", moment);
  revalidatePath(`/b/${businessId}`, "layout");
  redirect(`/b/${businessId}/processes/${id}`);
}

// ---------- The seven parts of the business ----------

export async function saveFunctionOwners(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const fn = fnName(formData);
  if (!fn) back(formData, businessId, "", "Pick a part of the business.");
  const supabase = await createClient();
  const chosen = formData.getAll("member_id").map(String).filter(Boolean);
  const { data: existing } = await supabase.from("function_owners").select("member_id").eq("business_id", businessId).eq("function", fn);
  const had = (existing ?? []).map((r) => r.member_id as string);
  const add = chosen.filter((m) => !had.includes(m));
  const drop = had.filter((m) => !chosen.includes(m));
  let error: string | undefined;
  if (add.length) {
    const res = await supabase.from("function_owners").insert(add.map((m) => ({ business_id: businessId, function: fn, member_id: m })));
    error = res.error?.message;
  }
  if (!error && drop.length) {
    const res = await supabase.from("function_owners").delete().eq("business_id", businessId).eq("function", fn).in("member_id", drop);
    error = res.error?.message;
  }
  back(formData, businessId, "", error);
}

// ---------- Procedures ----------

export async function addProcess(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const name = str(formData, "name");
  if (!name) back(formData, businessId, "processes", "Give the process a name.");
  const id = randomUUID();
  const { error } = await supabase.from("processes").insert({
    id,
    business_id: businessId,
    name,
    purpose: str(formData, "purpose"),
    outcome: str(formData, "outcome"),
    function: fnName(formData),
    created_by: user?.id ?? null,
  });
  if (error) back(formData, businessId, "processes", error.message);
  await snapshot(supabase, id, false, "Created");
  revalidatePath(`/b/${businessId}`, "layout");
  redirect(`/b/${businessId}/processes/${id}`);
}

export async function saveProcess(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const processId = String(formData.get("process_id"));
  const supabase = await createClient();
  const name = str(formData, "name");
  if (!name) back(formData, businessId, `processes/${processId}`, "The process needs a name.");
  const { error } = await supabase
    .from("processes")
    .update({
      name,
      purpose: str(formData, "purpose"),
      trigger_text: str(formData, "trigger_text"),
      outcome: str(formData, "outcome"),
      owner_role_id: str(formData, "owner_role_id"),
      function: fnName(formData),
    })
    .eq("id", processId);
  if (!error) await snapshot(supabase, processId, true, str(formData, "reason"));
  back(formData, businessId, `processes/${processId}`, error?.message);
}

export async function saveStep(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const processId = String(formData.get("process_id"));
  const stepId = str(formData, "id");
  const supabase = await createClient();
  const title = str(formData, "title");
  if (!title) back(formData, businessId, `processes/${processId}`, "Give the step a title.");
  const r = route(formData, "route") ?? "person";
  const minutesRaw = str(formData, "minutes");
  const minutes = minutesRaw && Number.isFinite(Number(minutesRaw)) ? Math.max(0, Math.round(Number(minutesRaw))) : null;
  const assessment = parseAssessment({
    digital: formData.get("a_digital"),
    rules: formData.get("a_rules"),
    presence: formData.get("a_presence"),
    stakes: formData.get("a_stakes"),
  });
  const row = {
    title,
    instructions: str(formData, "instructions"),
    result: str(formData, "result"),
    standard: str(formData, "standard"),
    minutes,
    role_id: str(formData, "role_id"),
    route: r,
    // An agent that can't do a step hands it to a person unless told otherwise.
    fallback_route: route(formData, "fallback_route") ?? (r === "person" ? null : "person"),
    review_required: formData.get("review_required") === "1",
    can_search: formData.get("can_search") === "1",
    assessment,
  };
  let error: string | undefined;
  if (stepId) {
    const res = await supabase.from("process_steps").update(row).eq("id", stepId);
    error = res.error?.message;
  } else {
    const { data: last } = await supabase.from("process_steps").select("seq").eq("process_id", processId).order("seq", { ascending: false }).limit(1);
    const res = await supabase.from("process_steps").insert({ ...row, business_id: businessId, process_id: processId, seq: (last?.[0]?.seq ?? 0) + 1 });
    error = res.error?.message;
  }
  if (!error) await snapshot(supabase, processId, true, str(formData, "reason") ?? (stepId ? null : `Added step: ${title}`));
  back(formData, businessId, `processes/${processId}`, error);
}

export async function removeStep(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const processId = String(formData.get("process_id"));
  const supabase = await createClient();
  const { data: step } = await supabase.from("process_steps").select("title").eq("id", String(formData.get("id"))).maybeSingle();
  const { error } = await supabase.from("process_steps").delete().eq("id", String(formData.get("id")));
  if (!error) {
    await renumber(supabase, processId);
    await snapshot(supabase, processId, true, `Removed step: ${step?.title ?? ""}`);
  }
  back(formData, businessId, `processes/${processId}`, error?.message);
}

export async function moveStep(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const processId = String(formData.get("process_id"));
  const dir = String(formData.get("dir")) === "up" ? -1 : 1;
  const supabase = await createClient();
  const { data: steps } = await supabase.from("process_steps").select("id, seq, title").eq("process_id", processId).order("seq");
  const list = steps ?? [];
  const i = list.findIndex((s) => s.id === String(formData.get("id")));
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) back(formData, businessId, `processes/${processId}`);
  // Swap through a spare number so the two steps never share one.
  await supabase.from("process_steps").update({ seq: -1 }).eq("id", list[i].id);
  await supabase.from("process_steps").update({ seq: list[i].seq }).eq("id", list[j].id);
  const { error } = await supabase.from("process_steps").update({ seq: list[j].seq }).eq("id", list[i].id);
  if (!error) await snapshot(supabase, processId, true, `Moved step: ${list[i].title}`);
  back(formData, businessId, `processes/${processId}`, error?.message);
}

// One step per line: title | result | standard
export async function pasteSteps(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const processId = String(formData.get("process_id"));
  const supabase = await createClient();
  const rows = (str(formData, "pasted") ?? "")
    .split(/\r?\n/)
    .map((line) => line.split(line.includes("\t") ? "\t" : "|").map((c) => c.trim()))
    .filter((cells) => cells[0] && !/^(#|step|title)$/i.test(cells[0]))
    .map((cells) => (cells.length > 3 && /^#?\d+\.?$/.test(cells[0]) ? cells.slice(1) : cells));
  if (!rows.length) back(formData, businessId, `processes/${processId}`, "Nothing to add. Put one step on each line: title | result | standard.");
  const { data: last } = await supabase.from("process_steps").select("seq").eq("process_id", processId).order("seq", { ascending: false }).limit(1);
  let seq = last?.[0]?.seq ?? 0;
  const { error } = await supabase.from("process_steps").insert(
    rows.map((c) => ({
      business_id: businessId,
      process_id: processId,
      seq: ++seq,
      title: c[0],
      result: c[1] || null,
      standard: c[2] || null,
    }))
  );
  if (!error) await snapshot(supabase, processId, true, `Pasted ${rows.length} step${rows.length === 1 ? "" : "s"}`);
  back(formData, businessId, `processes/${processId}`, error?.message);
}

// ---------- Runs ----------

export async function startRun(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const processId = String(formData.get("process_id"));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_process_run", {
    p_process: processId,
    p_subject: str(formData, "subject") ?? "",
    p_brief: str(formData, "brief") ?? "",
  });
  if (error) back(formData, businessId, `processes/${processId}`, error.message);
  revalidatePath(`/b/${businessId}`, "layout");
  // Land on the first step's task, with its one action showing.
  const { data: first } = await supabase.from("tasks").select("id").eq("process_run_id", data).order("created_at").limit(1);
  redirect(first?.[0] ? `/b/${businessId}/tasks?task=${first[0].id}&started=1` : `/b/${businessId}/tasks?run=${data}`);
}

export async function stopRun(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const processId = String(formData.get("process_id"));
  const runId = String(formData.get("run_id"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("process_runs").update({ status: "stopped", finished_at: new Date().toISOString() }).eq("id", runId).eq("status", "running");
  if (!error) {
    const { data: open } = await supabase
      .from("tasks")
      .select("id")
      .eq("process_run_id", runId)
      .in("status", ["queued", "in_progress", "blocked", "awaiting_approval", "awaiting_review", "failed", "escalated"]);
    for (const t of open ?? []) {
      await supabase.from("tasks").update({ status: "cancelled" }).eq("id", t.id);
      await supabase.from("task_events").insert({ business_id: businessId, task_id: t.id, event: "marked cancelled", actor: user?.email ?? "user", detail: "Run stopped" });
    }
  }
  back(formData, businessId, `processes/${processId}`, error?.message);
}

// ---------- Claude does a step; a person checks it ----------

export async function runWithClaude(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const taskId = String(formData.get("task_id"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const fail: (m: string) => never = (m) => back(formData, businessId, "tasks", m);
  if (!process.env.ANTHROPIC_API_KEY) fail("Claude isn't switched on yet: the API key is missing.");
  const { data: t } = await supabase
    .from("tasks")
    .select("id, route, status, needs_approval, approved_at, updated_at, attempts")
    .eq("id", taskId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!t) fail("That task wasn't found.");
  if (t.route !== "claude") fail("This task isn't routed to Claude.");
  const fresh = Date.now() - new Date(t.updated_at).getTime() < CLAUDE_STALE_MINUTES * 60_000;
  if (t.status === "in_progress" && fresh) fail("Claude is already working on this.");
  if (!["queued", "in_progress", "failed", "escalated", "blocked"].includes(t.status)) fail("This task can't be started from here.");
  if (t.needs_approval && !t.approved_at) fail("This task is waiting for approval before anyone starts it.");
  const { error } = await supabase
    .from("tasks")
    .update({ status: "in_progress", claimed_by: CLAUDE_LABEL, attempts: t.attempts + 1, updated_at: new Date().toISOString() })
    .eq("id", taskId);
  if (error) fail(error.message);
  await supabase.from("task_events").insert({ business_id: businessId, task_id: taskId, event: "claimed", actor: CLAUDE_LABEL, detail: `Started by ${user?.email ?? "a team member"}` });
  // Claude works after this page has answered; the task page refreshes itself until the result arrives.
  after(() => finishClaudeTask(supabase, businessId, taskId));
  back(formData, businessId, "tasks");
}

export async function approveResult(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const taskId = String(formData.get("task_id"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: t } = await supabase.from("tasks").select("status").eq("id", taskId).eq("business_id", businessId).maybeSingle();
  if (t?.status !== "awaiting_review") back(formData, businessId, "tasks", "There's no result waiting to be checked on that task.");
  const { error } = await supabase
    .from("tasks")
    .update({ status: "done", reviewed_at: new Date().toISOString(), reviewed_by: user?.id ?? null })
    .eq("id", taskId);
  if (!error) {
    await supabase.from("task_events").insert({ business_id: businessId, task_id: taskId, event: "result approved", actor: user?.email ?? "user", detail: str(formData, "note") });
    const nextPath = await afterStepPath(supabase, businessId, taskId);
    if (nextPath) {
      revalidatePath(`/b/${businessId}`, "layout");
      redirect(nextPath);
    }
  }
  back(formData, businessId, "tasks", error?.message);
}

export async function sendBack(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const taskId = String(formData.get("task_id"));
  const note = str(formData, "note");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!note) back(formData, businessId, "tasks", "Say what needs fixing, so the next attempt can fix it.");
  const { data: t } = await supabase.from("tasks").select("status, rejections").eq("id", taskId).eq("business_id", businessId).maybeSingle();
  if (t?.status !== "awaiting_review") back(formData, businessId, "tasks", "There's no result waiting to be checked on that task.");
  const { error } = await supabase
    .from("tasks")
    .update({ status: "queued", rejections: (t?.rejections ?? 0) + 1, review_note: note, reviewed_at: null, reviewed_by: null })
    .eq("id", taskId);
  if (!error) await supabase.from("task_events").insert({ business_id: businessId, task_id: taskId, event: "result sent back", actor: user?.email ?? "user", detail: note });
  back(formData, businessId, "tasks", error?.message);
}
