import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CANVAS_BOXES, EVIDENCE_KINDS, MODELS, STAGES, gradeOf, isStale, type EvidenceStrength } from "@/lib/framework";
import { CANVAS_PLAIN } from "@/lib/programme";

export const AI_MODEL = "claude-sonnet-5-5";
export const REVIEWER_VERSION = 2;

// ---------- The fixed checks ----------
// The AI answers each check yes or no with a quote. The platform does the counting.
// "computed" checks are worked out from the evidence grades, not by the AI.

export type Check = { id: string; method: string; question: string; critical: boolean; computed?: boolean };

export const CHECKS: Check[] = [
  { id: "who_pays_specific", method: "Opportunity (Sahlman, Aulet)", question: "Is the paying customer specific enough that you could find and contact one this week?", critical: true },
  { id: "why_choose", method: "Opportunity (Sahlman)", question: "Is there a concrete reason customers would choose this over what they do today?", critical: true },
  { id: "evidence_behaviour", method: "Customer evidence (The Mom Test)", question: "Is the evidence for who pays and why based on what customers did or paid, rather than what they said they'd do?", critical: true },
  { id: "critical_supported", method: "Assumption load (McGrath and MacMillan)", question: "Are the critical claims (who pays, why they'd choose you, price, costs) backed by at least medium evidence?", critical: true, computed: true },
  { id: "money_adds_up", method: "Work back from profit (McGrath and MacMillan)", question: "Do the price, volume and costs given produce a profit at a volume the plan shows is realistic?", critical: true },
  { id: "obstacle_real", method: "Diagnosis (Rumelt)", question: "Does the diagnosis name a specific obstacle, rather than a goal or ambition?", critical: true },
  { id: "approach_tackles", method: "Diagnosis (Rumelt)", question: "Does the approach directly tackle the obstacle that was named?", critical: false },
  { id: "actions_fit", method: "Diagnosis (Rumelt)", question: "Do the actions follow from the approach and support each other, rather than being a wish list?", critical: false },
  { id: "choices_made", method: "Strategy (Rumelt, Roger Martin)", question: "Does the plan make clear choices about who it serves and what it won't do, rather than generic statements?", critical: false },
  { id: "parts_agree", method: "Consistency", question: "Do the parts agree with each other: customers with channels, price with costs, targets with stage?", critical: false },
  { id: "outside_risks", method: "Context (Sahlman)", question: "Does the plan recognise outside factors that could hurt it, such as competitors, regulation, suppliers or the economy?", critical: false },
  { id: "survives_downside", method: "Cash and affordable loss", question: "Does the plan show the business could survive if its riskiest belief turned out wrong?", critical: false },
];

export const PEOPLE_QUESTIONS = [
  "Have you, or someone working with you, done this kind of work successfully before?",
  "Do you have the time, money and skills to carry out the next 90 days of this plan?",
  "Who will you turn to when something goes wrong, and have you asked them?",
];

export const RESPONSES: Record<string, string> = {
  fixed: "Fixed it in the plan",
  testing: "Will test it",
  accepted: "Accept the risk",
  ignored: "Disagree, ignoring it",
};

export type CheckResult = { id: string; result: "yes" | "no"; quote: string; reason: string };
export type Challenge = { area: string; severity: "critical" | "important" | "minor"; problem: string; question: string; smallest_test: string };
export type CheckpointReview = {
  version?: number;
  verdict: string;
  readiness: "ready" | "nearly" | "not_yet";
  strengths: string[];
  challenges: Challenge[];
  contradictions: string[];
  riskiest_assumptions: string[];
  checks?: CheckResult[];
};

const AI_CHECKS = CHECKS.filter((c) => !c.computed);

