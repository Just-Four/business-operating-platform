import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import { ownerOpenBusiness, ownerStopViewing } from "../actions";

type Row = {
  email: string;
  signed_up: string;
  confirmed: boolean;
  last_sign_in: string | null;
  business_id: string | null;
  business_name: string | null;
  sector: string | null;
  stage: string | null;
  planning_route: string | null;
  business_created: string | null;
  boxes_filled: number;
  sessions_done: number;
  sessions_total: number;
  last_session: string | null;
  moments: number;
  people: number;
  processes: number;
  runs: number;
  locked: boolean;
  my_role: string | null;
};

const ROUTE: Record<string, string> = { guided: "Guided sessions", focused: "Focused sessions", partial: "Short programme", board: "Straight to the pages" };

function day(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }) : "never";
}

// Only the platform's owner can open this page. Everyone else gets "not found".
export default async function OwnerPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: isOwner } = await supabase.rpc("is_platform_admin");
  if (!isOwner) notFound();
  const { data } = await supabase.rpc("admin_overview");
  const rows = (data ?? []) as Row[];
  const emails = Array.from(new Set(rows.map((r) => r.email)));
  const nBusinesses = rows.filter((r) => r.business_id).length;

  return (
    <>
      <TopBar email={user?.email} />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <p className="text-sm">
          <Link href="/" className="font-semibold underline underline-offset-4">Back to your businesses</Link>
        </p>
        <h1 className="mt-4 text-4xl font-bold leading-none sm:text-5xl">Everyone using the platform</h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          {emails.length} {emails.length === 1 ? "person has" : "people have"} signed up, with {nBusinesses} {nBusinesses === 1 ? "business" : "businesses"} between
          them. Only you can see this page. Opening a business lets you read it but not change it, and each time you open
          or close one is recorded.
        </p>
        {error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}

        <div className="mt-8 space-y-6">
          {emails.map((email) => {
            const mine = rows.filter((r) => r.email === email);
            const u = mine[0];
            const list = mine.filter((r) => r.business_id);
            return (
              <section key={email} className="card p-0" aria-label={email}>
                <div className="p-5">
                  <h2 className="display text-xl font-bold break-all">{email}</h2>
                  <p className="hint">
                    Signed up {day(u.signed_up)}. {u.confirmed ? "Email confirmed." : "Email not confirmed yet."} Last logged in {day(u.last_sign_in)}.
                  </p>
                </div>
                {list.length === 0 ? (
                  <p className="border-t border-[var(--line)] px-5 py-3 text-sm">No business yet.</p>
                ) : (
                  <ul>
                    {list.map((b) => (
                      <li key={b.business_id} className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-[var(--line)] px-5 py-4">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">
                            {b.business_name} {b.locked && <span className="tag ml-1" data-tone="go">Plan locked</span>}
                          </p>
                          <p className="hint">
                            {b.sector ? `${b.sector}. ` : ""}
                            {b.planning_route ? ROUTE[b.planning_route] ?? b.planning_route : "Not set up yet"}. Created {day(b.business_created)}.
                          </p>
                          <p className="mt-1 text-sm">
                            {b.sessions_total > 0 ? `${b.sessions_done} of ${b.sessions_total} sessions done${b.last_session ? `, the last on ${day(b.last_session)}` : ""}. ` : ""}
                            {b.boxes_filled} of 9 business model boxes filled. {b.moments} of 5 moments of the customer&apos;s journey. {b.people}{" "}
                            {b.people === 1 ? "person" : "people"} in the team. {b.processes} {b.processes === 1 ? "process" : "processes"}, {b.runs}{" "}
                            {b.runs === 1 ? "run" : "runs"}.
                          </p>
                        </div>
                        {b.my_role === "viewer" ? (
                          <div className="flex flex-wrap gap-2">
                            <Link className="btn" href={`/b/${b.business_id}`}>Open</Link>
                            <form action={ownerStopViewing}>
                              <input type="hidden" name="business_id" value={b.business_id ?? ""} />
                              <button className="btn btn-secondary">Stop viewing</button>
                            </form>
                          </div>
                        ) : b.my_role ? (
                          <Link className="btn btn-secondary" href={`/b/${b.business_id}`}>Open: it&apos;s yours</Link>
                        ) : (
                          <form action={ownerOpenBusiness}>
                            <input type="hidden" name="business_id" value={b.business_id ?? ""} />
                            <button className="btn">Open to read</button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </main>
    </>
  );
}
