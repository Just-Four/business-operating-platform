"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SideRoute, { type RouteStop } from "@/components/SideRoute";

const PLAN_PAGES = ["canvas", "diagnosis", "direction", "launch", "year", "quarter", "programme", "start"];

// The left menu: the dashboard on top, then the four stages in order.
export default function SideNav({
  businessId,
  guided,
  planStops,
  planNote,
  waiting,
}: {
  businessId: string;
  guided: boolean;
  planStops: RouteStop[];
  planNote: string;
  waiting: number;
}) {
  const pathname = usePathname();
  const base = `/b/${businessId}`;
  const rest = pathname.slice(base.length + 1);
  const first = rest.split("/")[0];
  const onPlan = first === "s" || PLAN_PAGES.includes(first);

  const Item = ({ href, label, badge }: { href: string; label: string; badge?: number }) => {
    const current = pathname === href || (href !== base && pathname.startsWith(`${href}/`));
    return (
      <Link
        href={href}
        aria-current={current ? "page" : undefined}
        className={`flex items-center justify-between rounded px-2 py-1.5 hover:bg-white/10 ${current ? "bg-white/15 font-semibold" : ""}`}
      >
        <span>{label}</span>
        {badge ? <span className="rounded-full bg-[var(--wait)] px-2 text-xs font-bold text-[var(--ink)]">{badge}</span> : null}
      </Link>
    );
  };
  const Head = ({ n, title }: { n: number; title: string }) => (
    <p className="mb-1 mt-5 flex items-center gap-2 text-xs uppercase tracking-wide text-white/60">
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/40 text-[11px] font-bold">{n}</span>
      {title}
    </p>
  );

  return (
    <nav className="mt-6 flex-1 text-sm" aria-label="Business">
      <Item href={base} label="Home: what to do next" />
      <Item href={`${base}/dashboard`} label="Dashboard" badge={waiting} />

      <Head n={1} title="Plan" />
      <details key={onPlan ? "open" : "closed"} open={onPlan}>
        <summary className="cursor-pointer rounded px-2 py-1.5 hover:bg-white/10">{planNote}</summary>
        <div className="mt-2 pl-1">
          <SideRoute businessId={businessId} stops={planStops} />
          <div className="mt-3 space-y-1">
            {guided ? (
              <Item href={`${base}/programme`} label="All sessions and dates" />
            ) : (
              <>
                <Item href={`${base}/s/sign_off`} label="Have the plan reviewed" />
                <Link href={`${base}/year#lock`} className="block rounded px-2 py-1.5 hover:bg-white/10">Lock the plan</Link>
              </>
            )}
          </div>
        </div>
      </details>

      <Head n={2} title="Build" />
      <Item href={`${base}/processes`} label="Processes" />
      <Item href={`${base}/team`} label="Roles and team" />

      <Head n={3} title="Run" />
      <Item href={`${base}/tasks`} label="Tasks" />
      <Item href={`${base}/scorecards`} label="Scorecards" />

      <Head n={4} title="Review" />
      <Item href={`${base}/rhythm`} label="Meetings" />
      <Item href={`${base}/reviews`} label="Monthly review" />
    </nav>
  );
}
