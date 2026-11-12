import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PARTS, type Stage } from "@/lib/framework";

// For businesses working through the ten parts directly: where to go next.
// Businesses on a guided programme follow their sessions instead, so they see nothing here.
export default async function NextPart({ businessId, slug }: { businessId: string; slug: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("businesses").select("stage, planning_route").eq("id", businessId).single();
  if (!data || data.planning_route !== "board") return null;
  const usable = PARTS.filter((p) => p.num <= 6 && p.built && p.stages[data.stage as Stage] !== "off");
  const i = usable.findIndex((p) => p.slug === slug);
  if (i < 0) return null;
  const prev = usable[i - 1];
  const next = usable[i + 1];
  return (
    <nav className="mt-12 flex flex-wrap justify-between gap-3 border-t border-[var(--line)] pt-4 text-sm" aria-label="Plan parts">
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
