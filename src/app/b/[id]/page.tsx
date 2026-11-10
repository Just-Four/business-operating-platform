import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MODELS, PARTS, STAGES, STATE_LABELS, type Stage } from "@/lib/framework";
import { getProgress } from "@/lib/progress";
import { updateStage } from "./actions";
import Notice from "@/components/Notice";

const ORDER: Stage[] = ["launch", "early_revenue", "established"];

const GROUPS = [
  { title: "Plan", text: "What the business is, where it's going, and this year's and this quarter's targets.", parts: [1, 2, 3, 4, 5, 6] },
  { title: "Run", text: "Who does the work, how it's measured, and how it's routed.", parts: [7, 8] },
  { title: "Review", text: "The rhythm that checks the plan, and the chairman's monthly review.", parts: [9, 10] },
];

const STATE_TAG: Record<string, { tone: string; text: string }> = {
  complete: { tone: "go", text: "Complete" },
  partial: { tone: "wait", text: "Started" },
  empty: { tone: "quiet", text: "Not started" },
};

export default async function BusinessOverview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error, saved } = await searchParams;
  const supabase = await createClient();
  const { data: biz } = await supabase.from("businesses").select("name, stage, model, sector").eq("id", id).single();
  const stage = (biz?.stage ?? "launch") as Stage;
  const progress = await getProgress(supabase, id);
  const stageIndex = ORDER.indexOf(stage);

  const builtOn = PARTS.filter((p) => p.built && p.stages[stage] !== "off");
  const done = builtOn.filter((p) => progress.states[p.slug] === "complete").length;
  const next = builtOn.find((p) => progress.states[p.slug] !== "complete");

  return (
    <div>
      <Notice error={error} saved={saved} />

      <section aria-labelledby="stage-heading">
        <h1 id="stage-heading" className="text-4xl font-bold leading-none sm:text-5xl">
          {next ? `Next: ${next.title.toLowerCase()}` : "Plan foundations complete"}
        </h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          {done} of {builtOn.length} available parts complete for a business at this stage.
          {next ? ` ${next.summary}` : ""}
        </p>

        <div className="mt-6 track" role="list" aria-label="Business stage">
          {ORDER.map((s, i) => (
            <div
              key={s}
              role="listitem"
              className="track-step"
              data-state={i < stageIndex ? "done" : i === stageIndex ? "current" : "ahead"}
              aria-current={i === stageIndex ? "step" : undefined}
            >
              <span className="display block font-semibold">{STAGES[s]}</span>
            </div>
          ))}
        </div>

        <form action={updateStage} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="business_id" value={id} />
          <label htmlFor="sector" className="hint">
            Sector
          </label>
          <input className="input w-48 py-1.5" id="sector" name="sector" defaultValue={biz?.sector ?? ""} />
          <label htmlFor="model" className="hint ml-2">
            How it makes money
          </label>
          <select className="input w-auto py-1.5" id="model" name="model" defaultValue={biz?.model ?? "other"}>
            {Object.entries(MODELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <label htmlFor="stage" className="hint ml-2">
            Stage
          </label>
          <select className="input w-auto py-1.5" id="stage" name="stage" defaultValue={stage}>
            {ORDER.map((s) => (
              <option key={s} value={s}>
                {STAGES[s]}
              </option>
            ))}
          </select>
          <button className="btn btn-secondary py-1.5">Update</button>
        </form>
      </section>

      {GROUPS.map((g) => (
        <section key={g.title} className="mt-12" aria-labelledby={`g-${g.title}`}>
          <div className="flex items-baseline justify-between gap-4 border-b border-[var(--line)] pb-2">
            <h2 id={`g-${g.title}`} className="text-2xl font-bold">
              {g.title}
            </h2>
            <p className="hint hidden sm:block">{g.text}</p>
          </div>
          <ul className="mt-2 divide-y divide-[var(--line)]">
            {g.parts.map((num) => {
              const p = PARTS.find((x) => x.num === num)!;
              const s = p.stages[stage];
              const prog = progress.states[p.slug];
              const tag = !p.built
                ? { tone: "quiet", text: "Next build" }
                : s === "off"
                  ? { tone: "quiet", text: "Not used at this stage" }
                  : STATE_TAG[prog ?? "empty"];
              return (
                <li key={p.slug}>
                  <Link
                    href={`/b/${id}/${p.slug}`}
                    className={`group grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 py-4 ${s === "off" ? "opacity-55" : ""}`}
                  >
                    <span className="display text-2xl font-bold text-[var(--muted)]">{p.num}</span>
                    <span className="min-w-0">
                      <span className="block font-semibold group-hover:underline group-hover:underline-offset-4">
                        {p.title}
                        {s !== "on" && s !== "off" && (
                          <span className="ml-2 font-normal text-[var(--muted)]">({STATE_LABELS[s].toLowerCase()})</span>
                        )}
                      </span>
                      <span className="hint block">{p.built ? progress.detail[p.slug] : p.summary}</span>
                    </span>
                    <span className="tag" data-tone={tag.tone}>
                      {tag.text}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
