import { NextResponse } from "next/server";
import { matchCaptionTerms, normalizeGlossaryTerms } from "@/lib/glossary";
import { createSupabaseAdminClient } from "@/lib/supabase";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { captions?: unknown } | null;
  if (!Array.isArray(body?.captions) || body.captions.length > 24 || body.captions.some((caption) => typeof caption !== "string" || caption.length > 2000)) {
    return NextResponse.json({ error: "Invalid captions." }, { status: 400 });
  }

  try {
    const { data, error } = await createSupabaseAdminClient().from("terms").select("term,definition,category").eq("enabled", true).order("term").limit(100);
    if (error) throw error;
    const terms = normalizeGlossaryTerms(data);
    return NextResponse.json({ matchedTerms: (body.captions as string[]).map((caption) => matchCaptionTerms(caption, terms)) });
  } catch (error) {
    console.warn("Could not match glossary terms for public posts.", error);
    return NextResponse.json({ error: "Glossary context is temporarily unavailable." }, { status: 503 });
  }
}
