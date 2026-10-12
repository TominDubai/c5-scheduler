// POST /api/notify — run the batched change notifications.
// Called every 10 minutes by pg_cron (db/008_change_log.sql). Protected by a shared secret, not a user session.
// GET with the same header is a dry run: shows who would be emailed without sending or marking anything.
import { NextResponse, type NextRequest } from "next/server";
import { runNotifications } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function authorised(req: NextRequest) {
  const secret = process.env.NOTIFY_SECRET;
  if (!secret) return false;
  const h = req.headers.get("authorization") ?? "";
  return h === `Bearer ${secret}`;
}

async function handle(req: NextRequest, dryRun: boolean) {
  if (!authorised(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  try {
    const result = await runNotifications({ dryRun });
    return NextResponse.json({ ok: true, dryRun, ...result });
  } catch (e) {
    // on failure, show the shape of each secret (prefix + length only) so a mis-pasted key is obvious
    const shape = (v?: string) => v ? `${v.trim().slice(0, 10)}… (${v.length} chars${v !== v.trim() ? ", has whitespace" : ""})` : "MISSING";
    const env = { NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "MISSING", SUPABASE_SERVICE_ROLE_KEY: shape(process.env.SUPABASE_SERVICE_ROLE_KEY), RESEND_API_KEY: shape(process.env.RESEND_API_KEY) };
    return NextResponse.json({ ok: false, error: (e as Error).message, env }, { status: 500 });
  }
}

export async function POST(req: NextRequest) { return handle(req, false); }
export async function GET(req: NextRequest) { return handle(req, true); } // GET is always a dry run
