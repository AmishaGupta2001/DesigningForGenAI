import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, type Profile } from "@/lib/supabase";
import ProfileForm from "./profile-form";
import NycUnhingedNav from "../nyc-unhinged-nav";

export const metadata = {
  title: "Profile | NYC Unhinged",
};

export default async function ProfilePage() {
  const supabase = createSupabaseServerClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("first_name, last_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to load your profile right now.");
  }

  const currentProfile = profile as Profile | null;

  return (
    <main className="unhinged-shell">
      <NycUnhingedNav active="profile" />
      <section className="unhinged-profile" aria-labelledby="page-title">
        <header className="unhinged-profile__header">
          <p className="unhinged-kicker"><span aria-hidden="true">✦</span> YOUR CORNER OF THE CITY</p>
          <div>
            <div>
              <h1 id="page-title">Your profile</h1>
              <p>Set the name and photo your fellow city lurkers will see.</p>
            </div>
            <form action="/auth/signout" method="post">
              <button className="unhinged-signout" type="submit">Sign out</button>
            </form>
          </div>
        </header>

        <ProfileForm
          initialAvatarUrl={currentProfile?.avatar_url ?? null}
          initialFirstName={currentProfile?.first_name ?? null}
          initialLastName={currentProfile?.last_name ?? null}
          userId={user.id}
        />
      </section>
    </main>
  );
}
