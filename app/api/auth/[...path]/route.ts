import { getNeonAuth } from "../../../../lib/auth/neon";

export const dynamic = "force-dynamic";

type AuthContext = { params: Promise<{ path: string[] }> };

function handler(method: "GET" | "POST") {
  return (request: Request, context: AuthContext) => getNeonAuth().handler()[method](request, context);
}

export const GET = handler("GET");
export const POST = handler("POST");
