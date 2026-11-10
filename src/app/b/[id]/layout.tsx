import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MODELS, PARTS, STAGES, STATE_LABELS, type Stage } from "@/lib/framework";
import { getProgress } from "@/lib/progress";
import { SESSIONS, sessionTitle } from "@/lib/programme";
import SideRoute, { type RouteStop } from "@/components/SideRoute";
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
      note: !s.built ? "Next build" : s.checkpoint ? (r?.approved_at ? "Reviewed" : "Review checkpoint") : undefined,
      highlight: !!s.checkpoint,
    };
  });

  const stops: RouteStop[] = PARTS.map((p) => {
    const s = p.stages[stage];
    return {
      num: p.num,
      slug: p.slug,
      title: p.title,
      state: s === "off" ? "off" : (progress.states[p.slug] ?? "empty"),
      note: s === "on" ? (p.built ? undefined : "Next build") : STATE_LABELS[s],
    };
  });

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
          {guided && (
            <Link href={`/b/${id}/programme`} className="mt-6 block rounded border border-white/25 px-3 py-2 text-sm hover:bg-white/10">
              Planning programme and dates
            </Link>
          )}
          <nav className="mt-6 flex-1" aria-label={guided ? "Programme sessions" : "Plan parts"}>
            <SideRoute businessId={id} stops={guided ? sessionStops : stops} />
            {guided && (
              <details className="mt-6 text-sm text-white/80">
                <summary className="cursor-pointer hover:text-white">View the plan by part</summary>
                <div className="mt-3">
                  <SideRoute businessId={id} stops={stops} />
                </div>
              </details>
            )}
          </nav>
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
