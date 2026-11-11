import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Notice from "@/components/Notice";
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
    supabase.from("processes").select("id, name, purpose, version, updated_at").eq("business_id", id).order("created_at"),
    supabase.from("process_steps").select("process_id").eq("business_id", id),
    supabase.from("process_runs").select("process_id, status").eq("business_id", id),
  ]);
  const list = processes ?? [];

  return (
    <div className="max-w-4xl">
      <Notice error={error} saved={saved} />
      <p className="hint">Run</p>
      <h1 className="text-4xl font-bold leading-none sm:text-5xl">Processes</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">
        The recurring work of the business, written down once as a procedure. Each step says what it must produce, to what
        standard, and who or what does it. Starting a process creates its tasks one step at a time, and what you change
        in the procedure is what the next task follows.
      </p>

      {list.length > 0 && (
        <ul className="mt-6 space-y-3">
          {list.map((p) => {
            const n = (steps ?? []).filter((s) => s.process_id === p.id).length;
            const running = (runs ?? []).filter((r) => r.process_id === p.id && r.status === "running").length;
            return (
              <li key={p.id}>
                <Link href={`/b/${id}/processes/${p.id}`} className="card block p-4 hover:bg-[#f7f8fa]">
                  <span className="flex flex-wrap items-center gap-3">
                    <span className="display min-w-0 flex-1 text-xl font-bold">{p.name}</span>
                    {running > 0 && <span className="tag" data-tone="wait">{running} running</span>}
                    <span className="tag" data-tone="quiet">{n} {n === 1 ? "step" : "steps"}</span>
                    <span className="tag" data-tone="quiet">Version {p.version}</span>
                  </span>
                  {p.purpose && <span className="hint mt-1 block">{p.purpose}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <section className="mt-8">
        <h2 className="display text-2xl font-bold">{list.length ? "Add a process" : "Write your first process"}</h2>
        <p className="hint">
          Pick a piece of work that repeats and matters, such as winning a customer, delivering an order or collecting a
          payment. You add the steps on the next page.
        </p>
        <form action={addProcess} className="card mt-3 space-y-4 p-4">
          <input type="hidden" name="business_id" value={id} />
          <div>
            <label className="label" htmlFor="name">What is it called?</label>
            <input className="input" id="name" name="name" required placeholder="Map our customers and who supplies them" />
          </div>
          <div>
            <label className="label" htmlFor="purpose">What is it for?</label>
            <textarea className="input min-h-20" id="purpose" name="purpose" />
          </div>
          <div>
            <label className="label" htmlFor="outcome">What result must it produce?</label>
            <p className="hint mb-2">When this process has been done well, what exists that didn&apos;t before?</p>
            <textarea className="input min-h-20" id="outcome" name="outcome" />
          </div>
          <button className="btn">Add process</button>
        </form>
      </section>
    </div>
  );
}
