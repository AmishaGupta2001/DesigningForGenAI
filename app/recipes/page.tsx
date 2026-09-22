import { connection } from "next/server";
import { createSupabaseServerClient, type Recipe } from "@/lib/supabase";

export const metadata = {
  title: "Meal Planner",
  description: "Browse recipes for your weekly meal plan.",
};

export default async function RecipesPage() {
  await connection();

  const supabase = createSupabaseServerClient();
  const { data: recipes, error } = await supabase
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
          <p className="meal-planner__eyebrow">Weekly menu</p>
          <h1 id="page-title">Meal Planner</h1>
          <p className="meal-planner__intro">
            A simple collection of recipes to inspire your next meal.
          </p>
        </header>

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
