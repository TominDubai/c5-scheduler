// POST /api/notify/daily — the 07:30 "your meetings today" email (pg_cron job scheduler-meetings-today, db/010_meetings.sql).
// Same bearer secret as /api/notify. GET = dry run; ?date=YYYY-MM-DD to preview another day.
import { NextResponse, type NextRequest } from "next/server";
import { runMeetingsToday } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function handle(req: NextRequest, dryRun: boolean) {
  const secret = process.env.NOTIFY_SECRET;
  if (!secret || (req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  try {
    const date = req.nextUrl.searchParams.get("date") ?? undefined;
    return NextResponse.json({ ok: true, dryRun, ...(await runMeetingsToday({ dryRun, date })) });
  } catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 }); }
}
export async function POST(req: NextRequest) { return handle(req, false); }
export async function GET(req: NextRequest) { return handle(req, true); }
