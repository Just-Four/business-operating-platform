import { createClient } from "@/lib/supabase/server";
import { saveDirection } from "../actions";
import Notice from "@/components/Notice";

export default async function DirectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error, saved } = await searchParams;
  const supabase = await createClient();
  const [{ data }, { data: biz }] = await Promise.all([
    supabase.from("direction").select("*").eq("business_id", id).maybeSingle(),
    supabase.from("businesses").select("currency, stage").eq("id", id).single(),
  ]);
  const currency = biz?.currency ?? "GBP";

  return (
    <div className="max-w-3xl">
      <Notice error={error} saved={saved} />
      <p className="hint">Part 3</p>
      <h1 className="text-4xl font-bold leading-none sm:text-5xl">Direction</h1>
      <p className="mt-3 text-[var(--muted)]">
        Where the business is going over three horizons.
        {biz?.stage === "launch" ? " At launch stage, purpose and the 3–5 year targets are enough." : ""}
      </p>

      <form action={saveDirection} className="mt-6 space-y-4">
        <input type="hidden" name="business_id" value={id} />
        <div className="card p-4">
          <label className="label" htmlFor="purpose">Purpose</label>
          <p className="hint mb-2">Why the business exists, in one line.</p>
          <input className="input" id="purpose" name="purpose" defaultValue={data?.purpose ?? ""} />
        </div>

        <div className="card grid gap-4 p-4 sm:grid-cols-4">
          <div className="sm:col-span-3">
            <label className="label" htmlFor="long_term_target">Long-term target</label>
            <p className="hint mb-2">One bold, measurable goal, about 10 years out.</p>
            <input className="input" id="long_term_target" name="long_term_target" defaultValue={data?.long_term_target ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="long_term_year">By year</label>
            <p className="hint mb-2">&nbsp;</p>
            <input className="input" id="long_term_year" name="long_term_year" inputMode="numeric" defaultValue={data?.long_term_year ?? ""} />
          </div>
        </div>

        <div className="card p-4">
          <h3 className="font-semibold">3–5 year targets</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-4">
            <div>
              <label className="label" htmlFor="mid_term_year">By year</label>
              <input className="input" id="mid_term_year" name="mid_term_year" inputMode="numeric" defaultValue={data?.mid_term_year ?? ""} />
            </div>
            <div>
              <label className="label" htmlFor="mid_term_revenue">Revenue ({currency})</label>
              <input className="input" id="mid_term_revenue" name="mid_term_revenue" inputMode="numeric" defaultValue={data?.mid_term_revenue ?? ""} />
            </div>
            <div>
              <label className="label" htmlFor="mid_term_profit_pct">EBITDA (%)</label>
              <input className="input" id="mid_term_profit_pct" name="mid_term_profit_pct" inputMode="decimal" defaultValue={data?.mid_term_profit_pct ?? ""} />
            </div>
            <div>
              <label className="label" htmlFor="mid_term_size">Size</label>
              <input className="input" id="mid_term_size" name="mid_term_size" placeholder="e.g. 1,200 beds" defaultValue={data?.mid_term_size ?? ""} />
            </div>
          </div>
          <div className="mt-4">
            <label className="label" htmlFor="capabilities">Capabilities needed to get there</label>
            <p className="hint mb-2">Three, one per line.</p>
            <textarea className="input" id="capabilities" name="capabilities" rows={3} defaultValue={(data?.capabilities ?? []).join("\n")} />
          </div>
        </div>

        <p className="hint">The Must-Win Battles in Part 5 must move the business measurably towards these targets.</p>
        <button className="btn">Save direction</button>
      </form>
    </div>
  );
}
