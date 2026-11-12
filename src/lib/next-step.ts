import type { SupabaseClient } from "@supabase/supabase-js";

// After a step of a process is finished: where the person should land next.
// The next step's task if there is one, otherwise the dashboard saying the run is finished.
export async function afterStepPath(supabase: SupabaseClient, businessId: string, taskId: string): Promise<string | null> {
  const { data: t } = await supabase.from("tasks").select("process_run_id").eq("id", taskId).maybeSingle();
  if (!t?.process_run_id) return null;
  const { data: open } = await supabase
    .from("tasks")
    .select("id")
    .eq("process_run_id", t.process_run_id)
    .not("status", "in", "(done,cancelled)")
    .order("created_at", { ascending: false })
    .limit(1);
  if (open?.[0]) return `/b/${businessId}/tasks?task=${open[0].id}&moved=1`;
  return `/b/${businessId}/dashboard?finished=${t.process_run_id}`;
}
