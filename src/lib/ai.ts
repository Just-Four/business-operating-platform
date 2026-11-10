import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CANVAS_BOXES, EVIDENCE_KINDS, MODELS, STAGES, gradeOf, isStale, type EvidenceStrength } from "@/lib/framework";
import { CANVAS_PLAIN } from "@/lib/programme";

export const AI_MODEL = "claude-sonnet-5-5";

export type CheckpointReview = {
  verdict: string;
  readiness: "ready" | "nearly" | "not_yet";
  strengths: string[];
  challenges: { area: string; severity: "critical" | "important" | "minor"; problem: string; question: string; smallest_test: string }[];
  contradictions: string[];
  riskiest_assumptions: string[];
};

const CHECKPOINT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "readiness", "strengths", "challenges", "contradictions", "riskiest_assumptions"],
  properties: {
    verdict: { type: "string", description: "Two or three plain sentences: where this plan stands and the single most important thing to fix." },
    readiness: { type: "string", enum: ["ready", "nearly", "not_yet"] },
    strengths: { type: "array", items: { type: "string" }, description: "Up to three things that are genuinely solid, each tied to what's written." },
    challenges: {
      type: "array",
      description: "Up to six challenges, most serious first.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["area", "severity", "problem", "question", "smallest_test"],
        properties: {
          area: { type: "string", description: "Plain name of the part of the plan, e.g. 'Who pays you', 'Pricing', 'Biggest obstacle'." },
          severity: { type: "string", enum: ["critical", "important", "minor"] },
          problem: { type: "string", description: "What is weak, vague, unproven or inconsistent, quoting or referring to what they wrote." },
          question: { type: "string", description: "The question the owner must be able to answer." },
          smallest_test: { type: "string", description: "The smallest, cheapest thing they could do this week to find out, with a pass mark." },
        },
      },
    },
    contradictions: { type: "array", items: { type: "string" }, description: "Places where two parts of the plan don't agree. Empty if none." },
    riskiest_assumptions: { type: "array", items: { type: "string" }, description: "Up to three beliefs that would sink the plan if wrong, most dangerous first." },
  },
};

const SYSTEM = `You are an experienced business reviewer: someone who has started, run, funded and turned around businesses. You are reviewing a business plan at a checkpoint, before the owner commits to direction and numbers.

Your job is to challenge, not to approve. Be direct and specific. No flattery, no padding, no generic advice that would apply to any business.

Rules:
- Work only from what is written. Never invent facts about the business, its market or its numbers. If something is missing, say it's missing.
- Each part of the business model carries an evidence grade: Proven (strong evidence such as signed contracts, payments or own trading data), Supported (medium evidence such as written commitments, quotes or independent data), Assumption (weak or no evidence). Treat Assumption as unproven, however confident the wording. Out-of-date evidence counts for less.
- Focus on what matters most: who pays and why they'd choose this, whether the money adds up at a realistic volume, whether the stated obstacle is a real obstacle rather than a goal, and the beliefs that would sink the plan if wrong.
- Check the parts against each other: customers versus channels, price versus costs, the obstacle versus the approach, targets versus the stage the business is at.
- For every challenge, give the smallest, cheapest test the owner could run this week, with a clear pass mark.
- Match the stage. A business that hasn't made a sale yet should be tested on whether anyone will pay. An established business should be tested on its numbers and what last year taught it.
- Write in plain British English, to the owner as "you". Short sentences. No jargon; if a technical term helps, put the plain words first.`;

