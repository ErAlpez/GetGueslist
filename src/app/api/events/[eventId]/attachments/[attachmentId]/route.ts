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
  { params }: { params: Promise<{ eventId: string; attachmentId: string }> },
) {
  const context = await getWorkspaceContext();
  if (!context) return new Response(null, { status: 401, headers: privateHeaders });
  if (!workspaceRoleCanAccessSection(context.membership.role, "events")) {
    return new Response(null, { status: 404, headers: privateHeaders });
  }

  const { eventId, attachmentId } = await params;
  const attachment = await getPrisma().eventAttachment.findFirst({
    where: {
      id: attachmentId,
      eventId,
      event: { workspaceId: context.workspace.id, archivedAt: null },
    },
    select: { contentType: true, data: true, fileName: true, size: true, storagePath: true },
  });
  if (!attachment) return new Response(null, { status: 404, headers: privateHeaders });

  let bytes: Uint8Array;
  if (attachment.storagePath) {
    try {
      bytes = await downloadSupabaseObject(attachment.storagePath);
    } catch (error) {
      console.error("Event attachment download from Supabase Storage failed.", error);
      return new Response("File storage is temporarily unavailable.", { status: 503, headers: privateHeaders });
    }
  } else if (attachment.data) {
    bytes = new Uint8Array(attachment.data);
  } else {
    console.error("Event attachment has neither a storage path nor legacy file data.", { attachmentId });
    return new Response("The requested file is unavailable.", { status: 503, headers: privateHeaders });
  }

  return new Response(Buffer.from(bytes), {
    headers: {
      ...privateHeaders,
      "Content-Disposition": eventAttachmentContentDisposition(attachment.fileName),
      "Content-Length": String(attachment.size),
      "Content-Type": attachment.contentType,
    },
  });
}
