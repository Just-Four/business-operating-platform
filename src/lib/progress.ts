import type { SupabaseClient } from "@supabase/supabase-js";
import { gradeOf, type EvidenceStrength } from "@/lib/framework";

export type Progress = "complete" | "partial" | "empty";

export type BusinessProgress = {
  states: Record<string, Progress>;
  detail: Record<string, string>;
};

export async function getProgress(supabase: SupabaseClient, id: string): Promise<BusinessProgress> {
  const { data: cyc } = await supabase.from("plan_cycles").select("id").eq("business_id", id).order("start_date", { ascending: false }).limit(1).maybeSingle();
  const [yb, yn] = cyc
    ? await Promise.all([
        supabase.from("must_win_battles").select("id").eq("plan_cycle_id", cyc.id),
        supabase.from("financial_lines").select("id").eq("plan_cycle_id", cyc.id).eq("scenario", "budget").eq("measure", "revenue"),
      ])
    : [{ data: [] }, { data: [] }];
  const { data: qp } = await supabase.from("quarterly_priorities").select("id").eq("business_id", id);
  const { data: qr } = await supabase.from("key_results").select("priority_id").eq("business_id", id);
  const nPriorities = (qp ?? []).length;
  const withNumber = (qp ?? []).filter((p) => (qr ?? []).some((r) => r.priority_id === p.id)).length;
  const { data: rh } = await supabase.from("rhythm_items").select("id").eq("business_id", id);
  const { data: rv } = await supabase.from("reviews").select("status").eq("business_id", id).eq("kind", "monthly");
  const nRhythm = (rh ?? []).length;
  const nHeld = (rv ?? []).filter((r) => r.status === "held").length;
  const nBattles = (yb.data ?? []).length;
  const hasNumbers = (yn.data ?? []).length > 0;
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
    year: nBattles > 0 && hasNumbers ? "complete" : cyc ? "partial" : "empty",
    rhythm: nRhythm >= 2 ? "complete" : nRhythm ? "partial" : "empty",
    reviews: nHeld ? "complete" : (rv ?? []).length ? "partial" : "empty",
    quarter: nPriorities >= 3 && withNumber === nPriorities ? "complete" : nPriorities ? "partial" : "empty",
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
    rhythm: nRhythm ? `${nRhythm} standing meeting${nRhythm === 1 ? "" : "s"}` : "Not started",
    reviews: nHeld ? `${nHeld} review${nHeld === 1 ? "" : "s"} held` : "None held yet",
    quarter: nPriorities ? `${nPriorities} priorit${nPriorities === 1 ? "y" : "ies"}, ${withNumber} with a number` : "Not started",
    year: cyc ? `${nBattles} Must-Win Battle${nBattles === 1 ? "" : "s"}, numbers ${hasNumbers ? "entered" : "not entered"}` : "Not started",
  };

  return { states, detail };
}
