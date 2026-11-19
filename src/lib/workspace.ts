import "server-only";

import { Prisma } from "@prisma/client";
import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import {
  workspaceRoleCanAccessSection,
  workspaceRoleHasPermission,
  workspaceRoleHome,
  type DashboardSection,
  type WorkspacePermission,
} from "@/lib/workspace-roles";

export const getWorkspaceContext = cache(async () => {
  const session = await getCurrentSession();
  if (!session) return null;

  const prisma = getPrisma();
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: session.user.id },
    include: { workspace: { include: { subscription: { include: { plan: true } } } } },
    orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
  });
  if (memberships.length === 0) return null;

  const cookieStore = await cookies();
  const selectedWorkspaceId = cookieStore.get("guestlist.workspace")?.value;
  const membership =
    memberships.find((item) => item.workspaceId === selectedWorkspaceId) ??
    memberships.find((item) => item.role === "OWNER") ??
    memberships[0];
  if (!membership) return null;

  return {
    user: session.user,
    membership,
    workspace: membership.workspace,
    subscription: membership.workspace.subscription,
    memberships,
  };
});

export async function requireWorkspaceContext() {
  const context = await getWorkspaceContext();
  if (!context) redirect("/login");
  return context;
}

export async function requireWorkspaceSection(section: DashboardSection) {
  const context = await requireWorkspaceContext();
  if (!workspaceRoleCanAccessSection(context.membership.role, section)) {
    redirect(workspaceRoleHome(context.membership.role));
  }
  return context;
}

export async function requireWorkspacePermission(permission: WorkspacePermission, fallback = "/dashboard") {
  const context = await requireWorkspaceContext();
  if (!workspaceRoleHasPermission(context.membership.role, permission)) redirect(fallback);
  return context;
}

export async function getDashboardSummary(workspaceId: string, locale: string) {
  const prisma = getPrisma();
  const now = new Date();
  const trendStart = new Date(now);
  trendStart.setUTCHours(0, 0, 0, 0);
  trendStart.setUTCDate(trendStart.getUTCDate() - 6);

  const [
    countRows,
    recentEvents,
    recentRegistrations,
    subscription,
    recentAttendanceLogs,
    registrationTrendRows,
  ] = await Promise.all([
    prisma.$queryRaw<Array<{
      totalEvents: bigint;
      activeEvents: bigint;
      upcomingEvents: bigint;
      completedEvents: bigint;
      totalRegistrations: bigint;
      checkedInAttendees: bigint;
    }>>(Prisma.sql`
      WITH workspace_events AS (
        SELECT id, status, "startsAt", "archivedAt"
        FROM "Event"
        WHERE "workspaceId" = ${workspaceId}
      ),
      event_metrics AS (
        SELECT
          COUNT(*) FILTER (WHERE "archivedAt" IS NULL) AS "totalEvents",
          COUNT(*) FILTER (
            WHERE "archivedAt" IS NULL
              AND status IN ('PUBLISHED', 'REGISTRATION_OPEN', 'ONGOING')
          ) AS "activeEvents",
          COUNT(*) FILTER (
            WHERE "archivedAt" IS NULL
              AND "startsAt" >= ${now}
              AND status NOT IN ('COMPLETED', 'CANCELLED')
          ) AS "upcomingEvents",
          COUNT(*) FILTER (
            WHERE "archivedAt" IS NULL AND status = 'COMPLETED'
          ) AS "completedEvents"
        FROM workspace_events
      )
      SELECT
        event_metrics."totalEvents",
        event_metrics."activeEvents",
        event_metrics."upcomingEvents",
        event_metrics."completedEvents",
        (
          SELECT COUNT(*)
          FROM "EventRegistration" AS registration
          JOIN workspace_events AS event ON event.id = registration."eventId"
        ) AS "totalRegistrations",
        (
          SELECT COUNT(DISTINCT attendance."registrationId")
          FROM "AttendanceLog" AS attendance
          WHERE attendance."workspaceId" = ${workspaceId}
            AND attendance.action = 'CHECK_IN'
        ) AS "checkedInAttendees"
      FROM event_metrics
    `),
    prisma.event.findMany({
      where: {
        workspaceId,
        startsAt: { gte: now },
        status: { notIn: ["COMPLETED", "CANCELLED"] },
        archivedAt: null,
      },
      select: {
        id: true,
        name: true,
        startsAt: true,
        timezone: true,
        venue: true,
        format: true,
        status: true,
        _count: { select: { registrations: true } },
      },
      orderBy: { startsAt: "asc" },
      take: 4,
    }),
    prisma.eventRegistration.findMany({
      where: { event: { workspaceId } },
      select: {
        id: true,
        registeredAt: true,
        attendee: { select: { firstName: true, lastName: true } },
        event: { select: { name: true, timezone: true } },
      },
      orderBy: { registeredAt: "desc" },
      take: 5,
    }),
    prisma.subscription.findUnique({
      where: { workspaceId },
      select: {
        status: true,
        plan: {
          select: {
            name: true,
            code: true,
            activeEventLimit: true,
            attendeePerEventLimit: true,
          },
        },
      },
    }),
    prisma.attendanceLog.findMany({
      where: { workspaceId, action: "CHECK_IN" },
      select: {
        id: true,
        createdAt: true,
        registration: {
          select: { attendee: { select: { firstName: true, lastName: true } } },
        },
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

  const [counts] = countRows;
  if (!counts) throw new Error("Dashboard summary counts could not be loaded.");
  const totalEvents = Number(counts.totalEvents);
  const activeEvents = Number(counts.activeEvents);
  const upcomingEvents = Number(counts.upcomingEvents);
  const completedEvents = Number(counts.completedEvents);
  const totalRegistrations = Number(counts.totalRegistrations);
  const checkedInAttendees = Number(counts.checkedInAttendees);
  const trendByDay = new Map(registrationTrendRows.map((row) => [row.day, Number(row.count)]));
  const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const registrationTrend = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now);
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() - (6 - index));
    const key = day.toISOString().slice(0, 10);
    return {
      label: weekdayFormatter.format(day),
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
