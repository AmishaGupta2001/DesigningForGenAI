import Link from "next/link";
import GoogleSignIn from "../recipes/google-sign-in";

export const metadata = {
  title: "Sign in | NYC Unhinged",
  description: "Sign in to join NYC Unhinged.",
};

export default function SignInPage() {
  return (
    <main className="unhinged-shell sign-in-page">
      <Link aria-label="NYC Unhinged home" className="unhinged-nav__brand sign-in-page__brand" href="/">
        <span className="unhinged-nav__mark" aria-hidden="true">NYC</span>
        <span>Unhinged</span>
      </Link>
      <section className="unhinged-auth" aria-labelledby="sign-in-title">
        <span className="unhinged-auth__sticker" aria-hidden="true">you belong here</span>
        <p className="unhinged-kicker"><span aria-hidden="true">✦</span> KEEP THE GROUP CHAT GOING</p>
        <h1 id="sign-in-title">Get unhinged with NYC.</h1>
        <p>Sign in to build your profile, save your favorite moments, and add your own city lore.</p>
        <GoogleSignIn />

      </section>
    </main>
  );
}
