import { createClient } from "@/lib/supabase/server";
import { CANVAS_BOXES } from "@/lib/framework";
import { saveCanvas } from "../actions";
import Notice from "@/components/Notice";

export default async function CanvasPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error, saved } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("canvas_boxes").select("box, answer, evidence").eq("business_id", id);
  const byBox = new Map((data ?? []).map((r) => [r.box, r]));

  return (
    <div>
      <Notice error={error} saved={saved} />
      <h2 className="text-2xl font-semibold">Part 1 – Business model</h2>
      <p className="hint mt-1 max-w-3xl">
        Say what the business is and how it makes money before planning anything. Fill the boxes in order:
        customers first, then what you offer them, then how you deliver it, then the money.
      </p>

      <form action={saveCanvas} className="mt-6 space-y-4">
        <input type="hidden" name="business_id" value={id} />
        {CANVAS_BOXES.map((box, i) => {
          const row = byBox.get(box.key);
          return (
            <div key={box.key} className="card p-4">
              <label className="label" htmlFor={`${box.key}_answer`}>
                {i + 1}. {box.title}
              </label>
              <p className="hint mb-2">{box.question}</p>
              <textarea className="input" id={`${box.key}_answer`} name={`${box.key}_answer`} rows={3} defaultValue={row?.answer ?? ""} />
              <input className="input mt-2" name={`${box.key}_evidence`} placeholder="Evidence (contract, data, conversation). Blank = an assumption for Part 4" defaultValue={row?.evidence ?? ""} />
            </div>
          );
        })}
        <div className="card p-4">
          <h3 className="font-semibold">Four checks before moving on</h3>
          <ul className="hint mt-2 list-disc space-y-1 pl-5">
            <li>Does each value proposition match a named customer segment?</li>
            <li>Does the revenue in box 5 cover the costs in box 9 at a realistic volume?</li>
            <li>Which single partner or resource, if lost, would stop the business? That&apos;s a risk for Part 5.</li>
            <li>Is there a box you couldn&apos;t fill with evidence? That&apos;s an assumption for Part 4.</li>
          </ul>
        </div>
        <button className="btn">Save business model</button>
      </form>
    </div>
  );
}
