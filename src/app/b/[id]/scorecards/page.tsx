import Link from "next/link";
import NextPart from "@/components/NextPart";
import { createClient } from "@/lib/supabase/server";
import { addMeasure, saveReadings } from "../actions";
import Notice from "@/components/Notice";
import { weekStart, ragOf } from "@/lib/framework";

type Measure = {
  id: string;
  role_id: string | null;
  name: string;
  kind: string;
  unit: string | null;
  target: number | null;
  target_period: string;
  better_when: string;
  data_source: string | null;
};

const RAG_TONE: Record<string, string> = { green: "go", amber: "wait", red: "stop", none: "quiet" };
const RAG_LABEL: Record<string, string> = { green: "On target", amber: "Close", red: "Off target", none: "No reading" };

function shift(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function short(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
function fmt(n: number | null | undefined, unit?: string | null) {
  if (n === null || n === undefined) return "–";
  const v = Number(n).toLocaleString("en-GB", { maximumFractionDigits: 2 });
  if (!unit) return v;
  if (unit === "%") return `${v}%`;
  return unit.length <= 1 ? `${unit}${v}` : `${v} ${unit}`;
}

export default async function ScorecardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; week?: string; session?: string }>;
}) {
  const { id } = await params;
  const { error, saved, week: weekParam, session } = await searchParams;
  const week = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekStart(new Date(`${weekParam}T12:00:00Z`)) : weekStart();
  const weeks = [shift(week, -21), shift(week, -14), shift(week, -7), week];
  const supabase = await createClient();
  const [{ data: roles }, { data: measures }, { data: readings }] = await Promise.all([
    supabase.from("roles").select("id, name, filled_by").eq("business_id", id).eq("active", true).order("created_at"),
    supabase.from("measures").select("*").eq("business_id", id).eq("active", true).order("updated_at"),
    supabase.from("measure_readings").select("measure_id, period_start, value").eq("business_id", id).gte("period_start", shift(week, -1500)).lte("period_start", week),
  ]);
  const ms = (measures ?? []) as Measure[];
  const val = (m: string, w: string) => readings?.find((r) => r.measure_id === m && r.period_start === w)?.value as number | undefined;

  // Measures counted by the month, quarter or year have their own periods.
  const periodStart = (per: string, back = 0) => {
    const d = new Date(`${week}T00:00:00Z`);
    if (per === "month") return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1)).toISOString().slice(0, 10);
    if (per === "quarter") return new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3 - back * 3, 1)).toISOString().slice(0, 10);
    if (per === "year") return new Date(Date.UTC(d.getUTCFullYear() - back, 0, 1)).toISOString().slice(0, 10);
    return shift(week, -7 * back);
  };
  const periodLabel = (per: string, start: string) => {
    const d = new Date(`${start}T00:00:00Z`);
    if (per === "month") return d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
    if (per === "quarter") return `${d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })} quarter ${d.getUTCFullYear()}`;
    if (per === "year") return String(d.getUTCFullYear());
    return short(start);
  };
  const weekly = ms.filter((m) => m.target_period === "week");
  const longer = ms.filter((m) => m.target_period !== "week");
  const status = ms.map((m) => ({ m, rag: ragOf(val(m.id, periodStart(m.target_period)), m.target, m.better_when) }));
  const red = status.filter((s) => s.rag === "red");
  const amber = status.filter((s) => s.rag === "amber");
  const missing = status.filter((s) => s.rag === "none");
  const roleName = (rid: string | null) => roles?.find((r) => r.id === rid)?.name ?? "Whole business";

  const groups = [
    ...(roles ?? []).map((r) => ({ key: r.id, title: r.name, sub: r.filled_by || "Vacant", items: weekly.filter((m) => m.role_id === r.id) })),
    { key: "none", title: "Whole business", sub: "Not tied to one role", items: weekly.filter((m) => !m.role_id) },
  ].filter((g) => g.items.length);

  return (
    <div className="max-w-6xl">
      <Notice error={error} saved={saved} />
      {session && (
        <p className="mb-4 rounded border border-[var(--line)] bg-white p-3 text-sm">
          You&apos;re in a planning session.{" "}
          <Link href={`/b/${id}/s/${session}`} className="font-semibold underline underline-offset-4">Back to the session</Link>
        </p>
      )}
      <p className="hint">Stage 3: Run</p>
      <h1 className="text-4xl font-bold leading-none sm:text-5xl">Scorecards</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">
        A few numbers per role, checked every week. Lead measures are the activity you control. Lag measures are the
        results that follow. If a lead measure stays red, the result will follow it down.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link className="btn btn-secondary" href={`/b/${id}/scorecards?week=${shift(week, -7)}`}>Previous week</Link>
        <p className="display text-xl font-bold">Week starting {short(week)}</p>
        <Link className="btn btn-secondary" href={`/b/${id}/scorecards?week=${shift(week, 7)}`}>Next week</Link>
      </div>

      {ms.length > 0 && (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="card p-4" style={{ borderLeft: "6px solid var(--stop)" }}>
            <p className="display text-3xl font-bold">{red.length}</p>
            <p className="font-semibold">Off target</p>
            <p className="hint">{red.map((s) => s.m.name).join(", ") || "Nothing slipping"}</p>
          </div>
          <div className="card p-4" style={{ borderLeft: "6px solid var(--wait)" }}>
            <p className="display text-3xl font-bold">{amber.length}</p>
            <p className="font-semibold">Close to target</p>
            <p className="hint">{amber.map((s) => s.m.name).join(", ") || "None"}</p>
          </div>
          <div className="card p-4" style={{ borderLeft: "6px solid var(--line)" }}>
            <p className="display text-3xl font-bold">{missing.length}</p>
            <p className="font-semibold">Not entered yet</p>
            <p className="hint">
              {missing.length === 0
                ? "All in"
                : missing.length === ms.length
                  ? "Nothing entered yet. Type this week's numbers in the boxes below and save."
                  : `${missing.slice(0, 3).map((s) => `${s.m.name} (${roleName(s.m.role_id)})`).join(", ")}${missing.length > 3 ? `, and ${missing.length - 3} more` : ""}`}
            </p>
          </div>
        </div>
      )}

      {ms.length === 0 ? (
        <div className="card mt-6 p-4">
          <h2 className="font-semibold">No measures yet</h2>
          <p className="hint mt-1">
            Give each role two to four numbers. At least one should be a lead measure, something the role does every
            week that drives the result, such as calls made, proposals sent or orders shipped.
          </p>
        </div>
      ) : (
        <form action={saveReadings} className="mt-6 space-y-6">
          <input type="hidden" name="business_id" value={id} />
          <input type="hidden" name="period_start" value={week} />
          <input type="hidden" name="return_to" value={`/b/${id}/scorecards?week=${week}${session ? `&session=${session}` : ""}`} />
          {groups.map((g) => (
            <section key={g.key} className="card overflow-x-auto p-0">
              <div className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] p-4">
                <h2 className="display text-xl font-bold">{g.title}</h2>
                <span className="hint">{g.sub}</span>
              </div>
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-left text-[var(--muted)]">
                    <th className="px-4 py-2 font-medium">Measure</th>
                    <th className="px-2 py-2 font-medium">Target</th>
                    {weeks.slice(0, 3).map((w) => (
                      <th key={w} className="px-2 py-2 text-right font-medium">{short(w)}</th>
                    ))}
                    <th className="px-2 py-2 font-medium">This week</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((m) => {
                    const rag = ragOf(val(m.id, week), m.target, m.better_when);
                    return (
                      <tr key={m.id} className="border-t border-[var(--line)]">
                        <td className="px-4 py-3">
                          <span className="font-semibold">{m.name}</span>
                          <span className="hint block">
                            {m.kind === "lead" ? "Lead" : "Lag"}
                            {m.better_when === "lower" ? ", lower is better" : ""}
                            {m.data_source ? `, from ${m.data_source}` : ""}
                          </span>
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap">
                          {fmt(m.target, m.unit)}
                          <span className="hint"> a {m.target_period}</span>
                        </td>
                        {weeks.slice(0, 3).map((w) => {
                          const r = ragOf(val(m.id, w), m.target, m.better_when);
                          return (
                            <td key={w} className="px-2 py-3 text-right">
                              <span className="inline-flex items-center gap-1.5">
                                {fmt(val(m.id, w))}
                                <span className="rag" data-rag={r} aria-hidden />
                              </span>
                            </td>
                          );
                        })}
                        <td className="px-2 py-3">
                          <input
                            className="input w-28"
                            name={`reading_${m.id}`}
                            inputMode="decimal"
                            aria-label={`${m.name}, week starting ${short(week)}`}
                            defaultValue={val(m.id, week) ?? ""}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span className="tag" data-tone={RAG_TONE[rag]}>{RAG_LABEL[rag]}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}
          {longer.length > 0 && (
            <section className="card overflow-x-auto p-0">
              <div className="border-b border-[var(--line)] p-4">
                <h2 className="display text-xl font-bold">Counted by the month, quarter or year</h2>
                <p className="hint">These only need a number once per period. Enter it when the period closes, or update it as you go.</p>
              </div>
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-left text-[var(--muted)]">
                    <th className="px-4 py-2 font-medium">Measure</th>
                    <th className="px-2 py-2 font-medium">Target</th>
                    <th className="px-2 py-2 font-medium">Earlier</th>
                    <th className="px-2 py-2 font-medium">Now</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {longer.map((m) => {
                    const cur = periodStart(m.target_period);
                    const rag = ragOf(val(m.id, cur), m.target, m.better_when);
                    return (
                      <tr key={m.id} className="border-t border-[var(--line)]">
                        <td className="px-4 py-3">
                          <span className="font-semibold">{m.name}</span>
                          <span className="hint block">
                            {roleName(m.role_id)}, {m.kind === "lead" ? "lead" : "lag"}
                            {m.better_when === "lower" ? ", lower is better" : ""}
                            {m.data_source ? `, from ${m.data_source}` : ""}
                          </span>
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap">
                          {fmt(m.target, m.unit)}
                          <span className="hint"> a {m.target_period}</span>
                        </td>
                        <td className="px-2 py-3">
                          {[2, 1].map((n) => {
                            const p = periodStart(m.target_period, n);
                            const r = ragOf(val(m.id, p), m.target, m.better_when);
                            return (
                              <span key={p} className="mr-4 inline-flex items-center gap-1.5 whitespace-nowrap">
                                <span className="hint">{periodLabel(m.target_period, p)}</span> {fmt(val(m.id, p))}
                                <span className="rag" data-rag={r} aria-hidden />
                              </span>
                            );
                          })}
                        </td>
                        <td className="px-2 py-3">
                          <label className="hint block" htmlFor={`r-${m.id}`}>{periodLabel(m.target_period, cur)}</label>
                          <input className="input w-28" id={`r-${m.id}`} name={`reading_${m.id}__${cur}`} inputMode="decimal" defaultValue={val(m.id, cur) ?? ""} />
                        </td>
                        <td className="px-4 py-3">
                          <span className="tag" data-tone={RAG_TONE[rag]}>{RAG_LABEL[rag]}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}
          <button className="btn">Save the numbers</button>
        </form>
      )}

      <details className="card mt-6 p-0" open={ms.length === 0}>
        <summary className="cursor-pointer p-4 font-semibold">Add a measure</summary>
        <form action={addMeasure} className="space-y-4 border-t border-[var(--line)] p-4">
          <input type="hidden" name="business_id" value={id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="name">Measure</label>
              <input className="input" id="name" name="name" required placeholder="Proposals sent" />
            </div>
            <div>
              <label className="label" htmlFor="role_id">Role</label>
              <select className="input" id="role_id" name="role_id" defaultValue={roles?.[0]?.id ?? ""}>
                {(roles ?? []).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
                <option value="">Whole business</option>
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-5">
            <div>
              <label className="label" htmlFor="kind">Type</label>
              <select className="input" id="kind" name="kind" defaultValue="lead">
                <option value="lead">Lead (activity)</option>
                <option value="lag">Lag (result)</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="target">Target</label>
              <input className="input" id="target" name="target" inputMode="decimal" required />
            </div>
            <div>
              <label className="label" htmlFor="unit">Unit</label>
              <input className="input" id="unit" name="unit" placeholder="£, %, calls" />
            </div>
            <div>
              <label className="label" htmlFor="target_period">Per</label>
              <select className="input" id="target_period" name="target_period" defaultValue="week">
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="quarter">Quarter</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="better_when">Better when</label>
              <select className="input" id="better_when" name="better_when" defaultValue="higher">
                <option value="higher">Higher</option>
                <option value="lower">Lower</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="data_source">Where the number comes from</label>
            <p className="hint mb-2">The system or report that holds it. Later an automation can fill it in for you.</p>
            <input className="input" id="data_source" name="data_source" placeholder="CRM, bank feed, booking system" />
          </div>
          <button className="btn">Add measure</button>
        </form>
      </details>
      <NextPart businessId={id} slug="scorecards" />
    </div>
  );
}
