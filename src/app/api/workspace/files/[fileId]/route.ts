import { Buffer } from "node:buffer";
import { getPrisma } from "@/lib/prisma";
import { eventAttachmentContentDisposition } from "@/lib/event-attachment";
import { downloadSupabaseObject } from "@/lib/supabase-storage";
import { getWorkspaceContext } from "@/lib/workspace";
import { workspaceRoleCanAccessSection } from "@/lib/workspace-roles";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const context = await getWorkspaceContext();
  if (!context) return new Response(null, { status: 401, headers: privateHeaders });
  if (!workspaceRoleCanAccessSection(context.membership.role, "files")) {
    return new Response(null, { status: 404, headers: privateHeaders });
  }

  const { fileId } = await params;
  const file = await getPrisma().workspaceFile.findFirst({
    where: { id: fileId, workspaceId: context.workspace.id },
    select: { contentType: true, fileName: true, size: true, storagePath: true },
  });
  if (!file) return new Response(null, { status: 404, headers: privateHeaders });

  let bytes: Uint8Array;
  try {
    bytes = await downloadSupabaseObject(file.storagePath);
  } catch (error) {
    console.error("Workspace file download from Supabase Storage failed.", error);
    return new Response("File storage is temporarily unavailable.", { status: 503, headers: privateHeaders });
  }

  return new Response(Buffer.from(bytes), {
    headers: {
      ...privateHeaders,
      "Content-Disposition": eventAttachmentContentDisposition(file.fileName),
      "Content-Length": String(file.size),
      "Content-Type": file.contentType,
    },
  });
}
