import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Magic link lands here. Exchange the code for a session, then check the email is on the team list.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const supabase = await createClient();
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL("/login?error=link", url.origin));
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.redirect(new URL("/login?error=link", url.origin));
  const { data: person } = await supabase.from("people").select("id").ilike("email", user.email).maybeSingle();
  if (!person) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=not_allowed", url.origin));
  }
  return NextResponse.redirect(new URL("/board", url.origin));
}
