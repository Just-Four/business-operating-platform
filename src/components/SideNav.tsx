"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SideRoute, { type RouteStop } from "@/components/SideRoute";
import { DESIGN_SESSIONS, PLAN_SESSIONS } from "@/lib/programme";

const DESIGN_PAGES = ["canvas", "diagnosis", "direction", "programme", "start"];
const PLAN_PAGES = ["launch", "year", "quarter"];

// The left menu: home and the dashboard on top, then the five stages in order.
export default function SideNav({
  businessId,
  guided,
  designStops,
  designNote,
  planStops,
  planNote,
  waiting,
  next,
  buildNotes,
  reviewNote,
}: {
  businessId: string;
  guided: boolean;
  designStops: RouteStop[];
  designNote: string;
  planStops: RouteStop[];
  planNote: string;
  waiting: number;
  next: { title: string; href: string };
  buildNotes: Record<string, string>;
  reviewNote: string;
}) {
  const pathname = usePathname();
  const base = `/b/${businessId}`;
  const parts = pathname.slice(base.length + 1).split("/");
  const first = parts[0];
  const onDesign = DESIGN_PAGES.includes(first) || (first === "s" && DESIGN_SESSIONS.includes(parts[1]));
  const onPlan = PLAN_PAGES.includes(first) || (first === "s" && PLAN_SESSIONS.includes(parts[1]));

  const Item = ({ href, label, badge, note }: { href: string; label: string; badge?: number; note?: string }) => {
    const current = pathname === href || (href !== base && pathname.startsWith(`${href}/`));
    return (
      <Link
        href={href}
        aria-current={current ? "page" : undefined}
        className={`flex items-center justify-between rounded px-2 py-1.5 hover:bg-white/10 ${current ? "bg-white/15 font-semibold" : ""}`}
      >
        <span>{label}</span>
        {badge ? <span className="rounded-full bg-[var(--wait)] px-2 text-xs font-bold text-[var(--ink)]">{badge}</span> : null}
        {note ? <span className={`shrink-0 pl-2 text-[12px] ${note === "Complete" ? "text-white/55" : "text-[#f3c869]"}`}>{note === "Complete" ? "Done" : note}</span> : null}
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
      <Item href={`${base}/dashboard`} label="Dashboard: your to-do list" badge={waiting} />
      <Link href={next.href} className="mt-3 block rounded border border-[#f3c869] px-3 py-2 hover:bg-white/10">
        <span className="block text-[11px] uppercase tracking-wide text-[#f3c869]">Next thing to do</span>
        <span className="block font-semibold leading-snug">{next.title}</span>
      </Link>

      <Head n={1} title="Design" />
      <details key={onDesign ? "design-open" : "design-closed"} open={onDesign}>
        <summary className="cursor-pointer rounded px-2 py-1.5 hover:bg-white/10">{designNote}</summary>
        <div className="mt-2 pl-1">
          <SideRoute businessId={businessId} stops={designStops} />
          {guided && (
            <div className="mt-3 space-y-1">
              <Item href={`${base}/programme`} label="All sessions and dates" />
            </div>
          )}
        </div>
      </details>

      <Head n={2} title="Build" />
      <Item href={`${base}/story`} label="How the business works" note={buildNotes[`${base}/story`]} />
      <Item href={`${base}/people`} label="Team" note={buildNotes[`${base}/people`]} />
      <Item href={`${base}/processes`} label="Processes" note={buildNotes[`${base}/processes`]} />
      <Item href={`${base}/team`} label="Roles" note={buildNotes[`${base}/team`]} />

      <Head n={3} title="Plan" />
      <details key={onPlan ? "plan-open" : "plan-closed"} open={onPlan}>
        <summary className="cursor-pointer rounded px-2 py-1.5 hover:bg-white/10">{planNote}</summary>
        <div className="mt-2 pl-1">
          <SideRoute businessId={businessId} stops={planStops} />
          {!guided && (
            <div className="mt-3 space-y-1">
              <Item href={`${base}/s/sign_off`} label="Have the plan reviewed" note={reviewNote} />
              <Link href={`${base}/year#lock`} className="block rounded px-2 py-1.5 hover:bg-white/10">Lock the plan</Link>
            </div>
          )}
        </div>
      </details>

      <Head n={4} title="Run" />
      <Item href={`${base}/tasks`} label="Tasks" />
      <Item href={`${base}/scorecards`} label="Scorecards" />

      <Head n={5} title="Review" />
      <Item href={`${base}/rhythm`} label="Meetings" />
      <Item href={`${base}/reviews`} label="Monthly review" />
    </nav>
  );
}
