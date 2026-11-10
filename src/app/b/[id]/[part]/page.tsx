import { notFound } from "next/navigation";
import { PARTS } from "@/lib/framework";

export default async function UpcomingPart({ params }: { params: Promise<{ id: string; part: string }> }) {
  const { part } = await params;
  const p = PARTS.find((x) => x.slug === part);
  if (!p) notFound();
  return (
    <div className="max-w-3xl">
      <p className="hint">Part {p.num}</p>
      <h1 className="text-4xl font-bold leading-none sm:text-5xl">{p.title}</h1>
      <p className="mt-3 text-[var(--muted)]">{p.summary}</p>
      <div className="card mt-6 p-6">
        <p className="font-medium">This screen is in the next build.</p>
        <p className="hint mt-1">The database tables for this part already exist, so nothing entered later will need moving.</p>
      </div>
    </div>
  );
}
