import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SESSIONS, iso } from "@/lib/programme";
import { saveSchedule, setRoute } from "../actions";
import Notice from "@/components/Notice";

function status(s: { completed_at: string | null; scheduled_on: string | null }, built: boolean, today: string) {
  if (s.completed_at) return { tone: "go", text: "Done" };
  if (!built) return { tone: "quiet", text: "Next build" };
  if (!s.scheduled_on) return { tone: "quiet", text: "Not scheduled" };
  if (s.scheduled_on < today) return { tone: "stop", text: "Behind" };
  if (s.scheduled_on === today) return { tone: "wait", text: "Today" };
  return { tone: "quiet", text: "Upcoming" };
}

export default async function ProgrammePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error, saved } = await searchParams;
  const supabase = await createClient();
  const [{ data: biz }, { data: rows }] = await Promise.all([
    supabase.from("businesses").select("name, planning_route, sign_off_date").eq("id", id).single(),
    supabase.from("programme_sessions").select("key, scheduled_on, completed_at, approved_at").eq("business_id", id),
  ]);
  const byKey = new Map((rows ?? []).map((r) => [r.key, r]));
  const today = iso(new Date());
  const committed = !!byKey.get("commit")?.completed_at;
  const built = SESSIONS.filter((s) => s.built);
  const doneCount = built.filter((s) => byKey.get(s.key)?.completed_at).length;
  const behind = built.filter((s) => {
    const r = byKey.get(s.key);
    return r && !r.completed_at && r.scheduled_on && r.scheduled_on < today;
  }).length;
  const next = SESSIONS.find((s) => !byKey.get(s.key)?.completed_at);

  return (
    <div className="max-w-4xl">
      <Notice error={error} saved={saved} />
      <p className="hint">{biz?.planning_route === "focused" ? "Focused sessions" : "Guided programme"}</p>
      <h1 className="text-4xl font-bold leading-none sm:text-5xl">Your planning programme</h1>
      <p className="mt-3 text-[var(--muted)]">
        {doneCount} of {built.length} sessions done.{" "}
        {behind ? `${behind} behind schedule.` : "On schedule."} The dates set the pace, but nothing is locked: you can do
        the next session whenever you&apos;re ready.
      </p>

      {next && (
        <Link href={`/b/${id}/s/${next.key}`} className="card mt-6 flex items-center justify-between gap-4 border-[var(--ink)] p-5 hover:bg-[#f7f8fa]">
          <span>
            <span className="hint block">{committed ? "Next session" : "Start here"}</span>
            <span className="display text-2xl font-bold">{next.title}</span>
            <span className="hint block">About {next.minutes} minutes</span>
          </span>
          <span className="btn">{next.built ? "Start session" : "View"}</span>
        </Link>
      )}

      <form action={saveSchedule} className="mt-10">
        <input type="hidden" name="business_id" value={id} />
        <div className="flex items-baseline justify-between border-b border-[var(--line)] pb-2">
          <h2 className="text-2xl font-bold">Sessions and dates</h2>
          <span className="hint">Change any date to suit you</span>
        </div>
        <ol className="divide-y divide-[var(--line)]">
          {SESSIONS.map((s) => {
            const r = byKey.get(s.key);
            const st = status({ completed_at: r?.completed_at ?? null, scheduled_on: r?.scheduled_on ?? null }, s.built, today);
            return (
              <li key={s.key} className="grid grid-cols-[2.5rem_1fr_auto_auto] items-center gap-3 py-3">
                <span className="display text-xl font-bold text-[var(--muted)]">{s.seq}</span>
                <span className="min-w-0">
                  <Link href={`/b/${id}/s/${s.key}`} className="font-semibold hover:underline hover:underline-offset-4">
                    {s.title}
                  </Link>
                  <span className="hint block">
                    About {s.minutes} min
                    {s.checkpoint ? (r?.approved_at ? ", reviewed" : ", review checkpoint") : ""}
                  </span>
                </span>
                <input
                  type="date"
                  name={`date_${s.key}`}
                  aria-label={`Date for ${s.title}`}
                  defaultValue={r?.scheduled_on ?? ""}
                  className="input w-auto py-1"
                  disabled={!!r?.completed_at}
                />
                <span className="tag w-24 justify-center" data-tone={st.tone}>{st.text}</span>
              </li>
            );
          })}
        </ol>

        <div className="card mt-6 grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="sign_off_date">Sign-off date</label>
            <p className="hint mb-2">The day the plan is finished and agreed. Sessions are spread to finish by then.</p>
            <input id="sign_off_date" name="sign_off_date" type="date" className="input w-auto" defaultValue={biz?.sign_off_date ?? ""} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary">Save dates</button>
            {!committed && (
              <button className="btn" name="commit" value="1">
                I commit to these dates
              </button>
            )}
          </div>
        </div>
        {!committed && (
          <p className="hint mt-2">
            Committing puts the dates on record. Add them to your calendar now, as you would a meeting
            you can&apos;t miss.
          </p>
        )}
      </form>

      <form action={setRoute} className="mt-10 flex flex-wrap items-center gap-2">
        <input type="hidden" name="business_id" value={id} />
        <label htmlFor="route" className="hint">Change how you plan</label>
        <select id="route" name="route" className="input w-auto py-1.5" defaultValue={biz?.planning_route ?? "guided"}>
          <option value="guided">Guided programme</option>
          <option value="focused">Focused sessions</option>
          <option value="board">Straight to the full plan</option>
        </select>
        <button className="btn btn-secondary py-1.5">Change</button>
      </form>
    </div>
  );
}
