import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PARTS, STAGES, STATE_LABELS, type Stage } from "@/lib/framework";
import { updateStage } from "./actions";
import Notice from "@/components/Notice";

export default async function BusinessOverview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error, saved } = await searchParams;
  const supabase = await createClient();

  const [biz, canvas, diag, dir, assumptions, milestones] = await Promise.all([
    supabase.from("businesses").select("stage").eq("id", id).single(),
    supabase.from("canvas_boxes").select("answer").eq("business_id", id),
    supabase.from("diagnoses").select("diagnosis").eq("business_id", id).eq("is_current", true).maybeSingle(),
    supabase.from("direction").select("purpose, mid_term_year").eq("business_id", id).maybeSingle(),
    supabase.from("assumptions").select("status").eq("business_id", id),
    supabase.from("milestones").select("status").eq("business_id", id),
  ]);

  const stage = (biz.data?.stage ?? "launch") as Stage;
  const filled = (canvas.data ?? []).filter((c) => c.answer && String(c.answer).trim()).length;
  const proven = (assumptions.data ?? []).filter((a) => a.status === "proven").length;
  const met = (milestones.data ?? []).filter((m) => m.status === "met").length;

  const progress: Record<string, string> = {
    canvas: `${filled} of 9 boxes filled`,
    diagnosis: diag.data?.diagnosis ? "Written" : "Not written",
    direction: dir.data?.purpose ? `Set${dir.data.mid_term_year ? ` to ${dir.data.mid_term_year}` : ""}` : "Not set",
    launch: `${(assumptions.data ?? []).length} assumptions (${proven} proven) · ${met}/${(milestones.data ?? []).length} milestones met`,
  };

  return (
    <div>
      <Notice error={error} saved={saved} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Overview</h2>
          <p className="hint">Which parts of the framework are switched on depends on the stage.</p>
        </div>
        <form action={updateStage} className="flex items-end gap-2">
          <input type="hidden" name="business_id" value={id} />
          <div>
            <label className="label" htmlFor="stage">Stage</label>
            <select className="input" id="stage" name="stage" defaultValue={stage}>
              {Object.entries(STAGES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-secondary">Change stage</button>
        </form>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {PARTS.map((p) => {
          const state = p.stages[stage];
          return (
            <Link
              key={p.slug}
              href={`/b/${id}/${p.slug}`}
              className={`card block p-4 hover:border-[#2f5d50] ${state === "off" ? "opacity-50" : ""}`}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">
                  <span className="mr-2 text-[#8a8983]">{p.num}</span>
                  {p.title}
                </h3>
                <span className="rounded bg-[#f0efec] px-2 py-0.5 text-xs">{STATE_LABELS[state]}</span>
              </div>
              <p className="hint mt-1">{p.summary}</p>
              <p className="mt-2 text-sm font-medium">
                {p.built ? progress[p.slug] : "Screen coming in the next build"}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
