"use client";

import { useFormStatus } from "react-dom";

export default function PendingButton({ label, pending, className = "btn" }: { label: string; pending: string; className?: string }) {
  const { pending: busy } = useFormStatus();
  return (
    <button className={className} disabled={busy} aria-busy={busy}>
      {busy ? pending : label}
    </button>
  );
}
