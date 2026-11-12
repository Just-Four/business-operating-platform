import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { type Stage } from "@/lib/framework";
import { designParts, yearParts } from "@/lib/journey";

// For businesses working through the parts directly: where to go next.
// The order is Design, then the outline of Build (how it works, the team), then Plan.
// Businesses on a guided programme follow their sessions instead, so they see nothing here.
export default async function NextPart({ businessId, slug }: { businessId: string; slug: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("businesses").select("stage, planning_route").eq("id", businessId).single();
  if (!data || data.planning_route !== "board") return null;
  const stage = data.stage as Stage;
  const order = [
    ...designParts(stage).map((p) => ({ slug: p.slug, title: p.title })),
    { slug: "story", title: "How the business works" },
    { slug: "people", title: "Team" },
    ...yearParts(stage).map((p) => ({ slug: p.slug, title: p.title })),
  ];
  const i = order.findIndex((p) => p.slug === slug);
  if (i < 0) return null;
  const prev = order[i - 1];
  const next = order[i + 1];
  return (
    <nav className="mt-12 flex flex-wrap justify-between gap-3 border-t border-[var(--line)] pt-4 text-sm" aria-label="Next and back">
      {prev ? (
        <Link href={`/b/${businessId}/${prev.slug}`} className="hover:underline">
          Back: {prev.title}
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link href={`/b/${businessId}/${next.slug}`} className="font-semibold hover:underline">
          Next: {next.title}
        </Link>
      ) : (
        <Link href={`/b/${businessId}/s/sign_off`} className="font-semibold hover:underline">
          Next: Have the plan reviewed
        </Link>
      )}
    </nav>
  );
}
