import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getWorkspaceContext } from "@/lib/workspace";

const notificationLimit = 20;
const notificationRetentionMs = 30 * 24 * 60 * 60 * 1000;
const notificationActivityFilters = [
  { action: "attendee.registered", entityType: "registration" },
  { action: "attendee.checked_in", entityType: "attendance" },
];

export async function GET() {
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const prisma = getPrisma();
  const activity = await prisma.activityLog.findMany({
    where: {
      workspaceId: context.workspace.id,
      OR: notificationActivityFilters,
      createdAt: { gt: new Date(Date.now() - notificationRetentionMs) },
    },
    select: {
      id: true,
      entityId: true,
      action: true,
      createdAt: true,
      seenBy: { where: { userId: context.user.id }, select: { seenAt: true }, take: 1 },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: notificationLimit,
  });

  if (activity.length === 0) {
    return NextResponse.json(
      { notifications: [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const registrations = await prisma.eventRegistration.findMany({
    where: {
      id: { in: activity.map((item) => item.entityId) },
      event: { workspaceId: context.workspace.id },
    },
    select: {
      id: true,
      eventId: true,
      attendee: { select: { firstName: true, lastName: true } },
      event: { select: { name: true } },
    },
  });
  const registrationsById = new Map(registrations.map((registration) => [registration.id, registration]));

  const notifications = activity.flatMap((item) => {
    const registration = registrationsById.get(item.entityId);
    if (!registration) return [];

    return [{
      id: item.id,
      kind: item.action === "attendee.checked_in" ? "check_in" : "registration",
      attendeeName: `${registration.attendee.firstName} ${registration.attendee.lastName}`,
      eventId: registration.eventId,
      eventName: registration.event.name,
      createdAt: item.createdAt.toISOString(),
      seenAt: item.seenBy[0]?.seenAt.toISOString() ?? null,
    }];
  });

  return NextResponse.json(
    { notifications },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

const seenInput = z.object({
  ids: z.array(z.string().min(1).max(128)).min(1).max(notificationLimit),
});

export async function POST(request: Request) {
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ error: "JSON content required." }, { status: 415 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = seenInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid notification IDs." }, { status: 400 });
  const ids = [...new Set(parsed.data.ids)];
  const prisma = getPrisma();
  const seen = await prisma.$transaction(async (transaction) => {
    const activity = await transaction.activityLog.findMany({
      where: {
        id: { in: ids },
        workspaceId: context.workspace.id,
        OR: notificationActivityFilters,
      },
      select: { id: true },
    });
    if (activity.length !== ids.length) return null;

    await transaction.notificationView.createMany({
      data: activity.map(({ id }) => ({ userId: context.user.id, activityId: id })),
      skipDuplicates: true,
    });
    return transaction.notificationView.findMany({
      where: { userId: context.user.id, activityId: { in: ids } },
      select: { activityId: true, seenAt: true },
    });
  });
  if (!seen) return NextResponse.json({ error: "Notification not found." }, { status: 404 });
  return NextResponse.json(
    { seen: seen.map((item) => ({ id: item.activityId, seenAt: item.seenAt.toISOString() })) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
