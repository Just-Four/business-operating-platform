import Link from "next/link";
import NextPart from "@/components/NextPart";
import { createClient } from "@/lib/supabase/server";
import { saveRole } from "../actions";
import Notice from "@/components/Notice";
import { ROUTES, DEFAULT_GATES } from "@/lib/framework";

type Role = {
  id: string;
  name: string;
  purpose: string | null;
  filled_by: string | null;
  route: string;
  fallback_route: string | null;
  standing_instructions: string | null;
  knowledge: string | null;
  capacity_trigger: string | null;
  approval_gates: string[] | null;
};

function RouteSelect({ name, value, allowNone }: { name: string; value?: string | null; allowNone?: boolean }) {
  return (
    <select className="input" id={name} name={name} defaultValue={value ?? (allowNone ? "" : "person")}>
      {allowNone && <option value="">No fallback</option>}
      {Object.entries(ROUTES).map(([k, r]) => (
        <option key={k} value={k}>
          {r.label}
        </option>
      ))}
    </select>
  );
}

function RoleForm({ businessId, role, back }: { businessId: string; role?: Role; back?: string }) {
  const p = role?.id ?? "new";
  return (
    <form action={saveRole} className="space-y-4">
      <input type="hidden" name="business_id" value={businessId} />
      {back && <input type="hidden" name="return_to" value={back} />}
      {role && <input type="hidden" name="id" value={role.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${p}-name`}>Role name</label>
          <input className="input" id={`${p}-name`} name="name" required defaultValue={role?.name ?? ""} placeholder="Sales lead" />
        </div>
        <div>
          <label className="label" htmlFor={`${p}-filled_by`}>Who fills it now</label>
          <input className="input" id={`${p}-filled_by`} name="filled_by" defaultValue={role?.filled_by ?? ""} placeholder="A name, an agent, or leave blank if vacant" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor={`${p}-purpose`}>Purpose</label>
        <p className="hint mb-2">What this role is accountable for, in one line.</p>
        <input className="input" id={`${p}-purpose`} name="purpose" defaultValue={role?.purpose ?? ""} placeholder="Turn enquiries into signed customers" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${p}-route`}>Who or what does the work</label>
          <RouteSelect name="route" value={role?.route} />
        </div>
        <div>
          <label className="label" htmlFor={`${p}-fallback_route`}>If that fails, hand it to</label>
          <RouteSelect name="fallback_route" value={role?.fallback_route} allowNone />
        </div>
      </div>
      <div>
        <label className="label" htmlFor={`${p}-standing_instructions`}>Standing instructions</label>
        <p className="hint mb-2">How this role works, written so a new person or an AI agent could follow it on day one.</p>
        <textarea className="input min-h-28" id={`${p}-standing_instructions`} name="standing_instructions" defaultValue={role?.standing_instructions ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor={`${p}-knowledge`}>What it needs to know</label>
        <p className="hint mb-2">Prices, policies, tone of voice, links to documents.</p>
        <textarea className="input min-h-20" id={`${p}-knowledge`} name="knowledge" defaultValue={role?.knowledge ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor={`${p}-approval_gates`}>Needs approval before</label>
        <p className="hint mb-2">One per line. Tasks that touch these wait for a person to approve.</p>
        <textarea className="input min-h-24" id={`${p}-approval_gates`} name="approval_gates" defaultValue={(role?.approval_gates ?? DEFAULT_GATES).join("\n")} />
      </div>
      <div>
        <label className="label" htmlFor={`${p}-capacity_trigger`}>When to add capacity</label>
        <p className="hint mb-2">The sign this role needs more help, for example a measure staying red for three weeks.</p>
        <input className="input" id={`${p}-capacity_trigger`} name="capacity_trigger" defaultValue={role?.capacity_trigger ?? ""} />
      </div>
      <button className="btn">{role ? "Save role" : "Add role"}</button>
    </form>
  );
}

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; session?: string }>;
}) {
  const { id } = await params;
  const { error, saved, session } = await searchParams;
  const back = session ? `/b/${id}/team?session=${session}` : undefined;
  const supabase = await createClient();
  const [{ data: roles }, { data: measures }, { data: tasks }] = await Promise.all([
    supabase.from("roles").select("*").eq("business_id", id).eq("active", true).order("created_at"),
    supabase.from("measures").select("id, role_id").eq("business_id", id).eq("active", true),
    supabase.from("tasks").select("id, role_id, status").eq("business_id", id).in("status", ["queued", "in_progress", "blocked", "escalated", "awaiting_approval", "awaiting_review"]),
  ]);
  const list = (roles ?? []) as Role[];

  return (
    <div className="max-w-4xl">
      <Notice error={error} saved={saved} />
      {session && (
        <p className="mb-4 rounded border border-[var(--line)] bg-white p-3 text-sm">
          You&apos;re in a planning session.{" "}
          <Link href={`/b/${id}/s/${session}`} className="font-semibold underline underline-offset-4">Back to the session</Link>
        </p>
      )}
      <p className="hint">Stage 2: Build</p>
      <h1 className="text-4xl font-bold leading-none sm:text-5xl">Roles and team</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">
        Every goal needs an owner. A role can be filled by a person, an AI agent or an automation. Write each one so that
        whoever fills it could start tomorrow, and give it a scorecard so you can see if it&apos;s working.
      </p>

      {list.length === 0 && (
        <div className="card mt-6 p-4">
          <h2 className="font-semibold">Start with the roles that carry the plan</h2>
          <p className="hint mt-1">
            Most businesses start with three to five: someone who wins customers, someone who delivers, someone who
            looks after money and admin. One person can fill several roles.
          </p>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {list.map((r) => {
          const m = (measures ?? []).filter((x) => x.role_id === r.id).length;
          const t = (tasks ?? []).filter((x) => x.role_id === r.id).length;
          return (
            <details key={r.id} className="card group p-0">
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 p-4">
                <span className="min-w-0 flex-1">
                  <span className="display block text-xl font-bold">{r.name}</span>
                  <span className="hint block">{r.purpose || "No purpose written yet"}</span>
                </span>
                <span className="tag" data-tone={r.filled_by ? "go" : "stop"}>{r.filled_by || "Vacant"}</span>
                <span className="tag" data-tone="quiet">{ROUTES[r.route]?.label ?? r.route}</span>
                <span className="tag" data-tone={m ? "go" : "wait"}>{m ? `${m} measure${m > 1 ? "s" : ""}` : "No scorecard"}</span>
                {t > 0 && <span className="tag" data-tone="quiet">{t} open task{t > 1 ? "s" : ""}</span>}
              </summary>
              <div className="border-t border-[var(--line)] p-4">
                <RoleForm businessId={id} role={r} back={back} />
                <p className="mt-4 flex gap-5 text-sm">
                  <Link className="underline underline-offset-4" href={`/b/${id}/scorecards`}>Scorecard</Link>
                  <Link className="underline underline-offset-4" href={`/b/${id}/tasks?role=${r.id}`}>Tasks</Link>
                </p>
              </div>
            </details>
          );
        })}
      </div>

      <details className="card mt-6 p-0" open={list.length === 0}>
        <summary className="cursor-pointer p-4 font-semibold">Add a role</summary>
        <div className="border-t border-[var(--line)] p-4">
          <RoleForm businessId={id} back={back} />
        </div>
      </details>
      <NextPart businessId={id} slug="team" />
    </div>
  );
}
