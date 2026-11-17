import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getWorkspaceContext } from "@/lib/workspace";

const pollInterval = 2_000;
const heartbeatInterval = 15_000;

export async function GET() {
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const prisma = getPrisma();
  const activityWhere = {
    workspaceId: context.workspace.id,
    action: "attendee.registered",
    entityType: "registration",
  };
  const initialActivity = await prisma.activityLog.findFirst({
    where: activityWhere,
    select: { id: true, createdAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const encoder = new TextEncoder();
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let cursorAt = initialActivity?.createdAt ?? new Date(0);
      let idsAtCursor = new Set(initialActivity ? [initialActivity.id] : []);
      let lastHeartbeatAt = Date.now();

      controller.enqueue(encoder.encode("retry: 3000\n\nevent: sync\ndata: {}\n\n"));

      const poll = async () => {
        try {
          const recentActivity = await prisma.activityLog.findMany({
            where: { ...activityWhere, createdAt: { gte: cursorAt } },
            select: { id: true, createdAt: true },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 100,
          });
          if (cancelled) return;

          const newActivity = recentActivity.some((activity) =>
            activity.createdAt > cursorAt || !idsAtCursor.has(activity.id),
          );
          if (newActivity) {
            const newestTimestamp = recentActivity[0]?.createdAt;
            if (newestTimestamp) {
              cursorAt = newestTimestamp;
              idsAtCursor = new Set(
                recentActivity
                  .filter((activity) => activity.createdAt.getTime() === newestTimestamp.getTime())
                  .map((activity) => activity.id),
              );
            }
            controller.enqueue(encoder.encode("event: registration\ndata: {}\n\n"));
          } else if (Date.now() - lastHeartbeatAt >= heartbeatInterval) {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
            lastHeartbeatAt = Date.now();
          }
        } catch {
          if (cancelled) return;
          controller.enqueue(encoder.encode("event: stream-error\ndata: {}\n\n"));
        }

        if (!cancelled) {
          timer = setTimeout(() => {
            void poll();
          }, pollInterval);
        }
      };

      timer = setTimeout(() => {
        void poll();
      }, pollInterval);
    },
    cancel() {
      cancelled = true;
      if (timer) clearTimeout(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "private, no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
