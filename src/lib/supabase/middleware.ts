import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/** Routes reachable without a session. Everything else requires sign-in. */
const PUBLIC_PATHS = ["/login", "/signup"];

/** Where a signed-in user lands when they visit an auth page. */
const DEFAULT_AUTHENTICATED_PATH = "/dashboard";

/** Anti-caching headers Supabase asks us to forward with auth cookies. */
const CACHE_HEADERS = ["cache-control", "expires", "pragma"] as const;

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

/**
 * Refreshes the Supabase session cookies and enforces route protection.
 * Called from the Next.js proxy (formerly "middleware") on every matched request.
 *
 * `getUser()` revalidates the JWT with the Supabase Auth server, unlike
 * `getSession()` which only reads the (spoofable) cookie. Always use it for
 * trust decisions.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          // Mirror refreshed cookies on the request (so Server Components see
          // them in this same pass) and on the response (so the browser stores them).
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          // Responses carrying auth cookies must never be cached by a CDN.
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getUser(): a refresh that
  // completes after the response is built would be lost.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") {
      url.searchParams.set("next", `${pathname}${search}`);
    }
    return redirectWithCookies(url, response);
  }

  if (user && isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = DEFAULT_AUTHENTICATED_PATH;
    url.search = "";
    return redirectWithCookies(url, response);
  }

  return response;
}

/** Redirect while preserving any session cookies/headers set during refresh. */
function redirectWithCookies(url: URL, from: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  CACHE_HEADERS.forEach((name) => {
    const value = from.headers.get(name);
    if (value) redirect.headers.set(name, value);
  });
  return redirect;
}
