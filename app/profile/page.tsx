import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, type Profile } from "@/lib/supabase";
import ProfileForm from "./profile-form";

export const metadata = {
  title: "Profile | Meal Planner",
};

export default async function ProfilePage() {
  const supabase = createSupabaseServerClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/recipes");
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
    <main className="meal-planner">
      <section className="meal-planner__content" aria-labelledby="page-title">
        <header className="meal-planner__header">
          <div className="meal-planner__topline">
            <p className="meal-planner__eyebrow">Account</p>
            <div className="meal-planner__actions">
              <Link className="profile-link" href="/recipes">Recipes</Link>
              <form action="/auth/signout" method="post">
                <button className="sign-out-button" type="submit">Sign out</button>
              </form>
            </div>
          </div>
          <h1 id="page-title">Your profile</h1>
          <p className="meal-planner__intro">Update the details shown with your Meal Planner account.</p>
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
