import { createClient } from "@/lib/supabase/server";
import { saveDiagnosis } from "../actions";
import Notice from "@/components/Notice";

export default async function DiagnosisPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error, saved } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("diagnoses")
    .select("id, diagnosis, guiding_policy, coordinated_actions, reviewed_on")
    .eq("business_id", id)
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="max-w-3xl">
      <Notice error={error} saved={saved} />
      <h2 className="text-2xl font-semibold">Part 2 – Diagnosis</h2>
      <p className="hint mt-1">
        Name the one challenge that decides whether this business succeeds, before setting a single goal.
        {data?.reviewed_on ? ` Last reviewed ${data.reviewed_on}.` : ""}
      </p>

      <form action={saveDiagnosis} className="mt-6 space-y-4">
        <input type="hidden" name="business_id" value={id} />
        {data?.id && <input type="hidden" name="id" value={data.id} />}
        <div className="card p-4">
          <label className="label" htmlFor="diagnosis">Diagnosis</label>
          <p className="hint mb-2">
            What is the single biggest challenge right now? Be specific: &quot;we have contracts but can&apos;t secure beds fast enough&quot;, not &quot;growth&quot;.
          </p>
          <textarea className="input" id="diagnosis" name="diagnosis" rows={3} defaultValue={data?.diagnosis ?? ""} />
        </div>
        <div className="card p-4">
          <label className="label" htmlFor="guiding_policy">Guiding policy</label>
          <p className="hint mb-2">Our overall approach to dealing with it. Say what we will not do.</p>
          <textarea className="input" id="guiding_policy" name="guiding_policy" rows={3} defaultValue={data?.guiding_policy ?? ""} />
        </div>
        <div className="card p-4">
          <label className="label" htmlFor="coordinated_actions">Coordinated actions</label>
          <p className="hint mb-2">Three to five actions that, taken together, carry out the policy. One per line.</p>
          <textarea
            className="input"
            id="coordinated_actions"
            name="coordinated_actions"
            rows={5}
            defaultValue={(data?.coordinated_actions ?? []).join("\n")}
          />
        </div>
        <div className="card p-4">
          <h3 className="font-semibold">Tests</h3>
          <ul className="hint mt-2 list-disc space-y-1 pl-5">
            <li>Could a competitor read the diagnosis and know exactly what we&apos;re up against?</li>
            <li>Does the guiding policy say what we will not do?</li>
            <li>Every Must-Win Battle in Part 5 must answer this diagnosis directly.</li>
          </ul>
        </div>
        <button className="btn">Save diagnosis</button>
      </form>
    </div>
  );
}
