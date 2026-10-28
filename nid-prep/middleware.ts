import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

const PUBLIC_PATHS = ["/login", "/setup", "/manifest.webmanifest", "/icon.svg"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = supabaseUrl();
  const anonKey = supabaseAnonKey();
  const path = request.nextUrl.pathname;
  // Not configured yet (fresh Vercel deploy): send everything to the setup guide.
  if (!url || !anonKey) {
    if (path.startsWith("/setup") || PUBLIC_PATHS.some((p) => path.startsWith(p) && p !== "/login")) return response;
    const setup = request.nextUrl.clone();
    setup.pathname = "/setup";
    setup.search = "";
    return NextResponse.redirect(setup);
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  if (!data.user && !PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = path === "/" ? "" : `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|.*\\.(?:png|jpg|svg|webp)$).*)"],
};
