import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Notice from "@/components/Notice";
import NextPart from "@/components/NextPart";
import { CANVAS_PLAIN } from "@/lib/programme";
import { MOMENTS, storyCount, type StoryRow } from "@/lib/story";
import { saveStory, storyToProcess } from "../process-actions";

const ALREADY_SAID = ["channels", "key_activities", "key_resources"];

export default async function StoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error, saved } = await searchParams;
  const supabase = await createClient();
  const [{ data: story }, { data: boxes }, { data: processes }] = await Promise.all([
    supabase.from("story_points").select("moment, what_happens, who, needs, process_id").eq("business_id", id),
    supabase.from("canvas_boxes").select("box, answer").eq("business_id", id).in("box", ALREADY_SAID),
    supabase.from("processes").select("id, name").eq("business_id", id),
  ]);
  const rows = (story ?? []) as StoryRow[];
  const row = (key: string) => rows.find((r) => r.moment === key);
  const said = ALREADY_SAID.map((b) => ({ box: b, answer: (boxes ?? []).find((x) => x.box === b)?.answer?.trim() ?? "" })).filter((x) => x.answer);
  const n = storyCount(rows);
  const answered = MOMENTS.filter((m) => (row(m.key)?.what_happens ?? "").trim());

  return (
    <div className="max-w-4xl">
      <Notice error={error} saved={saved} />
      <p className="hint">Stage 2: Build</p>
      <h1 className="text-4xl font-bold leading-none sm:text-5xl">How the business works</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">
        Follow one customer from first hearing about you to coming back. For each of the five moments, say what happens,
        who does it and what they need. It shows what the business has to do, before you put numbers on it.
      </p>
      <p className="hint mt-2 max-w-2xl">
        A first guess is enough. If you get to a moment and can&apos;t say what happens, you have found something the
        business still needs. {n} of {MOMENTS.length} described.
      </p>

      {said.length > 0 && (
        <details className="card mt-6 p-4">
          <summary className="cursor-pointer font-semibold">What you&apos;ve already said in the business model</summary>
          <dl className="mt-3 space-y-3 text-sm">
            {said.map((x) => (
              <div key={x.box}>
                <dt className="hint">{CANVAS_PLAIN[x.box]?.question}</dt>
                <dd className="whitespace-pre-line">{x.answer}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      <form action={saveStory} className="mt-6 space-y-4">
        <input type="hidden" name="business_id" value={id} />
        {MOMENTS.map((m, i) => {
          const r = row(m.key);
          return (
            <section key={m.key} className="card p-5" aria-labelledby={`moment-${m.key}`}>
              <div className="flex items-start gap-3">
                <span className="display flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-lg font-bold text-white" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id={`moment-${m.key}`} className="display text-2xl font-bold leading-tight">{m.title}</h2>
                  <label className="mt-1 block text-sm" htmlFor={`what_${m.key}`}>{m.question}</label>
                  <textarea className="input mt-2 min-h-20" id={`what_${m.key}`} name={`what_${m.key}`} defaultValue={r?.what_happens ?? ""} placeholder={`For example: ${m.example}`} />
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label" htmlFor={`who_${m.key}`}>Who does it?</label>
                      <input className="input" id={`who_${m.key}`} name={`who_${m.key}`} defaultValue={r?.who ?? ""} placeholder="You, a partner, someone you'll hire, an AI" />
                    </div>
                    <div>
                      <label className="label" htmlFor={`needs_${m.key}`}>What do they need to do it?</label>
                      <input className="input" id={`needs_${m.key}`} name={`needs_${m.key}`} defaultValue={r?.needs ?? ""} placeholder="A website, a price list, a card reader" />
                    </div>
                  </div>
                </div>
              </div>
            </section>
          );
        })}
        <button className="btn">Save how the business works</button>
      </form>

      {answered.length > 0 && (
        <section className="mt-10" aria-labelledby="to-process">
          <h2 id="to-process" className="display text-2xl font-bold">Turn a moment into a process</h2>
          <p className="hint max-w-2xl">
            You don&apos;t need to do this yet. When a moment happens often enough to be worth writing down, make it a
            process and add its steps.
          </p>
          <ul className="mt-3 space-y-3">
            {answered.map((m) => {
              const r = row(m.key);
              const proc = (processes ?? []).find((p) => p.id === r?.process_id);
              return (
                <li key={m.key} className="card flex flex-wrap items-end gap-3 p-4">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{m.title}</span>
                    <span className="hint block">{r?.what_happens}</span>
                  </span>
                  {proc ? (
                    <Link className="btn btn-secondary" href={`/b/${id}/processes/${proc.id}`}>Open the process: {proc.name}</Link>
                  ) : (
                    <form action={storyToProcess} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="business_id" value={id} />
                      <input type="hidden" name="moment" value={m.key} />
                      <div>
                        <label className="label" htmlFor={`name_${m.key}`}>Name of the process</label>
                        <input className="input w-56" id={`name_${m.key}`} name="name" defaultValue={m.processName} required />
                      </div>
                      <button className="btn btn-secondary">Make this a process</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <NextPart businessId={id} slug="story" />
    </div>
  );
}
