import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AI_MODEL } from "@/lib/ai";
import { MODELS } from "@/lib/framework";

export const CLAUDE_LABEL = "Claude";

const SYSTEM = `You are an AI team member doing one step of a business process for the owner. A person will check your result before anything else happens, so be accurate and easy to check rather than impressive.

Rules:
- Do exactly the step you are given. Produce the result it asks for, in the form it asks for, and meet the standard it states.
- Work only from what the owner gave you, the earlier steps' approved results, and (when you have a search tool) what you find on the web. Never invent a fact, name, number, date or source. If you cannot find something, write "Not found" against it.
- Say where each fact comes from: the owner's own words, an earlier step, or a web page (give the full address). Keep these apart. Anything you infer or estimate is labelled "Estimate" with the assumption behind it.
- Nothing you write is sent to anyone. Do not write as if you have contacted anyone or as if anything is agreed.
- Write in plain British English. Plain text only: no markdown symbols, no tables. Use short lines and simple lists with a dash.
- Finish with two short sections. First "Against the standard": one line for each part of the standard, saying met or not met and why. Then "Check these first": the weakest parts of your result that the person should verify.
- If the owner sent an earlier attempt back, fix exactly what they said and say in one line what you changed.`;

export type StepRun = { text: string; input_tokens: number; output_tokens: number; searches: number; model: string };

type TaskRow = {
  id: string;
  business_id: string;
  title: string;
  detail: string | null;
  process_run_id: string | null;
  process_step_id: string | null;
  step_seq: number | null;
  result: string | null;
  review_note: string | null;
  rejections: number;
};

