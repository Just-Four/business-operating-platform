import Link from "next/link";
import type { Need } from "@/lib/journey";

// One line per thing that needs someone, each with one button that says what to do.
export default function NeedsList({ needs, limit }: { needs: Need[]; limit?: number }) {
  const shown = limit ? needs.slice(0, limit) : needs;
  if (!shown.length) return null;
  return (
    <ul className="space-y-2">
      {shown.map((n) => (
        <li key={n.taskId} className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
          <span className="min-w-0 flex-1">
            <span className="block font-semibold leading-snug">{n.title}</span>
            <span className="hint block">
              {n.line}
              {n.who ? ` Role: ${n.who}.` : ""}
            </span>
          </span>
          <Link className={n.acts ? "btn" : "btn btn-secondary"} href={n.href}>
            {n.label}
          </Link>
        </li>
      ))}
      {limit && needs.length > limit && <li className="hint">And {needs.length - limit} more on the dashboard.</li>}
    </ul>
  );
}
