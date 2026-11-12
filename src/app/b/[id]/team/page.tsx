import Link from "next/link";
import NextPart from "@/components/NextPart";
import { createClient } from "@/lib/supabase/server";
import { saveRole } from "../actions";
import Notice from "@/components/Notice";
import { ROUTES, DEFAULT_GATES } from "@/lib/framework";
import { FUNCTION_NAMES as DEPARTMENTS } from "@/lib/functions";
import OrgChart from "@/components/OrgChart";

type Role = {
  id: string;
  name: string;
  department: string | null;
  reports_to: string | null;
  purpose: string | null;
  filled_by: string | null;
  route: string;
  fallback_route: string | null;
  standing_instructions: string | null;
  knowledge: string | null;
  capacity_trigger: string | null;
  approval_gates: string[] | null;
};
type Member = { id: string; name: string };

function RouteSelect({ id, name, value, allowNone }: { id: string; name: string; value?: string | null; allowNone?: boolean }) {
  return (
    <select className="input" id={id} name={name} defaultValue={value ?? (allowNone ? "" : "person")}>
      {allowNone && <option value="">Nobody</option>}
      {Object.entries(ROUTES).map(([k, r]) => (
        <option key={k} value={k}>
          {r.label}
        </option>
      ))}
    </select>
  );
}

