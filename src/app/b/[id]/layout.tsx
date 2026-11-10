import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import { MODELS, PARTS, STAGES, STATE_LABELS, type Stage } from "@/lib/framework";

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

  return (
    <>
      <TopBar email={user?.email} />
      <div className="mx-auto flex max-w-7xl gap-8 px-6 py-8">
        <aside className="w-64 shrink-0">
          <Link href="/" className="hint hover:underline">← Portfolio</Link>
          <Link href={`/b/${id}`} className="mt-3 block">
            <h1 className="text-lg font-semibold leading-tight">{business.name}</h1>
            <p className="hint">
              {MODELS[business.model] ?? business.model} · {STAGES[stage]}
            </p>
          </Link>
          <nav className="mt-6 space-y-1">
            {PARTS.map((p) => {
              const state = p.stages[stage];
              const off = state === "off";
              return (
                <Link
                  key={p.slug}
                  href={`/b/${id}/${p.slug}`}
                  className={`flex items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-white ${off ? "text-[#a3a29c]" : ""}`}
                >
                  <span>
                    <span className="mr-2 inline-block w-5 text-right text-[#8a8983]">{p.num}</span>
                    {p.title}
                  </span>
                  {state !== "on" && <span className="text-[11px] text-[#8a8983]">{STATE_LABELS[state]}</span>}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </>
  );
}
