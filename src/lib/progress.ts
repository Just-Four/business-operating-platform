import type { SupabaseClient } from "@supabase/supabase-js";
import { gradeOf, type EvidenceStrength } from "@/lib/framework";

export type Progress = "complete" | "partial" | "empty";

export type BusinessProgress = {
  states: Record<string, Progress>;
  detail: Record<string, string>;
};

export async function getProgress(supabase: SupabaseClient, id: string): Promise<BusinessProgress> {
  const [canvas, diag, dir, assumptions, milestones, ev] = await Promise.all([
    supabase.from("canvas_boxes").select("box, answer").eq("business_id", id),
    supabase
      .from("diagnoses")
      .select("diagnosis, guiding_policy, coordinated_actions")
      .eq("business_id", id)
      .eq("is_current", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("direction").select("purpose, long_term_target, mid_term_year").eq("business_id", id).maybeSingle(),
    supabase.from("assumptions").select("status").eq("business_id", id),
    supabase.from("milestones").select("status").eq("business_id", id),
    supabase.from("evidence").select("subject_key, strength, evidence_date").eq("business_id", id).eq("subject_type", "canvas"),
  ]);

  const boxes = (canvas.data ?? []).filter((c) => c.answer && String(c.answer).trim());
  const evItems = (ev.data ?? []) as { subject_key: string; strength: EvidenceStrength; evidence_date: string }[];
  const proven = boxes.filter((c) => gradeOf(true, evItems.filter((e) => e.subject_key === c.box)) === "proven").length;
  const d = diag.data;
  const dActions = (d?.coordinated_actions ?? []).length;
  const r = dir.data;
  const a = assumptions.data ?? [];
  const m = milestones.data ?? [];
  const provenAssumptions = a.filter((x) => x.status === "proven").length;
  const met = m.filter((x) => x.status === "met").length;

  const states: Record<string, Progress> = {
    canvas: boxes.length === 9 ? "complete" : boxes.length > 0 ? "partial" : "empty",
    diagnosis:
      d?.diagnosis && d?.guiding_policy && dActions >= 3
        ? "complete"
        : d?.diagnosis || d?.guiding_policy || dActions
          ? "partial"
          : "empty",
    direction: r?.purpose && r?.mid_term_year ? "complete" : r?.purpose || r?.long_term_target ? "partial" : "empty",
    launch: a.length >= 3 && m.length > 0 ? "complete" : a.length || m.length ? "partial" : "empty",
  };

  const detail: Record<string, string> = {
    canvas: boxes.length
      ? `${boxes.length} of 9 boxes filled, ${proven} proven by strong evidence`
      : "Not started",
    diagnosis: d?.diagnosis ? `Written, with ${dActions} coordinated action${dActions === 1 ? "" : "s"}` : "Not written",
    direction: r?.purpose ? (r.mid_term_year ? `Targets set to ${r.mid_term_year}` : "Purpose set, targets missing") : "Not set",
    launch:
      a.length || m.length
        ? `${provenAssumptions} of ${a.length} assumptions proven, ${met} of ${m.length} milestones met`
        : "Not started",
  };

  return { states, detail };
}
