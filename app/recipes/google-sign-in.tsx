"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useState } from "react";

export default function GoogleSignIn() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  async function handleSignIn() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      setErrorMessage("Google sign-in is not configured yet.");
      return;
    }

    setIsSigningIn(true);
    setErrorMessage(null);

    const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setErrorMessage("Unable to start Google sign-in. Please try again.");
      setIsSigningIn(false);
    }
  }

  return (
    <div>
      <button
        className="profile-save-button"
        disabled={isSigningIn}
        onClick={handleSignIn}
        type="button"
      >
        {isSigningIn ? "Opening Google…" : "Continue with Google"}
      </button>
      {errorMessage && (
        <p className="auth-gate__notice" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
