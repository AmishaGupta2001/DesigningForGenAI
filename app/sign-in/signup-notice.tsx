"use client";

import { useSearchParams } from "next/navigation";

export default function SignupNotice() {
  const params = useSearchParams();
  const error = params.get("error");
  if (!error) return null;
  const message = error === "signup-not-allowed"
    ? "Columbia.edu addresses are allowed. Other addresses need an enabled exact-email allowlist entry."
    : "We couldn’t verify signup access right now. Please try again later.";
  return <p role="alert" className="mb-4 rounded-lg border border-red-300/30 bg-red-950/40 p-3 text-sm text-red-100">{message}</p>;
}
