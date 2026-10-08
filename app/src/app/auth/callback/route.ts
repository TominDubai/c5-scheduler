import { NextResponse, type NextRequest } from "next/server";

// Legacy magic-link landing. Sign-in is by code now; anything arriving here just goes to the sign-in page.
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/login", new URL(request.url).origin));
}
