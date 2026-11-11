import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Notice from "@/components/Notice";
import {
  savePlanYear,
  saveBattle,
  removeBattle,
  addDemand,
  addRisk,
  updateRisk,
  removeYearRow,
  saveNumbers,
  pasteYearRows,
} from "../actions";

type Battle = {
  id: string;
  number: number;
  title: string;
  winning_looks_like: string | null;
  kpi: string | null;
  target: string | null;
  deadline: string | null;
  owner_role_id: string | null;
  answers_diagnosis: string | null;
  status: string;
};

const BATTLE_STATUS: Record<string, { label: string; tone: string }> = {
  on_track: { label: "On track", tone: "go" },
  at_risk: { label: "At risk", tone: "wait" },
  off_track: { label: "Off track", tone: "stop" },
  won: { label: "Won", tone: "go" },
  lost: { label: "Lost", tone: "stop" },
};
const CONF: Record<string, { label: string; tone: string }> = {
  confirmed: { label: "Confirmed", tone: "go" },
  likely: { label: "Likely", tone: "wait" },
  speculative: { label: "Hoped for", tone: "stop" },
};
const LEVEL: Record<string, string> = { high: "High", medium: "Medium", low: "Low" };
const CASES = [
  { key: "budget", label: "Likely", help: "What you honestly expect" },
  { key: "commit", label: "Promise", help: "What you'd stake your name on" },
  { key: "stretch", label: "Possible", help: "If most things go right" },
];
const LINES = [
  { key: "revenue", label: "Sales for the year", help: "Everything customers pay you" },
  { key: "direct_costs", label: "Costs that rise with sales", help: "What it costs to deliver what you sell" },
  { key: "overheads", label: "Fixed running costs", help: "Pay, rent, software and other costs you carry whatever you sell" },
];

function day(iso: string | null) {
  return iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";
}
function monthsBetween(a: string, b: string) {
  const x = new Date(`${a}T00:00:00Z`);
  const y = new Date(`${b}T00:00:00Z`);
  return Math.max(0, (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + y.getUTCMonth() - x.getUTCMonth() + (y.getUTCDate() >= x.getUTCDate() ? 1 : 0));
}

function PasteBox({ id, cycle, kind, columns, back }: { id: string; cycle: string; kind: string; columns: string; back: string }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer font-semibold">Paste several at once</summary>
      <form action={pasteYearRows} className="mt-2 space-y-2">
        <input type="hidden" name="business_id" value={id} />
        <input type="hidden" name="plan_cycle_id" value={cycle} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="return_to" value={back} />
        <p className="hint">
          Copy the rows from a table in a document or spreadsheet and paste them here. One per line, columns in this
          order: {columns}.
        </p>
        <textarea className="input min-h-28 font-mono text-xs" name="rows" required aria-label="Rows to add" />
        <button className="btn btn-secondary">Add these</button>
      </form>
    </details>
  );
}