const CHECKPOINT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["checks", "verdict", "readiness", "strengths", "challenges", "contradictions", "riskiest_assumptions"],
  properties: {
    checks: {
      type: "array",
      description: "One entry for every check listed, in the order given.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "result", "quote", "reason"],
        properties: {
          id: { type: "string", enum: AI_CHECKS.map((c) => c.id) },
          result: { type: "string", enum: ["yes", "no"] },
          quote: { type: "string", description: "The exact words from the plan this answer relies on. Empty string if nothing relevant is written." },
          reason: { type: "string", description: "One sentence explaining the answer." },
        },
      },
    },
    verdict: { type: "string", description: "Two or three plain sentences: where this plan stands and the single most important thing to fix." },
    readiness: { type: "string", enum: ["ready", "nearly", "not_yet"] },
    strengths: { type: "array", items: { type: "string" }, description: "Up to three things that are genuinely solid, each tied to what's written." },
    challenges: {
      type: "array",
      description: "Up to six challenges, most serious first. Base them on the checks that failed.",
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

const SYSTEM = `You are reviewing a business plan at a checkpoint, before the owner commits to direction and numbers. Review it as an experienced operator would: someone who has started and run businesses and cares whether this can actually be delivered week to week.

Your job is to find what's wrong, not to approve. You are not predicting whether the business will succeed; you are finding gaps, contradictions and unproven beliefs. Be direct and specific. No flattery, no padding, no generic advice.

First, answer every check you are given, strictly:
- Answer "yes" only if the plan as written clearly meets the check. If it's missing, vague or only implied, answer "no".
- Quote the exact words from the plan you relied on. If nothing relevant is written, leave the quote empty and answer "no".
- Give one sentence of reason.
Then write the verdict, challenges, contradictions, riskiest beliefs and strengths. Base the challenges on the checks that failed, most serious first.

Rules:
- Work only from what is written. Never invent facts about the business, its market or its numbers.
- Evidence grades: Proven (strong: signed contracts, payments, own trading data), Supported (medium: written commitments, quotes, independent data), Assumption (weak or none). Treat Assumption as unproven, however confident the wording. Out-of-date evidence counts for less.
- Match the stage. A business that hasn't made a sale should be tested on whether anyone will pay. An established business should be tested on its numbers and what last year taught it.
- For every challenge, give the smallest, cheapest test the owner could run this week, with a clear pass mark.
- Never say or imply the business will or won't succeed, is investable, or is approved.
- Write in plain British English, to the owner as "you". Short sentences. No jargon; if a technical term helps, put the plain words first.`;

const CRITICAL_BOXES = ["customer_segments", "value_proposition", "revenue_streams", "cost_structure"];

export async function loadPlan(supabase: SupabaseClient, businessId: string) {
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

  const grades: Record<string, string> = {};
  for (const b of CANVAS_BOXES) {
    const answer = (canvas ?? []).find((c) => c.box === b.key)?.answer?.trim() ?? "";
    const items = (evidence ?? []).filter((e) => e.subject_key === b.key);
    grades[b.key] = gradeOf(!!answer, items as { strength: EvidenceStrength; evidence_date: string }[]);
  }

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
    const grade = grades[b.key];
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
  const { data: cyc } = await supabase.from("plan_cycles").select("id, start_date, end_date, runway_floor_months").eq("business_id", businessId).order("start_date", { ascending: false }).limit(1).maybeSingle();
  if (cyc) {
    const [{ data: bt }, { data: dm }, { data: fl }, { data: rk }, { data: qp }] = await Promise.all([
      supabase.from("must_win_battles").select("number, title, winning_looks_like, kpi, target, deadline, answers_diagnosis, owner_role_id").eq("plan_cycle_id", cyc.id).order("number"),
      supabase.from("demand_sources").select("source, starts_paying, ends_or_renews, monthly_value, confidence, evidence").eq("plan_cycle_id", cyc.id),
      supabase.from("financial_lines").select("scenario, measure, value").eq("plan_cycle_id", cyc.id).eq("forecast_version", 0),
      supabase.from("risks").select("risk, early_warning, response, likelihood, impact, status").eq("business_id", businessId),
      supabase.from("quarterly_priorities").select("quarter_start, number, objective, due_date, owner_role_id").eq("business_id", businessId).order("quarter_start").order("number"),
    ]);
    lines.push(`\nYEAR PLAN (${cyc.start_date} to ${cyc.end_date}; safety cushion ${cyc.runway_floor_months} months of fixed costs)`);
    lines.push("Must-Win Battles:");
    for (const x of bt ?? []) lines.push(`- ${x.number}. ${x.title}. Winning: ${x.winning_looks_like ?? "(empty)"} Measure: ${x.kpi ?? "(none)"}, target ${x.target ?? "(none)"}, by ${x.deadline ?? "(no date)"}. Owner: ${x.owner_role_id ? "set" : "none"}. Tackles the obstacle by: ${x.answers_diagnosis ?? "(empty)"}`);
    if (!(bt ?? []).length) lines.push("(none)");
    lines.push("Sources of sales (confirmed = signed or paid, likely = written commitment, speculative = hoped for):");
    for (const x of dm ?? []) lines.push(`- ${x.source}: ${x.monthly_value ?? "?"} ${cur} a month from ${x.starts_paying ?? "?"} to ${x.ends_or_renews ?? "open"} [${x.confidence}]. ${x.evidence ?? ""}`);
    if (!(dm ?? []).length) lines.push("(none)");
    lines.push("Numbers for the year (budget = likely, commit = promise, stretch = possible):");
    for (const x of fl ?? []) lines.push(`- ${x.scenario} ${x.measure}: ${x.value} ${cur}`);
    if (!(fl ?? []).length) lines.push("(none)");
    lines.push("Risks:");
    for (const x of rk ?? []) lines.push(`- ${x.risk} [chance ${x.likelihood}, damage ${x.impact}, ${x.status}]. Early sign: ${x.early_warning ?? "(none)"}. Response: ${x.response ?? "(none)"}`);
    if (!(rk ?? []).length) lines.push("(none)");
    lines.push("Quarterly priorities:");
    for (const x of qp ?? []) lines.push(`- Quarter from ${x.quarter_start}, ${x.number}. ${x.objective}${x.due_date ? `, due ${x.due_date}` : ""}. Owner: ${x.owner_role_id ? "set" : "none"}`);
    if (!(qp ?? []).length) lines.push("(none)");
  }
  return { text: lines.join("\n"), grades };
}

function computedChecks(grades: Record<string, string>): CheckResult[] {
  const weak = CRITICAL_BOXES.filter((k) => !["proven", "supported"].includes(grades[k]));
  const names = weak.map((k) => CANVAS_PLAIN[k]?.question ?? k);
  return [
    {
      id: "critical_supported",
      result: weak.length ? "no" : "yes",
      quote: "",
      reason: weak.length ? `Still unproven: ${names.join("; ")}.` : "Every critical claim has at least medium evidence.",
    },
  ];
}

export async function runCheckpointReview(supabase: SupabaseClient, businessId: string) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("The AI review isn't switched on yet: the API key is missing.");
  const { text, grades } = await loadPlan(supabase, businessId);
  const checkList = AI_CHECKS.map((c, i) => `${i + 1}. [${c.id}] ${c.question}`).join("\n");
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 6000,
    system: SYSTEM,
    output_config: { effort: "medium", format: { type: "json_schema", schema: CHECKPOINT_SCHEMA } },
    messages: [{ role: "user", content: `CHECKS TO ANSWER\n${checkList}\n\nTHE PLAN\n${text}` }],
  });
  const raw = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  const content = JSON.parse(raw) as CheckpointReview;
  // Every check gets an answer: anything the AI skipped counts as not met.
  const answered = new Map((content.checks ?? []).map((c) => [c.id, c]));
  const all: CheckResult[] = [];
  for (const c of CHECKS) {
    if (c.computed) continue;
    all.push(answered.get(c.id) ?? { id: c.id, result: "no", quote: "", reason: "Not assessed." });
  }
  content.checks = [...computedChecks(grades), ...all];
  content.version = REVIEWER_VERSION;
  return { content, model: msg.model, input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens };
}

export function tally(checks: CheckResult[] = []) {
  const byId = new Map(checks.map((c) => [c.id, c]));
  const crit = CHECKS.filter((c) => c.critical);
  const rest = CHECKS.filter((c) => !c.critical);
  const pass = (list: Check[]) => list.filter((c) => byId.get(c.id)?.result === "yes").length;
  return { critPassed: pass(crit), critTotal: crit.length, restPassed: pass(rest), restTotal: rest.length };
}
