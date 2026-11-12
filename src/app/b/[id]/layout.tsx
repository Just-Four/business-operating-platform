import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MODELS, STAGES, STATE_LABELS, type Stage } from "@/lib/framework";
import { getProgress } from "@/lib/progress";
import { SESSIONS, sessionTitle } from "@/lib/programme";
import { type RouteStop } from "@/components/SideRoute";
import SideNav from "@/components/SideNav";
import { getNeeds, planParts } from "@/lib/journey";
import { signOut } from "@/app/login/actions";

export default async function BusinessLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, model, sector, stage, country, planning_route")
    .eq("id", id)
    .maybeSingle();
  if (!business) notFound();
  const stage = business.stage as Stage;
  const progress = await getProgress(supabase, id);

  const guided = ["guided", "focused", "partial"].includes(business.planning_route ?? "");
  const { data: sessionRows } = guided
    ? await supabase.from("programme_sessions").select("key, completed_at, approved_at").eq("business_id", id)
    : { data: [] as { key: string; completed_at: string | null; approved_at: string | null }[] };
  const inProgramme = new Set((sessionRows ?? []).map((x) => x.key));
  const sessionStops: RouteStop[] = SESSIONS.filter((s) => inProgramme.size === 0 || inProgramme.has(s.key)).map((s, i) => {
    const r = (sessionRows ?? []).find((x) => x.key === s.key);
    return {
      num: i + 1,
      slug: `s/${s.key}`,
      title: sessionTitle(s.key, business.stage),
      state: !s.built ? "off" : r?.completed_at ? "complete" : "empty",
      note: !s.built ? "Not available yet" : s.checkpoint ? (r?.approved_at ? "Reviewed" : "Review checkpoint") : undefined,
      highlight: !!s.checkpoint,
    };
  });

  const stops: RouteStop[] = planParts(stage).map((p) => {
    const s = p.stages[stage];
    return {
      num: p.num,
      slug: p.slug,
      title: p.title,
      state: progress.states[p.slug] ?? "empty",
      note: s === "on" ? undefined : STATE_LABELS[s],
    };
  });
  const needs = await getNeeds(supabase, id);
  const waiting = needs.filter((n) => n.acts).length;
  const sessionsDone = sessionStops.filter((s) => s.state === "complete").length;
  const partsDone = stops.filter((s) => s.state === "complete").length;
  const planNote = guided ? `${sessionsDone} of ${sessionStops.length} sessions done` : `${partsDone} of ${stops.length} parts complete`;

  return (
    <div className="min-h-screen lg:flex">
      <aside className="bg-[var(--ink)] text-white lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:shrink-0 lg:overflow-y-auto">
        <div className="flex h-full flex-col px-5 py-6">
          <Link href="/" className="text-sm text-white/70 hover:text-white">
            All businesses
          </Link>
          <Link href={`/b/${id}`} className="mt-4 block">
            <span className="display block text-2xl font-bold leading-tight">{business.name}</span>
            <span className="mt-1 block text-sm text-white/70">
              {[business.sector || MODELS[business.model], business.country].filter(Boolean).join(", ")}
            </span>
            <span className="tag mt-3" data-tone="wait">
              {STAGES[stage]}
            </span>
          </Link>
          <SideNav businessId={id} guided={guided} planStops={guided ? sessionStops : stops} planNote={planNote} waiting={waiting} />
          <div className="mt-8 border-t border-white/15 pt-4 text-sm">
            <p className="truncate text-white/60">{user?.email}</p>
            <form action={signOut}>
              <button className="mt-1 text-white/85 underline-offset-4 hover:underline">Sign out</button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-6 py-8 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