export default async function YearPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; session?: string }>;
}) {
  const { id } = await params;
  const { error, saved, session } = await searchParams;
  const supabase = await createClient();
  const back = `/b/${id}/year${session ? `?session=${session}` : ""}`;

  const [{ data: biz }, { data: cycles }, { data: diag }, { data: roles }, { data: risks }, { data: lookback }] = await Promise.all([
    supabase.from("businesses").select("stage, currency").eq("id", id).single(),
    supabase.from("plan_cycles").select("*").eq("business_id", id).order("start_date", { ascending: false }).limit(1),
    supabase.from("diagnoses").select("diagnosis, guiding_policy").eq("business_id", id).eq("is_current", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("roles").select("id, name, filled_by").eq("business_id", id).eq("active", true).order("created_at"),
    supabase.from("risks").select("*").eq("business_id", id).order("updated_at"),
    supabase.from("lookbacks").select("period_label, biggest_lesson").eq("business_id", id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const cycle = cycles?.[0];
  const cur = biz?.currency || "GBP";
  const launch = biz?.stage === "launch";
  const money = (n: number | null | undefined) =>
    n === null || n === undefined || !Number.isFinite(n) ? "–" : new Intl.NumberFormat("en-GB", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n);

  const [{ data: battles }, { data: demand }, { data: lines }] = cycle
    ? await Promise.all([
        supabase.from("must_win_battles").select("*").eq("plan_cycle_id", cycle.id).order("number"),
        supabase.from("demand_sources").select("*").eq("plan_cycle_id", cycle.id).order("starts_paying", { nullsFirst: false }),
        supabase.from("financial_lines").select("scenario, measure, value").eq("plan_cycle_id", cycle.id).eq("forecast_version", 0),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const bs = (battles ?? []) as Battle[];
  const freeNumbers = [1, 2, 3].filter((n) => !bs.some((b) => b.number === n));
  const val = (scenario: string, measure: string) => {
    const v = (lines ?? []).find((l) => l.scenario === scenario && l.measure === measure)?.value;
    return v === undefined || v === null ? null : Number(v);
  };

  // Demand: value inside the plan year, by confidence
  const yearValue = (d: { starts_paying: string | null; ends_or_renews: string | null; monthly_value: number | null }) => {
    if (!cycle || !d.monthly_value) return 0;
    const from = d.starts_paying && d.starts_paying > cycle.start_date ? d.starts_paying : cycle.start_date;
    const to = d.ends_or_renews && d.ends_or_renews < cycle.end_date ? d.ends_or_renews : cycle.end_date;
    return from > to ? 0 : monthsBetween(from, to) * Number(d.monthly_value);
  };
  const demandTotal = (c: string) => (demand ?? []).filter((d) => d.confidence === c).reduce((t, d) => t + yearValue(d), 0);
  const confirmed = demandTotal("confirmed");
  const likely = demandTotal("likely");
  const hoped = demandTotal("speculative");

  // Numbers
  const opening = val("budget", "opening_cash");
  const funding = val("budget", "funding_in") ?? 0;
  const calc = (s: string) => {
    const rev = val(s, "revenue");
    const dc = val(s, "direct_costs");
    const oh = val(s, "overheads");
    if (rev === null || dc === null || oh === null) return null;
    const gross = rev - dc;
    const profit = gross - oh;
    return { rev, dc, oh, gross, grossPct: rev ? (gross / rev) * 100 : null, profit, profitPct: rev ? (profit / rev) * 100 : null, closing: opening === null ? null : opening + funding + profit };
  };
  const results = Object.fromEntries(CASES.map((c) => [c.key, calc(c.key)]));
  const b = results.budget;
  const c = results.commit;
  // Stress test: sales land at the promise, fixed costs stay as planned
  const stress =
    b && c
      ? (() => {
          const dc = b.rev ? (b.dc / b.rev) * c.rev : c.dc;
          const profit = c.rev - dc - b.oh;
          const closing = opening === null ? null : opening + funding + profit;
          const monthly = b.oh / 12;
          const months = closing === null || !monthly ? null : closing / monthly;
          return { profit, closing, months };
        })()
      : null;
  const floor = Number(cycle?.runway_floor_months ?? 3);
  const budgetRev = val("budget", "revenue");

  const pct = (n: number | null | undefined) => (n === null || n === undefined ? "–" : `${n.toFixed(0)}%`);

  return (
    <div className="max-w-5xl">
      <Notice error={error} saved={saved} />
      {session && (
        <p className="mb-4 rounded border border-[var(--line)] bg-white p-3 text-sm">
          You&apos;re in a planning session.{" "}
          <Link href={`/b/${id}/s/${session}`} className="font-semibold underline underline-offset-4">Back to the session</Link>
        </p>
      )}
      <p className="hint">Part 5</p>
      <h1 className="text-4xl font-bold leading-none sm:text-5xl">This year</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">
        The year in four decisions: the few battles you must win, where the money will come from, what the numbers look
        like in three cases, and what could go wrong.
      </p>

      {/* Plan year */}
      <section className="card mt-6 p-5">
        <h2 className="display text-xl font-bold">The plan year</h2>
        <form action={savePlanYear} className="mt-3 grid gap-4 sm:grid-cols-[1fr_12rem_12rem_auto] sm:items-end">
          <input type="hidden" name="business_id" value={id} />
          <input type="hidden" name="return_to" value={back} />
          {cycle && <input type="hidden" name="id" value={cycle.id} />}
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input className="input" id="name" name="name" defaultValue={cycle?.name ?? ""} placeholder="2027 plan" />
          </div>
          <div>
            <label className="label" htmlFor="start_date">Starts</label>
            <input className="input" id="start_date" name="start_date" type="date" required defaultValue={cycle?.start_date ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="runway_floor_months">Cash floor (months)</label>
            <input className="input" id="runway_floor_months" name="runway_floor_months" inputMode="decimal" defaultValue={cycle?.runway_floor_months ?? 3} />
          </div>
          <button className={cycle ? "btn btn-secondary" : "btn"}>{cycle ? "Save" : "Set the plan year"}</button>
        </form>
        <p className="hint mt-2">
          {cycle
            ? `Runs ${day(cycle.start_date)} to ${day(cycle.end_date)}. The cash floor is the months of fixed costs you never want to drop below.`
            : "Pick the day the 12 months start. The cash floor is the months of fixed costs you never want to drop below."}
        </p>
      </section>

      {!cycle ? (
        <p className="mt-6 text-[var(--muted)]">Set the plan year to open the rest of this page.</p>
      ) : (
        <>
          {!launch && (
            <section className="card mt-6 p-5">
              <h2 className="display text-xl font-bold">What last year taught you</h2>
              {lookback?.biggest_lesson ? (
                <p className="mt-2">
                  {lookback.biggest_lesson} <span className="hint">({lookback.period_label})</span>
                </p>
              ) : (
                <p className="hint mt-2">Not done yet. Last year&apos;s misses should shape this year&apos;s plan.</p>
              )}
              <Link className="mt-3 inline-block text-sm underline underline-offset-4" href={`/b/${id}/s/launch_path`}>
                {lookback?.biggest_lesson ? "Open the look-back" : "Do the look-back"}
              </Link>
            </section>
          )}

          {/* Battles */}
          <section id="battles" className="mt-10">
            <h2 className="display text-2xl font-bold">Must-Win Battles</h2>
            <p className="hint max-w-2xl">
              Up to three. If you lost one of these, the year would fail whatever else went well. Each one should answer
              the obstacle you named in your diagnosis.
            </p>
            <div className="mt-3 rounded border-l-4 border-[var(--wait)] bg-white p-4 text-sm">
              <p className="font-semibold">Your biggest obstacle</p>
              <p className="mt-1">{diag?.diagnosis || "Not written yet."}</p>
              {diag?.guiding_policy && <p className="mt-2 text-[var(--muted)]">Your approach: {diag.guiding_policy}</p>}
              {!diag?.diagnosis && (
                <Link className="mt-2 inline-block underline underline-offset-4" href={`/b/${id}/diagnosis`}>Write the diagnosis first</Link>
              )}
            </div>

            <div className="mt-4 space-y-3">
              {bs.map((x) => (
                <details key={x.id} className="card p-0">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 p-4">
                    <span className="display text-3xl font-bold text-[var(--muted)]">{x.number}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-lg font-semibold leading-snug">{x.title}</span>
                      <span className="hint block">
                        {[x.kpi && x.target ? `${x.kpi}: ${x.target}` : x.kpi || x.target, x.deadline ? `by ${day(x.deadline)}` : "", roles?.find((r) => r.id === x.owner_role_id)?.name]
                          .filter(Boolean)
                          .join(", ") || "No measure or deadline yet"}
                      </span>
                    </span>
                    <span className="tag" data-tone={BATTLE_STATUS[x.status]?.tone}>{BATTLE_STATUS[x.status]?.label}</span>
                  </summary>
                  <div className="border-t border-[var(--line)] p-4">
                    <BattleForm id={id} cycle={cycle.id} back={back} number={x.number} battle={x} roles={roles ?? []} />
                    <form action={removeBattle} className="mt-3">
                      <input type="hidden" name="business_id" value={id} />
                      <input type="hidden" name="id" value={x.id} />
                      <input type="hidden" name="return_to" value={back} />
                      <button className="text-sm text-[var(--muted)] underline underline-offset-4">Remove this battle</button>
                    </form>
                  </div>
                </details>
              ))}
            </div>

            {freeNumbers.length > 0 ? (
              <details className="card mt-3 p-0" open={bs.length === 0}>
                <summary className="cursor-pointer p-4 font-semibold">Add battle {freeNumbers[0]}</summary>
                <div className="border-t border-[var(--line)] p-4">
                  <BattleForm id={id} cycle={cycle.id} back={back} number={freeNumbers[0]} roles={roles ?? []} />
                  <PasteBox id={id} cycle={cycle.id} kind="battles" back={back} columns="battle, what winning looks like, measure, target, deadline" />
                </div>
              </details>
            ) : (
              <p className="hint mt-3">Three is the limit. To add another, remove one: more than three means none of them is a must.</p>
            )}
          </section>

          {/* Demand map */}
          <section id="demand" className="mt-12">
            <h2 className="display text-2xl font-bold">{launch ? "Where the first sales will come from" : "Where the sales will come from"}</h2>
            <p className="hint max-w-2xl">
              List each customer, contract or source of sales, and be honest about how sure it is. Confirmed means signed
              or paid. Likely means a written commitment. Hoped for means everything else.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              {[
                { label: "Confirmed", v: confirmed, tone: "var(--go)" },
                { label: "Likely", v: likely, tone: "var(--wait)" },
                { label: "Hoped for", v: hoped, tone: "var(--stop)" },
              ].map((t) => (
                <div key={t.label} className="card p-4" style={{ borderLeft: `6px solid ${t.tone}` }}>
                  <p className="display text-2xl font-bold">{money(t.v)}</p>
                  <p className="text-sm font-semibold">{t.label}</p>
                </div>
              ))}
              <div className="card p-4">
                <p className="display text-2xl font-bold">{budgetRev ? pct(((confirmed + likely) / budgetRev) * 100) : "–"}</p>
                <p className="text-sm font-semibold">of likely sales covered</p>
                <p className="hint">Confirmed plus likely, against your likely case</p>
              </div>
            </div>

            {(demand ?? []).length > 0 && (
              <div className="card mt-4 overflow-x-auto p-0">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="text-left text-[var(--muted)]">
                      <th className="px-4 py-2 font-medium">Source</th>
                      <th className="px-2 py-2 font-medium">Pays from</th>
                      <th className="px-2 py-2 font-medium">Until</th>
                      <th className="px-2 py-2 text-right font-medium">A month</th>
                      <th className="px-2 py-2 text-right font-medium">This year</th>
                      <th className="px-2 py-2 font-medium">How sure</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {(demand ?? []).map((d) => (
                      <tr key={d.id} className="border-t border-[var(--line)] align-top">
                        <td className="px-4 py-3">
                          <span className="font-semibold">{d.source}</span>
                          <span className="hint block">
                            {d.source_type === "existing" ? "Existing customer" : d.source_type === "renewal" ? "Renewal" : "New"}
                            {d.evidence ? `. ${d.evidence}` : ""}
                          </span>
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap">{day(d.starts_paying) || "–"}</td>
                        <td className="px-2 py-3 whitespace-nowrap">{day(d.ends_or_renews) || "–"}</td>
                        <td className="px-2 py-3 text-right whitespace-nowrap">{money(d.monthly_value)}</td>
                        <td className="px-2 py-3 text-right whitespace-nowrap">{money(yearValue(d))}</td>
                        <td className="px-2 py-3"><span className="tag" data-tone={CONF[d.confidence]?.tone}>{CONF[d.confidence]?.label}</span></td>
                        <td className="px-4 py-3 text-right">
                          <form action={removeYearRow}>
                            <input type="hidden" name="business_id" value={id} />
                            <input type="hidden" name="table" value="demand_sources" />
                            <input type="hidden" name="id" value={d.id} />
                            <input type="hidden" name="return_to" value={back} />
                            <button className="text-[var(--muted)] underline underline-offset-4" aria-label={`Remove ${d.source}`}>Remove</button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <details className="card mt-3 p-0" open={(demand ?? []).length === 0}>
              <summary className="cursor-pointer p-4 font-semibold">Add a source of sales</summary>
              <div className="border-t border-[var(--line)] p-4">
                <form action={addDemand} className="space-y-4">
                  <input type="hidden" name="business_id" value={id} />
                  <input type="hidden" name="plan_cycle_id" value={cycle.id} />
                  <input type="hidden" name="return_to" value={back} />
                  <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
                    <div>
                      <label className="label" htmlFor="source">Customer, contract or source</label>
                      <input className="input" id="source" name="source" required />
                    </div>
                    <div>
                      <label className="label" htmlFor="source_type">Type</label>
                      <select className="input" id="source_type" name="source_type" defaultValue="new">
                        <option value="new">New</option>
                        <option value="existing">Existing customer</option>
                        <option value="renewal">Renewal</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-4">
                    <div>
                      <label className="label" htmlFor="starts_paying">Pays from</label>
                      <input className="input" id="starts_paying" name="starts_paying" type="date" />
                    </div>
                    <div>
                      <label className="label" htmlFor="ends_or_renews">Ends or renews</label>
                      <input className="input" id="ends_or_renews" name="ends_or_renews" type="date" />
                    </div>
                    <div>
                      <label className="label" htmlFor="monthly_value">Worth a month ({cur})</label>
                      <input className="input" id="monthly_value" name="monthly_value" inputMode="decimal" />
                    </div>
                    <div>
                      <label className="label" htmlFor="confidence">How sure</label>
                      <select className="input" id="confidence" name="confidence" defaultValue="speculative">
                        <option value="confirmed">Confirmed: signed or paid</option>
                        <option value="likely">Likely: written commitment</option>
                        <option value="speculative">Hoped for</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="label" htmlFor="evidence">What makes you say that</label>
                    <input className="input" id="evidence" name="evidence" />
                  </div>
                  <button className="btn">Add source</button>
                </form>
                <PasteBox id={id} cycle={cycle.id} kind="demand" back={back} columns="source, type (new, existing or renewal), pays from, worth a month, ends or renews, how sure (confirmed, likely or speculative), evidence" />
              </div>
            </details>
          </section>

          {/* Numbers */}
          <section id="numbers" className="mt-12">
            <h2 className="display text-2xl font-bold">The numbers, in three cases</h2>
            <p className="hint max-w-2xl">
              Totals for the whole plan year. Likely is your honest forecast. Promise is the lower figure you&apos;d commit
              to. Possible is what happens if most things go right. The gap between them shows how much you&apos;re
              relying on luck.
            </p>
            <form action={saveNumbers} className="card mt-4 overflow-x-auto p-0">
              <input type="hidden" name="business_id" value={id} />
              <input type="hidden" name="plan_cycle_id" value={cycle.id} />
              <input type="hidden" name="month" value={cycle.start_date} />
              <input type="hidden" name="return_to" value={`${back}#numbers`} />
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="px-4 py-3 font-medium text-[var(--muted)]">{cur}</th>
                    {CASES.map((k) => (
                      <th key={k.key} className="px-2 py-3">
                        <span className="display text-lg font-bold">{k.label}</span>
                        <span className="hint block font-normal">{k.help}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {LINES.map((l) => (
                    <tr key={l.key} className="border-t border-[var(--line)]">
                      <td className="px-4 py-3">
                        <span className="font-semibold">{l.label}</span>
                        <span className="hint block">{l.help}</span>
                      </td>
                      {CASES.map((k) => (
                        <td key={k.key} className="px-2 py-3">
                          <input className="input" name={`n_${k.key}_${l.key}`} inputMode="decimal" aria-label={`${l.label}, ${k.label}`} defaultValue={val(k.key, l.key) ?? ""} />
                        </td>
                      ))}
                    </tr>
                  ))}
                  {[
                    { label: "Left after delivery costs", f: (r: NonNullable<ReturnType<typeof calc>>) => `${money(r.gross)} (${pct(r.grossPct)})` },
                    { label: "Profit before tax and interest", f: (r: NonNullable<ReturnType<typeof calc>>) => `${money(r.profit)} (${pct(r.profitPct)})` },
                    { label: "Cash at year end", f: (r: NonNullable<ReturnType<typeof calc>>) => money(r.closing) },
                  ].map((row) => (
                    <tr key={row.label} className="border-t border-[var(--line)] bg-[var(--paper)]">
                      <td className="px-4 py-3 font-semibold">{row.label}</td>
                      {CASES.map((k) => {
                        const r = results[k.key];
                        return (
                          <td key={k.key} className={`px-2 py-3 font-semibold ${r && r.profit < 0 && row.label.startsWith("Profit") ? "text-[var(--stop)]" : ""}`}>
                            {r ? row.f(r) : "–"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="grid gap-4 border-t border-[var(--line)] p-4 sm:grid-cols-[14rem_14rem_1fr] sm:items-end">
                <div>
                  <label className="label" htmlFor="opening_cash">Cash at the start ({cur})</label>
                  <input className="input" id="opening_cash" name="n_budget_opening_cash" inputMode="decimal" defaultValue={opening ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="funding_in">New money coming in ({cur})</label>
                  <input className="input" id="funding_in" name="n_budget_funding_in" inputMode="decimal" defaultValue={val("budget", "funding_in") ?? ""} />
                </div>
                <p className="hint">Loans, investment or your own money put in during the year. Leave blank if none.</p>
              </div>
              <div className="border-t border-[var(--line)] p-4">
                <button className="btn">Save the numbers</button>
              </div>
            </form>

            {stress && (
              <div className="card mt-3 p-5" style={{ borderLeft: `6px solid ${stress.months !== null && stress.months < floor ? "var(--stop)" : stress.profit < 0 ? "var(--wait)" : "var(--go)"}` }}>
                <h3 className="font-semibold">Stress test: sales only reach the promise, fixed costs stay as planned</h3>
                <p className="mt-1">
                  Profit would be <strong>{money(stress.profit)}</strong>
                  {stress.closing !== null && (
                    <>
                      , leaving <strong>{money(stress.closing)}</strong> in cash at year end
                      {stress.months !== null && (
                        <>
                          , which covers <strong>{stress.months.toFixed(1)} months</strong> of fixed costs against your floor of {floor}
                        </>
                      )}
                    </>
                  )}
                  .
                </p>
                {stress.months !== null && stress.months < floor && (
                  <p className="mt-2 font-semibold text-[var(--stop)]">That is below your cash floor. Cut fixed costs, raise more money, or lower what you commit to spend until sales are confirmed.</p>
                )}
                <p className="hint mt-2">A rough whole-year check. It doesn&apos;t show a mid-year dip, when cash can run short before sales arrive.</p>
              </div>
            )}
          </section>

          {/* Team */}
          <section id="team" className="mt-12">
            <h2 className="display text-2xl font-bold">Who will deliver it</h2>
            <div className="card mt-3 flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-sm">
                {(roles ?? []).length
                  ? `${roles!.length} role${roles!.length > 1 ? "s" : ""} set up, ${roles!.filter((r) => !r.filled_by).length} vacant. Every battle needs a role that owns it.`
                  : "No roles yet. Every battle needs a role that owns it."}
              </p>
              <Link className="btn btn-secondary" href={`/b/${id}/team`}>Open roles and team</Link>
            </div>
          </section>

          {/* Risks */}
          <section id="risks" className="mt-12">
            <h2 className="display text-2xl font-bold">What could go wrong</h2>
            <p className="hint max-w-2xl">
              For each risk, write the early sign that it&apos;s starting and what you&apos;ll do when you see it. Deciding
              now is easier than deciding in the middle of it.
            </p>
            <div className="mt-4 space-y-3">
              {(risks ?? []).map((r) => (
                <article key={r.id} className="card p-4">
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                    <h3 className="min-w-0 flex-1 font-semibold">{r.risk}</h3>
                    <span className="tag" data-tone={r.likelihood === "high" ? "stop" : r.likelihood === "medium" ? "wait" : "quiet"}>{LEVEL[r.likelihood ?? "medium"]} chance</span>
                    <span className="tag" data-tone={r.impact === "high" ? "stop" : r.impact === "medium" ? "wait" : "quiet"}>{LEVEL[r.impact ?? "medium"]} damage</span>
                    {r.status !== "watching" && <span className="tag" data-tone={r.status === "triggered" ? "stop" : "quiet"}>{r.status === "triggered" ? "Happening" : "Closed"}</span>}
                  </div>
                  <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="hint">Early sign</dt>
                      <dd>{r.early_warning || "Not written"}</dd>
                    </div>
                    <div>
                      <dt className="hint">What you&apos;ll do</dt>
                      <dd>{r.response || "Not written"}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm">
                    {[
                      { s: "triggered", label: "It's happening" },
                      { s: "watching", label: "Back to watching" },
                      { s: "closed", label: "Close it" },
                    ]
                      .filter((o) => o.s !== r.status)
                      .map((o) => (
                        <form key={o.s} action={updateRisk}>
                          <input type="hidden" name="business_id" value={id} />
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="status" value={o.s} />
                          <input type="hidden" name="return_to" value={back} />
                          <button className="underline underline-offset-4">{o.label}</button>
                        </form>
                      ))}
                    <form action={removeYearRow}>
                      <input type="hidden" name="business_id" value={id} />
                      <input type="hidden" name="table" value="risks" />
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="return_to" value={back} />
                      <button className="text-[var(--muted)] underline underline-offset-4">Remove</button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
            <details className="card mt-3 p-0" open={(risks ?? []).length === 0}>
              <summary className="cursor-pointer p-4 font-semibold">Add a risk</summary>
              <div className="border-t border-[var(--line)] p-4">
                <form action={addRisk} className="space-y-4">
                  <input type="hidden" name="business_id" value={id} />
                  <input type="hidden" name="return_to" value={back} />
                  <div>
                    <label className="label" htmlFor="risk">What could go wrong</label>
                    <input className="input" id="risk" name="risk" required />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="label" htmlFor="early_warning">The early sign</label>
                      <input className="input" id="early_warning" name="early_warning" />
                    </div>
                    <div>
                      <label className="label" htmlFor="response">What you&apos;ll do when you see it</label>
                      <input className="input" id="response" name="response" />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="label" htmlFor="likelihood">How likely</label>
                      <select className="input" id="likelihood" name="likelihood" defaultValue="medium">
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="impact">How much damage</label>
                      <select className="input" id="impact" name="impact" defaultValue="medium">
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                  </div>
                  <button className="btn">Add risk</button>
                </form>
                <PasteBox id={id} cycle={cycle.id} kind="risks" back={back} columns="risk, early sign, what you'll do, how likely (high, medium or low), how much damage (high, medium or low)" />
              </div>
            </details>
          </section>
        </>
      )}
    </div>
  );
}

function BattleForm({
  id,
  cycle,
  back,
  number,
  battle,
  roles,
}: {
  id: string;
  cycle: string;
  back: string;
  number: number;
  battle?: Battle;
  roles: { id: string; name: string }[];
}) {
  const p = `b${number}`;
  return (
    <form action={saveBattle} className="space-y-4">
      <input type="hidden" name="business_id" value={id} />
      <input type="hidden" name="plan_cycle_id" value={cycle} />
      <input type="hidden" name="number" value={number} />
      <input type="hidden" name="return_to" value={back} />
      <div>
        <label className="label" htmlFor={`${p}-title`}>The battle</label>
        <p className="hint mb-2">One line, starting with a verb. For example: win three trade customers.</p>
        <input className="input" id={`${p}-title`} name="title" required defaultValue={battle?.title ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor={`${p}-win`}>What winning looks like</label>
        <textarea className="input" id={`${p}-win`} name="winning_looks_like" rows={2} defaultValue={battle?.winning_looks_like ?? ""} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor={`${p}-kpi`}>The number that proves it</label>
          <input className="input" id={`${p}-kpi`} name="kpi" defaultValue={battle?.kpi ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor={`${p}-target`}>Target</label>
          <input className="input" id={`${p}-target`} name="target" defaultValue={battle?.target ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor={`${p}-deadline`}>By when</label>
          <input className="input" id={`${p}-deadline`} name="deadline" type="date" defaultValue={battle?.deadline ?? ""} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_14rem_12rem]">
        <div>
          <label className="label" htmlFor={`${p}-answers`}>How it tackles your obstacle</label>
          <input className="input" id={`${p}-answers`} name="answers_diagnosis" defaultValue={battle?.answers_diagnosis ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor={`${p}-owner`}>Owned by</label>
          <select className="input" id={`${p}-owner`} name="owner_role_id" defaultValue={battle?.owner_role_id ?? ""}>
            <option value="">No role yet</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        {battle && (
          <div>
            <label className="label" htmlFor={`${p}-status`}>Status</label>
            <select className="input" id={`${p}-status`} name="status" defaultValue={battle.status}>
              {Object.entries(BATTLE_STATUS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <button className="btn">{battle ? "Save battle" : "Add battle"}</button>
    </form>
  );
}
