import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase";

type CaptionRequest = { imageId?: unknown; direction?: unknown };
type GeminiResult = { candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: Record<string, unknown>; error?: { message?: string } };
type PromptMixRow = { chain_id: string; weight: number | string };
type PromptChainRow = { id: string; name: string };
type PromptStepRow = { id: string; chain_id: string; step_order: number; name: string; prompt_template: string };
type PromptTermRow = { term: string; definition: string | null; category: string | null };
type GenerationExampleRow = { input_prompt: string; expected_output: string };
type ProviderRow = { id: string; provider_key: string; enabled: boolean };
type ModelRow = { id: string; model_key: string; provider_id: string; enabled: boolean };
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const BASE_PROMPT = `You are the caption writer for NYC UNHINGED, a social app for Columbia students and NYC college students.

Look carefully at the supplied image and understand what is actually happening.

Write ONE original, funny, concise caption that matches the image.

The user's creative direction is guidance only. Do NOT copy the direction into the caption.

The caption should feel natural, witty, internet-native, and relevant to NYC or college life when appropriate.

Do not add "Caption:".
Do not use quotation marks.
Do not provide multiple options.
Return ONLY the final caption.`;

function getMimeType(contentType: string | null, imageUrl: string) {
  if (contentType?.startsWith("image/")) return contentType.split(";")[0];
  const extension = imageUrl.split("?")[0].split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  return null;
}

function fillTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, key: string) => values[key.toLowerCase()] ?? "");
}

async function buildPrompt(supabase: ReturnType<typeof createSupabaseServerClient>, direction: string, image: { title: string; tags: string[] }) {
  const values = { direction: direction || "Create a funny, concise NYC caption that fits this image.", image_title: image.title, image_tags: image.tags.join(", ") };
  let chainInstructions = "";
  let chainId: string | null = null;
  try {
    const { data: mixes } = await supabase.from("prompt_chain_mix").select("chain_id,weight").eq("enabled", true);
    const mixRows = (mixes ?? []) as PromptMixRow[];
    const chainIds = mixRows.map((row) => row.chain_id);
    if (chainIds.length) {
      const [{ data: chains }, { data: steps }] = await Promise.all([
        supabase.from("prompt_chains").select("id,name").in("id", chainIds).eq("enabled", true),
        supabase.from("prompt_chain_steps").select("id,chain_id,step_order,name,prompt_template").in("chain_id", chainIds).eq("enabled", true).order("step_order", { ascending: true }),
      ]);
      const chainRows = (chains ?? []) as PromptChainRow[];
      const stepRows = (steps ?? []) as PromptStepRow[];
      const valid = mixRows.map((mix) => ({ mix, chain: chainRows.find((item) => item.id === mix.chain_id), steps: stepRows.filter((item) => item.chain_id === mix.chain_id) })).filter((item): item is { mix: PromptMixRow; chain: PromptChainRow; steps: PromptStepRow[] } => Boolean(item.chain && item.steps.length && Number(item.mix.weight) > 0));
      const total = valid.reduce((sum, item) => sum + Number(item.mix.weight), 0);
      if (total > 0) {
        let pick = Math.random() * total;
        const chosen = valid.find((item) => (pick -= Number(item.mix.weight)) <= 0) ?? valid[valid.length - 1];
        if (chosen?.chain && chosen.steps.length) {
          chainId = chosen.chain.id;
          chainInstructions = `\n\nConfigured prompt chain: ${chosen.chain.name}\n` + chosen.steps.map((step, index) => `Step ${index + 1} — ${step.name}:\n${fillTemplate(step.prompt_template, values)}`).join("\n\n");
        }
      }
    }
  } catch (error) {
    console.warn("Prompt chain configuration unavailable; using default prompt.", error);
  }
  let termsText = "";
  try {
    const { data } = await supabase.from("terms").select("term,definition,category").eq("enabled", true).order("term").limit(100);
    const termRows = (data ?? []) as PromptTermRow[];
    if (termRows.length) termsText = `\n\nApproved terminology:\n${termRows.map((item) => `- ${item.term}${item.category ? ` (${item.category})` : ""}${item.definition ? `: ${item.definition}` : ""}`).join("\n")}`;
  } catch { /* The base caption flow remains available if configuration reads fail. */ }
  let examplesText = "";
  try {
    let query = supabase.from("ai_generation_examples").select("input_prompt,expected_output").eq("enabled", true);
    query = chainId ? query.or(`prompt_chain_id.is.null,prompt_chain_id.eq.${chainId}`) : query.is("prompt_chain_id", null);
    const { data } = await query.order("created_at", { ascending: false }).limit(3);
    const exampleRows = (data ?? []) as GenerationExampleRow[];
    if (exampleRows.length) examplesText = `\n\nReference examples (style guidance only):\n${exampleRows.map((item, i) => `Example ${i + 1}\nInput: ${item.input_prompt}\nExpected style/output: ${item.expected_output}`).join("\n\n")}`;
  } catch { /* Examples are optional and never block captioning. */ }
  return { prompt: `${BASE_PROMPT}${chainInstructions}${termsText}${examplesText}\n\nCreative direction:\n${values.direction}`, chainId };
}

