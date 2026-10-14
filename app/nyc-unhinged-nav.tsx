"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

type Active = "feed" | "create" | "profile" | "moments" | "lols";
export default function NycUnhingedNav({ active }: { active: Active }) {
  const [dark, setDark] = useState(false);
  const [name, setName] = useState("Profile");
  const [avatar, setAvatar] = useState<string | null>(null);
  useEffect(() => {
    const stored = localStorage.getItem("nyc-unhinged-theme");
    const next = stored === "dark" || (!stored && matchMedia("(prefers-color-scheme: dark)").matches);
    window.setTimeout(() => setDark(next), 0); document.documentElement.dataset.theme = next ? "dark" : "light";
    const supabase = createSupabaseBrowserClient();
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from("profiles").select("first_name, avatar_url").eq("id", user.id).maybeSingle();
      setName(data?.first_name || "Profile"); setAvatar(data?.avatar_url || null);
    });
  }, []);
  function toggleTheme() { const next = !dark; setDark(next); localStorage.setItem("nyc-unhinged-theme", next ? "dark" : "light"); document.documentElement.dataset.theme = next ? "dark" : "light"; }
  const item = (href: string, key: Active, icon: string, label: string, sub?: string) => <Link className={active === key ? "is-active" : ""} href={href}><span aria-hidden="true">{icon}</span><b>{label}</b>{sub && <small>{sub}</small>}</Link>;
  return <>
    <header className="app-header"><Link className="brand" href="/feed"><i>NYC</i><span>UNHINGED</span></Link><div className="header-actions"><button aria-label="Toggle dark mode" className="theme-toggle" onClick={toggleTheme} type="button">{dark ? "☀" : "☾"}</button><Link aria-label="Open your profile" className="profile-chip" href="/profile">{avatar ? <img alt="" src={avatar} /> : <span>{name.slice(0, 1).toUpperCase()}</span>}<b>{name}</b></Link></div></header>
    <aside className="left-nav" aria-label="Primary navigation"><nav>{item("/feed", "feed", "🍳", "THE FEED", "Latest posts")}{item("/create", "create", "➕", "COOK SOMETHING", "Create a caption")}<hr/><p>YOUR CHAOS</p>{item("/feed?scope=mine", "moments", "📸", "MY MOMENTS", "Your published posts")}{item("/feed?scope=lols", "lols", "❤️", "MY LOLS", "Posts you upvoted")}</nav></aside>
    <nav className="mobile-nav" aria-label="Mobile navigation"><Link className={active === "feed" ? "is-active" : ""} href="/feed">🍳<span>FEED</span></Link><Link className={active === "create" ? "is-active" : ""} href="/create">➕<span>COOK</span></Link><Link className={active === "profile" ? "is-active" : ""} href="/profile">◉<span>PROFILE</span></Link></nav>
  </>;
}
