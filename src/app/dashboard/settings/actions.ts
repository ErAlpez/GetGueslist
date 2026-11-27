"use server";

import { Buffer } from "node:buffer";
import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { WorkspaceRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getWorkspaceContext } from "@/lib/workspace";
import { workspaceRoleHasPermission } from "@/lib/workspace-roles";
import { workspaceHasFeature } from "@/lib/plan-features";
import { convertImageToAvif } from "@/lib/image-optimization";

export type WorkspaceSettingsState = { error?: string; success?: string; unchanged?: boolean };
export type ProfilePictureState = { error?: string; success?: string };
export type WorkspaceInvitationState = { error?: string; success?: string };

const profileImagePrefix = "data:image/jpeg;base64,";
const profileImageInput = z.string()
  .max(140_000)
  .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/);

const settingsInput = z.object({
  name: z.string().trim().min(2, "Workspace name must have at least 2 characters.").max(100),
  contactEmail: z.union([z.literal(""), z.email("Enter a valid contact email.")]),
  contactPhone: z.string().trim().max(40),
  organizationType: z.string().trim().max(80),
  address: z.string().trim().max(500),
  timezone: z.string().min(1, "Choose a timezone."),
});

export async function updateWorkspaceAction(
  _previousState: WorkspaceSettingsState,
  formData: FormData,
): Promise<WorkspaceSettingsState> {
  const context = await getWorkspaceContext();
  if (!context) return { error: "Your session has expired. Sign in again to continue." };
  if (!workspaceHasFeature(context.subscription, "workspace_settings")) {
    return { error: "Workspace details require the Max plan." };
  }
  if (!workspaceRoleHasPermission(context.membership.role, "workspace.manage")) {
    return { error: "Only workspace owners and admins can update these settings." };
  }

  const parsed = settingsInput.safeParse({
    name: formData.get("name"),
    contactEmail: String(formData.get("contactEmail") ?? "").trim(),
    contactPhone: formData.get("contactPhone"),
    organizationType: formData.get("organizationType"),
    address: formData.get("address"),
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your workspace details." };

  const updatedSettings = {
    name: parsed.data.name,
    contactEmail: parsed.data.contactEmail || null,
    contactPhone: parsed.data.contactPhone || null,
    organizationType: parsed.data.organizationType || null,
    address: parsed.data.address || null,
    timezone: parsed.data.timezone,
  };
  const currentSettings = context.workspace;
  if (
    currentSettings.name === updatedSettings.name &&
    currentSettings.contactEmail === updatedSettings.contactEmail &&
    currentSettings.contactPhone === updatedSettings.contactPhone &&
    currentSettings.organizationType === updatedSettings.organizationType &&
    currentSettings.address === updatedSettings.address &&
    currentSettings.timezone === updatedSettings.timezone
  ) {
    return { unchanged: true };
  }

  const prisma = getPrisma();
  await prisma.$transaction([
    prisma.workspace.update({
      where: { id: context.workspace.id },
      data: updatedSettings,
    }),
    prisma.activityLog.create({
      data: {
        workspaceId: context.workspace.id,
        actorId: context.user.id,
        action: "workspace.updated",
        entityType: "workspace",
        entityId: context.workspace.id,
      },
    }),
  ]);
  revalidatePath("/dashboard", "layout");
  return { success: "Workspace settings saved." };
}

export async function updateProfilePictureAction(
  _previousState: ProfilePictureState,
  formData: FormData,
): Promise<ProfilePictureState> {
  const context = await getWorkspaceContext();
  if (!context) return { error: "Your session has expired. Sign in again to continue." };

  const removeImage = formData.get("removeImage") === "true";
  let image: string | null = null;
  if (!removeImage) {
    const parsed = profileImageInput.safeParse(formData.get("imageData"));
    if (!parsed.success) return { error: "Choose a photo before saving." };

    const encoded = parsed.data.slice(profileImagePrefix.length);
    const bytes = Buffer.from(encoded, "base64");
    const isJpeg =
      bytes.length >= 4 &&
      bytes.length <= 105_000 &&
      encoded === bytes.toString("base64") &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[bytes.length - 2] === 0xff &&
      bytes[bytes.length - 1] === 0xd9;
    if (!isJpeg) return { error: "That photo could not be saved. Choose another image." };
    try {
      const avif = await convertImageToAvif(bytes, { maxDimension: 256, quality: 60 });
      if (avif.length > 100_000) {
        return { error: "This image is too large after compression. Choose another image." };
      }
      image = `data:image/avif;base64,${avif.toString("base64")}`;
    } catch (error) {
      console.error("Profile photo AVIF conversion failed.", error);
      return { error: "That photo could not be processed. Choose another image." };
    }
  }

  await getPrisma().user.update({
    where: { id: context.user.id },
    data: { image },
  });
  revalidatePath("/dashboard", "layout");
  return { success: removeImage ? "Profile photo removed." : "Profile photo updated." };
}

export async function inviteWorkspaceMemberAction(
  _previousState: WorkspaceInvitationState,
  formData: FormData,
): Promise<WorkspaceInvitationState> {
  const context = await getWorkspaceContext();
  if (!context) return { error: "Your session has expired. Sign in again to continue." };
  if (!workspaceRoleHasPermission(context.membership.role, "workspace.manage")) {
    return { error: "Only workspace owners and admins can invite members." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const roleValue = String(formData.get("role") ?? "VIEWER");
  if (!z.email().safeParse(email).success) return { error: "Enter a valid email address." };
  if (!["ADMIN", "MANAGER", "CHECKIN", "VIEWER"].includes(roleValue)) {
    return { error: "Choose a valid workspace role." };
  }

  const prisma = getPrisma();
  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) {
    const existingMember = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: context.workspace.id, userId: existingUser.id } },
    });
    if (existingMember) return { error: "That person is already a workspace member." };
  }

  const existingInvite = await prisma.workspaceInvitation.findUnique({
    where: { workspaceId_email: { workspaceId: context.workspace.id, email } },
  });
  if (existingInvite && existingInvite.acceptedAt === null && existingInvite.expiresAt > new Date()) {
    return { error: "A pending invitation already exists for that email." };
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await prisma.$transaction([
    prisma.workspaceInvitation.upsert({
      where: { workspaceId_email: { workspaceId: context.workspace.id, email } },
      create: {
        workspaceId: context.workspace.id,
        email,
        role: roleValue as WorkspaceRole,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        invitedById: context.user.id,
      },
      update: {
        role: roleValue as WorkspaceRole,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        acceptedAt: null,
        invitedById: context.user.id,
      },
    }),
    prisma.activityLog.create({
      data: {
        workspaceId: context.workspace.id,
        actorId: context.user.id,
        action: "workspace.member_invited",
        entityType: "workspace_invitation",
        entityId: email,
        metadata: { email, role: roleValue },
      },
    }),
  ]);

  const baseUrl = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { sendAuthEmail } = await import("@/lib/email");
  await sendAuthEmail({
    to: email,
    subject: `Invitation to ${context.workspace.name}`,
    url: `${baseUrl.replace(/\/$/, "")}/invite/${token}`,
  }).catch((error: unknown) => {
    console.error("Workspace invitation email could not be sent:", error);
  });

  revalidatePath("/dashboard/settings");
  return { success: "Invitation created and sent." };
}

