import { cookies } from "next/headers";
import Link from "next/link";
import {
  createSupabaseAnonClient,
  createSupabaseServerClient,
  type Profile,
  type Recipe,
} from "@/lib/supabase";
import GoogleSignIn from "./google-sign-in";
import ProfileForm from "../profile/profile-form";

export const metadata = {
  title: "Meal Planner",
  description: "Browse recipes for your weekly meal plan.",
};

export default async function RecipesPage() {
  const supabase = createSupabaseServerClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="meal-planner">
        <section className="meal-planner__content" aria-labelledby="page-title">
          <header className="meal-planner__header">
            <p className="meal-planner__eyebrow">Weekly menu</p>
            <h1 id="page-title">Meal Planner</h1>
            <p className="meal-planner__intro">
              Sign in to view your recipe collection and plan your next meal.
            </p>
          </header>

          <section className="auth-gate" aria-labelledby="sign-in-title">
            <h2 id="sign-in-title">Your recipes are ready when you are</h2>
            <p>Sign in with Google to access the meal planner.</p>
            <GoogleSignIn />
          </section>
        </section>
      </main>
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("first_name, last_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error("Unable to load your profile right now.");
  }

  const currentProfile = profile as Profile | null;
  const needsProfileDetails = !currentProfile?.first_name || !currentProfile?.last_name;

  const { data: recipes, error } = await createSupabaseAnonClient()
    .from("recipes")
    .select("id, name, cuisine, meal_type")
    .order("name", { ascending: true });

  if (error) {
    throw new Error("Unable to load recipes right now.");
  }

  return (
    <main className="meal-planner">
      <section className="meal-planner__content" aria-labelledby="page-title">
        <header className="meal-planner__header">
          <div className="meal-planner__topline">
            <p className="meal-planner__eyebrow">Weekly menu</p>
            <div className="meal-planner__actions">
              <Link className="profile-link" href="/profile">Profile</Link>
              <form action="/auth/signout" method="post">
                <button className="sign-out-button" type="submit">
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <h1 id="page-title">Meal Planner</h1>
          <p className="meal-planner__intro">
            A simple collection of recipes to inspire your next meal.
          </p>
        </header>

        {needsProfileDetails && (
          <ProfileForm
            completionOnly
            initialAvatarUrl={currentProfile?.avatar_url ?? null}
            initialFirstName={currentProfile?.first_name ?? null}
            initialLastName={currentProfile?.last_name ?? null}
            userId={user.id}
          />
        )}

        {recipes && recipes.length > 0 ? (
          <div className="recipe-grid">
            {(recipes as Recipe[]).map((recipe) => (
              <article className="recipe-card" key={recipe.id}>
                <p className="recipe-card__meal-type">{recipe.meal_type}</p>
                <h2>{recipe.name}</h2>
                <p className="recipe-card__cuisine">{recipe.cuisine} cuisine</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="recipe-empty">
            <h2>No recipes yet</h2>
            <p>Check back once recipes have been added to your collection.</p>
          </div>
        )}
      </section>
    </main>
  );
}
