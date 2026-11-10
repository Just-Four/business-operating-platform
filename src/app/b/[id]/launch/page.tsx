import { createClient } from "@/lib/supabase/server";
import { ASSUMPTION_STATUSES, MILESTONE_STATUSES, label } from "@/lib/framework";
import {
  addAssumption,
  addMilestone,
  loadStandardMilestones,
  updateAssumption,
  updateMilestone,
} from "../actions";
import Notice from "@/components/Notice";

const statusColour: Record<string, string> = {
  proven: "bg-[#e5f4e4]",
  met: "bg-[#e5f4e4]",
  testing: "bg-[#f9eeda]",
  in_progress: "bg-[#f9eeda]",
  disproven: "bg-[#fbebeb]",
  missed: "bg-[#fbebeb]",
};

export default async function LaunchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error, saved } = await searchParams;
  const supabase = await createClient();
  const [{ data: assumptions }, { data: milestones }, { data: biz }] = await Promise.all([
    supabase.from("assumptions").select("*").eq("business_id", id).order("rank"),
    supabase.from("milestones").select("*").eq("business_id", id).order("sequence"),
    supabase.from("businesses").select("currency").eq("id", id).single(),
  ]);
  const currency = biz?.currency ?? "GBP";

  return (
    <div>
      <Notice error={error} saved={saved} />
      <p className="hint">Part 4</p>
      <h1 className="text-4xl font-bold leading-none sm:text-5xl">Launch plan</h1>
      <p className="mt-3 text-[var(--muted)] max-w-3xl">
        A new business plans against assumptions, not history. Test the riskiest first, and release more money only
        when a milestone is met. When milestone 6 is met, switch the stage to Early revenue.
      </p>

      <section className="mt-8">
        <h2 className="text-2xl font-bold">Assumptions, riskiest first</h2>
        <div className="mt-3 space-y-3">
          {(assumptions ?? []).map((a) => (
            <form key={a.id} action={updateAssumption} className={`card p-4 ${statusColour[a.status] ?? ""}`}>
              <input type="hidden" name="business_id" value={id} />
              <input type="hidden" name="id" value={a.id} />
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{a.rank}. {a.assumption}</p>
                  {a.why_it_matters && <p className="hint">Why it matters: {a.why_it_matters}</p>}
                  {a.test && <p className="hint">Test: {a.test}</p>}
                  {a.checkpoint_date && <p className="hint">Checkpoint: {a.checkpoint_date}</p>}
                </div>
                <div className="flex items-end gap-2">
                  <select className="input w-36" name="status" defaultValue={a.status}>
                    {ASSUMPTION_STATUSES.map((s) => (
                      <option key={s} value={s}>{label(s)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <input className="input" name="result" placeholder="Result of the test" defaultValue={a.result ?? ""} />
                <button className="btn btn-secondary">Update</button>
              </div>
            </form>
          ))}
          {(assumptions ?? []).length === 0 && <p className="hint">No assumptions yet.</p>}
        </div>

        <form action={addAssumption} className="card mt-4 grid gap-3 p-4 sm:grid-cols-2">
          <input type="hidden" name="business_id" value={id} />
          <div className="sm:col-span-2">
            <label className="label" htmlFor="assumption">New assumption</label>
            <input className="input" id="assumption" name="assumption" required placeholder="e.g. We can lease 3-bed houses for under 9,000 kr a month" />
          </div>
          <div>
            <label className="label" htmlFor="why_it_matters">Why it matters</label>
            <input className="input" id="why_it_matters" name="why_it_matters" />
          </div>
          <div>
            <label className="label" htmlFor="test">How we&apos;ll test it</label>
            <input className="input" id="test" name="test" />
          </div>
          <div>
            <label className="label" htmlFor="checkpoint_date">Checkpoint date</label>
            <input className="input" id="checkpoint_date" name="checkpoint_date" type="date" />
          </div>
          <div className="flex items-end">
            <button className="btn">Add assumption</button>
          </div>
        </form>
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Milestones to first revenue</h2>
          {(milestones ?? []).length === 0 && (
            <form action={loadStandardMilestones}>
              <input type="hidden" name="business_id" value={id} />
              <button className="btn btn-secondary">Load the six standard milestones</button>
            </form>
          )}
        </div>
        <p className="hint">Each milestone has a spend limit that can&apos;t be passed until the one before it is met.</p>
        <div className="mt-3 space-y-3">
          {(milestones ?? []).map((m) => (
            <form key={m.id} action={updateMilestone} className={`card p-4 ${statusColour[m.status] ?? ""}`}>
              <input type="hidden" name="business_id" value={id} />
              <input type="hidden" name="id" value={m.id} />
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[220px] flex-1">
                  <p className="font-medium">{m.sequence}. {m.name}</p>
                  {m.description && <p className="hint">{m.description}</p>}
                  {m.met_on && <p className="hint">Met on {m.met_on}</p>}
                </div>
                <div>
                  <label className="label">Due</label>
                  <input className="input w-40" name="due_date" type="date" defaultValue={m.due_date ?? ""} />
                </div>
                <div>
                  <label className="label">Spend limit ({currency})</label>
                  <input className="input w-36" name="spend_limit" inputMode="numeric" defaultValue={m.spend_limit ?? ""} />
                </div>
                <div>
                  <label className="label">Status</label>
                  <select className="input w-36" name="status" defaultValue={m.status}>
                    {MILESTONE_STATUSES.map((s) => (
                      <option key={s} value={s}>{label(s)}</option>
                    ))}
                  </select>
                </div>
                <button className="btn btn-secondary">Update</button>
              </div>
            </form>
          ))}
        </div>

        <form action={addMilestone} className="card mt-4 grid gap-3 p-4 sm:grid-cols-4">
          <input type="hidden" name="business_id" value={id} />
          <div className="sm:col-span-2">
            <label className="label" htmlFor="m_name">New milestone</label>
            <input className="input" id="m_name" name="name" required />
          </div>
          <div>
            <label className="label" htmlFor="m_due">Due</label>
            <input className="input" id="m_due" name="due_date" type="date" />
          </div>
          <div>
            <label className="label" htmlFor="m_spend">Spend limit ({currency})</label>
            <input className="input" id="m_spend" name="spend_limit" inputMode="numeric" />
          </div>
          <div className="sm:col-span-3">
            <label className="label" htmlFor="m_desc">What &quot;met&quot; means</label>
            <input className="input" id="m_desc" name="description" />
          </div>
          <div className="flex items-end">
            <button className="btn">Add milestone</button>
          </div>
        </form>
      </section>
    </div>
  );
}
