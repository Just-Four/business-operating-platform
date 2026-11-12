import { createClient } from "@/lib/supabase/server";
import NextPart from "@/components/NextPart";
import Notice from "@/components/Notice";
import { loadStandardRhythm, saveRhythm } from "../actions";

type Item = { id: string; name: string; cadence: string; when_text: string | null; minutes: number | null; attendees: string | null; agenda: string | null };

const CADENCE: Record<string, string> = { weekly: "Every week", monthly: "Every month", quarterly: "Every quarter", yearly: "Once a year" };
const ORDER = ["weekly", "monthly", "quarterly", "yearly"];

function length(m: number | null) {
  if (!m) return "";
  return m < 90 ? `${m} minutes` : `${(m / 60).toLocaleString("en-GB", { maximumFractionDigits: 1 })} hours`;
}

function ItemForm({ businessId, item }: { businessId: string; item?: Item }) {
  const p = item?.id ?? "new";
  return (
    <form action={saveRhythm} className="space-y-4">
      <input type="hidden" name="business_id" value={businessId} />
      {item && <input type="hidden" name="id" value={item.id} />}
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <div>
          <label className="label" htmlFor={`${p}-name`}>Meeting</label>
          <input className="input" id={`${p}-name`} name="name" required defaultValue={item?.name ?? ""} placeholder="Weekly check-in" />
        </div>
        <div>
          <label className="label" htmlFor={`${p}-cadence`}>How often</label>
          <select className="input" id={`${p}-cadence`} name="cadence" defaultValue={item?.cadence ?? "weekly"}>
            {ORDER.map((c) => (
              <option key={c} value={c}>{CADENCE[c]}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem_1fr]">
        <div>
          <label className="label" htmlFor={`${p}-when`}>When</label>
          <input className="input" id={`${p}-when`} name="when_text" defaultValue={item?.when_text ?? ""} placeholder="Monday 9am" />
        </div>
        <div>
          <label className="label" htmlFor={`${p}-minutes`}>Minutes</label>
          <input className="input" id={`${p}-minutes`} name="minutes" inputMode="numeric" defaultValue={item?.minutes ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor={`${p}-attendees`}>Who&apos;s there</label>
          <input className="input" id={`${p}-attendees`} name="attendees" defaultValue={item?.attendees ?? ""} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor={`${p}-agenda`}>What it covers</label>
        <p className="hint mb-2">One item per line. The same list every time, so nobody has to prepare an agenda.</p>
        <textarea className="input min-h-28" id={`${p}-agenda`} name="agenda" defaultValue={item?.agenda ?? ""} />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button className="btn">{item ? "Save" : "Add meeting"}</button>
        {item && <button name="remove" value="1" className="text-sm text-[var(--muted)] underline underline-offset-4">Remove this meeting</button>}
      </div>
    </form>
  );
}

export default async function RhythmPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error, saved } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("rhythm_items").select("*").eq("business_id", id).order("sort");
  const items = ((data ?? []) as Item[]).sort((a, b) => ORDER.indexOf(a.cadence) - ORDER.indexOf(b.cadence));
  const missing = ORDER.filter((c) => !items.some((i) => i.cadence === c));

  return (
    <div className="max-w-4xl">
      <Notice error={error} saved={saved} />
      <p className="hint">Stage 5: Review</p>
      <h1 className="text-4xl font-bold leading-none sm:text-5xl">Meetings</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">
        A plan only works if someone looks at it on a fixed beat. These are the few standing meetings that keep it alive.
        Short and regular beats long and occasional. If you work alone, they&apos;re still worth keeping as appointments
        with yourself.
      </p>

      {missing.length > 0 && (
        <form action={loadStandardRhythm} className="card mt-6 flex flex-wrap items-center justify-between gap-3 p-4">
          <input type="hidden" name="business_id" value={id} />
          <p className="text-sm">
            <span className="font-semibold">{items.length ? "Fill the gaps with the standard meetings" : "Start with the standard four"}</span>
            <span className="hint block">
              A weekly check-in, a monthly review, a quarterly reset and a yearly plan, each with a set list to cover. Change anything afterwards.
            </span>
          </p>
          <button className="btn">{items.length ? "Add the missing ones" : "Load the standard rhythm"}</button>
        </form>
      )}

      <div className="mt-6 space-y-3">
        {items.map((i) => (
          <details key={i.id} className="card p-0">
            <summary className="flex cursor-pointer flex-wrap items-start gap-x-4 gap-y-2 p-4">
              <span className="min-w-0 flex-1">
                <span className="display block text-xl font-bold">{i.name}</span>
                <span className="hint block">{[CADENCE[i.cadence], i.when_text, length(i.minutes), i.attendees].filter(Boolean).join(", ")}</span>
                {i.agenda && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
                    {i.agenda.split("\n").filter((l) => l.trim()).map((l, n) => <li key={n}>{l}</li>)}
                  </ul>
                )}
              </span>
              <span className="text-sm underline underline-offset-4">Change</span>
            </summary>
            <div className="border-t border-[var(--line)] p-4">
              <ItemForm businessId={id} item={i} />
            </div>
          </details>
        ))}
      </div>

      <details className="card mt-4 p-0">
        <summary className="cursor-pointer p-4 font-semibold">Add a meeting of your own</summary>
        <div className="border-t border-[var(--line)] p-4">
          <ItemForm businessId={id} />
        </div>
      </details>
      <NextPart businessId={id} slug="rhythm" />
    </div>
  );
}
