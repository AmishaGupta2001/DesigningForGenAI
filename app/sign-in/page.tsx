import Link from "next/link";
import GoogleSignIn from "../recipes/google-sign-in";
import ShootingStars from "../components/ShootingStars";

export const metadata = {
  title: "Sign in | NYC Unhinged",
  description: "Sign in to join NYC Unhinged.",
};

export default function SignInPage() {
  return (
    <main className="unhinged-shell sign-in-page">
        <ShootingStars />
      <Link aria-label="NYC Unhinged home" className="unhinged-nav__brand sign-in-page__brand" href="/">
        <span className="unhinged-nav__mark" aria-hidden="true">NYC</span>
        <span>Unhinged</span>
      </Link>
      <section className="unhinged-auth" aria-labelledby="sign-in-title">
        <span className="unhinged-auth__sticker" aria-hidden="true">Spill the tea ☕</span>
        <p className="unhinged-kicker"><span aria-hidden="true">✦</span> YOUR SCREEN TIME CALLED. IT'S CONCERNED.</p>
        <h1 id="sign-in-title">Get unhinged with NYC.</h1>
        <p>Sign in to turn your daily NYC trauma into community entertainment. At least someone should get a laugh out of it.</p>
        <GoogleSignIn />

      </section>
    </main>
  );
}


