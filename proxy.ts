import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        supabaseResponse = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });

        Object.entries(headers).forEach(([name, value]) => {
          supabaseResponse.headers.set(name, value);
        });
      },
    },
  });

  const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();

  const claims = claimsError ? null : claimsData?.claims;

  const pathname = request.nextUrl.pathname;

  const isAuthenticated = Boolean(claims);

  const isRoot = pathname === "/";
  const isProtectedRoute =
      pathname === "/feed" ||
      pathname.startsWith("/feed/") ||
      pathname === "/create" ||
      pathname.startsWith("/create/") ||
      pathname === "/profile" ||
      pathname.startsWith("/profile/");

  if (isRoot || isProtectedRoute) {
    if (!isAuthenticated) {
      const url = request.nextUrl.clone();
      url.pathname = "/sign-in";
      url.search = "";

      const redirectResponse = NextResponse.redirect(url);

      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie);
      });

      return redirectResponse;
    }

    if (isRoot) {
      const url = request.nextUrl.clone();
      url.pathname = "/feed";
      url.search = "";

      const redirectResponse = NextResponse.redirect(url);

      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie);
      });

      return redirectResponse;
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/",
    "/feed/:path*",
    "/create/:path*",
    "/profile/:path*",
    "/recipes/:path*",
  ],
};
