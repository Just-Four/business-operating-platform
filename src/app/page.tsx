import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import { createBusiness } from "./actions";
import { MODELS, STAGES, type Stage } from "@/lib/framework";

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, name, model, stage, country, currency, memberships(role, user_id)")
    .order("name");

  const ids = (businesses ?? []).map((b) => b.id);
  const [{ data: milestones }, { data: canvas }] = await Promise.all([
    supabase.from("milestones").select("business_id, status").in("business_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    supabase.from("canvas_boxes").select("business_id, answer").in("business_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
  ]);

  return (
    <>
      <TopBar email={user?.email} />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Portfolio</h1>
          <p className="hint">Every business you chair or run, on one page.</p>
        </div>

        {error && <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(businesses ?? []).map((b) => {
            const myRole = (b.memberships ?? []).find((m: { user_id: string }) => m.user_id === user?.id)?.role;
            const ms = (milestones ?? []).filter((m) => m.business_id === b.id);
            const met = ms.filter((m) => m.status === "met").length;
            const filled = (canvas ?? []).filter((c) => c.business_id === b.id && c.answer && String(c.answer).trim()).length;
            return (
              <Link key={b.id} href={`/b/${b.id}`} className="card block p-5 hover:border-[#2f5d50]">
                <div className="flex items-start justify-between">
                  <h2 className="text-lg font-semibold">{b.name}</h2>
                  {myRole && <span className="rounded bg-[#e7f1fb] px-2 py-0.5 text-xs capitalize">{myRole}</span>}
                </div>
                <p className="hint mt-1">
                  {MODELS[b.model] ?? b.model} · {STAGES[b.stage as Stage]}
                  {b.country ? ` · ${b.country}` : ""}
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="hint">Business model</dt>
                    <dd className="font-medium">{filled}/9 boxes</dd>
                  </div>
                  <div>
                    <dt className="hint">Launch milestones</dt>
                    <dd className="font-medium">{ms.length ? `${met}/${ms.length} met` : "Not set"}</dd>
                  </div>
                </dl>
              </Link>
            );
          })}
          {(businesses ?? []).length === 0 && (
            <p className="hint">No businesses yet. Add the first one below.</p>
          )}
        </div>

        <section className="card mt-10 max-w-2xl p-6">
          <h2 className="text-lg font-semibold">Add a business</h2>
          <p className="hint mb-4">You become its chairman. Invite the operator once it&apos;s set up.</p>
          <form action={createBusiness} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="name">Name</label>
              <input className="input" id="name" name="name" required />
            </div>
            <div>
              <label className="label" htmlFor="model">Business model</label>
              <select className="input" id="model" name="model" defaultValue="workforce_accommodation">
                {Object.entries(MODELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="stage">Stage</label>
              <select className="input" id="stage" name="stage" defaultValue="launch">
                {Object.entries(STAGES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="country">Country</label>
              <input className="input" id="country" name="country" />
            </div>
            <div>
              <label className="label" htmlFor="currency">Currency</label>
              <select className="input" id="currency" name="currency" defaultValue="GBP">
                <option value="GBP">GBP (£)</option>
                <option value="SEK">SEK (kr)</option>
                <option value="EUR">EUR (€)</option>
                <option value="NOK">NOK (kr)</option>
                <option value="DKK">DKK (kr)</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <button className="btn">Add business</button>
            </div>
          </form>
        </section>
      </main>
    </>
  );
}
