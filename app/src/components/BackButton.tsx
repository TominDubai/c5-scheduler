"use client";
import { useRouter } from "next/navigation";

/** Returns to the page the user came from (Board, List, Estimation…); falls back to `fallback` when there is no history. */
export default function BackButton({ fallback = "/board" }: { fallback?: string }) {
  const router = useRouter();
  return (
    <button type="button" className="btn ghost" style={{ padding: "6px 14px", marginRight: 12 }}
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}>
      ← Back
    </button>
  );
}
