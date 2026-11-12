import Link from "next/link";
import NextPart from "@/components/NextPart";
import { createClient } from "@/lib/supabase/server";
import { saveDirection } from "../actions";
import Notice from "@/components/Notice";
import { guidanceFor } from "@/lib/guidance";

export default async function DirectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; session?: string }>;
}) {
  const { id } = await params;
  const { error, saved, session } = await searchParams;
  const supabase = await createClient();
  const [{ data }, { data: biz }] = await Promise.all([
    supabase.from("direction").select("*").eq("business_id", id).maybeSingle(),
    supabase.from("businesses").select("currency, stage, model").eq("id", id).single(),
  ]);
  const currency = biz?.currency ?? "GBP";
  const guide = guidanceFor(biz?.model);

  return (
    <div className="max-w-3xl">
      <Notice error={error} saved={saved} />
      {session && (
        <p className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--wait)] bg-[var(--wait-tint)] p-3 text-sm">
          <span>You&apos;re working through this as part of your planning programme.</span>
          <Link href={`/b/${id}/s/${session}`} className="font-semibold underline underline-offset-4">Back to the session</Link>
        </p>
      )}
      <p className="hint">Stage 1: Plan, part 3 of 6</p>
      <h1 className="text-4xl font-bold leading-none sm:text-5xl">Direction</h1>
      <p className="mt-3 text-[var(--muted)]">
        Where the business is going over three horizons.
        {biz?.stage === "launch" ? " At launch stage, purpose and the 3–5 year targets are enough." : ""}
      </p>

      <form action={saveDirection} className="mt-6 space-y-4">
        <input type="hidden" name="business_id" value={id} />
          {session && <input type="hidden" name="return_to" value={`/b/${id}/direction?session=${session}`} />}
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
              <label className="label" htmlFor="mid_term_profit_pct">Profit margin (%)</label>
              <input className="input" id="mid_term_profit_pct" name="mid_term_profit_pct" inputMode="decimal" defaultValue={data?.mid_term_profit_pct ?? ""} />
            </div>
            <div>
              <label className="label" htmlFor="mid_term_size">Size</label>
              <input className="input" id="mid_term_size" name="mid_term_size" placeholder={guide.size} defaultValue={data?.mid_term_size ?? ""} />
            </div>
          </div>
          <div className="mt-4">
            <p className="label">Capabilities needed to get there</p>
            <p className="hint mb-2">The three things the business must be able to do well. One in each box.</p>
            <div className="space-y-3">
              {Array.from({ length: Math.max(3, (data?.capabilities ?? []).length) }, (_, i) => (
                <div key={i} className="grid grid-cols-[1.5rem_1fr] items-start gap-2">
                  <label htmlFor={`capability_${i}`} className="display pt-2 text-lg font-bold text-[var(--muted)]">
                    {i + 1}
                    <span className="sr-only"> capability</span>
                  </label>
                  <textarea className="input" id={`capability_${i}`} name="capabilities" rows={2} defaultValue={(data?.capabilities ?? [])[i] ?? ""} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="hint">Profit margin here means profit before tax and interest, as a share of sales, the same as in the year plan. The Must-Win Battles in the year plan must move the business measurably towards these targets.</p>
        <button className="btn">Save direction</button>
      </form>
      <NextPart businessId={id} slug="direction" />
    </div>
  );
}
