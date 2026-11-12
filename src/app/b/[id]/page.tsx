import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MODELS, STAGES, type Stage } from "@/lib/framework";
import { getProgress } from "@/lib/progress";
import { getJourney, getNeeds } from "@/lib/journey";
import { updateStage } from "./actions";
import Notice from "@/components/Notice";
import NeedsList from "@/components/NeedsList";
import BusinessMap from "@/components/BusinessMap";
import { getFunctions } from "@/lib/functions";

const ORDER: Stage[] = ["launch", "early_revenue", "established"];
const STATE_TAG = {
  done: { tone: "go", text: "Done" },
  now: { tone: "wait", text: "In progress" },
  ahead: { tone: "quiet", text: "Not started" },
};

export default async function BusinessHome({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error, saved } = await searchParams;
  const supabase = await createClient();
  const { data: biz } = await supabase.from("businesses").select("name, stage, model, sector, planning_route").eq("id", id).single();
  if (biz && !biz.planning_route) redirect(`/b/${id}/start`);
  const stage = (biz?.stage ?? "launch") as Stage;
  const [progress, needs, functions] = await Promise.all([getProgress(supabase, id), getNeeds(supabase, id), getFunctions(supabase, id)]);
  const journey = await getJourney(supabase, id, { stage: biz?.stage ?? null, planning_route: biz?.planning_route ?? null }, progress, needs);
  const acting = needs.filter((n) => n.acts);

  return (
    <div className="max-w-5xl">
      <Notice error={error} saved={saved} />
      <h1 className="text-4xl font-bold leading-none sm:text-5xl">{biz?.name}</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">
        Five stages, in order: design the business, build how it works, plan the year and the money, run it, review it. This page always shows the next thing to do.
      </p>

      <section className="card mt-6 border-2 border-[var(--ink)] p-6" aria-labelledby="next-heading">
        <p className="hint" id="next-heading">Next thing to do. {journey.next.stage}</p>
        <div className="mt-1 flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="display text-3xl font-bold leading-tight">{journey.next.title}</p>
            <p className="mt-1 text-[var(--muted)]">{journey.next.why}</p>
          </div>
          <Link className="btn px-6 py-3 text-base" href={journey.next.href}>
            {journey.next.label}
          </Link>
        </div>
      </section>

      {acting.length > 1 && (
        <section className="mt-8" aria-labelledby="needs-heading">
          <h2 id="needs-heading" className="display text-2xl font-bold">
            What needs you now <span className="text-[var(--muted)]">{acting.length}</span>
          </h2>
          <div className="mt-3">
            <NeedsList needs={acting} limit={5} />
          </div>
        </section>
      )}

      <BusinessMap businessId={id} parts={functions.parts} />

      <h2 className="display mt-10 text-2xl font-bold">The five stages</h2>
      <div className="mt-3 space-y-6">
        {journey.stages.map((s) => (
          <section key={s.key} className="card p-0" aria-labelledby={`stage-${s.key}`}>
            <div className="flex flex-wrap items-start gap-x-4 gap-y-3 p-5">
              <span className="display flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-xl font-bold text-white" aria-hidden="true">
                {s.num}
              </span>
              <div className="min-w-0 flex-1">
                <h2 id={`stage-${s.key}`} className="text-2xl font-bold leading-tight">
                  {s.title}
                  <span className="tag ml-3 align-middle" data-tone={STATE_TAG[s.state].tone}>
                    {s.tagText ?? STATE_TAG[s.state].text}
                  </span>
                </h2>
                <p className="mt-1 max-w-2xl text-sm">{s.purpose}</p>
                <p className="hint max-w-2xl">{s.ends}</p>
                <p className="mt-2 text-sm font-semibold">{s.summary}</p>
              </div>
              {s.action && (
                <Link className="btn btn-secondary" href={s.action.href}>
                  {s.action.label}
                </Link>
              )}
            </div>
            {(s.key === "design" || s.key === "plan") && journey.guided ? (
              <details className="border-t border-[var(--line)]">
                <summary className="cursor-pointer px-5 py-3 text-sm text-[var(--muted)]">See what&apos;s written so far, part by part</summary>
                <Rows rows={s.rows} />
                {s.key === "design" && (
                  <p className="border-t border-[var(--line)] px-5 py-3 text-sm">
                    <Link className="underline underline-offset-4" href={`/b/${id}/programme`}>All planning sessions and their dates</Link>
                  </p>
                )}
              </details>
            ) : (
              <div className="border-t border-[var(--line)]">
                <Rows rows={s.rows} />
                {s.key === "plan" && !journey.locked && (
                  <p className="border-t border-[var(--line)] px-5 py-3 text-sm">
                    When the parts are written:{" "}
                    <Link className="font-semibold underline underline-offset-4" href={`/b/${id}/s/sign_off`}>have the plan reviewed</Link>, then{" "}
                    <Link className="font-semibold underline underline-offset-4" href={`/b/${id}/year#lock`}>lock it</Link>.
                  </p>
                )}
              </div>
            )}
          </section>
        ))}
      </div>

      <details className="mt-10 text-sm">
        <summary className="cursor-pointer text-[var(--muted)]">
          Business details: {[biz?.sector || MODELS[biz?.model ?? "other"], STAGES[stage]].filter(Boolean).join(", ")}
        </summary>
        <form action={updateStage} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="business_id" value={id} />
          <div>
            <label htmlFor="sector" className="label">What it does</label>
            <input className="input w-56" id="sector" name="sector" defaultValue={biz?.sector ?? ""} />
          </div>
          <div>
            <label htmlFor="model" className="label">How customers pay</label>
            <select className="input w-auto" id="model" name="model" defaultValue={biz?.model ?? "other"}>
              {Object.entries(MODELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="stage" className="label">How far along it is</label>
            <select className="input w-auto" id="stage" name="stage" defaultValue={stage}>
              {ORDER.map((s) => (
                <option key={s} value={s}>{STAGES[s]}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-secondary">Update</button>
        </form>
      </details>
    </div>
  );
}

function Rows({ rows }: { rows: { title: string; detail: string; href: string; tag?: { tone: string; text: string } }[] }) {
  return (
    <ul className="divide-y divide-[var(--line)]">
      {rows.map((r) => (
        <li key={r.href}>
          <Link href={r.href} className="group flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-[#f7f8fa]">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold group-hover:underline group-hover:underline-offset-4">{r.title}</span>
              <span className="hint block">{r.detail}</span>
            </span>
            {r.tag && (
              <span className="tag" data-tone={r.tag.tone}>
                {r.tag.text}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
