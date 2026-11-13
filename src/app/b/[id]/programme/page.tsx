import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DESIGN_SESSIONS, FOCUSED_GROUPS, LOOKBACK_SESSION, PLAN_SESSIONS, SESSIONS, iso, sessionTitle, type Session } from "@/lib/programme";
import { getProgress } from "@/lib/progress";
import { getJourney, getNeeds } from "@/lib/journey";
import { getOpenChallenges } from "@/lib/challenges";
import { saveSchedule, setRoute } from "../actions";
import Notice from "@/components/Notice";

type Row = { key: string; scheduled_on: string | null; completed_at: string | null; approved_at: string | null };

function status(s: { completed_at: string | null; scheduled_on: string | null }, built: boolean, today: string) {
  if (s.completed_at) return { tone: "go", text: "Done" };
  if (!built) return { tone: "quiet", text: "Not available yet" };
  if (!s.scheduled_on) return { tone: "quiet", text: "Not scheduled" };
  if (s.scheduled_on < today) return { tone: "stop", text: "Behind" };
  if (s.scheduled_on === today) return { tone: "wait", text: "Today" };
  return { tone: "quiet", text: "Upcoming" };
}

const ROUTE_LABEL: Record<string, string> = {
  guided: "Guided programme",
  focused: "Focused sittings",
  partial: "Short programme",
};

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
    supabase.from("businesses").select("name, planning_route, sign_off_date, stage, current_need").eq("id", id).single(),
    supabase.from("programme_sessions").select("key, scheduled_on, completed_at, approved_at").eq("business_id", id),
  ]);
  const byKey = new Map<string, Row>((rows ?? []).map((r) => [r.key, r]));
  const [progress, needs, open] = await Promise.all([getProgress(supabase, id), getNeeds(supabase, id), getOpenChallenges(supabase, id)]);
  const journey = await getJourney(supabase, id, { stage: biz?.stage ?? null, planning_route: biz?.planning_route ?? null }, progress, needs);
  const buildRows = journey.stages.find((x) => x.key === "build")?.rows ?? [];
  const route = biz?.planning_route ?? "guided";
  const stage = biz?.stage ?? "launch";
  const today = iso(new Date());
  const sessions = SESSIONS.filter((s) => byKey.size === 0 || byKey.has(s.key));
  const minutesOf = (s: Session) => (s.key === "launch_path" && stage !== "launch" ? LOOKBACK_SESSION.minutes : s.minutes);
  const committed = !!byKey.get("commit")?.completed_at;
  const built = sessions.filter((s) => s.built);
  const doneCount = built.filter((s) => byKey.get(s.key)?.completed_at).length;
  const behind = built.filter((s) => {
    const r = byKey.get(s.key);
    return r && !r.completed_at && r.scheduled_on && r.scheduled_on < today;
  }).length;
  // The sessions sit in their stages, with Build between Design and Plan, the same order as the menu.
  const groups: { title: string; items: Session[]; build?: boolean }[] =
    route === "focused"
      ? FOCUSED_GROUPS.map((g) => ({ title: g.title, items: sessions.filter((s) => g.keys.includes(s.key)) })).filter((g) => g.items.length)
      : [
          { title: "Stage 1: Design", items: sessions.filter((s) => DESIGN_SESSIONS.includes(s.key)) },
          { title: "Stage 2: Build", items: sessions.filter((s) => s.key === "roles"), build: true },
          { title: "Stage 3: Plan", items: sessions.filter((s) => PLAN_SESSIONS.includes(s.key)) },
        ].filter((g) => g.items.length || g.build);

  const renderRow = (s: Session, n: number) => {
    const r = byKey.get(s.key);
    const toAnswer = open && open.sessionKey === s.key ? open.unanswered : 0;
    const st = toAnswer
      ? { tone: "wait", text: `${toAnswer} to answer` }
      : status({ completed_at: r?.completed_at ?? null, scheduled_on: r?.scheduled_on ?? null }, s.built, today);
    const title = sessionTitle(s.key, stage);
    return (
      <li
        key={s.key}
        className={`grid grid-cols-[2.5rem_1fr_auto_auto] items-center gap-3 py-3 ${s.checkpoint ? "-mx-3 my-1 rounded border-l-4 border-[var(--wait)] bg-[var(--wait-tint)] px-3" : ""}`}
      >
        <span className={`display text-xl font-bold ${s.checkpoint ? "text-[#8a5d0f]" : "text-[var(--muted)]"}`}>{n}</span>
        <span className="min-w-0">
          <Link
            href={`/b/${id}/s/${s.key}`}
            className={`hover:underline hover:underline-offset-4 ${s.checkpoint ? "display text-lg font-bold" : "font-semibold"}`}
          >
            {title}
          </Link>
          <span className="hint block">
            About {minutesOf(s)} min
            {toAnswer
              ? `. The review raised ${toAnswer} ${toAnswer === 1 ? "challenge" : "challenges"} that still ${toAnswer === 1 ? "needs" : "need"} your answer`
              : s.checkpoint
                ? r?.approved_at
                  ? ", reviewed"
                  : ", review checkpoint: have your plan challenged"
                : ""}
          </span>
        </span>
        {route === "focused" ? (
          <span />
        ) : (
          <input
            type="date"
            name={`date_${s.key}`}
            aria-label={`Date for ${title}`}
            defaultValue={r?.scheduled_on ?? ""}
            className="input w-auto py-1"
            disabled={!!r?.completed_at}
          />
        )}
        <span className="tag w-24 justify-center" data-tone={st.tone}>{st.text}</span>
      </li>
    );
  };

  let counter = 0;

  return (
    <div className="max-w-4xl">
      <Notice error={error} saved={saved} />
      <p className="hint">{ROUTE_LABEL[route] ?? "Planning programme"}</p>
      <h1 className="text-4xl font-bold leading-none sm:text-5xl">Your planning programme</h1>
      <p className="mt-3 text-[var(--muted)]">
        {doneCount} of {built.length} sessions done.{" "}
        {behind ? `${behind} behind schedule.` : "On schedule."} The dates set the pace, but nothing is locked: you can do
        the next session whenever you&apos;re ready.
      </p>
      {route === "partial" && (
        <p className="mt-3 rounded border border-[var(--line)] bg-[var(--surface)] p-3 text-sm">
          {biz?.current_need === "quarter"
            ? "A short programme for this quarter's priorities: a quick check of the biggest obstacle, a review, then the quarter's priorities and who owns them."
            : "A short programme to refresh an existing plan: re-check the business model and evidence, re-check the biggest obstacle, have it challenged, and update where you're going."}
        </p>
      )}

      <Link href={journey.next.href} className="card mt-6 flex flex-wrap items-center justify-between gap-4 border-2 border-[var(--ink)] p-5 hover:bg-[#f7f8fa]">
        <span className="min-w-0 flex-1">
          <span className="hint block">Next thing to do. {journey.next.stage}</span>
          <span className="display block text-2xl font-bold leading-tight">{journey.next.title}</span>
          <span className="hint block">{journey.next.why}</span>
        </span>
        <span className="btn">{journey.next.label}</span>
      </Link>

      <form action={saveSchedule} className="mt-10">
        <input type="hidden" name="business_id" value={id} />
        <div className="flex items-baseline justify-between border-b border-[var(--line)] pb-2">
          <h2 className="text-2xl font-bold">{route === "focused" ? "Sittings and dates" : "Sessions and dates"}</h2>
          <span className="hint">Change any date to suit you</span>
        </div>

        {groups.map((g, gi) => {
          const first = g.items[0] ? byKey.get(g.items[0].key) : undefined;
          const total = g.items.reduce((a, s) => a + minutesOf(s), 0);
          return (
            <section key={g.title || "all"} className="mt-6">
              {route !== "focused" && <h3 className="display text-xl font-bold">{g.title}</h3>}
              {g.build && (
                <>
                  <p className="hint">
                    Not sessions with dates. Say how the business works and who is in the team before you plan the year.
                  </p>
                  <ul className="divide-y divide-[var(--line)]">
                    {buildRows.map((r) => (
                      <li key={r.href} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 py-3">
                        <span />
                        <span className="min-w-0">
                          <Link href={r.href} className="font-semibold hover:underline hover:underline-offset-4">{r.title}</Link>
                          <span className="hint block">{r.detail}</span>
                        </span>
                        {r.tag && <span className="tag w-24 justify-center" data-tone={r.tag.tone}>{r.tag.text}</span>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {route === "focused" && (
                <div className="flex flex-wrap items-end justify-between gap-3 rounded bg-[var(--surface)] p-3">
                  <div>
                    <p className="hint">Sitting {gi + 1}</p>
                    <h3 className="display text-xl font-bold">{g.title}</h3>
                    <p className="hint">
                      About {total >= 60 ? `${Math.floor(total / 60)} h ${total % 60 ? `${total % 60} min` : ""}` : `${total} min`}
                    </p>
                  </div>
                  <input
                    type="date"
                    aria-label={`Date for sitting ${gi + 1}`}
                    name={`group_${gi}`}
                    defaultValue={first?.scheduled_on ?? ""}
                    className="input w-auto py-1"
                  />
                  {g.items.map((s) => (
                    <input key={s.key} type="hidden" name={`group_${gi}_key`} value={s.key} />
                  ))}
                </div>
              )}
              <ol className="divide-y divide-[var(--line)]">{g.items.map((s) => renderRow(s, ++counter))}</ol>
            </section>
          );
        })}

        <div className="card mt-6 grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="sign_off_date">Sign-off date</label>
            <p className="hint mb-2">The day the plan is finished and agreed. Sessions are spread to finish by then.</p>
            <input id="sign_off_date" name="sign_off_date" type="date" className="input w-auto" defaultValue={biz?.sign_off_date ?? ""} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary">Save dates</button>
            {!committed && byKey.has("commit") && (
              <button className="btn" name="commit" value="1">
                I commit to these dates
              </button>
            )}
          </div>
        </div>
        {!committed && (
          <p className="hint mt-2">
            Committing puts the dates on record. Add them to your calendar now, as you would a meeting you can&apos;t miss.
          </p>
        )}
      </form>

      <form action={setRoute} className="mt-10 flex flex-wrap items-center gap-2">
        <input type="hidden" name="business_id" value={id} />
        <label htmlFor="route" className="hint">Change how you plan</label>
        <select id="route" name="route" className="input w-auto py-1.5" defaultValue={route}>
          <option value="guided">Guided programme</option>
          <option value="focused">Focused sittings</option>
          {biz?.current_need === "quarter" || biz?.current_need === "refresh" ? <option value="partial">Short programme</option> : null}
          <option value="board">Straight to the full plan</option>
        </select>
        <button className="btn btn-secondary py-1.5">Change</button>
      </form>
    </div>
  );
}
