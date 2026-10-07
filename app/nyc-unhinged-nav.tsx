import Link from "next/link";

type NycUnhingedNavProps = {
  active: "feed" | "create" | "profile";
};

export default function NycUnhingedNav({ active }: NycUnhingedNavProps) {
  return (
    <header className="unhinged-nav">
      <Link aria-label="NYC Unhinged home" className="unhinged-nav__brand" href="/">
        <span className="unhinged-nav__mark" aria-hidden="true">NYC</span>
        <span>Unhinged</span>
      </Link>
      <nav aria-label="Main navigation" className="unhinged-nav__links">
        <Link aria-current={active === "feed" ? "page" : undefined} href="/">Feed</Link>
        <Link aria-current={active === "create" ? "page" : undefined} href="/create">Create</Link>
        <Link aria-current={active === "profile" ? "page" : undefined} href="/profile">Profile</Link>
      </nav>
    </header>
  );
}
