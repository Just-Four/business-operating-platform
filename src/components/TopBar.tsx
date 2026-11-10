import Link from "next/link";
import { signOut } from "@/app/login/actions";

export default function TopBar({ email }: { email?: string | null }) {
  return (
    <header className="border-b border-[#e4e3de] bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <Link href="/" className="font-semibold">Business Operating Platform</Link>
        <div className="flex items-center gap-4 text-sm">
          {email && <span className="hint">{email}</span>}
          <form action={signOut}>
            <button className="btn btn-secondary">Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
