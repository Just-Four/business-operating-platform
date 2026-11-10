import { signIn, signUp } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="card w-full max-w-sm p-8">
        <h1 className="text-xl font-semibold">Business Operating Platform</h1>
        <p className="hint mt-1 mb-6">Plan, execute, manage and review.</p>
        {error && <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {message && <p className="mb-4 rounded bg-green-50 p-3 text-sm text-green-800">{message}</p>}
        <form className="space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input className="input" id="password" name="password" type="password" required minLength={8} autoComplete="current-password" />
          </div>
          <div className="flex gap-2 pt-2">
            <button className="btn" formAction={signIn}>Sign in</button>
            <button className="btn btn-secondary" formAction={signUp}>Create account</button>
          </div>
        </form>
      </div>
    </main>
  );
}
