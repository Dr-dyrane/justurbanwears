import { NextResponse, type NextRequest } from "next/server";

const STUDIO_RETURN_TO_HEADER = "x-justurbanwears-studio-return-to";

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    STUDIO_RETURN_TO_HEADER,
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/studio/:path*"],
};
