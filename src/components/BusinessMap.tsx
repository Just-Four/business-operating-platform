import Link from "next/link";
import { TIERS, type FnSummary } from "@/lib/functions";

// The business on one page: the seven parts, each showing where it stands.
export default function BusinessMap({ businessId, parts }: { businessId: string; parts: FnSummary[] }) {
  return (
    <section className="mt-10" aria-labelledby="map-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="map-heading" className="display text-2xl font-bold">Your business on a page</h2>
        <p className="hint">Ready means a part has a process, an owner and a number. Open any part to see inside it.</p>
      </div>
      {TIERS.map((t) => {
        const row = parts.filter((p) => p.fn.tier === t.key);
        return (
          <div key={t.key} className="mt-4">
            <p className="hint mb-2">{t.label}</p>
            <ul className={`grid gap-3 ${row.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
              {row.map((p) => (
                <li key={p.fn.key}>
                  <Link href={`/b/${businessId}/f/${p.fn.key}`} className="card flex h-full min-h-32 flex-col gap-1 p-4 hover:bg-[#f7f8fa]">
                    <span className="flex items-start justify-between gap-2">
                      <span className="display text-lg font-bold leading-tight">{p.fn.name}</span>
                      <span className="tag shrink-0" data-tone={p.status.tone}>{p.status.text}</span>
                    </span>
                    <span className="hint">{p.fn.job}</span>
                    <span className="mt-auto text-sm">
                      {p.processes.length ? `${p.processes.length} process${p.processes.length === 1 ? "" : "es"}` : "No process yet"}.{" "}
                      {p.owners.length ? p.owners.join(", ") : "Nobody yet"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