export async function buildPlanText(supabase: SupabaseClient, businessId: string) {
  const [{ data: biz }, { data: canvas }, { data: evidence }, { data: diag }, { data: dir }, { data: assumptions }, { data: milestones }, { data: lookback }] =
    await Promise.all([
      supabase.from("businesses").select("name, sector, model, stage, country, currency").eq("id", businessId).single(),
      supabase.from("canvas_boxes").select("box, answer").eq("business_id", businessId),
      supabase.from("evidence").select("subject_key, kind, strength, summary, source, evidence_date").eq("business_id", businessId).eq("subject_type", "canvas"),
      supabase.from("diagnoses").select("diagnosis, guiding_policy, coordinated_actions").eq("business_id", businessId).eq("is_current", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("direction").select("*").eq("business_id", businessId).maybeSingle(),
      supabase.from("assumptions").select("rank, assumption, why_it_matters, test, status, result").eq("business_id", businessId).order("rank"),
      supabase.from("milestones").select("sequence, name, description, spend_limit, due_date, status").eq("business_id", businessId).order("sequence"),
      supabase.from("lookbacks").select("*").eq("business_id", businessId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

  const cur = biz?.currency ?? "";
  const lines: string[] = [];
  lines.push(`BUSINESS: ${biz?.name ?? "Unnamed"}`);
  lines.push(`Sector: ${biz?.sector || "not given"}`);
  lines.push(`How it makes money: ${MODELS[biz?.model ?? "other"] ?? biz?.model}`);
  lines.push(`Stage: ${STAGES[(biz?.stage ?? "launch") as keyof typeof STAGES] ?? biz?.stage}`);
  lines.push(`Country: ${biz?.country || "not given"}; currency ${cur}`);
  lines.push("");
  lines.push("BUSINESS MODEL");
  for (const b of CANVAS_BOXES) {
    const answer = (canvas ?? []).find((c) => c.box === b.key)?.answer?.trim() ?? "";
    const items = (evidence ?? []).filter((e) => e.subject_key === b.key);
    const grade = gradeOf(!!answer, items as { strength: EvidenceStrength; evidence_date: string }[]);
    lines.push(`\n## ${CANVAS_PLAIN[b.key]?.question ?? b.title}`);
    lines.push(`Answer: ${answer || "(empty)"}`);
    lines.push(`Evidence grade: ${grade === "empty" ? "Empty" : grade[0].toUpperCase() + grade.slice(1)}`);
    for (const e of items) {
      const kind = EVIDENCE_KINDS.find((k) => k.key === e.kind)?.label ?? e.kind;
      const stale = isStale(e.strength as EvidenceStrength, e.evidence_date) ? " (out of date)" : "";
      lines.push(`- Evidence (${e.strength}${stale}): ${kind}. ${e.summary ?? ""}${e.source ? ` Source: ${e.source}.` : ""}${e.evidence_date ? ` Dated ${e.evidence_date}.` : ""}`);
    }
  }
  lines.push("\nDIAGNOSIS");
  lines.push(`Biggest obstacle: ${diag?.diagnosis || "(empty)"}`);
  lines.push(`Approach: ${diag?.guiding_policy || "(empty)"}`);
  lines.push(`Actions: ${diag?.coordinated_actions || "(empty)"}`);
  if (dir) {
    lines.push("\nDIRECTION");
    lines.push(`Purpose: ${dir.purpose || "(empty)"}`);
    lines.push(`Long-term target: ${dir.long_term_target || "(empty)"}${dir.long_term_year ? ` by ${dir.long_term_year}` : ""}`);
    lines.push(
      `3–5 year target${dir.mid_term_year ? ` (${dir.mid_term_year})` : ""}: revenue ${dir.mid_term_revenue ?? "?"} ${cur}, profit margin ${dir.mid_term_profit_pct ?? "?"}%, size ${dir.mid_term_size || "?"}`
    );
    if (dir.capabilities) lines.push(`Capabilities needed: ${dir.capabilities}`);
  }
  if (assumptions?.length) {
    lines.push("\nKEY ASSUMPTIONS");
    for (const a of assumptions) lines.push(`- ${a.assumption} [${a.status}]${a.why_it_matters ? ` Why it matters: ${a.why_it_matters}.` : ""}${a.test ? ` Test: ${a.test}.` : ""}${a.result ? ` Result: ${a.result}.` : ""}`);
  }
  if (milestones?.length) {
    lines.push("\nMILESTONES");
    for (const m of milestones) lines.push(`- ${m.name} [${m.status}]${m.due_date ? ` due ${m.due_date}` : ""}${m.spend_limit ? `, spend limit ${m.spend_limit} ${cur}` : ""}${m.description ? `. ${m.description}` : ""}`);
  }
  if (lookback) {
    lines.push(`\nLOOK-BACK (${lookback.period_label})`);
    for (const it of (lookback.items ?? []) as Record<string, unknown>[]) lines.push(`- ${JSON.stringify(it)}`);
    for (const k of ["furthest_wrong", "lost_why", "least_profitable", "no_payback", "biggest_lesson"]) if (lookback[k]) lines.push(`${k.replace(/_/g, " ")}: ${lookback[k]}`);
  }
  return lines.join("\n");
}

export async function runCheckpointReview(planText: string) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("The AI review isn't switched on yet: the API key is missing.");
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    output_config: { effort: "medium", format: { type: "json_schema", schema: CHECKPOINT_SCHEMA } },
    messages: [{ role: "user", content: `Review this plan at the checkpoint.\n\n${planText}` }],
  });
  const text = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  const content = JSON.parse(text) as CheckpointReview;
  return { content, model: msg.model, input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens };
}
