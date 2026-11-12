import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Notice from "@/components/Notice";
import { TIERS, fnByKey, getFunctions } from "@/lib/functions";
import { addProcess, saveFunctionOwners } from "../../process-actions";

export default async function FunctionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; key: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id, key } = await params;
  const { error, saved } = await searchParams;
  const fn = fnByKey(key);
  if (!fn) notFound();
  const supabase = await createClient();
  const { parts, people } = await getFunctions(supabase, id);
  const part = parts.find((p) => p.fn.key === key)!;
  const here = `/b/${id}/f/${key}`;
  const tier = TIERS.find((t) => t.key === fn.tier)?.label ?? "";
  const suggestions = fn.usual.filter((u) => !part.processes.some((p) => p.name.toLowerCase() === u.toLowerCase()));

  return (
    <div className="max-w-4xl">
      <Notice error={error} saved={saved} />
      <p className="text-sm">
        <Link href={`/b/${id}`} className="font-semibold underline underline-offset-4">Back to your business on a page</Link>
      </p>
      <p className="hint mt-4">{tier}. One of the seven parts of the business.</p>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-4xl font-bold leading-none sm:text-5xl">{fn.name}</h1>
        <span className="tag" data-tone={part.status.tone}>{part.status.text}</span>
      </div>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">{fn.job}.</p>

      <section className="card mt-6 space-y-2 p-5" aria-label="About this part of the business">
        <p><span className="font-semibold">Why it matters.</span> {fn.why}</p>
        <p><span className="font-semibold">What good looks like.</span> {fn.good}</p>
        <p><span className="font-semibold">What a lender or investor asks.</span> {fn.funder}</p>
      </section>

      <section className="mt-10" aria-labelledby="owner-heading">
        <h2 id="owner-heading" className="display text-2xl font-bold">Who owns it</h2>
        <p className="hint max-w-2xl">
          The person who answers for this part of the business, whoever does the day-to-day work. At the start that is
          usually you, for every part.
        </p>
        {people.length === 0 ? (
          <p className="card mt-3 p-4 text-sm">
            Nobody is in the team yet.{" "}
            <Link className="font-semibold underline underline-offset-4" href={`/b/${id}/people`}>Add yourself first</Link>
          </p>
        ) : (
          <form action={saveFunctionOwners} className="card mt-3 p-4">
            <input type="hidden" name="business_id" value={id} />
            <input type="hidden" name="function" value={fn.name} />
            <input type="hidden" name="return_to" value={here} />
            <div className="flex flex-wrap gap-2">
              {people.map((p) => (
                <label key={p.id} className="flex items-center gap-2 rounded border border-[var(--line)] px-3 py-2 text-sm">
                  <input type="checkbox" name="member_id" value={p.id} defaultChecked={part.ownerIds.includes(p.id)} />
                  {p.name}
                </label>
              ))}
            </div>
            <button className="btn mt-4">Save who owns it</button>
          </form>
        )}
      </section>

      <section className="mt-10" aria-labelledby="processes-heading">
        <h2 id="processes-heading" className="display text-2xl font-bold">The processes</h2>
        {part.processes.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {part.processes.map((p) => (
              <li key={p.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <span className="font-semibold">{p.name}</span>
                <Link className="btn btn-secondary" href={`/b/${id}/processes/${p.id}`}>Open</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint mt-1">No process is written for this part yet.</p>
        )}
        {suggestions.length > 0 && (
          <div className="mt-4">
            <p className="hint">Almost every business has these. Pick one to start it, then add its steps.</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((u) => (
                <li key={u}>
                  <form action={addProcess}>
                    <input type="hidden" name="business_id" value={id} />
                    <input type="hidden" name="function" value={fn.name} />
                    <input type="hidden" name="name" value={u} />
                    <button className="btn btn-secondary">{u}</button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}
        <form action={addProcess} className="card mt-4 flex flex-wrap items-end gap-3 p-4">
          <input type="hidden" name="business_id" value={id} />
          <input type="hidden" name="function" value={fn.name} />
          <div className="min-w-0 flex-1">
            <label className="label" htmlFor="name">Or name your own</label>
            <input className="input" id="name" name="name" required />
          </div>
          <button className="btn">Next: add the steps</button>
        </form>
      </section>

      <section className="mt-10" aria-labelledby="roles-heading">
        <h2 id="roles-heading" className="display text-2xl font-bold">The roles</h2>
        {part.roles.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {part.roles.map((r) => (
              <li key={r.id} className="card p-4">
                <span className="block font-semibold">{r.name}</span>
                <span className="hint block">{r.holders.length ? `Held by ${r.holders.join(", ")}` : "Nobody holds it yet"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint mt-1">No role sits in this part yet. Roles appear when the work is written down and handed on.</p>
        )}
        <p className="mt-3 text-sm">
          <Link className="font-semibold underline underline-offset-4" href={`/b/${id}/team`}>Open the roles</Link>
        </p>
      </section>

      <section className="mt-10" aria-labelledby="numbers-heading">
        <h2 id="numbers-heading" className="display text-2xl font-bold">The numbers</h2>
        {part.numbers.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {part.numbers.map((m) => (
              <li key={m.id} className="card p-4">
                <span className="block font-semibold">{m.name}</span>
                <span className="hint block">
                  {m.target !== null ? `Target ${m.target}${m.unit ? ` ${m.unit}` : ""}. ` : ""}Belongs to the role {m.role}.
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint mt-1">No number is watched for this part yet. Numbers are set per role, on the scorecards.</p>
        )}
        <p className="mt-3 text-sm">
          <Link className="font-semibold underline underline-offset-4" href={`/b/${id}/scorecards`}>Open the scorecards</Link>
        </p>
      </section>
    </div>
  );
}
