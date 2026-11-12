import { createClient } from "@/lib/supabase/server";
import { startProgramme } from "../actions";
import Notice from "@/components/Notice";

const Q = {
  experience: [
    ["never", "Never", "This will be my first"],
    ["some", "Once or twice", "I know the basics"],
    ["regular", "Regularly", "I plan every year"],
  ],
  need: [
    ["full_year", "A plan for the year", "Where we're going and how we'll get there"],
    ["launch", "A plan to launch something new", "From idea to first paying customers"],
    ["quarter", "Just this quarter's priorities", "What to focus on for the next three months"],
    ["refresh", "Review and refresh an existing plan", "Check it still holds and update it"],
  ],
  sale: [
    ["none", "Not yet", "We haven't been paid by a customer"],
    ["few", "Yes, a few", "Some sales, but not steady yet"],
    ["steady", "Yes, it's trading steadily", "Regular sales month to month"],
  ],
  pay: [
    ["recurring_contract", "A contract or retainer", "They pay regularly under an agreement"],
    ["capacity", "For a place, room, seat or slot", "They pay to use space or time you have"],
    ["project_pipeline", "Per project", "You win jobs and deliver them"],
    ["transactional", "Each time they buy", "In a shop, online, or at a counter"],
    ["subscription", "A subscription", "Software, membership or a regular box"],
    ["marketplace", "A commission", "Others trade through you and you take a share"],
    ["courses_events", "A course or event fee", "They pay to attend or take part"],
    ["other", "Something else", ""],
  ],
} as const;

function Choice({ name, options, value }: { name: string; options: readonly (readonly [string, string, string])[]; value?: string | null }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map(([v, label, help]) => (
        <label
          key={v}
          className="flex cursor-pointer items-start gap-3 rounded border border-[var(--line)] bg-[var(--surface)] p-3 has-[:checked]:border-[var(--ink)] has-[:checked]:bg-[#e9edf3]"
        >
          <input type="radio" name={name} value={v} required defaultChecked={value === v} className="mt-1" />
          <span>
            <span className="block font-semibold">{label}</span>
            {help && <span className="hint block">{help}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

export default async function StartPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: biz } = await supabase
    .from("businesses")
    .select("name, model, experience, current_need, stage")
    .eq("id", id)
    .single();
  const saleDefault = biz?.stage === "established" ? "steady" : biz?.stage === "early_revenue" ? "few" : biz?.experience ? "none" : null;

  return (
    <div className="max-w-3xl">
      <Notice error={error} />
      <h1 className="text-4xl font-bold leading-none sm:text-5xl">Let&apos;s set up {biz?.name ?? "your plan"}</h1>
      <p className="mt-3 text-[var(--muted)]">
        The first stage is the design of the business. Five quick questions decide how you work through it: short
        guided sessions over a couple of weeks, fewer and longer sessions, or straight to the full pages. You can change
        your mind later.
      </p>
      <p className="hint mt-2">After Design come Build, Plan, Run and Review. You don&apos;t need to think about those yet.</p>

      <form action={startProgramme} className="mt-8 space-y-8">
        <input type="hidden" name="business_id" value={id} />

        <fieldset>
          <legend className="text-xl font-bold">1. Have you written a business plan before?</legend>
          <div className="mt-3"><Choice name="experience" options={Q.experience} value={biz?.experience} /></div>
        </fieldset>

        <fieldset>
          <legend className="text-xl font-bold">2. What do you need right now?</legend>
          <div className="mt-3"><Choice name="need" options={Q.need} value={biz?.current_need} /></div>
        </fieldset>

        <fieldset>
          <legend className="text-xl font-bold">3. Have you made a sale yet?</legend>
          <div className="mt-3"><Choice name="sale" options={Q.sale} value={saleDefault} /></div>
        </fieldset>

        <fieldset>
          <legend className="text-xl font-bold">4. How do your customers pay you?</legend>
          <p className="hint mt-1">Pick the main way. This sets the examples you&apos;ll see and how the numbers are built.</p>
          <div className="mt-3"><Choice name="pay" options={Q.pay} value={biz?.experience ? biz?.model : null} /></div>
        </fieldset>

        <fieldset>
          <legend className="text-xl font-bold">5. When do you need the plan finished?</legend>
          <p className="hint mt-1">Leave it blank and we&apos;ll suggest about two weeks. You can press on faster if you like.</p>
          <input type="date" name="deadline" className="input mt-3 w-auto" />
        </fieldset>

        <details className="card p-4">
          <summary className="cursor-pointer font-semibold">Choose the route yourself</summary>
          <p className="hint mt-2">Otherwise we&apos;ll pick from your answers.</p>
          <select name="route" className="input mt-3 w-auto" defaultValue="">
            <option value="">Pick for me</option>
            <option value="guided">Guided programme: about 14 short sessions with explanations</option>
            <option value="focused">Focused: the same steps, fewer and longer sessions</option>
            <option value="board">Straight to the full plan: no sessions</option>
          </select>
        </details>

        <button className="btn">Set up the business</button>
      </form>
    </div>
  );
}
