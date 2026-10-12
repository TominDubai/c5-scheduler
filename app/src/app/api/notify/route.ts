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
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) { return handle(req, false); }
export async function GET(req: NextRequest) { return handle(req, true); } // GET is always a dry run
