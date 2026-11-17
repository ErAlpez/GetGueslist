"use server";

import { Buffer } from "node:buffer";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getWorkspaceContext } from "@/lib/workspace";

export type WorkspaceSettingsState = { error?: string; success?: string };
export type ProfilePictureState = { error?: string; success?: string };

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
  if (!["OWNER", "ADMIN"].includes(context.membership.role)) {
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

  const prisma = getPrisma();
  await prisma.$transaction([
    prisma.workspace.update({
      where: { id: context.workspace.id },
      data: {
        name: parsed.data.name,
        contactEmail: parsed.data.contactEmail || null,
        contactPhone: parsed.data.contactPhone || null,
        organizationType: parsed.data.organizationType || null,
        address: parsed.data.address || null,
        timezone: parsed.data.timezone,
      },
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
    image = parsed.data;
  }

  await getPrisma().user.update({
    where: { id: context.user.id },
    data: { image },
  });
  revalidatePath("/dashboard", "layout");
  return { success: removeImage ? "Profile photo removed." : "Profile photo updated." };
}