export async function revokeWorkspaceInvitationAction(formData: FormData) {
  const context = await getWorkspaceContext();
  if (!context) redirect("/login");
  if (!workspaceRoleHasPermission(context.membership.role, "workspace.manage")) redirect("/dashboard/settings");
  const invitationId = String(formData.get("invitationId") ?? "");
  await getPrisma().workspaceInvitation.deleteMany({
    where: { id: invitationId, workspaceId: context.workspace.id, acceptedAt: null },
  });
  revalidatePath("/dashboard/settings");
}

export async function removeWorkspaceMemberAction(formData: FormData) {
  const context = await getWorkspaceContext();
  if (!context) redirect("/login");
  if (context.membership.role !== "OWNER") redirect("/dashboard/settings");
  const memberId = String(formData.get("memberId") ?? "");
  await getPrisma().workspaceMember.deleteMany({
    where: { id: memberId, workspaceId: context.workspace.id, role: { not: "OWNER" } },
  });
  revalidatePath("/dashboard/settings");
}

export async function acceptWorkspaceInvitationAction(formData: FormData) {
  const context = await getWorkspaceContext();
  if (!context) redirect("/login");
  const token = String(formData.get("token") ?? "");
  if (!token) redirect("/dashboard");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const prisma = getPrisma();
  const invitation = await prisma.workspaceInvitation.findUnique({
    where: { tokenHash },
  });
  if (
    !invitation ||
    invitation.acceptedAt ||
    invitation.expiresAt <= new Date() ||
    invitation.email.toLowerCase() !== context.user.email.toLowerCase()
  ) {
    redirect("/dashboard?invitation=invalid");
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.workspaceMember.upsert({
      where: {
        workspaceId_userId: { workspaceId: invitation.workspaceId, userId: context.user.id },
      },
      create: {
        workspaceId: invitation.workspaceId,
        userId: context.user.id,
        role: invitation.role,
      },
      update: { role: invitation.role },
    });
    await transaction.workspaceInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });
  });

  const cookieStore = await import("next/headers").then(({ cookies }) => cookies());
  cookieStore.set("guestlist.workspace", invitation.workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/dashboard");
}
