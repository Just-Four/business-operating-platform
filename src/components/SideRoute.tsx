"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type RouteStop = {
  num: number;
  slug: string;
  title: string;
  state: "complete" | "partial" | "empty" | "off";
  note?: string;
};

export default function SideRoute({ businessId, stops }: { businessId: string; stops: RouteStop[] }) {
  const pathname = usePathname();
  return (
    <ol className="route" aria-label="Framework parts">
      {stops.map((s) => {
        const href = `/b/${businessId}/${s.slug}`;
        const current = pathname === href;
        return (
          <li key={s.slug}>
            <Link
              href={href}
              className="stop"
              aria-current={current ? "page" : undefined}
              data-off={s.state === "off" ? "true" : undefined}
            >
              <span className="dot" data-state={s.state} aria-hidden="true">
                {s.state === "complete" ? "✓" : s.num}
              </span>
              <span className="min-w-0 flex-1">
                <span className="stop-label">{s.title}</span>
                {s.note && <span className="block text-[12px] leading-tight text-white/55">{s.note}</span>}
              </span>
              <span className="sr-only">
                {s.state === "complete" ? "complete" : s.state === "partial" ? "started" : s.state === "off" ? "not used at this stage" : "not started"}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
