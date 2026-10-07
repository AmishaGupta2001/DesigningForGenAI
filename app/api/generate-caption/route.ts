import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase";

type CaptionRequest = {
  imageId?: unknown;
  direction?: unknown;
};

function getMimeType(contentType: string | null, imageUrl: string) {
  if (contentType?.startsWith("image/")) {
    return contentType.split(";")[0];
  }

  const extension = imageUrl.split("?")[0].split(".").pop()?.toLowerCase();

  switch (extension) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    default:
      return "image/jpeg";
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as CaptionRequest | null;

    const imageId =
      typeof body?.imageId === "string" ? body.imageId.trim() : "";

    const direction =
      typeof body?.direction === "string" ? body.direction.trim() : "";

    if (!imageId) {
      return NextResponse.json(
        { error: "Please select an image first." },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServerClient(await cookies());

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "You must be signed in to generate a caption." },
        { status: 401 },
      );
    }

    const { data: image, error: imageError } = await supabase
      .from("images")
      .select("image_url")
      .eq("id", imageId)
      .maybeSingle();

    if (imageError || !image?.image_url) {
      return NextResponse.json(
        { error: "Unable to load the selected image." },
        { status: 404 },
      );
    }

    const geminiKey = process.env.GEMINI_API_KEY;

    if (!geminiKey) {
      return NextResponse.json(
        { error: "Gemini API is not configured." },
        { status: 500 },
      );
    }

    const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";

    const absoluteImageUrl = new URL(
      image.image_url,
      request.url,
    ).toString();

    const imageResponse = await fetch(absoluteImageUrl);

    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: "Unable to load the selected image." },
        { status: 502 },
      );
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const imageBase64 = Buffer.from(imageBuffer).toString("base64");

    const mimeType = getMimeType(
      imageResponse.headers.get("content-type"),
      absoluteImageUrl,
    );

    const creativeDirection =
      direction ||
      "Create a funny, concise NYC caption that fits this image.";

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are the caption writer for NYC UNHINGED, a social app for Columbia students and NYC college students.

Look carefully at the supplied image and understand what is actually happening.

Write ONE original, funny, concise caption that matches the image.

The user's creative direction is guidance only. Do NOT copy the direction into the caption.

The caption should feel natural, witty, internet-native, and relevant to NYC or college life when appropriate.

Do not add "Caption:".
Do not use quotation marks.
Do not provide multiple options.
Return ONLY the final caption.

Creative direction:
${creativeDirection}`,
                },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: imageBase64,
                  },
                },
              ],
            },
          ],
            generationConfig: {
                temperature: 1,
                maxOutputTokens: 300,
                thinkingConfig: {
                    thinkingLevel: "low",

            },
          },
        }),
      },
    );

    const result = (await response.json()) as {
      candidates?: Array<{
  finishReason?: string;
  content?: {
    parts?: Array<{
      text?: string;
    }>;
  };
}>;
      error?: {
        message?: string;
      };
    };

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            result.error?.message ||
            "Gemini could not generate a caption.",
        },
        { status: 502 },
      );
    }

    const caption = result.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();

    if (!caption) {
  const finishReason = result.candidates?.[0]?.finishReason;

  return NextResponse.json(
    {
      error: `Gemini returned no caption. Finish reason: ${
        finishReason || "unknown"
      }`,
    },
    { status: 502 },
  );
}
    return NextResponse.json({ caption });
  } catch (error) {
    console.error("Gemini caption generation failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to generate a caption.",
      },
      { status: 500 },
    );
  }
}
