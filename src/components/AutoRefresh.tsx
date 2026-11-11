"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Re-reads the page every few seconds while something is being done in the background.
export default function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
