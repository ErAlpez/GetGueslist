"use server";

import type { WorkspaceRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getWorkspaceContext } from "@/lib/workspace";

const demoRoles = ["OWNER", "ADMIN", "MANAGER", "CHECKIN", "VIEWER"] as const satisfies readonly WorkspaceRole[];

export async function switchDemoRoleAction(formData: FormData) {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Demo role switching is only available in development.");
  }

  const context = await getWorkspaceContext();
  if (!context) redirect("/login");
  if (
    context.user.id !== "guestlist-demo-user" ||
    context.workspace.id !== "guestlist-demo-workspace"
  ) {
    throw new Error("Demo role switching is only available to the local demo workspace.");
  }

  const role = demoRoles.find((candidate) => candidate === formData.get("role"));
  if (!role) throw new Error("Choose a valid demo role.");

  await getPrisma().workspaceMember.update({
    where: {
      workspaceId_userId: {
        workspaceId: context.workspace.id,
        userId: context.user.id,
      },
    },
    data: { role },
  });

  const requestedPath = formData.get("returnTo");
  const returnTo = typeof requestedPath === "string" && /^\/dashboard(?:\/|$)/.test(requestedPath)
    ? requestedPath
    : "/dashboard";
  revalidatePath("/dashboard", "layout");
  redirect(returnTo);
}
