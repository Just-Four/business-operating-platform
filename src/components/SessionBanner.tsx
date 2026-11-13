import Link from "next/link";
import { sessionTitle } from "@/lib/programme";
import { finishSession } from "@/app/b/[id]/actions";

// Shown on a page opened from a guided session, so the session can be finished right here
// without going back to find the button.
export default function SessionBanner({ businessId, sessionKey, stage }: { businessId: string; sessionKey: string; stage?: string | null }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded border border-[var(--line)] bg-white p-3 text-sm">
      <p className="min-w-0 flex-1">
        You&apos;re in a planning session: <span className="font-semibold">{sessionTitle(sessionKey, stage ?? null)}</span>. When you&apos;ve done what you
        came here to do, finish the session.
      </p>
      <Link href={`/b/${businessId}/s/${sessionKey}`} className="underline underline-offset-4">Back to the session</Link>
      <form action={finishSession}>
        <input type="hidden" name="business_id" value={businessId} />
        <input type="hidden" name="session_key" value={sessionKey} />
        <button className="btn">Finish session</button>
      </form>
    </div>
  );
}
