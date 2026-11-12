import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import CountryCurrency from "@/components/CountryCurrency";
import { createBusiness } from "./actions";
import { MODELS, STAGES, type Stage } from "@/lib/framework";

const STAGES_4 = [
  ["Plan", "Say what the business is, where it's going and what this year must deliver. About two weeks of short sessions, or faster if you already know it."],
  ["Build", "Write each piece of repeating work once, as steps, and say who or what does each step."],
  ["Run", "The steps come to the right person or AI. You approve, check results and unblock."],
  ["Review", "Look at the numbers on a fixed rhythm and change what isn't working."],
];

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
    .select("id, name, model, sector, stage, country, currency, planning_route, memberships(role, user_id)")
    .order("name");
  const list = businesses ?? [];
  const ids = list.map((b) => b.id);
  const none = ["00000000-0000-0000-0000-000000000000"];
  const [{ data: open }, { data: cycles }, { data: procs }] = await Promise.all([
    supabase
      .from("tasks")
      .select("business_id, status, route, needs_approval, approved_at")
      .in("business_id", ids.length ? ids : none)
      .in("status", ["queued", "blocked", "awaiting_approval", "awaiting_review", "failed", "escalated"])
      .limit(2000),
    supabase.from("plan_cycles").select("business_id, status").in("business_id", ids.length ? ids : none),
    supabase.from("processes").select("business_id").in("business_id", ids.length ? ids : none),
  ]);
  const first = list.length === 0;

  return (
    <>
      <TopBar email={user?.email} />
      <main className="mx-auto max-w-5xl px-6 py-8">
        {first ? (
          <div className="mb-8">
            <h1 className="text-4xl font-bold leading-tight sm:text-5xl">Welcome. Start with one business.</h1>
            <p className="mt-3 max-w-2xl text-[var(--muted)]">
              You&apos;ll end up with a written plan, the processes that run the business, and one page showing what needs
              you. It goes in four stages, and every page tells you the next thing to do.
            </p>
            <ol className="mt-6 grid gap-3 sm:grid-cols-2">
              {STAGES_4.map(([t, d], i) => (
                <li key={t} className="card flex gap-3 p-4">
                  <span className="display flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] font-bold text-white">{i + 1}</span>
                  <span>
                    <span className="block font-semibold">{t}</span>
                    <span className="hint">{d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="mb-6">
            <h1 className="text-4xl font-bold leading-none sm:text-5xl">Your businesses</h1>
            <p className="mt-3 text-[var(--muted)]">Open one to see the next thing to do in it.</p>
          </div>
        )}

        {error && <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}

        {!first && (
          <ul className="space-y-3">
            {list.map((b) => {
              const myRole = (b.memberships ?? []).find((m: { user_id: string }) => m.user_id === user?.id)?.role;
              const waiting = (open ?? []).filter(
                (t) => t.business_id === b.id && (t.status !== "queued" || ["person", "claude"].includes(t.route) || (t.needs_approval && !t.approved_at))
              ).length;
              const locked = (cycles ?? []).some((c) => c.business_id === b.id && c.status === "approved");
              const nProcs = (procs ?? []).filter((p) => p.business_id === b.id).length;
              const where = !b.planning_route ? "Not set up yet" : !locked ? "Stage 1: Plan" : nProcs === 0 ? "Stage 2: Build" : "Stage 3: Run";
              return (
                <li key={b.id}>
                  <Link href={`/b/${b.id}`} className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-5 hover:bg-[#f7f8fa]">
                    <span className="min-w-0 flex-1">
                      <span className="display block text-2xl font-bold">{b.name}</span>
                      <span className="hint block">
                        {[b.sector || MODELS[b.model], STAGES[b.stage as Stage], b.country].filter(Boolean).join(", ")}
                        {myRole ? `. You are the ${({ chairman: "owner", operator: "operator", team_member: "team member", viewer: "viewer" } as Record<string, string>)[myRole] ?? myRole}.` : ""}
                      </span>
                    </span>
                    <span className="tag" data-tone="quiet">{where}</span>
                    {waiting > 0 && <span className="tag" data-tone="wait">{waiting} waiting for you</span>}
                    <span className="btn">Open</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <section className={`card max-w-2xl p-6 ${first ? "" : "mt-10"}`}>
          <h2 className="text-xl font-semibold">{first ? "Start your first business" : "Add another business"}</h2>
          <p className="hint mb-4">Three things now. Then five quick questions decide how the planning works for you.</p>
          <form action={createBusiness} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="name">What is the business called?</label>
              <input className="input" id="name" name="name" required />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="sector">What does it do?</label>
              <input className="input" id="sector" name="sector" placeholder="Childcare, IT support, a cafe" />
            </div>
            <CountryCurrency />
            <div className="sm:col-span-2">
              <button className="btn">{first ? "Start" : "Add this business"}</button>
            </div>
          </form>
        </section>
      </main>
    </>
  );
}
