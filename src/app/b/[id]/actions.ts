"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CANVAS_BOXES } from "@/lib/framework";
import { guidanceFor } from "@/lib/guidance";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SESSIONS, defaultDeadline, iso, nextSession, schedule, type Route } from "@/lib/programme";

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
  const next = nextSession(key);
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
  const capabilities = (str(formData, "capabilities") ?? "")
    .split("\n")
    .map((s) => s.trim())
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

  if (route === "guided" || route === "focused") {
    const dates = schedule(SESSIONS.map((s) => s.key), start, deadline);
    await supabase.from("programme_sessions").upsert(
      SESSIONS.map((s) => ({ business_id: businessId, key: s.key, seq: s.seq, scheduled_on: dates[s.key] })),
      { onConflict: "business_id,key" }
    );
    revalidatePath(`/b/${businessId}`, "layout");
    redirect(`/b/${businessId}/programme`);
  }
  revalidatePath(`/b/${businessId}`, "layout");
  redirect(`/b/${businessId}`);
}

export async function saveSchedule(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  for (const s of SESSIONS) {
    const d = str(formData, `date_${s.key}`);
    if (d) await supabase.from("programme_sessions").update({ scheduled_on: d }).eq("business_id", businessId).eq("key", s.key);
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
  await supabase.from("businesses").update({ planning_route: route }).eq("id", businessId);
  if (route === "guided" || route === "focused") {
    const { data: existing } = await supabase.from("programme_sessions").select("key").eq("business_id", businessId);
    if (!existing?.length) {
      const start = new Date();
      const dates = schedule(SESSIONS.map((s) => s.key), start, defaultDeadline(route, start));
      await supabase.from("programme_sessions").upsert(
        SESSIONS.map((s) => ({ business_id: businessId, key: s.key, seq: s.seq, scheduled_on: dates[s.key] })),
        { onConflict: "business_id,key" }
      );
    }
    revalidatePath(`/b/${businessId}`, "layout");
    redirect(`/b/${businessId}/programme`);
  }
  revalidatePath(`/b/${businessId}`, "layout");
  redirect(`/b/${businessId}`);
}
