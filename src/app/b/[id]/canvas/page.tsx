import { createClient } from "@/lib/supabase/server";
import NextPart from "@/components/NextPart";
import { addEvidence, deleteEvidence, saveCanvas } from "../actions";
import Notice from "@/components/Notice";
import CanvasBoard from "@/components/CanvasBoard";
import { guidanceFor } from "@/lib/guidance";

export default async function CanvasPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error, saved } = await searchParams;
  const supabase = await createClient();
  const [{ data }, { data: evidence }, { data: biz }] = await Promise.all([
    supabase.from("canvas_boxes").select("box, answer").eq("business_id", id),
    supabase
      .from("evidence")
      .select("id, subject_key, kind, strength, summary, source, evidence_date, link")
      .eq("business_id", id)
      .eq("subject_type", "canvas")
      .order("evidence_date", { ascending: false }),
    supabase.from("businesses").select("model").eq("id", id).single(),
  ]);
  const guide = guidanceFor(biz?.model);
  const initial: Record<string, string> = {};
  for (const r of data ?? []) initial[r.box] = r.answer ?? "";

  return (
    <div>
      <Notice error={error} saved={saved} />
      <p className="hint">Stage 1: Plan, part 1 of 6</p>
      <h1 className="text-4xl font-bold leading-none sm:text-5xl">Business model</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">
        What the business is and how it makes money, on one board. Start on the right with customers, work left to what
        it takes to serve them, then fill in the money along the bottom. Back each box with evidence; anything left
        unproven becomes an assumption to test in the launch plan.
      </p>

      <div className="mt-8">
        <CanvasBoard
          businessId={id}
          initial={initial}
          evidence={evidence ?? []}
          examples={guide.canvas}
          action={saveCanvas}
          addEvidence={addEvidence}
          deleteEvidence={deleteEvidence}
        />
      </div>
      <NextPart businessId={id} slug="canvas" />
    </div>
  );
}
