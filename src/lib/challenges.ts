import type { SupabaseClient } from "@supabase/supabase-js";
import type { CheckpointReview } from "@/lib/ai";

// The challenges from the latest review, and how many still need an answer.
export type OpenChallenges = { reviewId: string; sessionKey: string; total: number; unanswered: number; criticalUnanswered: number };

export async function getOpenChallenges(supabase: SupabaseClient, businessId: string): Promise<OpenChallenges | null> {
  const { data } = await supabase
    .from("ai_reviews")
    .select("id, content, responses, session_key")
    .eq("business_id", businessId)
    .eq("kind", "checkpoint")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const challenges = ((data.content as CheckpointReview)?.challenges ?? []) as CheckpointReview["challenges"];
  const responses = (data.responses ?? {}) as Record<string, string>;
  const open = challenges.map((c, i) => ({ c, i })).filter(({ i }) => !responses[String(i)]);
  return {
    reviewId: data.id as string,
    sessionKey: (data.session_key as string) ?? "checkpoint_1",
    total: challenges.length,
    unanswered: open.length,
    criticalUnanswered: open.filter(({ c }) => c.severity === "critical").length,
  };
}

export type TestTask = { id: string; status: string; due_date: string | null; test_passed: boolean | null; result: string | null };

// The test tasks set from a review, by the number of the challenge each came from.
export async function getReviewTests(supabase: SupabaseClient, reviewId: string): Promise<Record<string, TestTask>> {
  const { data } = await supabase
    .from("tasks")
    .select("id, status, due_date, test_passed, result, source_challenge, created_at")
    .eq("source_review_id", reviewId)
    .eq("kind", "test")
    .neq("status", "cancelled")
    .order("created_at");
  const out: Record<string, TestTask> = {};
  for (const t of data ?? []) out[String(t.source_challenge)] = { id: t.id, status: t.status, due_date: t.due_date, test_passed: t.test_passed, result: t.result };
  return out;
}

type Ch = { area: string; problem: string; question: string; smallest_test: string };

// Each challenge becomes a task the moment the review is run. Open challenge tasks from an earlier review
// are cancelled, because the new review replaces it.
export async function createChallengeTasks(supabase: SupabaseClient, businessId: string, reviewId: string, challenges: Ch[], userId: string | null) {
  await supabase
    .from("tasks")
    .update({ status: "cancelled" })
    .eq("business_id", businessId)
    .eq("kind", "challenge")
    .neq("source_review_id", reviewId)
    .in("status", ["queued", "in_progress", "blocked"]);
  if (!challenges.length) return;
  await supabase.from("tasks").insert(
    challenges.map((c, i) => ({
      business_id: businessId,
      title: `Answer the review: ${c.area}`.slice(0, 140),
      detail: `${c.problem}\n\n${c.question}\n\nSmallest test: ${c.smallest_test}`,
      route: "person",
      status: "queued",
      source_review_id: reviewId,
      source_challenge: i,
      kind: "challenge",
      created_by: userId,
    }))
  );
}
