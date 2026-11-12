import Link from "next/link";

export const metadata = { title: "Privacy" };

// A plain statement of what is stored and who can see it. A draft, to be checked before the platform opens to the public.
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <p className="text-sm">
        <Link href="/login" className="font-semibold underline underline-offset-4">Back</Link>
      </p>
      <h1 className="mt-4 text-4xl font-bold leading-none sm:text-5xl">Your information</h1>
      <p className="mt-3 text-[var(--muted)]">
        The Business Operating Platform is an early version, being tried by people its owner has invited. This page says
        what it stores about you and who can see it.
      </p>

      <h2 className="display mt-8 text-2xl font-bold">What is stored</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Your email address, and your password in a scrambled form that nobody can read.</li>
        <li>Everything you type into a business: the plan, the processes, the team, the numbers and the tasks.</li>
        <li>A record of who changed a task or a process, and when.</li>
      </ul>

      <h2 className="display mt-8 text-2xl font-bold">Who can see it</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>You.</li>
        <li>Anyone who has been added to one of your businesses.</li>
        <li>
          The platform&apos;s owner, and people working on the platform for the owner. They can see the list of accounts and how
          far each business has got, and can open a business to read it so that they can run the platform, fix faults and
          improve it. When the owner opens a business on screen they can read it but not change it, and each time is recorded.
        </li>
      </ul>
      <p className="mt-3">While it is being tried, don&apos;t put in anything you would not want the owner to read.</p>

      <h2 className="display mt-8 text-2xl font-bold">What goes to the AI</h2>
      <p className="mt-2">
        The AI is only used when you press a button that asks for it, such as having the plan reviewed or having a step
        done by Claude. The parts of your business needed for that are then sent to Anthropic, the company that makes
        Claude, to produce the answer. Nothing is sent otherwise.
      </p>

      <h2 className="display mt-8 text-2xl font-bold">Where it is held</h2>
      <p className="mt-2">The information is held in a database run by Supabase, in London. The website is run by Vercel.</p>

      <h2 className="display mt-8 text-2xl font-bold">Having it removed</h2>
      <p className="mt-2">
        Ask the person who invited you. Your account and your businesses, with everything in them, will be deleted.
      </p>
    </main>
  );
}
