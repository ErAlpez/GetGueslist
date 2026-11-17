import "server-only";

import { EventStatus, Prisma } from "@prisma/client";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const getWorkspaceContext = cache(async () => {
  const session = await getCurrentSession();
  if (!session) return null;

  const prisma = getPrisma();
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id },
    include: {
      workspace: {
        include: {
          subscription: { include: { plan: true } },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  if (!membership) return null;

  return {
    user: session.user,
    membership,
    workspace: membership.workspace,
    subscription: membership.workspace.subscription,
  };
});

export async function requireWorkspaceContext() {
  const context = await getWorkspaceContext();
  if (!context) redirect("/login");
  return context;
}

export async function getDashboardSummary(workspaceId: string) {
  const prisma = getPrisma();
  const now = new Date();
  const trendStart = new Date(now);
  trendStart.setUTCHours(0, 0, 0, 0);
  trendStart.setUTCDate(trendStart.getUTCDate() - 6);
  const activeStatuses: EventStatus[] = ["PUBLISHED", "REGISTRATION_OPEN", "ONGOING"];

  const [
    totalEvents,
    activeEvents,
    upcomingEvents,
    completedEvents,
    totalRegistrations,
    checkedInAttendees,
    recentEvents,
    recentRegistrations,
    subscription,
    recentAttendanceLogs,
    registrationTrendRows,
  ] = await Promise.all([
    prisma.event.count({ where: { workspaceId, archivedAt: null } }),
    prisma.event.count({ where: { workspaceId, status: { in: activeStatuses }, archivedAt: null } }),
    prisma.event.count({
      where: {
        workspaceId,
        startsAt: { gte: now },
        status: { notIn: ["COMPLETED", "CANCELLED"] },
        archivedAt: null,
      },
    }),
    prisma.event.count({ where: { workspaceId, status: "COMPLETED", archivedAt: null } }),
    prisma.eventRegistration.count({ where: { event: { workspaceId } } }),
    prisma.attendanceLog.count({ where: { workspaceId, action: "CHECK_IN" } }),
    prisma.event.findMany({
      where: {
        workspaceId,
        startsAt: { gte: now },
        status: { notIn: ["COMPLETED", "CANCELLED"] },
        archivedAt: null,
      },
      include: { _count: { select: { registrations: true } } },
      orderBy: { startsAt: "asc" },
      take: 4,
    }),
    prisma.eventRegistration.findMany({
      where: { event: { workspaceId } },
      include: { attendee: true, event: { select: { name: true } } },
      orderBy: { registeredAt: "desc" },
      take: 5,
    }),
    prisma.subscription.findUnique({
      where: { workspaceId },
      include: { plan: true },
    }),
    prisma.attendanceLog.findMany({
      where: { workspaceId, action: "CHECK_IN" },
      include: {
        registration: { include: { attendee: { select: { firstName: true, lastName: true } } } },
        event: { select: { name: true, timezone: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    prisma.$queryRaw<Array<{ day: string; count: bigint }>>(Prisma.sql`
      SELECT to_char(date_trunc('day', registration."registeredAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
        COUNT(*) AS count
      FROM "EventRegistration" AS registration
      JOIN "Event" AS event ON event.id = registration."eventId"
      WHERE event."workspaceId" = ${workspaceId}
        AND registration."registeredAt" >= ${trendStart}
      GROUP BY date_trunc('day', registration."registeredAt" AT TIME ZONE 'UTC')
      ORDER BY day
    `),
  ]);

  const trendByDay = new Map(registrationTrendRows.map((row) => [row.day, Number(row.count)]));
  const registrationTrend = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now);
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() - (6 - index));
    const key = day.toISOString().slice(0, 10);
    return {
      label: new Intl.DateTimeFormat("en-PH", { weekday: "short", timeZone: "UTC" }).format(day),
      count: trendByDay.get(key) ?? 0,
    };
  });

  return {
    totalEvents,
    activeEvents,
    upcomingEvents,
    completedEvents,
    totalRegistrations,
    checkedInAttendees,
    notCheckedInAttendees: Math.max(totalRegistrations - checkedInAttendees, 0),
    attendanceRate: totalRegistrations === 0 ? 0 : Math.round((checkedInAttendees / totalRegistrations) * 100),
    recentEvents,
    recentRegistrations,
    subscription,
    recentAttendanceLogs,
    registrationTrend,
  };
}
