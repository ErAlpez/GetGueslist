import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  attendeeInput,
  createGuestRegistration,
  rolesAllowedToRegister,
} from "@/lib/guest-registration";
import { getWorkspaceContext } from "@/lib/workspace";

const syncInput = attendeeInput.extend({
  offlineSyncId: z.uuid(),
  workspaceId: z.string().min(1),
});

const responseHeaders = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const requestHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string | null = null;
  try {
    originHost = origin ? new URL(origin).host : null;
  } catch {
    originHost = null;
  }
  if (!requestHost || !originHost || originHost !== requestHost.toLowerCase()) {
    return Response.json({ error: "This request was not accepted." }, { status: 403, headers: responseHeaders });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 4_096) {
    return Response.json({ error: "This offline change is too large." }, { status: 413, headers: responseHeaders });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return Response.json({ error: "This offline change is invalid." }, { status: 400, headers: responseHeaders });
  }

  const parsed = syncInput.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Check the offline guest details." }, {
      status: 400,
      headers: responseHeaders,
    });
  }

  const context = await getWorkspaceContext();
  if (!context) {
    return Response.json({ error: "Sign in again before syncing offline guest registrations." }, {
      status: 401,
      headers: responseHeaders,
    });
  }
  if (!rolesAllowedToRegister.has(context.membership.role)) {
    return Response.json({ error: "You don’t have permission to add guests in this workspace." }, {
      status: 403,
      headers: responseHeaders,
    });
  }
  if (parsed.data.workspaceId !== context.workspace.id) {
    return Response.json({ error: "Switch to the workspace where this guest was added before syncing." }, {
      status: 409,
      headers: responseHeaders,
    });
  }

  const result = await createGuestRegistration(
    attendeeInput.parse(parsed.data),
    context.workspace.id,
    context.user.id,
    parsed.data.offlineSyncId,
  );
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 409, headers: responseHeaders });
  }

  for (const path of ["/dashboard/attendees", "/dashboard/tickets", "/dashboard/check-in", "/dashboard/reports"]) {
    revalidatePath(path);
  }
  return Response.json({ success: true }, { headers: responseHeaders });
}
