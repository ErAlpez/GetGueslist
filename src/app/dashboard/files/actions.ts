"use server";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  detectEventAttachmentContentType,
  maxEventAttachmentBytes,
  normalizeEventAttachmentFileName,
} from "@/lib/event-attachment";
import {
  deleteSupabaseObject,
  downloadSupabaseObject,
  uploadSupabaseObject,
} from "@/lib/supabase-storage";
import { getPrisma } from "@/lib/prisma";
import { getWorkspaceContext } from "@/lib/workspace";
import { workspaceRoleCanManageFiles } from "@/lib/workspace-roles";
const maxWorkspaceFiles = 100;

export type WorkspaceFileActionState = {
  error?: string;
  success?: string;
};

export async function uploadWorkspaceFileAction(
  _previousState: WorkspaceFileActionState,
  formData: FormData,
): Promise<WorkspaceFileActionState> {
  const context = await getWorkspaceContext();
  if (!context) redirect("/login");
  if (!workspaceRoleCanManageFiles(context.membership.role)) {
    return { error: "You don’t have permission to manage workspace files." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a PDF or image to upload." };
  }
  if (file.size > maxEventAttachmentBytes) {
    return { error: "Files can’t exceed 2 MB." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = detectEventAttachmentContentType(bytes);
  if (!contentType) {
    return { error: "This file type isn’t allowed. Upload a PDF, JPEG, PNG, or WebP image." };
  }

  const prisma = getPrisma();
  const currentCount = await prisma.workspaceFile.count({ where: { workspaceId: context.workspace.id } });
  if (currentCount >= maxWorkspaceFiles) {
    return { error: "This workspace has reached its 100-file limit." };
  }

  const id = randomUUID();
  const fileName = normalizeEventAttachmentFileName(file.name, contentType);
  const storagePath = `workspaces/${context.workspace.id}/files/${id}/${fileName}`;
  try {
    await uploadSupabaseObject(storagePath, bytes, contentType);
  } catch (error) {
    console.error("Workspace file upload to Supabase Storage failed.", error);
    return { error: "File storage is unavailable or not configured. Try again after checking Supabase Storage settings." };
  }

  let result: "SAVED" | "LIMIT_REACHED";
  try {
    result = await prisma.$transaction(async (transaction) => {
      const count = await transaction.workspaceFile.count({ where: { workspaceId: context.workspace.id } });
      if (count >= maxWorkspaceFiles) return "LIMIT_REACHED";

      await transaction.workspaceFile.create({
        data: {
          id,
          workspaceId: context.workspace.id,
          uploadedById: context.user.id,
          fileName,
          contentType,
          size: bytes.length,
          storagePath,
        },
      });
      await transaction.activityLog.create({
        data: {
          workspaceId: context.workspace.id,
          actorId: context.user.id,
          action: "workspace.file_uploaded",
          entityType: "workspace_file",
          entityId: id,
        },
      });
      return "SAVED";
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    try {
      await deleteSupabaseObject(storagePath);
    } catch (cleanupError) {
      console.error("Orphaned workspace file cleanup failed.", cleanupError);
      throw new Error("The upload could not be saved and its storage cleanup failed.", { cause: error });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { error: "Another file upload happened at the same time. Refresh and try again." };
    }
    throw error;
  }

  if (result === "LIMIT_REACHED") {
    try {
      await deleteSupabaseObject(storagePath);
    } catch (error) {
      console.error("Orphaned workspace file cleanup failed.", error);
      return { error: "The upload could not be saved or cleaned up. Contact support before retrying." };
    }
    return { error: "This workspace has reached its 100-file limit." };
  }

  revalidatePath("/dashboard/files");
  return { success: "File uploaded." };
}

export async function deleteWorkspaceFileAction(
  _previousState: WorkspaceFileActionState,
  formData: FormData,
): Promise<WorkspaceFileActionState> {
  const context = await getWorkspaceContext();
  if (!context) redirect("/login");
  if (!workspaceRoleCanManageFiles(context.membership.role)) {
    return { error: "You don’t have permission to manage workspace files." };
  }

  const fileId = formData.get("fileId");
  if (typeof fileId !== "string" || !fileId) return { error: "Choose a file to delete." };

  const prisma = getPrisma();
  const file = await prisma.workspaceFile.findFirst({
    where: { id: fileId, workspaceId: context.workspace.id },
    select: { id: true, storagePath: true, contentType: true },
  });
  if (!file) return { error: "This file no longer exists. Refresh and try again." };

  let backup: Uint8Array;
  try {
    backup = await downloadSupabaseObject(file.storagePath);
    await deleteSupabaseObject(file.storagePath);
  } catch (error) {
    console.error("Workspace file deletion from Supabase Storage failed.", error);
    return { error: "The file could not be removed from storage. Try again later." };
  }

  try {
    await prisma.$transaction(async (transaction) => {
      const currentFile = await transaction.workspaceFile.findFirst({
        where: { id: file.id, workspaceId: context.workspace.id },
        select: { id: true },
      });
      if (!currentFile) return;

      await transaction.workspaceFile.delete({ where: { id: currentFile.id } });
      await transaction.activityLog.create({
        data: {
          workspaceId: context.workspace.id,
          actorId: context.user.id,
          action: "workspace.file_deleted",
          entityType: "workspace_file",
          entityId: file.id,
        },
      });
    });
  } catch (error) {
    try {
      await uploadSupabaseObject(file.storagePath, backup, file.contentType);
    } catch (restoreError) {
      console.error("Workspace file restoration after failed deletion did not succeed.", restoreError);
      throw new Error("The database deletion failed and the storage object could not be restored.", { cause: error });
    }
    throw error;
  }

  revalidatePath("/dashboard/files");
  return { success: "File deleted." };
}
