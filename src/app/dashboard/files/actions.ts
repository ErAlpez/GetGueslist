"use server";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  detectEventAttachmentContentType,
  maxEventAttachmentBytes,
  normalizeEventAttachmentOriginalFileName,
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
import { convertImageToAvif } from "@/lib/image-optimization";
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

  const uploadedBytes = new Uint8Array(await file.arrayBuffer());
  const uploadedContentType = detectEventAttachmentContentType(uploadedBytes);
  if (!uploadedContentType) {
    return { error: "This file type isn’t allowed. Upload a PDF, JPEG, PNG, WebP, or AVIF image." };
  }
  let bytes = uploadedBytes;
  let contentType = uploadedContentType;
  if (uploadedContentType.startsWith("image/")) {
    try {
      bytes = await convertImageToAvif(uploadedBytes, { maxDimension: 2048, quality: 60 });
    } catch (error) {
      console.error("Workspace image AVIF conversion failed.", error);
      return { error: "This image could not be processed. Choose another image." };
    }
    if (bytes.length > maxEventAttachmentBytes) {
      return { error: "This image is too large after compression. Choose another image." };
    }
    contentType = "image/avif";
  }
  const originalFileName = normalizeEventAttachmentOriginalFileName(file.name);
  const fileName = normalizeEventAttachmentFileName(file.name, contentType);

  const prisma = getPrisma();
  const existing = await prisma.workspaceFile.findFirst({
    where: {
      workspaceId: context.workspace.id,
      originalFileName: { equals: originalFileName, mode: "insensitive" },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      originalFileName: true,
      contentType: true,
      size: true,
      storagePath: true,
    },
  });
  const currentCount = await prisma.workspaceFile.count({ where: { workspaceId: context.workspace.id } });
  if (!existing && currentCount >= maxWorkspaceFiles) {
    return { error: "This workspace has reached its 100-file limit." };
  }

  const id = existing?.id ?? randomUUID();
  const storagePath = `workspaces/${context.workspace.id}/files/${id}/${randomUUID()}/${fileName}`;
  let previousBytes: Uint8Array | null = null;
  if (existing) {
    try {
      previousBytes = await downloadSupabaseObject(existing.storagePath);
    } catch (error) {
      console.error("Previous workspace file could not be backed up for replacement.", error);
      return { error: "The previous file could not be replaced safely. Try again later." };
    }
  }
  try {
    await uploadSupabaseObject(storagePath, bytes, contentType);
  } catch (error) {
    console.error("Workspace file upload to Supabase Storage failed.", error);
    return { error: "File storage is unavailable or not configured. Try again after checking Supabase Storage settings." };
  }

  let result: "CONFLICT" | "SAVED" | "LIMIT_REACHED";
  try {
    result = await prisma.$transaction(async (transaction) => {
      if (existing) {
        const currentFile = await transaction.workspaceFile.findFirst({
          where: { id: existing.id, workspaceId: context.workspace.id },
          select: { id: true, storagePath: true },
        });
        if (!currentFile || currentFile.storagePath !== existing.storagePath) return "CONFLICT";
        await transaction.workspaceFile.update({
          where: { id: existing.id },
          data: { fileName, originalFileName, contentType, size: bytes.length, storagePath, uploadedById: context.user.id },
        });
      } else {
        const sameNameFile = await transaction.workspaceFile.findFirst({
          where: {
            workspaceId: context.workspace.id,
            originalFileName: { equals: originalFileName, mode: "insensitive" },
          },
          select: { id: true },
        });
        if (sameNameFile) return "CONFLICT";
        const count = await transaction.workspaceFile.count({ where: { workspaceId: context.workspace.id } });
        if (count >= maxWorkspaceFiles) return "LIMIT_REACHED";

        await transaction.workspaceFile.create({
          data: {
            id,
            workspaceId: context.workspace.id,
            uploadedById: context.user.id,
            fileName,
            originalFileName,
            contentType,
            size: bytes.length,
            storagePath,
          },
        });
      }
      await transaction.activityLog.create({
        data: {
          workspaceId: context.workspace.id,
          actorId: context.user.id,
          action: existing ? "workspace.file_replaced" : "workspace.file_uploaded",
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
  if (result === "CONFLICT") {
    try {
      await deleteSupabaseObject(storagePath);
    } catch (error) {
      console.error("Conflicting workspace file upload cleanup failed.", error);
      throw new Error("The replacement conflicted and its temporary file could not be removed.", { cause: error });
    }
    return { error: "Another file upload happened at the same time. Refresh and try again." };
  }

  if (existing) {
    try {
      await deleteSupabaseObject(existing.storagePath);
    } catch (error) {
      console.error("Previous workspace file cleanup failed.", error);
      try {
        if (!previousBytes) throw new Error("The previous workspace file backup is unavailable.");
        await uploadSupabaseObject(existing.storagePath, previousBytes, existing.contentType);
        const restored = await prisma.workspaceFile.updateMany({
          where: { id: existing.id, workspaceId: context.workspace.id, storagePath },
          data: {
            fileName: existing.fileName,
            originalFileName: existing.originalFileName,
            contentType: existing.contentType,
            size: existing.size,
            storagePath: existing.storagePath,
          },
        });
        if (restored.count !== 1) throw new Error("The workspace file changed before rollback.");
        await deleteSupabaseObject(storagePath);
      } catch (restoreError) {
        console.error("Workspace file replacement rollback failed.", restoreError);
        throw new Error("The previous workspace file could not be safely restored.", { cause: error });
      }
      return { error: "The previous file could not be removed from storage, so the replacement was rolled back." };
    }
  }

  revalidatePath("/dashboard/files");
  return { success: existing ? "File replaced." : "File uploaded." };
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
