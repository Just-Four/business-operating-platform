import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Notice from "@/components/Notice";
import { FUNCTION_NAMES } from "@/lib/functions";
import { addProcess } from "../process-actions";

export default async function ProcessesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error, saved } = await searchParams;
  const supabase = await createClient();
  const [{ data: processes }, { data: steps }, { data: runs }] = await Promise.all([
    supabase.from("processes").select("id, name, purpose, version, updated_at, function").eq("business_id", id).order("created_at"),
    supabase.from("process_steps").select("process_id").eq("business_id", id),
    supabase.from("process_runs").select("process_id, status").eq("business_id", id),
  ]);
  const list = processes ?? [];
  const inPart = (f: string | null) => (f && FUNCTION_NAMES.includes(f) ? f : "");
  const groups = [...FUNCTION_NAMES.filter((f) => list.some((p) => p.function === f)), ...(list.some((p) => !inPart(p.function)) ? [""] : [])];

  return (
    <div className="max-w-4xl">
      <Notice error={error} saved={saved} />
      <p className="hint">Stage 2: Build</p>
      <h1 className="text-4xl font-bold leading-none sm:text-5xl">Processes</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">The work that repeats. Each process is written once as steps, with who or what does each step.</p>
      <ol className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        {[
          ["1. Write it", "Name a piece of work that repeats, then list its steps."],
          ["2. Say who does each step", "A person or an AI. Decide which results a person must check."],
          ["3. Run it", "Press Start a run. The steps come to you one at a time."],
        ].map(([t, d]) => (
          <li key={t} className="rounded border border-[var(--line)] bg-[var(--surface)] p-3">
            <span className="block font-semibold">{t}</span>
            <span className="hint">{d}</span>
          </li>
        ))}
      </ol>

      {groups.map((g) => (
        <section key={g || "none"} className="mt-8">
          <h2 className="display text-xl font-bold">{g || "No part of the business set yet"}</h2>
          {!g && <p className="hint">Open a process, press Change this process, and pick its part under Name, purpose and owner.</p>}
          <ul className="mt-3 space-y-3">
          {list.filter((p) => inPart(p.function) === g).map((p) => {
            const n = (steps ?? []).filter((s) => s.process_id === p.id).length;
            const pRuns = (runs ?? []).filter((r) => r.process_id === p.id);
            const running = pRuns.filter((r) => r.status === "running").length;
            const state = n === 0 ? "Needs its steps" : running ? `${running} run${running === 1 ? "" : "s"} in progress` : pRuns.length ? "Ready to run again" : "Ready to try";
            return (
              <li key={p.id} className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                <span className="min-w-0 flex-1">
                  <Link href={`/b/${id}/processes/${p.id}`} className="display text-xl font-bold underline-offset-4 hover:underline">
                    {p.name}
                  </Link>
                  <span className="hint block">
                    {n} {n === 1 ? "step" : "steps"}. {state}.
                  </span>
                </span>
                <Link className={n === 0 ? "btn" : "btn btn-secondary"} href={`/b/${id}/processes/${p.id}${n === 0 ? "?edit=1" : ""}`}>
                  {n === 0 ? "Add its steps" : "Open"}
                </Link>
                {n > 0 && (
                  <Link className="btn" href={`/b/${id}/processes/${p.id}#run`}>
                    Start a run
                  </Link>
                )}
              </li>
            );
          })}
          </ul>
        </section>
      ))}

      <section className="mt-10">
        <h2 className="display text-2xl font-bold">{list.length ? "Write another process" : "Write your first process"}</h2>
        <p className="hint">
          Pick a piece of work that repeats and matters, such as winning a customer, delivering an order or collecting a
          payment. You add the steps on the next page.
        </p>
        <form action={addProcess} className="card mt-3 space-y-4 p-4">
          <input type="hidden" name="business_id" value={id} />
          <div>
            <label className="label" htmlFor="name">What is it called?</label>
            <input className="input" id="name" name="name" required placeholder="Follow up a new enquiry" />
          </div>
          <div>
            <label className="label" htmlFor="function">Which part of the business is it in?</label>
            <select className="input" id="function" name="function" defaultValue="">
              <option value="">Not sure yet</option>
              {FUNCTION_NAMES.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="outcome">What must exist when it&apos;s done? (optional)</label>
            <textarea className="input min-h-20" id="outcome" name="outcome" placeholder="The customer has a quote and a date for the next call" />
          </div>
          <button className="btn">Next: add the steps</button>
        </form>
      </section>
    </div>
  );
}