// Does one step for a task using the AI key held on the server. Reads everything it needs from the task's run.
export async function runClaudeStep(supabase: SupabaseClient, taskId: string): Promise<StepRun> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("The API key is missing.");

  const { data: task } = await supabase
    .from("tasks")
    .select("id, business_id, title, detail, process_run_id, process_step_id, step_seq, result, review_note, rejections")
    .eq("id", taskId)
    .single<TaskRow>();
  if (!task) throw new Error("Task not found.");

  const [{ data: biz }, { data: boxes }] = await Promise.all([
    supabase.from("businesses").select("name, sector, model, country, currency").eq("id", task.business_id).single(),
    supabase.from("canvas_boxes").select("box, answer").eq("business_id", task.business_id).in("box", ["customer_segments", "value_proposition"]),
  ]);

  let canSearch = false;
  const lines: string[] = [];
  lines.push("THE BUSINESS");
  lines.push(`Name: ${biz?.name ?? "Unnamed"}`);
  if (biz?.sector) lines.push(`Sector: ${biz.sector}`);
  lines.push(`How it makes money: ${MODELS[biz?.model ?? "other"] ?? biz?.model}`);
  if (biz?.country) lines.push(`Country: ${biz.country}`);
  for (const [key, label] of [
    ["customer_segments", "Who the owner says pays"],
    ["value_proposition", "What the owner says it offers"],
  ] as const) {
    const a = (boxes ?? []).find((b) => b.box === key)?.answer?.trim();
    if (a) lines.push(`\n${label} (the owner's words):\n${a}`);
  }

  if (task.process_run_id) {
    const { data: run } = await supabase.from("process_runs").select("process_id, subject, brief, version").eq("id", task.process_run_id).single();
    const { data: proc } = run ? await supabase.from("processes").select("name, purpose, outcome").eq("id", run.process_id).single() : { data: null };
    if (proc) {
      lines.push("\nTHE PROCESS");
      lines.push(`Name: ${proc.name}`);
      if (proc.purpose) lines.push(`What it is for: ${proc.purpose}`);
      if (proc.outcome) lines.push(`The result the whole process must produce: ${proc.outcome}`);
    }
    if (run?.subject || run?.brief) {
      lines.push("\nTHIS RUN");
      if (run.subject) lines.push(`About: ${run.subject}`);
      if (run.brief) lines.push(`What the owner told you to start from:\n${run.brief}`);
    }
    if (task.process_step_id) {
      const { data: step } = await supabase.from("process_steps").select("can_search").eq("id", task.process_step_id).maybeSingle();
      canSearch = !!step?.can_search;
    }
    const { data: earlier } = await supabase
      .from("tasks")
      .select("title, result, step_seq")
      .eq("process_run_id", task.process_run_id)
      .eq("status", "done")
      .lt("step_seq", task.step_seq ?? 0)
      .order("step_seq");
    if (earlier?.length) {
      lines.push("\nWORK ALREADY DONE IN EARLIER STEPS (checked and approved by a person)");
      for (const e of earlier) lines.push(`\n${e.title}:\n${e.result ?? "(no result recorded)"}`);
    }
  }

  lines.push("\nYOUR STEP");
  lines.push(task.title);
  if (task.detail) lines.push(`\n${task.detail}`);
  if (task.rejections > 0 && task.review_note) {
    lines.push("\nYOUR EARLIER ATTEMPT WAS SENT BACK");
    lines.push(`What the person said:\n${task.review_note}`);
    if (task.result) lines.push(`\nYour earlier attempt:\n${task.result}`);
  }

  const client = new Anthropic();
  const tools: Anthropic.ToolUnion[] = canSearch ? [{ type: "web_search_20250305", name: "web_search", max_uses: 8 }] : [];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: lines.join("\n") }];

  let text = "";
  let input = 0;
  let output = 0;
  let searches = 0;
  let model: string = AI_MODEL;
  const pages = new Map<string, string>();
  let searchError: string | null = null;

  // A long search turn can pause; carry on up to a few times.
  for (let turn = 0; turn < 4; turn++) {
    const msg = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 5000,
      system: SYSTEM,
      output_config: { effort: "medium" },
      ...(tools.length ? { tools } : {}),
      messages,
    });
    model = msg.model;
    input += msg.usage.input_tokens;
    output += msg.usage.output_tokens;
    for (const block of msg.content) {
      if (block.type === "text") text += block.text;
      else if (block.type === "server_tool_use" && block.name === "web_search") searches += 1;
      else if (block.type === "web_search_tool_result") {
        if (Array.isArray(block.content)) {
          for (const r of block.content) if (r.type === "web_search_result") pages.set(r.url, r.title);
        } else {
          searchError = block.content.error_code;
        }
      }
    }
    if (msg.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: msg.content as Anthropic.ContentBlockParam[] });
  }

  text = text.trim();
  if (!text) throw new Error("Claude returned nothing for this step.");
  if (canSearch && searchError && pages.size === 0) {
    text += `\n\nNote: the web search did not work (${searchError}), so nothing here comes from the web.`;
  }
  if (pages.size) {
    const list = [...pages.entries()].slice(0, 15).map(([url, title]) => `- ${title}: ${url}`);
    text += `\n\nPages the search returned (for checking):\n${list.join("\n")}`;
  }
  return { text, input_tokens: input, output_tokens: output, searches, model };
}

// Runs in the background after the person clicks "Run with Claude". Records the result or the failure on the task.
export async function finishClaudeTask(supabase: SupabaseClient, businessId: string, taskId: string) {
  try {
    const r = await runClaudeStep(supabase, taskId);
    const { data: t } = await supabase.from("tasks").select("review_required, status").eq("id", taskId).single();
    if (!t || t.status !== "in_progress") return; // cancelled or changed while Claude was working
    const status = t.review_required ? "awaiting_review" : "done";
    const usage = `${r.input_tokens.toLocaleString("en-GB")} tokens in, ${r.output_tokens.toLocaleString("en-GB")} out${r.searches ? `, ${r.searches} web searches` : ""}`;
    await supabase.from("tasks").update({ status, result: r.text, review_note: null, updated_at: new Date().toISOString() }).eq("id", taskId);
    await supabase.from("task_events").insert({
      business_id: businessId,
      task_id: taskId,
      event: status === "awaiting_review" ? "result ready to check" : "done",
      actor: CLAUDE_LABEL,
      detail: `${usage}\n\n${r.text}`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Something went wrong.";
    await supabase
      .from("tasks")
      .update({ status: "failed", result: `Claude couldn't finish this step: ${message}`, updated_at: new Date().toISOString() })
      .eq("id", taskId)
      .eq("status", "in_progress");
    await supabase.from("task_events").insert({ business_id: businessId, task_id: taskId, event: "failed", actor: CLAUDE_LABEL, detail: message });
  }
}
