"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveRole } from "@/app/b/[id]/actions";

export type ChartRole = { id: string; name: string; area: string | null; holders: string[]; reportsTo: string | null };

// The roles as a chart. Drag a role onto the role it reports to; drop it on the bar to put it at the top.
export default function OrgChart({ businessId, roles, canEdit = true }: { businessId: string; roles: ChartRole[]; canEdit?: boolean }) {
  const router = useRouter();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const ids = new Set(roles.map((r) => r.id));
  const parentOf = (r: ChartRole) => (r.reportsTo && ids.has(r.reportsTo) ? r.reportsTo : null);
  const top = roles.filter((r) => !parentOf(r));
  const kids = (id: string) => roles.filter((r) => parentOf(r) === id);

  // A role can't report to itself or to anything beneath it.
  const below = (id: string): string[] => kids(id).flatMap((k) => [k.id, ...below(k.id)]);
  const allowed = (target: string | null) => !!dragging && target !== dragging && (target === null || !below(dragging).includes(target));

  const drop = (target: string | null) => {
    const id = dragging;
    setOver(null);
    setDragging(null);
    if (!id || target === id) return;
    if (target && below(id).includes(target)) {
      setMessage("That would make a role report to one beneath it. Move the lower role first.");
      return;
    }
    if ((roles.find((r) => r.id === id)?.reportsTo ?? null) === target) return;
    setMessage(null);
    start(async () => {
      const error = await moveRole(businessId, id, target);
      if (error) setMessage(error);
      router.refresh();
    });
  };

  // A plain function, not a component: the boxes must stay in place while one is being dragged.
  const node = (r: ChartRole): React.ReactNode => {
    const children = kids(r.id);
    const target = over === r.id && allowed(r.id);
    return (
      <li key={r.id}>
        <div
          className="org-box"
          data-over={target ? "true" : undefined}
          data-dragging={dragging === r.id ? "true" : undefined}
          draggable={canEdit}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", r.id);
            setDragging(r.id);
          }}
          onDragEnd={() => {
            setDragging(null);
            setOver(null);
          }}
          onDragOver={(e) => {
            if (!allowed(r.id)) return;
            e.preventDefault();
            setOver(r.id);
          }}
          onDragLeave={() => setOver((o) => (o === r.id ? null : o))}
          onDrop={(e) => {
            e.preventDefault();
            drop(r.id);
          }}
        >
          {r.area && <span className="org-area">{r.area}</span>}
          <span className="org-name">{r.name}</span>
          <span className="org-who" data-empty={r.holders.length ? undefined : "true"}>
            {r.holders.length ? r.holders.join(", ") : "Nobody yet"}
          </span>
        </div>
        {children.length > 0 && (
          <ul>
            {children.map((c) => node(c))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div aria-busy={busy}>
      {canEdit && (
        <div
          className="org-top"
          data-over={over === "top" && allowed(null) ? "true" : undefined}
          onDragOver={(e) => {
            if (!allowed(null)) return;
            e.preventDefault();
            setOver("top");
          }}
          onDragLeave={() => setOver((o) => (o === "top" ? null : o))}
          onDrop={(e) => {
            e.preventDefault();
            drop(null);
          }}
        >
          {dragging ? "Drop here to put this role at the top" : "Drag a role onto the role it reports to. Drop it here to put it at the top."}
        </div>
      )}
      {message && <p className="mt-2 rounded bg-red-50 p-3 text-sm text-red-800">{message}</p>}
      <div className="org-scroll">
        <ul className="org-tree">
          {top.map((r) => node(r))}
        </ul>
      </div>
    </div>
  );
}
