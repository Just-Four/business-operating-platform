import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MODELS, PARTS, STAGES, STATE_LABELS, type Stage } from "@/lib/framework";
import { getProgress } from "@/lib/progress";
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
    .select("id, name, model, stage, country")
    .eq("id", id)
    .maybeSingle();
  if (!business) notFound();
  const stage = business.stage as Stage;
  const progress = await getProgress(supabase, id);

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
              {MODELS[business.model] ?? business.model}
              {business.country ? `, ${business.country}` : ""}
            </span>
            <span className="tag mt-3" data-tone="wait">
              {STAGES[stage]}
            </span>
          </Link>
          <nav className="mt-8 flex-1">
            <SideRoute businessId={id} stops={stops} />
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
