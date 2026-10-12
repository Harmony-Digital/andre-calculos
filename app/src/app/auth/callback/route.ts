import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { safeReturnPath } from "@/modules/auth/forms";
import { portalOrigin } from "@/modules/auth/origin";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const origin = portalOrigin();
  const requested = request.nextUrl.searchParams.get("next");
  const next =
    requested === "/nova-senha" ? requested : safeReturnPath(requested);
  if (code) {
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(new URL(next, origin), {
        headers: { "Cache-Control": "private, no-store" },
      });
  }
  return NextResponse.redirect(new URL("/entrar?link=invalido", origin), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