export async function POST(request: Request) {
  let supabase: ReturnType<typeof createSupabaseServerClient> | null = null;
  let observabilityAdmin: ReturnType<typeof createSupabaseAdminClient> | null = null;
  let requestId: string | null = null;
  let providerId: string | null = null;
  let modelId: string | null = null;
  let requestContent: Record<string, unknown> | null = null;
  let responseLogged = false;

  async function finishRequest(status: "succeeded" | "failed", errorMessage?: string) {
    if (!observabilityAdmin || !requestId) return;
    try {
      const { error } = await observabilityAdmin.from("generation_requests").update({ status, completed_at: new Date().toISOString(), error_message: errorMessage ?? null }).eq("id", requestId);
      if (error) console.warn("Could not update generation request status:", error.message);
    } catch (error) { console.warn("Could not update generation request status:", error); }
  }
  async function recordResponse(status: "succeeded" | "failed", responseContent: unknown, errorMessage: string | null, latencyMs: number) {
    if (!observabilityAdmin || !requestId || responseLogged) return;
    try {
      const { error } = await observabilityAdmin.from("llm_responses").insert({ request_id: requestId, provider_id: providerId, model_id: modelId, status, request_content: requestContent, response_content: responseContent, error_message: errorMessage, latency_ms: latencyMs });
      if (error) console.warn("Could not record LLM response:", error.message);
      else responseLogged = true;
    } catch (error) { console.warn("Could not record LLM response:", error); }
  }

  try {
    const body = (await request.json().catch(() => null)) as CaptionRequest | null;
    const imageId = typeof body?.imageId === "string" ? body.imageId.trim() : "";
    const direction = typeof body?.direction === "string" ? body.direction.trim().slice(0, 2000) : "";
    if (!imageId) return NextResponse.json({ error: "Please select an image first." }, { status: 400 });

    supabase = createSupabaseServerClient(await cookies());
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "You must be signed in to generate a caption." }, { status: 401 });
    try { observabilityAdmin = createSupabaseAdminClient(); }
    catch (error) { console.warn("Generation observability is unavailable; captioning will continue.", error); }
    const { data: image, error: imageError } = await supabase.from("images").select("image_url,title,tags").eq("id", imageId).maybeSingle();
    if (imageError || !image?.image_url) return NextResponse.json({ error: "Unable to load the selected image." }, { status: 404 });

    let provider: ProviderRow | null = null;
    let modelRows: ModelRow[] = [];
    try {
      const [providerResult, modelResult] = await Promise.all([
        supabase.from("llm_providers").select("id,provider_key,enabled").eq("provider_key", "google_gemini").maybeSingle(),
        supabase.from("llm_models").select("id,model_key,provider_id,enabled").eq("enabled", true).order("created_at", { ascending: false }).limit(100),
      ]);
      provider = providerResult.data as ProviderRow | null;
      modelRows = (modelResult.data ?? []) as ModelRow[];
    } catch (error) { console.warn("LLM configuration unavailable; using server defaults.", error); }
    providerId = provider?.id ?? null;
    const selectedModel = provider?.enabled ? modelRows.find((model) => model.provider_id === provider.id) : null;
    modelId = selectedModel?.id ?? null;
    const model = selectedModel ? selectedModel.model_key : process.env.GEMINI_MODEL || "gemini-3.8-flash";
    const { prompt, chainId } = await buildPrompt(supabase, direction, { title: image.title ?? "", tags: image.tags ?? [] });
    requestContent = { model, image_id: imageId, direction, prompt, prompt_chain_id: chainId };

    if (observabilityAdmin) {
      try {
        const { data: requestRow, error: requestError } = await observabilityAdmin.from("generation_requests").insert({ user_id: user.id, image_id: imageId, prompt_chain_id: chainId, provider_id: providerId, model_id: modelId, prompt, direction, status: "running" }).select("id").single();
        if (requestError) console.warn("Could not create generation request record:", requestError.message);
        else requestId = requestRow.id;
      } catch (error) { console.warn("Could not create generation request record:", error); }
    }

    if (provider && !provider.enabled) {
      await finishRequest("failed", "The configured Gemini provider is disabled.");
      return NextResponse.json({ error: "Caption generation is temporarily disabled." }, { status: 503 });
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(model)) {
      await finishRequest("failed", "The selected Gemini model identifier is invalid.");
      return NextResponse.json({ error: "Caption generation is temporarily misconfigured. Ask an administrator to review the Gemini model." }, { status: 503 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      await finishRequest("failed", "Gemini API is not configured.");
      return NextResponse.json({ error: "Gemini API is not configured." }, { status: 500 });
    }

    const absoluteImageUrl = new URL(image.image_url, request.url).toString();
    const imageResponse = await fetch(absoluteImageUrl);
    if (!imageResponse.ok) {
      await finishRequest("failed", "Unable to load the selected image.");
      return NextResponse.json({ error: "Unable to load the selected image." }, { status: 502 });
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    const imageBase64 = Buffer.from(imageBuffer).toString("base64");
    const mimeType = getMimeType(imageResponse.headers.get("content-type"), absoluteImageUrl);
    if (!mimeType || !SUPPORTED_IMAGE_TYPES.has(mimeType)) {
      await finishRequest("failed", "Unsupported image format.");
      return NextResponse.json({ error: "This image format cannot be captioned. Please upload it again so it can be converted to JPEG." }, { status: 415 });
    }

    const llmStartedAt = Date.now();
    let llmResult: GeminiResult | null = null;
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: imageBase64 } }] }],
          generationConfig: { temperature: 1, maxOutputTokens: 300, thinkingConfig: { thinkingLevel: "low" } },
        }),
      });
      llmResult = await response.json().catch(() => null) as GeminiResult | null;
      const latencyMs = Date.now() - llmStartedAt;
      if (!response.ok) {
        const errorMessage = llmResult?.error?.message || "Gemini could not generate a caption.";
        await recordResponse("failed", llmResult, errorMessage, latencyMs);
        await finishRequest("failed", errorMessage);
        return NextResponse.json({ error: errorMessage }, { status: 502 });
      }
      const caption = llmResult?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
      const safeResponse = llmResult ? { candidates: llmResult.candidates, usageMetadata: llmResult.usageMetadata } : null;
      if (!caption) {
        await recordResponse("failed", safeResponse, "Gemini returned an empty caption.", latencyMs);
        await finishRequest("failed", "Gemini could not cook a caption. Please try again.");
        return NextResponse.json({ error: "Gemini could not cook a caption. Please try again." }, { status: 502 });
      }
      await recordResponse("succeeded", safeResponse, null, latencyMs);
      await finishRequest("succeeded");
      return NextResponse.json({ caption, requestId });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gemini request failed.";
      await recordResponse("failed", llmResult, message, Date.now() - llmStartedAt);
      await finishRequest("failed", message);
      throw error;
    }
  } catch (error) {
    if (requestId) {
      await recordResponse("failed", null, "Unable to generate a caption right now.", 0);
      await finishRequest("failed", "Unable to generate a caption right now.");
    }
    console.error("Gemini caption generation failed:", error);
    return NextResponse.json({ error: "Unable to generate a caption right now." }, { status: 500 });
  }
}
