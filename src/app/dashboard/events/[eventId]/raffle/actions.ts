"use server";

import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getWorkspaceContext } from "@/lib/workspace";
import { workspaceRoleHasPermission } from "@/lib/workspace-roles";

type RaffleWinner = {
  id: string;
  name: string;
  drawnAt: string;
};

export type RaffleDrawResult =
  | { success: true; winner: RaffleWinner; remainingCount: number }
  | { success: false; error: string };

export async function drawRaffleWinnerAction(eventId: string): Promise<RaffleDrawResult> {
  const context = await getWorkspaceContext();
  if (!context) return { success: false, error: "Sign in to run this raffle." };
  if (!workspaceRoleHasPermission(context.membership.role, "events.manage")) {
    return { success: false, error: "You don’t have permission to run this raffle." };
  }

  try {
    const result = await getPrisma().$transaction(async (tx) => {
      const event = await tx.event.findFirst({
        where: { id: eventId, workspaceId: context.workspace.id, archivedAt: null },
        select: { id: true },
      });
      if (!event) return { success: false as const, error: "This event is unavailable." };

      const eligible = await tx.eventRegistration.findMany({
        where: {
          eventId,
          attendanceLogs: {
            some: { eventId, workspaceId: context.workspace.id, action: "CHECK_IN" },
          },
          raffleDraws: { none: { eventId } },
        },
        select: {
          id: true,
          attendee: { select: { firstName: true, lastName: true } },
        },
      });
      if (eligible.length === 0) {
        return {
          success: false as const,
          error: "No checked-in guests remain. Reset the raffle to include previous winners again.",
        };
      }

      const selected = eligible[randomInt(eligible.length)];
      const draw = await tx.raffleDraw.create({
        data: {
          eventId,
          registrationId: selected.id,
          operatorId: context.user.id,
        },
        select: { createdAt: true },
      });

      return {
        success: true as const,
        winner: {
          id: selected.id,
          name: `${selected.attendee.firstName} ${selected.attendee.lastName}`,
          drawnAt: draw.createdAt.toISOString(),
        },
        remainingCount: eligible.length - 1,
      };
    });

    if (result.success) revalidatePath(`/dashboard/events/${eventId}`);
    return result;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { success: false, error: "Another draw just selected this guest. Spin again for a different winner." };
    }
    throw error;
  }
}

export async function resetRaffleAction(eventId: string): Promise<{ success: boolean; error?: string }> {
  const context = await getWorkspaceContext();
  if (!context) return { success: false, error: "Sign in to reset this raffle." };
  if (!workspaceRoleHasPermission(context.membership.role, "events.manage")) {
    return { success: false, error: "You don’t have permission to reset this raffle." };
  }

  const event = await getPrisma().event.findFirst({
    where: { id: eventId, workspaceId: context.workspace.id, archivedAt: null },
    select: { id: true },
  });
  if (!event) return { success: false, error: "This event is unavailable." };

  await getPrisma().raffleDraw.deleteMany({ where: { eventId } });
  revalidatePath(`/dashboard/events/${eventId}/raffle`);
  revalidatePath(`/dashboard/events/${eventId}`);
  return { success: true };
}
