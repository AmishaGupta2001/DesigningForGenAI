import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.json(
      { error: "Missing OAuth authorization code." },
      { status: 400 },
    );
  }

  const response = NextResponse.redirect(
    new URL("/", request.url),
    303,
  );

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "Supabase authentication is not configured." },
      { status: 500 },
    );
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([name, value]) => {
          response.headers.set(name, value);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // GoTrue can hide a rejected auth.users trigger behind its generic new-user
    // database error. Route that account-creation failure to a helpful notice.
    const errorText = `${error.message} ${(error as Error & { code?: string }).code ?? ""}`;
    if (/WEEK7_SIGNUP_NOT_ALLOWED|signup is not allowed|42501|database error saving new user/i.test(errorText)) {
      await supabase.auth.signOut();
      response.headers.set(
        "Location",
        new URL("/sign-in?error=signup-not-allowed", request.url).toString(),
      );
      return response;
    }
    return NextResponse.json(
      { error: "Unable to complete Google sign-in." },
      { status: 400 },
    );
  }

  const { data: signupAllowed, error: allowlistError } = await supabase.rpc("current_user_signup_allowed");
  if (allowlistError || signupAllowed !== true) {
    await supabase.auth.signOut();
    response.headers.set(
      "Location",
      new URL(`/sign-in?error=${allowlistError ? "signup-check-unavailable" : "signup-not-allowed"}`, request.url).toString(),
    );
    return response;
  }

  return response;
}
