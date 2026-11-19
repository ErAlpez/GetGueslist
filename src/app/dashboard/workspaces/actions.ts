"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace";

export async function switchWorkspaceAction(formData: FormData) {
  const context = await getWorkspaceContext();
  if (!context) redirect("/login");

  const workspaceId = String(formData.get("workspaceId") ?? "");
  const membership = context.memberships.find((item) => item.workspaceId === workspaceId);
  if (!membership) {
    redirect("/dashboard");
  }

  const cookieStore = await cookies();
  cookieStore.set("guestlist.workspace", workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}
