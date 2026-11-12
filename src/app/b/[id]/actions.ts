"use server";

import { randomUUID, randomBytes, createHash } from "crypto";
import { runCheckpointReview, RESPONSES } from "@/lib/ai";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CANVAS_BOXES } from "@/lib/framework";
import { guidanceFor } from "@/lib/guidance";
import { afterStepPath } from "@/lib/next-step";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SESSIONS, defaultDeadline, iso, keysForRoute, scheduleForRoute, type Route } from "@/lib/programme";

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  const s = v === null ? "" : String(v).trim();
  return s.length ? s : null;
}

function num(formData: FormData, key: string) {
  const s = str(formData, key);
  if (s === null) return null;
  const n = Number(s.replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
}

async function completeSessionInternal(supabase: SupabaseClient, businessId: string, key: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const today = iso(new Date());
  const { data: rows } = await supabase
    .from("programme_sessions")
    .select("key, seq, scheduled_on, completed_at")
    .eq("business_id", businessId);
  const row = (rows ?? []).find((r) => r.key === key);
  const seq = SESSIONS.find((x) => x.key === key)?.seq ?? 0;
  await supabase.from("programme_sessions").upsert(
    {
      business_id: businessId,
      key,
      seq,
      completed_at: row?.completed_at ?? new Date().toISOString(),
      completed_by: user?.id ?? null,
    },
    { onConflict: "business_id,key" }
  );
  // Ahead of schedule: pull the remaining sessions forward by the days gained,
  // but only when every earlier session is done (finishing out of order doesn't count).
  const earlierOpen = (rows ?? []).some((r) => r.seq < seq && !r.completed_at);
  if (!earlierOpen && row?.scheduled_on && row.scheduled_on > today) {
    const gained = Math.round((new Date(row.scheduled_on).getTime() - new Date(today).getTime()) / 86_400_000);
    for (const r of rows ?? []) {
      if (r.completed_at || r.key === key || !r.scheduled_on || r.seq <= seq) continue;
      const d = new Date(r.scheduled_on);
      d.setDate(d.getDate() - gained);
      while ((d.getDay() === 0 || d.getDay() === 6) && iso(d) > today) d.setDate(d.getDate() - 1);
      const moved = iso(d) < today ? today : iso(d);
      await supabase.from("programme_sessions").update({ scheduled_on: moved }).eq("business_id", businessId).eq("key", r.key);
    }
  }
  // A business that went straight to the board has no programme: go back to the plan.
  const { data: bizRoute } = await supabase.from("businesses").select("planning_route").eq("id", businessId).single();
  if (bizRoute?.planning_route === "board") return `/b/${businessId}/year?saved=1#lock`;
  // Next session within this business's own programme (short programmes skip steps).
  const inProgramme = new Set((rows ?? []).map((r) => r.key));
  const next = SESSIONS.filter((x) => x.seq > seq && (inProgramme.size === 0 || inProgramme.has(x.key))).sort((a, b) => a.seq - b.seq)[0];
  return next ? `/b/${businessId}/s/${next.key}` : `/b/${businessId}/programme`;
}

async function done(formData: FormData, supabase: SupabaseClient, businessId: string, page: string, error?: string) {
  revalidatePath(`/b/${businessId}`, "layout");
  const sessionKey = str(formData, "session_key");
  if (!error && sessionKey && formData.get("finish") === "1") {
    redirect(await completeSessionInternal(supabase, businessId, sessionKey));
  }
  const returnTo = str(formData, "return_to");
  const base = returnTo && returnTo.startsWith(`/b/${businessId}`) ? returnTo : `/b/${businessId}${page ? `/${page}` : ""}`;
  const sep = base.includes("?") ? "&" : "?";
  redirect(error ? `${base}${sep}error=${encodeURIComponent(error)}` : `${base}${sep}saved=1`);
}

export async function updateStage(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const update: Record<string, string> = { stage: String(formData.get("stage")) };
  const model = formData.get("model");
  if (model) update.model = String(model);
  const sector = formData.get("sector");
  if (sector !== null) update.sector = String(sector).trim();
  const { error } = await supabase.from("businesses").update(update).eq("id", businessId);
  await done(formData, supabase, businessId, "", error?.message);
}

export async function saveCanvas(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const rows = CANVAS_BOXES.filter((box) => formData.has(`${box.key}_answer`)).map((box) => ({
    business_id: businessId,
    box: box.key,
    answer: str(formData, `${box.key}_answer`),
    checked_on: today,
  }));
  const { error } = await supabase.from("canvas_boxes").upsert(rows, { onConflict: "business_id,box" });
  await done(formData, supabase, businessId, "canvas", error?.message);
}

export async function saveDiagnosis(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const id = str(formData, "id");
  const supabase = await createClient();
  const actions = (str(formData, "coordinated_actions") ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const row = {
    business_id: businessId,
    diagnosis: str(formData, "diagnosis"),
    guiding_policy: str(formData, "guiding_policy"),
    coordinated_actions: actions,
    reviewed_on: new Date().toISOString().slice(0, 10),
    is_current: true,
  };
  const { error } = id
    ? await supabase.from("diagnoses").update(row).eq("id", id)
    : await supabase.from("diagnoses").insert(row);
  await done(formData, supabase, businessId, "diagnosis", error?.message);
}

export async function saveDirection(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const capabilities = formData
    .getAll("capabilities")
    .map((s) => String(s).replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const { error } = await supabase.from("direction").upsert(
    {
      business_id: businessId,
      purpose: str(formData, "purpose"),
      long_term_target: str(formData, "long_term_target"),
      long_term_year: num(formData, "long_term_year"),
      mid_term_year: num(formData, "mid_term_year"),
      mid_term_revenue: num(formData, "mid_term_revenue"),
      mid_term_profit_pct: num(formData, "mid_term_profit_pct"),
      mid_term_size: str(formData, "mid_term_size"),
      capabilities,
    },
    { onConflict: "business_id" }
  );
  await done(formData, supabase, businessId, "direction", error?.message);
}

export async function addAssumption(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const { count } = await supabase
    .from("assumptions")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);
  const { error } = await supabase.from("assumptions").insert({
    business_id: businessId,
    rank: (count ?? 0) + 1,
    assumption: str(formData, "assumption") ?? "",
    why_it_matters: str(formData, "why_it_matters"),
    test: str(formData, "test"),
    checkpoint_date: str(formData, "checkpoint_date"),
  });
  await done(formData, supabase, businessId, "launch", error?.message);
}

export async function updateAssumption(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("assumptions")
    .update({ status: str(formData, "status"), result: str(formData, "result") })
    .eq("id", String(formData.get("id")));
  await done(formData, supabase, businessId, "launch", error?.message);
}

export async function addMilestone(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const { count } = await supabase
    .from("milestones")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);
  const { error } = await supabase.from("milestones").insert({
    business_id: businessId,
    sequence: (count ?? 0) + 1,
    name: str(formData, "name") ?? "",
    description: str(formData, "description"),
    spend_limit: num(formData, "spend_limit"),
    due_date: str(formData, "due_date"),
  });
  await done(formData, supabase, businessId, "launch", error?.message);
}

export async function loadStandardMilestones(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const { data: biz } = await supabase.from("businesses").select("model").eq("id", businessId).single();
  const { error } = await supabase.from("milestones").insert(
    guidanceFor(biz?.model).milestones.map((m, i) => ({
      business_id: businessId,
      sequence: i + 1,
      name: m.name,
      description: m.description,
    }))
  );
  await done(formData, supabase, businessId, "launch", error?.message);
}

export async function updateMilestone(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const status = str(formData, "status");
  const { error } = await supabase
    .from("milestones")
    .update({
      status,
      due_date: str(formData, "due_date"),
      spend_limit: num(formData, "spend_limit"),
      met_on: status === "met" ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", String(formData.get("id")));
  await done(formData, supabase, businessId, "launch", error?.message);
}

export async function addEvidence(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("evidence").insert({
    business_id: businessId,
    subject_type: String(formData.get("subject_type") ?? "canvas"),
    subject_key: String(formData.get("subject_key")),
    kind: String(formData.get("kind")),
    summary: str(formData, "summary") ?? "",
    source: str(formData, "source"),
    evidence_date: str(formData, "evidence_date") ?? new Date().toISOString().slice(0, 10),
    link: str(formData, "link"),
    created_by: user?.id ?? null,
  });
  revalidatePath(`/b/${businessId}`, "layout");
  return { error: error?.message ?? null };
}

export async function deleteEvidence(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("evidence").delete().eq("id", String(formData.get("id")));
  revalidatePath(`/b/${businessId}`, "layout");
  return { error: error?.message ?? null };
}

function routeFor(experience: string, need: string): Route {
  if (need === "quarter" || need === "refresh") return "partial";
  if (experience === "regular") return "board";
  if (experience === "some") return "focused";
  return "guided";
}

export async function startProgramme(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const experience = String(formData.get("experience") ?? "never");
  const need = String(formData.get("need") ?? "full_year");
  const sale = String(formData.get("sale") ?? "none");
  const model = String(formData.get("pay") ?? "other");
  const route = (str(formData, "route") as Route | null) ?? routeFor(experience, need);
  const stage = sale === "steady" ? "established" : sale === "few" ? "early_revenue" : "launch";
  const start = new Date();
  const deadlineStr = str(formData, "deadline");
  const deadline = deadlineStr ? new Date(deadlineStr) : defaultDeadline(route, start);

  const { error } = await supabase
    .from("businesses")
    .update({
      experience,
      current_need: need,
      stage,
      model,
      planning_route: route,
      plan_deadline: iso(deadline),
      sign_off_date: iso(deadline),
    })
    .eq("id", businessId);
  if (error) redirect(`/b/${businessId}/start?error=${encodeURIComponent(error.message)}`);

  if (route !== "board") {
    await writeProgramme(supabase, businessId, route, need, start, deadline);
    revalidatePath(`/b/${businessId}`, "layout");
    redirect(`/b/${businessId}/programme`);
  }
  revalidatePath(`/b/${businessId}`, "layout");
  redirect(`/b/${businessId}`);
}

async function writeProgramme(
  supabase: SupabaseClient,
  businessId: string,
  route: Route,
  need: string | null,
  start: Date,
  deadline: Date
) {
  const keys = keysForRoute(route, need);
  const { data: existing } = await supabase.from("programme_sessions").select("key, completed_at").eq("business_id", businessId);
  const done = new Set((existing ?? []).filter((r) => r.completed_at).map((r) => r.key));
  // Remove sessions that aren't part of this route. The work done in them is kept in its own tables.
  const drop = (existing ?? []).filter((r) => !keys.includes(r.key)).map((r) => r.key);
  if (drop.length) await supabase.from("programme_sessions").delete().eq("business_id", businessId).in("key", drop);
  const open = keys.filter((k) => !done.has(k));
  const dates = scheduleForRoute(route, open, start, deadline);
  await supabase.from("programme_sessions").upsert(
    keys.map((k) => ({
      business_id: businessId,
      key: k,
      seq: SESSIONS.find((x) => x.key === k)?.seq ?? 0,
      ...(done.has(k) ? {} : { scheduled_on: dates[k] }),
    })),
    { onConflict: "business_id,key" }
  );
}

export async function saveSchedule(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  for (const s of SESSIONS) {
    const d = str(formData, `date_${s.key}`);
    if (d) await supabase.from("programme_sessions").update({ scheduled_on: d }).eq("business_id", businessId).eq("key", s.key);
  }
  // Focused sittings: one date per sitting, applied to every session in it.
  for (let g = 0; g < 10; g++) {
    const d = str(formData, `group_${g}`);
    const keys = formData.getAll(`group_${g}_key`).map(String);
    if (d && keys.length) {
      await supabase
        .from("programme_sessions")
        .update({ scheduled_on: d })
        .eq("business_id", businessId)
        .in("key", keys)
        .is("completed_at", null);
    }
  }
  const signOff = str(formData, "sign_off_date");
  if (signOff) await supabase.from("businesses").update({ sign_off_date: signOff }).eq("id", businessId);
  if (formData.get("commit") === "1") {
    redirect(await completeSessionInternal(supabase, businessId, "commit"));
  }
  revalidatePath(`/b/${businessId}`, "layout");
  redirect(`/b/${businessId}/programme?saved=1`);
}

export async function finishSession(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  revalidatePath(`/b/${businessId}`, "layout");
  redirect(await completeSessionInternal(supabase, businessId, String(formData.get("session_key"))));
}

export async function recordReview(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const key = String(formData.get("session_key"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("programme_sessions")
    .update({
      approved_at: new Date().toISOString(),
      approved_by: user?.id ?? null,
      review_type: "person",
      reviewer_name: str(formData, "reviewer_name"),
      reviewer_role: str(formData, "reviewer_role"),
      review_notes: str(formData, "review_notes"),
    })
    .eq("business_id", businessId)
    .eq("key", key);
  if (error) redirect(`/b/${businessId}/s/${key}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/b/${businessId}`, "layout");
  redirect(await completeSessionInternal(supabase, businessId, key));
}

export async function setRoute(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const route = String(formData.get("route")) as Route;
  const supabase = await createClient();
  const { data: biz } = await supabase.from("businesses").select("current_need").eq("id", businessId).single();
  await supabase.from("businesses").update({ planning_route: route }).eq("id", businessId);
  if (route !== "board") {
    const start = new Date();
    const deadline = defaultDeadline(route, start);
    await supabase.from("businesses").update({ plan_deadline: iso(deadline), sign_off_date: iso(deadline) }).eq("id", businessId);
    await writeProgramme(supabase, businessId, route, biz?.current_need ?? null, start, deadline);
    revalidatePath(`/b/${businessId}`, "layout");
    redirect(`/b/${businessId}/programme`);
  }
  revalidatePath(`/b/${businessId}`, "layout");
  redirect(`/b/${businessId}`);
}

export async function saveLookback(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const measures = formData.getAll("measure").map(String);
  const items = measures.map((m, i) => ({
    measure: m,
    budget: str(formData, `budget_${i}`),
    actual: str(formData, `actual_${i}`),
    timing: str(formData, `timing_${i}`),
    cause: str(formData, `cause_${i}`),
  }));
  const { error } = await supabase.from("lookbacks").upsert(
    {
      business_id: businessId,
      period_label: str(formData, "period_label") ?? "Last year",
      items,
      furthest_wrong: str(formData, "furthest_wrong"),
      lost_why: str(formData, "lost_why"),
      least_profitable: str(formData, "least_profitable"),
      no_payback: str(formData, "no_payback"),
      biggest_lesson: str(formData, "biggest_lesson"),
    },
    { onConflict: "business_id,period_label" }
  );
  await done(formData, supabase, businessId, "", error?.message);
}

// ---------- Run side: roles, scorecards, tasks, agent keys ----------

// Keeps the short "who fills it" line on each role in step with the people assigned to it.
async function syncFilledBy(supabase: SupabaseClient, businessId: string) {
  const [{ data: roles }, { data: links }, { data: people }] = await Promise.all([
    supabase.from("roles").select("id, filled_by").eq("business_id", businessId),
    supabase.from("role_assignments").select("role_id, member_id").eq("business_id", businessId),
    supabase.from("team_members").select("id, name, active").eq("business_id", businessId).order("created_at"),
  ]);
  for (const r of roles ?? []) {
    const names = (people ?? [])
      .filter((p) => p.active && (links ?? []).some((l) => l.role_id === r.id && l.member_id === p.id))
      .map((p) => p.name);
    const text = names.length ? names.join(", ") : null;
    if (text !== r.filled_by) await supabase.from("roles").update({ filled_by: text }).eq("id", r.id);
  }
}

async function setLinks(supabase: SupabaseClient, businessId: string, column: "role_id" | "member_id", id: string, others: string[]) {
  const other = column === "role_id" ? "member_id" : "role_id";
  const { data: existing } = await supabase.from("role_assignments").select("role_id, member_id").eq(column, id);
  const have = (existing ?? []).map((x) => (x as Record<string, string>)[other]);
  const drop = have.filter((x) => !others.includes(x));
  const add = others.filter((x) => !have.includes(x));
  if (drop.length) await supabase.from("role_assignments").delete().eq(column, id).in(other, drop);
  if (add.length) await supabase.from("role_assignments").insert(add.map((x) => ({ business_id: businessId, [column]: id, [other]: x })));
}

export async function saveRole(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const existingId = str(formData, "id");
  const id = existingId ?? randomUUID();
  const supabase = await createClient();
  const gates = (str(formData, "approval_gates") ?? "")
    .split("\n")
    .map((g) => g.trim())
    .filter(Boolean);
  const row = {
    business_id: businessId,
    name: str(formData, "name") ?? "Unnamed role",
    department: str(formData, "department"),
    purpose: str(formData, "purpose"),
    route: str(formData, "route") ?? "person",
    fallback_route: str(formData, "fallback_route"),
    standing_instructions: str(formData, "standing_instructions"),
    knowledge: str(formData, "knowledge"),
    capacity_trigger: str(formData, "capacity_trigger"),
    approval_gates: gates,
  };
  const { error } = existingId ? await supabase.from("roles").update(row).eq("id", id) : await supabase.from("roles").insert({ id, ...row });
  if (!error) {
    await setLinks(supabase, businessId, "role_id", id, formData.getAll("member_id").map(String));
    await syncFilledBy(supabase, businessId);
  }
  await done(formData, supabase, businessId, "team", error?.message);
}

export async function saveMember(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const existingId = str(formData, "id");
  const id = existingId ?? randomUUID();
  const supabase = await createClient();
  const name = str(formData, "name");
  if (!name) return done(formData, supabase, businessId, "people", "Give the person a name.");
  const row = {
    business_id: businessId,
    name,
    email: str(formData, "email"),
    note: str(formData, "note"),
    active: formData.get("left") !== "1",
  };
  const { error } = existingId ? await supabase.from("team_members").update(row).eq("id", id) : await supabase.from("team_members").insert({ id, ...row });
  if (!error) {
    await setLinks(supabase, businessId, "member_id", id, formData.getAll("role_id").map(String));
    await syncFilledBy(supabase, businessId);
  }
  await done(formData, supabase, businessId, "people", error?.message);
}

// Several people at once: one name on each line.
export async function pasteMembers(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const names = (str(formData, "pasted") ?? "")
    .split("\n")
    .map((n) => n.trim())
    .filter(Boolean);
  if (!names.length) return done(formData, supabase, businessId, "people", "Type at least one name.");
  const { error } = await supabase.from("team_members").insert(names.map((name) => ({ business_id: businessId, name })));
  await done(formData, supabase, businessId, "people", error?.message);
}

export async function addMeasure(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("measures").insert({
    business_id: businessId,
    role_id: str(formData, "role_id"),
    name: str(formData, "name") ?? "",
    kind: str(formData, "kind") ?? "lead",
    unit: str(formData, "unit"),
    target: num(formData, "target"),
    target_period: str(formData, "target_period") ?? "week",
    better_when: str(formData, "better_when") ?? "higher",
    data_source: str(formData, "data_source"),
  });
  await done(formData, supabase, businessId, "scorecards", error?.message);
}

export async function saveReadings(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const period = String(formData.get("period_start"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const rows: { business_id: string; measure_id: string; period_start: string; value: number; recorded_by: string | null; source: string }[] = [];
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("reading_")) continue;
    const s = String(v).trim();
    if (!s) continue;
    const n = Number(s.replace(/[, ]/g, ""));
    if (!Number.isFinite(n)) continue;
    const [mid, own] = k.slice(8).split("__");
    rows.push({ business_id: businessId, measure_id: mid, period_start: own && /^\d{4}-\d{2}-\d{2}$/.test(own) ? own : period, value: n, recorded_by: user?.id ?? null, source: "manual" });
  }
  const { error } = rows.length
    ? await supabase.from("measure_readings").upsert(rows, { onConflict: "measure_id,period_start" })
    : { error: null };
  await done(formData, supabase, businessId, "scorecards", error?.message);
}

export async function addTask(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const roleId = str(formData, "role_id");
  let route = str(formData, "route");
  let fallback = str(formData, "fallback_route");
  if (roleId && (!route || !fallback)) {
    const { data: role } = await supabase.from("roles").select("route, fallback_route").eq("id", roleId).single();
    route = route ?? role?.route ?? "person";
    fallback = fallback ?? role?.fallback_route ?? null;
  }
  const id = randomUUID();
  const { error } = await supabase.from("tasks").insert({
    id,
    business_id: businessId,
    role_id: roleId,
    title: str(formData, "title") ?? "",
    detail: str(formData, "detail"),
    priority_id: str(formData, "priority_id"),
    route: route ?? "person",
    fallback_route: fallback,
    due_date: str(formData, "due_date"),
    needs_approval: formData.get("needs_approval") === "1",
    created_by: user?.id ?? null,
  });
  if (!error) {
    await supabase.from("task_events").insert({ business_id: businessId, task_id: id, event: "created", actor: user?.email ?? "user" });
  }
  await done(formData, supabase, businessId, "tasks", error?.message);
}

export async function updateTask(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const taskId = String(formData.get("task_id"));
  const action = String(formData.get("action"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const actor = user?.email ?? "user";
  const patch: Record<string, unknown> = {};
  if (action === "approve") {
    patch.approved_at = new Date().toISOString();
    patch.approved_by = user?.id ?? null;
  } else if (action === "start") patch.status = "in_progress";
  else if (action === "done") {
    patch.status = "done";
    patch.result = str(formData, "result");
  } else if (action === "block") patch.status = "blocked";
  else if (action === "cancel") patch.status = "cancelled";
  else if (action === "requeue") patch.status = "queued";
  const { error } = await supabase.from("tasks").update(patch).eq("id", taskId);
  if (!error) {
    await supabase.from("task_events").insert({
      business_id: businessId,
      task_id: taskId,
      event: action === "approve" ? "approved" : `marked ${String(patch.status ?? action).replace("_", " ")}`,
      actor,
      detail: str(formData, "result"),
    });
  }
  if (!error && action === "done") {
    const nextPath = await afterStepPath(supabase, businessId, taskId);
    if (nextPath) {
      revalidatePath(`/b/${businessId}`, "layout");
      redirect(nextPath);
    }
  }
  await done(formData, supabase, businessId, "tasks", error?.message);
}

export async function createAgentKey(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const key = `bop_${randomBytes(24).toString("base64url")}`;
  const hash = createHash("sha256").update(key).digest("hex");
  const { error } = await supabase.from("agent_keys").insert({
    business_id: businessId,
    label: str(formData, "label") ?? "Agent",
    route: str(formData, "route") ?? "grok_bot",
    key_hash: hash,
    key_hint: key.slice(-4),
    created_by: user?.id ?? null,
  });
  revalidatePath(`/b/${businessId}`, "layout");
  if (error) redirect(`/b/${businessId}/tasks?error=${encodeURIComponent(error.message)}`);
  // Shown once; never stored in readable form.
  redirect(`/b/${businessId}/tasks?newkey=${encodeURIComponent(key)}#agents`);
}

export async function revokeAgentKey(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  await supabase.from("agent_keys").update({ revoked_at: new Date().toISOString() }).eq("id", String(formData.get("id")));
  revalidatePath(`/b/${businessId}`, "layout");
  redirect(`/b/${businessId}/tasks#agents`);
}

// ---------- AI review ----------

export async function runAiReview(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const key = String(formData.get("session_key"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let message: string | null = null;
  try {
    const r = await runCheckpointReview(supabase, businessId);
    const { error } = await supabase.from("ai_reviews").insert({
      business_id: businessId,
      kind: "checkpoint",
      session_key: key,
      content: r.content,
      model: r.model,
      input_tokens: r.input_tokens,
      output_tokens: r.output_tokens,
      version: r.content.version ?? 1,
      created_by: user?.id ?? null,
    });
    if (error) message = error.message;
  } catch (e) {
    message = e instanceof Error ? e.message : "The AI review didn't complete. Try again.";
  }
  revalidatePath(`/b/${businessId}`, "layout");
  redirect(`/b/${businessId}/s/${key}${message ? `?error=${encodeURIComponent(message)}` : "#ai-review"}`);
}

export async function acceptAiReview(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const key = String(formData.get("session_key"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const reviewId = str(formData, "review_id");
  if (reviewId) {
    const responses: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (k.startsWith("resp_") && String(v) in RESPONSES) responses[k.slice(5)] = String(v);
    }
    await supabase.from("ai_reviews").update({ responses, responded_at: new Date().toISOString() }).eq("id", reviewId);
  }
  const { error } = await supabase
    .from("programme_sessions")
    .update({
      approved_at: new Date().toISOString(),
      approved_by: user?.id ?? null,
      review_type: "ai",
      review_notes: str(formData, "review_notes"),
    })
    .eq("business_id", businessId)
    .eq("key", key);
  if (error) redirect(`/b/${businessId}/s/${key}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/b/${businessId}`, "layout");
  redirect(await completeSessionInternal(supabase, businessId, key));
}

// ---------- Part 5: this year ----------

function parseDate(s: string | null | undefined) {
  if (!s) return null;
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function parseNum(s: string | null | undefined) {
  if (!s) return null;
  const n = Number(s.replace(/[^0-9.\-]/g, ""));
  return s.replace(/[^0-9]/g, "").length && Number.isFinite(n) ? n : null;
}

function pick(s: string | null | undefined, options: string[]) {
  const t = (s ?? "").trim().toLowerCase();
  return options.find((o) => t.startsWith(o)) ?? null;
}

// Rows pasted from a table: one per line, columns separated by tabs (or " | ").
function pastedRows(text: string | null, columns: number) {
  return (text ?? "")
    .split(/\r?\n/)
    .map((line) => line.split(line.includes("\t") ? "\t" : "|").map((c) => c.trim()))
    .filter((cells) => cells.some(Boolean))
    .map((cells) => (cells.length > columns && /^#?\d*$/.test(cells[0]) ? cells.slice(1) : cells))
    .filter((cells) => cells[0] && !/^(#|title|battle|must-win battle|source|risk)$/i.test(cells[0]));
}

export async function savePlanYear(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const id = str(formData, "id");
  const supabase = await createClient();
  const start = parseDate(str(formData, "start_date"));
  if (!start) return done(formData, supabase, businessId, "year", "Choose the date the plan year starts.");
  const e = new Date(`${start}T00:00:00Z`);
  e.setUTCFullYear(e.getUTCFullYear() + 1);
  e.setUTCDate(e.getUTCDate() - 1);
  const row = {
    business_id: businessId,
    name: str(formData, "name") ?? `12 months from ${new Date(`${start}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}`,
    start_date: start,
    end_date: e.toISOString().slice(0, 10),
    runway_floor_months: num(formData, "runway_floor_months") ?? 3,
  };
  const { error } = id ? await supabase.from("plan_cycles").update(row).eq("id", id) : await supabase.from("plan_cycles").insert(row);
  await done(formData, supabase, businessId, "year", error?.message);
}

export async function saveBattle(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const cycle = String(formData.get("plan_cycle_id"));
  const number = Number(formData.get("number"));
  const title = str(formData, "title");
  if (!title) return done(formData, supabase, businessId, "year", "Give the battle a name.");
  const { error } = await supabase.from("must_win_battles").upsert(
    {
      business_id: businessId,
      plan_cycle_id: cycle,
      number,
      title,
      winning_looks_like: str(formData, "winning_looks_like"),
      kpi: str(formData, "kpi"),
      target: str(formData, "target"),
      deadline: str(formData, "deadline"),
      owner_role_id: str(formData, "owner_role_id"),
      answers_diagnosis: str(formData, "answers_diagnosis"),
      status: str(formData, "status") ?? "on_track",
    },
    { onConflict: "plan_cycle_id,number" }
  );
  await done(formData, supabase, businessId, "year", error?.message);
}

export async function removeBattle(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("must_win_battles").delete().eq("id", String(formData.get("id")));
  await done(formData, supabase, businessId, "year", error?.message);
}

export async function addDemand(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("demand_sources").insert({
    business_id: businessId,
    plan_cycle_id: String(formData.get("plan_cycle_id")),
    source: str(formData, "source") ?? "",
    source_type: str(formData, "source_type") ?? "new",
    starts_paying: str(formData, "starts_paying"),
    monthly_value: num(formData, "monthly_value"),
    ends_or_renews: str(formData, "ends_or_renews"),
    confidence: str(formData, "confidence") ?? "speculative",
    evidence: str(formData, "evidence"),
  });
  await done(formData, supabase, businessId, "year", error?.message);
}

export async function addRisk(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("risks").insert({
    business_id: businessId,
    risk: str(formData, "risk") ?? "",
    early_warning: str(formData, "early_warning"),
    response: str(formData, "response"),
    likelihood: str(formData, "likelihood") ?? "medium",
    impact: str(formData, "impact") ?? "medium",
    owner_role_id: str(formData, "owner_role_id"),
  });
  await done(formData, supabase, businessId, "year", error?.message);
}

export async function updateRisk(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("risks").update({ status: String(formData.get("status")) }).eq("id", String(formData.get("id")));
  await done(formData, supabase, businessId, "year", error?.message);
}

export async function removeYearRow(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const table = String(formData.get("table"));
  const supabase = await createClient();
  if (!["demand_sources", "risks"].includes(table)) return done(formData, supabase, businessId, "year", "Can't remove that.");
  const { error } = await supabase.from(table).delete().eq("id", String(formData.get("id"))).eq("business_id", businessId);
  await done(formData, supabase, businessId, "year", error?.message);
}

export async function saveNumbers(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const cycle = String(formData.get("plan_cycle_id"));
  const month = String(formData.get("month"));
  const supabase = await createClient();
  const { data: cyc } = await supabase.from("plan_cycles").select("status").eq("id", cycle).single();
  if (cyc?.status === "approved") return done(formData, supabase, businessId, "year", "The plan is locked, so the numbers can't change. Unlock it at the bottom of this page first.");
  const rows: { business_id: string; plan_cycle_id: string; scenario: string; month: string; measure: string; value: number; forecast_version: number }[] = [];
  for (const [k, v] of formData.entries()) {
    const m = k.match(/^n_(budget|commit|stretch)_([a-z_]+)$/);
    if (!m) continue;
    const n = parseNum(String(v));
    if (n === null) continue;
    rows.push({ business_id: businessId, plan_cycle_id: cycle, scenario: m[1], month, measure: m[2], value: n, forecast_version: 0 });
  }
  const { error } = rows.length
    ? await supabase.from("financial_lines").upsert(rows, { onConflict: "plan_cycle_id,scenario,month,measure,forecast_version" })
    : { error: null };
  await done(formData, supabase, businessId, "year", error?.message);
}

export async function pasteYearRows(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const cycle = String(formData.get("plan_cycle_id"));
  const kind = String(formData.get("kind"));
  const text = str(formData, "rows");
  const supabase = await createClient();
  let error: string | undefined;
  if (kind === "battles") {
    const { data: existing } = await supabase.from("must_win_battles").select("number").eq("plan_cycle_id", cycle);
    const free = [1, 2, 3].filter((n) => !(existing ?? []).some((b) => b.number === n));
    const rows = pastedRows(text, 5).slice(0, free.length);
    if (!rows.length) error = free.length ? "Nothing to add. Paste one battle per line." : "You already have three battles. Remove one first.";
    else {
      const r = await supabase.from("must_win_battles").insert(
        rows.map((c, i) => ({
          business_id: businessId,
          plan_cycle_id: cycle,
          number: free[i],
          title: c[0],
          winning_looks_like: c[1] || null,
          kpi: c[2] || null,
          target: c[3] || null,
          deadline: parseDate(c[4]),
        }))
      );
      error = r.error?.message;
    }
  } else if (kind === "demand") {
    const rows = pastedRows(text, 7);
    if (!rows.length) error = "Nothing to add. Paste one source per line.";
    else {
      const r = await supabase.from("demand_sources").insert(
        rows.map((c) => ({
          business_id: businessId,
          plan_cycle_id: cycle,
          source: c[0],
          source_type: pick(c[1], ["existing", "renewal", "new"]) ?? "new",
          starts_paying: parseDate(c[2]),
          monthly_value: parseNum(c[3]),
          ends_or_renews: parseDate(c[4]),
          confidence: pick(c[5], ["confirmed", "likely", "speculative"]) ?? "speculative",
          evidence: c[6] || null,
        }))
      );
      error = r.error?.message;
    }
  } else if (kind === "risks") {
    const rows = pastedRows(text, 5);
    if (!rows.length) error = "Nothing to add. Paste one risk per line.";
    else {
      const r = await supabase.from("risks").insert(
        rows.map((c) => ({
          business_id: businessId,
          risk: c[0],
          early_warning: c[1] || null,
          response: c[2] || null,
          likelihood: pick(c[3], ["high", "medium", "low"]) ?? "medium",
          impact: pick(c[4], ["high", "medium", "low"]) ?? "medium",
        }))
      );
      error = r.error?.message;
    }
  }
  await done(formData, supabase, businessId, "year", error);
}


// ---------- Part 6: this quarter ----------

async function nextPriorityNumber(supabase: SupabaseClient, businessId: string, quarter: string) {
  const { data } = await supabase.from("quarterly_priorities").select("number").eq("business_id", businessId).eq("quarter_start", quarter);
  return [1, 2, 3, 4, 5].filter((n) => !(data ?? []).some((p) => p.number === n));
}

export async function savePriority(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const id = str(formData, "id");
  const quarter = String(formData.get("quarter_start"));
  const supabase = await createClient();
  const objective = str(formData, "objective");
  if (!objective) return done(formData, supabase, businessId, "quarter", "Write the priority.");
  const row = {
    objective,
    must_win_battle_id: str(formData, "must_win_battle_id"),
    owner_role_id: str(formData, "owner_role_id"),
    due_date: str(formData, "due_date"),
  };
  let error: string | undefined;
  if (id) {
    error = (await supabase.from("quarterly_priorities").update(row).eq("id", id)).error?.message;
  } else {
    const free = await nextPriorityNumber(supabase, businessId, quarter);
    if (!free.length) return done(formData, supabase, businessId, "quarter", "Five is the limit for one quarter. Remove one first.");
    const pid = randomUUID();
    const r = await supabase.from("quarterly_priorities").insert({
      id: pid,
      business_id: businessId,
      plan_cycle_id: str(formData, "plan_cycle_id"),
      quarter_start: quarter,
      number: free[0],
      ...row,
    });
    error = r.error?.message;
    const result = str(formData, "result");
    if (!error && result) {
      await supabase.from("key_results").insert({
        business_id: businessId,
        priority_id: pid,
        description: result,
        target: num(formData, "target"),
        unit: str(formData, "unit"),
        due_date: str(formData, "due_date"),
      });
    }
  }
  await done(formData, supabase, businessId, "quarter", error);
}

export async function removePriority(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("quarterly_priorities").delete().eq("id", String(formData.get("id"))).eq("business_id", businessId);
  await done(formData, supabase, businessId, "quarter", error?.message);
}

export async function addKeyResult(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("key_results").insert({
    business_id: businessId,
    priority_id: String(formData.get("priority_id")),
    description: str(formData, "description") ?? "",
    target: num(formData, "target"),
    unit: str(formData, "unit"),
    due_date: str(formData, "due_date"),
  });
  await done(formData, supabase, businessId, "quarter", error?.message);
}

export async function updateKeyResult(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const { error } =
    formData.get("remove") === "1"
      ? await supabase.from("key_results").delete().eq("id", id).eq("business_id", businessId)
      : await supabase.from("key_results").update({ current_value: num(formData, "current_value"), updated_at: new Date().toISOString() }).eq("id", id);
  await done(formData, supabase, businessId, "quarter", error?.message);
}

export async function pastePriorities(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const quarter = String(formData.get("quarter_start"));
  const supabase = await createClient();
  const free = await nextPriorityNumber(supabase, businessId, quarter);
  const rows = pastedRows(str(formData, "rows"), 5)
    .filter((c) => !/^priority$/i.test(c[0]))
    .slice(0, free.length);
  let error: string | undefined;
  if (!rows.length) error = free.length ? "Nothing to add. Paste one priority per line." : "Five is the limit for one quarter. Remove one first.";
  for (let i = 0; i < rows.length && !error; i++) {
    const c = rows[i];
    const pid = randomUUID();
    const r = await supabase.from("quarterly_priorities").insert({
      id: pid,
      business_id: businessId,
      plan_cycle_id: str(formData, "plan_cycle_id"),
      quarter_start: quarter,
      number: free[i],
      objective: c[0],
      due_date: parseDate(c[4]),
    });
    error = r.error?.message;
    if (!error && c[1]) {
      await supabase.from("key_results").insert({ business_id: businessId, priority_id: pid, description: c[1], target: parseNum(c[2]), unit: c[3] || null, due_date: parseDate(c[4]) });
    }
  }
  await done(formData, supabase, businessId, "quarter", error);
}

// ---------- Part 9: operating rhythm ----------

const STANDARD_RHYTHM = [
  { name: "Weekly check-in", cadence: "weekly", when_text: "Monday morning", minutes: 30, attendees: "Everyone who owns a number", agenda: "Scorecards: what's off target and why\nTasks that are blocked or waiting for approval\nThe one thing each person will finish this week" },
  { name: "Monthly review", cadence: "monthly", when_text: "First week of the month", minutes: 90, attendees: "The owners, and whoever challenges the plan", agenda: "The month against the plan\nMust-Win Battles: on track or not\nRisks: any early signs showing\nDecisions needed\nActions, each with an owner and a date" },
  { name: "Quarterly reset", cadence: "quarterly", when_text: "Last week of the quarter", minutes: 180, attendees: "The owners", agenda: "Score last quarter's priorities honestly\nWhat we learned\nSet next quarter's three to five priorities\nCheck roles and capacity" },
  { name: "Yearly plan", cadence: "yearly", when_text: "Six weeks before the plan year ends", minutes: 360, attendees: "The owners, and whoever challenges the plan", agenda: "What last year taught us\nRefresh the diagnosis and direction\nNext year's battles and numbers\nGet it challenged before it's locked" },
];

export async function loadStandardRhythm(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const { data: existing } = await supabase.from("rhythm_items").select("cadence").eq("business_id", businessId);
  const rows = STANDARD_RHYTHM.filter((r) => !(existing ?? []).some((e) => e.cadence === r.cadence)).map((r, i) => ({ ...r, business_id: businessId, sort: i }));
  const { error } = rows.length ? await supabase.from("rhythm_items").insert(rows) : { error: null };
  await done(formData, supabase, businessId, "rhythm", error?.message);
}

export async function saveRhythm(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const id = str(formData, "id");
  const supabase = await createClient();
  if (id && formData.get("remove") === "1") {
    const { error } = await supabase.from("rhythm_items").delete().eq("id", id).eq("business_id", businessId);
    return done(formData, supabase, businessId, "rhythm", error?.message);
  }
  const row = {
    business_id: businessId,
    name: str(formData, "name") ?? "Meeting",
    cadence: str(formData, "cadence") ?? "weekly",
    when_text: str(formData, "when_text"),
    minutes: num(formData, "minutes"),
    attendees: str(formData, "attendees"),
    agenda: str(formData, "agenda"),
    updated_at: new Date().toISOString(),
  };
  const { error } = id ? await supabase.from("rhythm_items").update(row).eq("id", id) : await supabase.from("rhythm_items").insert(row);
  await done(formData, supabase, businessId, "rhythm", error?.message);
}

// ---------- Part 10: monthly review ----------

export async function saveReview(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const period = String(formData.get("period_start"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const held = formData.get("held") === "1";
  const content = JSON.stringify({
    went_well: str(formData, "went_well"),
    went_badly: str(formData, "went_badly"),
    lesson: str(formData, "lesson"),
    change: str(formData, "change"),
  });
  const row: Record<string, unknown> = { business_id: businessId, kind: "monthly", period_start: period, content, prepared_by: user?.email ?? null, updated_at: new Date().toISOString() };
  if (held) {
    row.status = "held";
    row.held_on = new Date().toISOString().slice(0, 10);
  }
  const { error } = await supabase.from("reviews").upsert(row, { onConflict: "business_id,kind,period_start" });
  await done(formData, supabase, businessId, "reviews", error?.message);
}

export async function addDecision(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const period = String(formData.get("period_start"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let { data: review } = await supabase.from("reviews").select("id").eq("business_id", businessId).eq("kind", "monthly").eq("period_start", period).maybeSingle();
  if (!review) {
    const r = await supabase.from("reviews").insert({ business_id: businessId, kind: "monthly", period_start: period, content: "{}" }).select("id").single();
    review = r.data;
  }
  const { error } = await supabase.from("decisions").insert({
    business_id: businessId,
    review_id: review?.id ?? null,
    question: str(formData, "question") ?? "",
    decision: str(formData, "decision"),
    status: str(formData, "decision") ? "decided" : "open",
    decided_by: user?.id ?? null,
    decided_on: str(formData, "decision") ? new Date().toISOString().slice(0, 10) : null,
  });
  await done(formData, supabase, businessId, "reviews", error?.message);
}

// ---------- Locking the plan ----------

export async function lockPlan(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const cycle = String(formData.get("plan_cycle_id"));
  const supabase = await createClient();
  const unlock = formData.get("unlock") === "1";
  if (!unlock) {
    const [{ data: approved }, { data: ai }] = await Promise.all([
      supabase.from("programme_sessions").select("key").eq("business_id", businessId).not("approved_at", "is", null).limit(1),
      supabase.from("ai_reviews").select("id").eq("business_id", businessId).limit(1),
    ]);
    if (!(approved ?? []).length && !(ai ?? []).length) {
      return done(formData, supabase, businessId, "year", "Get the plan challenged before you lock it: run the AI review or record a review by someone else.");
    }
  }
  const { error } = await supabase
    .from("plan_cycles")
    .update(unlock ? { status: "draft", approved_on: null } : { status: "approved", approved_on: new Date().toISOString().slice(0, 10) })
    .eq("id", cycle);
  await done(formData, supabase, businessId, "year", error?.message);
}
