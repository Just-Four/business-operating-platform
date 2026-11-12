import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { pasteMembers, saveMember } from "../actions";
import Notice from "@/components/Notice";

type Member = { id: string; name: string; email: string | null; note: string | null; active: boolean };
type Role = { id: string; name: string; department: string | null };

function MemberForm({ businessId, member, roles, held }: { businessId: string; member?: Member; roles: Role[]; held: string[] }) {
  const p = member?.id ?? "new";
  return (
    <form action={saveMember} className="space-y-4">
      <input type="hidden" name="business_id" value={businessId} />
      {member && <input type="hidden" name="id" value={member.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${p}-name`}>Name</label>
          <input className="input" id={`${p}-name`} name="name" required defaultValue={member?.name ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor={`${p}-email`}>Email (optional)</label>
          <input className="input" id={`${p}-email`} name="email" type="email" defaultValue={member?.email ?? ""} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor={`${p}-note`}>Note (optional)</label>
        <input className="input" id={`${p}-note`} name="note" defaultValue={member?.note ?? ""} placeholder="Partner, two days a week" />
      </div>
      <fieldset>
        <legend className="label">Roles this person holds</legend>
        <p className="hint mb-2">Tick as many as they hold. Change these whenever the work moves between people.</p>
        {roles.length === 0 ? (
          <p className="text-sm">
            No roles yet. <Link className="font-semibold underline underline-offset-4" href={`/b/${businessId}/team`}>Add the roles</Link>
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => (
              <label key={r.id} className="flex cursor-pointer items-center gap-2 rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm has-[:checked]:border-[var(--ink)] has-[:checked]:bg-[#e9edf3]">
                <input type="checkbox" name="role_id" value={r.id} defaultChecked={held.includes(r.id)} className="h-4 w-4" />
                {r.name}
                {r.department ? <span className="text-[var(--muted)]">({r.department})</span> : null}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      {member && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="left" value="1" className="h-4 w-4" defaultChecked={!member.active} />
          No longer in the team
        </label>
      )}
      <button className="btn">{member ? "Save" : "Add this person"}</button>
    </form>
  );
}

export default async function PeoplePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error, saved } = await searchParams;
  const supabase = await createClient();
  const [{ data: people }, { data: roles }, { data: links }, { data: steps }, { data: tasks }] = await Promise.all([
    supabase.from("team_members").select("id, name, email, note, active").eq("business_id", id).order("created_at"),
    supabase.from("roles").select("id, name, department").eq("business_id", id).eq("active", true).order("created_at"),
    supabase.from("role_assignments").select("role_id, member_id").eq("business_id", id),
    supabase.from("process_steps").select("role_id, minutes").eq("business_id", id),
    supabase.from("tasks").select("role_id, status").eq("business_id", id).in("status", ["queued", "in_progress", "blocked", "escalated", "awaiting_approval", "awaiting_review", "failed"]),
  ]);
  const all = (people ?? []) as Member[];
  const active = all.filter((m) => m.active);
  const gone = all.filter((m) => !m.active);
  const roleList = (roles ?? []) as Role[];
  const unheld = roleList.filter((r) => !(links ?? []).some((l) => l.role_id === r.id && active.some((m) => m.id === l.member_id)));

  const PersonCard = ({ m }: { m: Member }) => {
    const held = (links ?? []).filter((l) => l.member_id === m.id).map((l) => l.role_id);
    const myRoles = roleList.filter((r) => held.includes(r.id));
    const nSteps = (steps ?? []).filter((s) => s.role_id && held.includes(s.role_id)).length;
    const nTasks = (tasks ?? []).filter((t) => t.role_id && held.includes(t.role_id)).length;
    return (
      <details className="card p-0">
        <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 p-4">
          <span className="min-w-0 flex-1">
            <span className="display block text-xl font-bold">{m.name}</span>
            <span className="hint block">{[m.note, m.email].filter(Boolean).join(", ") || (m.active ? "In the team" : "No longer in the team")}</span>
          </span>
          {myRoles.length === 0 && <span className="tag" data-tone="wait">No role yet</span>}
          {myRoles.map((r) => (
            <span key={r.id} className="tag" data-tone="go">{r.name}</span>
          ))}
          {nSteps > 0 && <span className="tag" data-tone="quiet">{nSteps} process step{nSteps > 1 ? "s" : ""}</span>}
          {nTasks > 0 && <span className="tag" data-tone="quiet">{nTasks} open task{nTasks > 1 ? "s" : ""}</span>}
        </summary>
        <div className="border-t border-[var(--line)] p-4">
          <MemberForm businessId={id} member={m} roles={roleList} held={held} />
        </div>
      </details>
    );
  };

  return (
    <div className="max-w-4xl">
      <Notice error={error} saved={saved} />
      <p className="hint">Stage 2: Build</p>
      <h1 className="text-4xl font-bold leading-none sm:text-5xl">Team</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">
        The people in the business. Each person holds one or more roles, and the roles can move between people as the
        business changes. What each role has to do is set on the{" "}
        <Link className="underline underline-offset-4" href={`/b/${id}/team`}>Roles</Link> page, from the processes.
      </p>

      {active.length === 0 && (
        <div className="card mt-6 p-4">
          <p className="font-semibold">Nobody is in the team yet.</p>
          <p className="hint mt-1">Add yourself first, then anyone else who does work in the business.</p>
        </div>
      )}
      <div className="mt-6 space-y-3">
        {active.map((m) => (
          <PersonCard key={m.id} m={m} />
        ))}
      </div>

      {unheld.length > 0 && (
        <section className="mt-8">
          <h2 className="display text-2xl font-bold">Roles nobody holds yet <span className="text-[var(--muted)]">{unheld.length}</span></h2>
          <p className="hint">Open a person above and tick the role, or leave it until someone is found.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {unheld.map((r) => (
              <li key={r.id} className="tag" data-tone="stop">
                {r.name}
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="card mt-8 p-0" open={active.length === 0}>
        <summary className="cursor-pointer p-4 font-semibold">Add a person</summary>
        <div className="border-t border-[var(--line)] p-4">
          <MemberForm businessId={id} roles={roleList} held={[]} />
        </div>
      </details>
      <details className="card mt-3 p-0">
        <summary className="cursor-pointer p-4 font-semibold">Or add several people at once</summary>
        <form action={pasteMembers} className="space-y-3 border-t border-[var(--line)] p-4">
          <input type="hidden" name="business_id" value={id} />
          <p className="hint">One name on each line. You give them their roles afterwards.</p>
          <textarea className="input min-h-24" name="pasted" aria-label="Names to add" />
          <button className="btn">Add these people</button>
        </form>
      </details>

      {gone.length > 0 && (
        <section className="mt-8">
          <h2 className="display text-xl font-bold">No longer in the team</h2>
          <div className="mt-3 space-y-3">
            {gone.map((m) => (
              <PersonCard key={m.id} m={m} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
