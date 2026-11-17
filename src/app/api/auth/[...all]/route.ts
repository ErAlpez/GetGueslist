import { getAuth } from "@/lib/auth";

async function handleAuthRequest(request: Request) {
  const auth = getAuth();
  if (!auth.handler) throw new Error("The authentication request handler is unavailable.");
  return auth.handler(request);
}

export const GET = handleAuthRequest;
export const POST = handleAuthRequest;
