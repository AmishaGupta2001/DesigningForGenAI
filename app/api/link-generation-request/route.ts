import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase";

export async function POST(request: Request) {
  const userClient = createSupabaseServerClient(await cookies());
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: signupAllowed, error: accessError } = await userClient.rpc("current_user_signup_allowed");
  if (accessError) return NextResponse.json({ error: "Unable to verify application access." }, { status: 503 });
  if (signupAllowed !== true) return NextResponse.json({ error: "You are not allowed to access this application." }, { status: 403 });

  const body = await request.json().catch(() => null) as { requestId?: unknown; generationId?: unknown } | null;
  const requestId = typeof body?.requestId === "string" ? body.requestId : "";
  const generationId = typeof body?.generationId === "string" ? body.generationId : "";
  if (!requestId || !generationId) return NextResponse.json({ error: "Request and generation IDs are required." }, { status: 400 });

  try {
    const admin = createSupabaseAdminClient();
    const { data: generation, error: generationError } = await admin.from("generations").select("id").eq("id", generationId).eq("user_id", user.id).maybeSingle();
    if (generationError) throw generationError;
    if (!generation) return NextResponse.json({ error: "Generation not found for this user." }, { status: 404 });

    const { data: linked, error } = await admin.from("generation_requests").update({ generation_id: generation.id }).eq("id", requestId).eq("user_id", user.id).eq("status", "succeeded").select("id").maybeSingle();
    if (error) throw error;
    if (!linked) return NextResponse.json({ error: "Successful generation request not found for this user." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Could not link published generation to request:", error);
    return NextResponse.json({ error: "Could not update the request link." }, { status: 500 });
  }
}