function RoleForm({
  businessId,
  role,
  back,
  members,
  holders,
  areas,
  others,
}: {
  businessId: string;
  role?: Role;
  back?: string;
  members: Member[];
  holders: string[];
  areas: string[];
  others: { id: string; name: string }[];
}) {
  const p = role?.id ?? "new";
  return (
    <form action={saveRole} className="space-y-4">
      <input type="hidden" name="business_id" value={businessId} />
      {back && <input type="hidden" name="return_to" value={back} />}
      {role && <input type="hidden" name="id" value={role.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${p}-name`}>Role name</label>
          <p className="hint mb-2">Name it for the work, not the person.</p>
          <input className="input" id={`${p}-name`} name="name" required defaultValue={role?.name ?? ""} placeholder="Sales lead" />
        </div>
        <div>
          <label className="label" htmlFor={`${p}-department`}>Part of the business</label>
          <p className="hint mb-2">One of the seven parts every business has.</p>
          <select className="input" id={`${p}-department`} name="department" defaultValue={role?.department ?? ""}>
            <option value="">Not set</option>
            {areas.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor={`${p}-purpose`}>What this role is there to get done</label>
        <input className="input" id={`${p}-purpose`} name="purpose" defaultValue={role?.purpose ?? ""} placeholder="Turn enquiries into signed customers" />
      </div>
      <div>
        <label className="label" htmlFor={`${p}-reports_to`}>Reports to</label>
        <select className="input sm:w-1/2" id={`${p}-reports_to`} name="reports_to" defaultValue={role?.reports_to ?? ""}>
          <option value="">Nobody: it is at the top</option>
          {others.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      </div>
      <fieldset>
        <legend className="label">Who holds this role now</legend>
        <p className="hint mb-2">Tick everyone who does. One person can hold several roles. Leave all empty if nobody does yet.</p>
        {members.length === 0 ? (
          <p className="text-sm">
            Nobody is in the team yet. <Link className="font-semibold underline underline-offset-4" href={`/b/${businessId}/people`}>Add your people</Link>
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm has-[:checked]:border-[var(--ink)] has-[:checked]:bg-[#e9edf3]">
                <input type="checkbox" name="member_id" value={m.id} defaultChecked={holders.includes(m.id)} className="h-4 w-4" />
                {m.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <details className="text-sm">
        <summary className="cursor-pointer text-[var(--muted)]">More: instructions, what it needs to know, approvals</summary>
        <div className="mt-3 space-y-4">
          <div>
            <label className="label" htmlFor={`${p}-standing_instructions`}>Standing instructions</label>
            <p className="hint mb-2">How this role works day to day, beyond the steps in its processes. Written so a new person or an AI agent could follow it on day one.</p>
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={`${p}-route`}>One-off tasks for this role are done by</label>
              <RouteSelect id={`${p}-route`} name="route" value={role?.route} />
            </div>
            <div>
              <label className="label" htmlFor={`${p}-fallback_route`}>If that fails, hand it to</label>
              <RouteSelect id={`${p}-fallback_route`} name="fallback_route" value={role?.fallback_route} allowNone />
            </div>
          </div>
        </div>
      </details>
      <button className="btn">{role ? "Save role" : "Add role"}</button>
    </form>
  );
}

export default async function RolesPage({
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
  const [{ data: roles }, { data: measures }, { data: tasks }, { data: processes }, { data: steps }, { data: people }, { data: links }] = await Promise.all([
    supabase.from("roles").select("*").eq("business_id", id).eq("active", true).order("created_at"),
    supabase.from("measures").select("id, role_id").eq("business_id", id).eq("active", true),
    supabase.from("tasks").select("id, role_id, status").eq("business_id", id).in("status", ["queued", "in_progress", "blocked", "escalated", "awaiting_approval", "awaiting_review"]),
    supabase.from("processes").select("id, name, owner_role_id").eq("business_id", id).order("created_at"),
    supabase.from("process_steps").select("id, process_id, seq, title, role_id, route, minutes, review_required").eq("business_id", id).order("seq"),
    supabase.from("team_members").select("id, name").eq("business_id", id).eq("active", true).order("created_at"),
    supabase.from("role_assignments").select("role_id, member_id").eq("business_id", id),
  ]);
  const list = (roles ?? []) as Role[];
  const members = (people ?? []) as Member[];
  const used = Array.from(new Set(list.map((r) => r.department).filter((d): d is string => !!d)));
  const areas = [...DEPARTMENTS, ...used.filter((d) => !DEPARTMENTS.includes(d))];
  const groups = [...areas.filter((a) => used.includes(a)), ...(list.some((r) => !r.department) ? [""] : [])];

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
      <h1 className="text-4xl font-bold leading-none sm:text-5xl">Roles</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">
        A role is a set of work that has to be done, whoever does it. It is defined by the process steps that are its job,
        and it sits in one of the seven parts of the business. People are separate: one person can hold several roles, and a role can
        change hands without changing the role.
      </p>
      <p className="mt-2 text-sm">
        The people are on the <Link className="font-semibold underline underline-offset-4" href={`/b/${id}/people`}>Team</Link> page.
      </p>

      {list.length === 0 && (
        <div className="card mt-6 p-4">
          <h2 className="font-semibold">Start with the roles that carry the plan</h2>
          <p className="hint mt-1">
            Most businesses start with three to five: someone who wins customers, someone who delivers, someone who
            looks after money and admin. One person can hold several.
          </p>
        </div>
      )}

      {list.length > 0 && (
        <section className="mt-8" aria-labelledby="chart-heading">
          <h2 id="chart-heading" className="display text-2xl font-bold">How the roles fit together</h2>
          <div className="card mt-3 p-4">
            <OrgChart
              businessId={id}
              roles={list.map((r) => ({
                id: r.id,
                name: r.name,
                area: r.department,
                reportsTo: r.reports_to,
                holders: members.filter((m) => (links ?? []).some((l) => l.role_id === r.id && l.member_id === m.id)).map((m) => m.name),
              }))}
            />
          </div>
          <p className="hint mt-2">On a phone or tablet, open a role in the list below and use &ldquo;Reports to&rdquo; instead of dragging.</p>
        </section>
      )}

      {list.length > 0 && <h2 className="display mt-10 text-2xl font-bold">The roles, by area</h2>}
      {groups.map((g) => (
        <section key={g || "none"} className="mt-5">
          <h3 className="display text-xl font-bold">{g || "No area set yet"}</h3>
          {!g && <p className="hint">Open a role and pick its part of the business, such as Sales and marketing, Operations or Finance.</p>}
          <div className="mt-3 space-y-3">
            {list
              .filter((r) => (r.department ?? "") === g)
              .map((r) => {
                const m = (measures ?? []).filter((x) => x.role_id === r.id).length;
                const t = (tasks ?? []).filter((x) => x.role_id === r.id).length;
                const mySteps = (steps ?? []).filter((x) => x.role_id === r.id);
                const myProcs = (processes ?? []).filter((pr) => pr.owner_role_id === r.id || mySteps.some((x) => x.process_id === pr.id));
                const mins = mySteps.reduce((a, x) => a + (x.minutes ?? 0), 0);
                const holders = (links ?? []).filter((l) => l.role_id === r.id).map((l) => l.member_id);
                const holderNames = members.filter((x) => holders.includes(x.id)).map((x) => x.name);
                return (
                  <details key={r.id} className="card group p-0">
                    <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 p-4">
                      <span className="min-w-0 flex-1">
                        <span className="block text-lg font-semibold">{r.name}</span>
                        <span className="hint block">{r.purpose || "Nothing written yet about what it is there to get done"}</span>
                      </span>
                      <span className="tag" data-tone={holderNames.length ? "go" : "stop"}>{holderNames.length ? holderNames.join(", ") : "Nobody yet"}</span>
                      <span className="tag" data-tone={mySteps.length ? "go" : "quiet"}>
                        {mySteps.length ? `${mySteps.length} step${mySteps.length > 1 ? "s" : ""} in ${myProcs.length} process${myProcs.length > 1 ? "es" : ""}` : "No process steps"}
                      </span>
                      <span className="tag" data-tone={m ? "go" : "wait"}>{m ? `${m} measure${m > 1 ? "s" : ""}` : "No scorecard"}</span>
                      {t > 0 && <span className="tag" data-tone="quiet">{t} open task{t > 1 ? "s" : ""}</span>}
                    </summary>
                    <div className="border-t border-[var(--line)] p-4">
                      <section className="mb-6 rounded border border-[var(--line)] bg-[var(--paper)] p-4" aria-label="The work this role does">
                        <h3 className="font-semibold">The work this role does</h3>
                        {myProcs.length === 0 ? (
                          <p className="mt-1 text-sm">
                            No process step is this role&apos;s job yet. Open a process, press &ldquo;Change this process&rdquo; and pick this role under &ldquo;Whose job is it?&rdquo; on each step it does.{" "}
                            <Link className="font-semibold underline underline-offset-4" href={`/b/${id}/processes`}>Go to processes</Link>
                          </p>
                        ) : (
                          <>
                            <p className="hint">
                              Taken from the processes. To change a step, change it in its process.
                              {mins > 0 ? ` About ${mins} minutes each time these run.` : ""}
                            </p>
                            <ul className="mt-3 space-y-3 text-sm">
                              {myProcs.map((pr) => (
                                <li key={pr.id}>
                                  <Link className="font-semibold underline underline-offset-4" href={`/b/${id}/processes/${pr.id}`}>{pr.name}</Link>
                                  {pr.owner_role_id === r.id && <span className="tag ml-2" data-tone="go">Owns this process</span>}
                                  <ul className="mt-1 space-y-0.5">
                                    {mySteps
                                      .filter((x) => x.process_id === pr.id)
                                      .map((x) => (
                                        <li key={x.id}>
                                          Step {x.seq}: {x.title}
                                          <span className="text-[var(--muted)]">
                                            {" "}
                                            ({x.route === "person" ? "done by hand" : `done by ${ROUTES[x.route]?.label ?? x.route}${x.review_required ? ", this role checks the result" : ""}`})
                                          </span>
                                        </li>
                                      ))}
                                  </ul>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </section>
                      <RoleForm businessId={id} role={r} back={back} members={members} holders={holders} areas={areas} others={list.filter((x) => x.id !== r.id)} />
                      <p className="mt-4 flex gap-5 text-sm">
                        <Link className="underline underline-offset-4" href={`/b/${id}/scorecards`}>Scorecard</Link>
                        <Link className="underline underline-offset-4" href={`/b/${id}/tasks?role=${r.id}`}>Tasks</Link>
                      </p>
                    </div>
                  </details>
                );
              })}
          </div>
        </section>
      ))}

      <details className="card mt-8 p-0" open={list.length === 0}>
        <summary className="cursor-pointer p-4 font-semibold">Add a role</summary>
        <div className="border-t border-[var(--line)] p-4">
          <RoleForm businessId={id} back={back} members={members} holders={[]} areas={areas} others={list} />
        </div>
      </details>
      <NextPart businessId={id} slug="team" />
    </div>
  );
}
