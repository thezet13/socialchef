import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  if (!pathname.startsWith("/admin")) return NextResponse.next();

  const role = req.cookies.get("sc_role")?.value;

  if (role === "SUPERADMIN") return NextResponse.next();

  return NextResponse.rewrite(new URL("/404", req.url));
}

export const config = {
  matcher: ["/admin/:path*"],
};
