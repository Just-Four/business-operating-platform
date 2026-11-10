"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CANVAS_BOXES, STANDARD_MILESTONES } from "@/lib/framework";

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

function done(businessId: string, page: string, error?: string) {
  revalidatePath(`/b/${businessId}`, "layout");
  const base = `/b/${businessId}${page ? `/${page}` : ""}`;
  redirect(error ? `${base}?error=${encodeURIComponent(error)}` : `${base}?saved=1`);
}

export async function updateStage(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("businesses")
    .update({ stage: String(formData.get("stage")) })
    .eq("id", businessId);
  done(businessId, "", error?.message);
}

export async function saveCanvas(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const rows = CANVAS_BOXES.map((box) => ({
    business_id: businessId,
    box: box.key,
    answer: str(formData, `${box.key}_answer`),
    evidence: str(formData, `${box.key}_evidence`),
    checked_on: today,
  }));
  const { error } = await supabase.from("canvas_boxes").upsert(rows, { onConflict: "business_id,box" });
  done(businessId, "canvas", error?.message);
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
  done(businessId, "diagnosis", error?.message);
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
  done(businessId, "direction", error?.message);
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
  done(businessId, "launch", error?.message);
}

export async function updateAssumption(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("assumptions")
    .update({ status: str(formData, "status"), result: str(formData, "result") })
    .eq("id", String(formData.get("id")));
  done(businessId, "launch", error?.message);
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
  done(businessId, "launch", error?.message);
}

export async function loadStandardMilestones(formData: FormData) {
  const businessId = String(formData.get("business_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("milestones").insert(
    STANDARD_MILESTONES.map((m, i) => ({
      business_id: businessId,
      sequence: i + 1,
      name: m.name,
      description: m.description,
    }))
  );
  done(businessId, "launch", error?.message);
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
  done(businessId, "launch", error?.message);
}
