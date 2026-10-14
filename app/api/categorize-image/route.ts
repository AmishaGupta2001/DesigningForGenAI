import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase";

const ALLOWED_TAGS = new Set([
  "happy", "sad", "irritated", "angry", "surprised", "shocked", "confused",
  "scared", "excited", "awkward", "unimpressed", "smug", "overwhelmed",
  "disgusted", "calm", "nyc", "subway", "mta", "columbia", "college",
  "studying", "dorm", "food", "restaurant", "party", "friends", "work",
  "phone", "traffic", "rain", "night",
]);

function tagsFromGemini(text: string) {
  try {
    const parsed = JSON.parse(text) as { tags?: unknown };
    if (!Array.isArray(parsed.tags)) return [];

    return [...new Set(parsed.tags
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => ALLOWED_TAGS.has(tag)))].slice(0, 5);
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createSupabaseServerClient(await cookies());
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Sign in to analyze an image." }, { status: 401 });
    }

    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof File) || !image.type.startsWith("image/") || image.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Unable to analyze that image." }, { status: 400 });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json({ error: "Image analysis is unavailable." }, { status: 503 });
    }

    const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
    const imageBase64 = Buffer.from(await image.arrayBuffer()).toString("base64");
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiKey,
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: `Analyze this image for searchable tags in NYC UNHINGED. Return only JSON in exactly this shape: {"tags":["tag"]}.

Choose 1 to 5 tags only when visually supported by the image. Include an emotion/expression/mood when apparent and a subject or context when visually obvious. Use only this controlled vocabulary:
moods: happy, sad, irritated, angry, surprised, shocked, confused, scared, excited, awkward, unimpressed, smug, overwhelmed, disgusted, calm
contexts: nyc, subway, mta, columbia, college, studying, dorm, food, restaurant, party, friends, work, phone, traffic, rain, night

Do not infer a location, school, or context that is not visible. If nothing is supported, return {"tags":[]}.`,
              },
              {
                inline_data: {
                  mime_type: image.type,
                  data: imageBase64,
                },
              },
            ],
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 120,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!response.ok) {
      return NextResponse.json({ error: "Image analysis is unavailable." }, { status: 502 });
    }

    const result = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = result.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("") || "";

    return NextResponse.json({ tags: tagsFromGemini(text) });
  } catch (error) {
    console.error("Gemini image categorization failed:", error);
    return NextResponse.json({ error: "Image analysis is unavailable." }, { status: 500 });
  }
}
