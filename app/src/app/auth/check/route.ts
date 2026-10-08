import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// After a code sign-in: is this email on the team list?
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ ok: false });
  const { data: person } = await supabase.from("people").select("id").ilike("email", user.email).maybeSingle();
  if (!person) { await supabase.auth.signOut(); return NextResponse.json({ ok: false }); }
  return NextResponse.json({ ok: true });
}
