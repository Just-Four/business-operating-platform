import { signIn, signUp } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  return (
    <main className="min-h-screen p-6 lg:flex lg:items-center lg:justify-center">
      <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <section>
          <p className="hint">Business Operating Platform</p>
          <h1 className="mt-1 text-4xl font-bold leading-tight sm:text-5xl">Plan your business, then run it from one place.</h1>
          <p className="mt-4 max-w-xl text-[var(--muted)]">
            You design the business, build how it works, and plan the year. People and AI do the work, and you see what
            needs you. Five stages, in order:
          </p>
          <ol className="mt-5 space-y-3">
            {[
              ["Design", "What the business is: who pays, why they'd choose you, and where it's going."],
              ["Build", "How it works and who does it, then each piece of repeating work written once as steps."],
              ["Plan", "What this year must deliver and what it will cost."],
              ["Run", "The steps come to the right person or AI. You approve, check and unblock."],
              ["Review", "Look at the numbers on a fixed rhythm and change what isn't working."],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className="display flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] font-bold text-white">{i + 1}</span>
                <span>
                  <span className="font-semibold">{t}. </span>
                  {d}
                </span>
              </li>
            ))}
          </ol>
        </section>
        <div className="card w-full p-8">
          <h2 className="text-xl font-semibold">Sign in, or create an account</h2>
          <p className="hint mt-1 mb-6">New here? Type an email and a password, then press Create account.</p>
          {error && <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          {message && <p className="mb-4 rounded bg-green-50 p-3 text-sm text-green-800">{message}</p>}
          <form className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input className="input" id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div>
              <label className="label" htmlFor="password">Password (8 characters or more)</label>
              <input className="input" id="password" name="password" type="password" required minLength={8} autoComplete="current-password" />
            </div>
            <div className="flex gap-2 pt-2">
              <button className="btn" formAction={signIn}>Sign in</button>
              <button className="btn btn-secondary" formAction={signUp}>Create account</button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
