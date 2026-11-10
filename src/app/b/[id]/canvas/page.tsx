import { createClient } from "@/lib/supabase/server";
import { saveCanvas } from "../actions";
import Notice from "@/components/Notice";
import CanvasBoard from "@/components/CanvasBoard";

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
  const { data } = await supabase.from("canvas_boxes").select("box, answer, evidence").eq("business_id", id);
  const initial: Record<string, { answer: string; evidence: string }> = {};
  for (const r of data ?? []) initial[r.box] = { answer: r.answer ?? "", evidence: r.evidence ?? "" };

  return (
    <div>
      <Notice error={error} saved={saved} />
      <p className="hint">Part 1</p>
      <h1 className="text-4xl font-bold leading-none sm:text-5xl">Business model</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">
        What the business is and how it makes money, on one board. Start on the right with customers, work left to what
        it takes to serve them, then fill in the money along the bottom.
      </p>

      <div className="mt-8">
        <CanvasBoard businessId={id} initial={initial} action={saveCanvas} />
      </div>
    </div>
  );
}
