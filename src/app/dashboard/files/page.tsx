import { getPrisma } from "@/lib/prisma";
import { getPreferences } from "@/lib/preferences";
import { localizeNode } from "@/lib/localization";
import { requireWorkspaceSection } from "@/lib/workspace";
import { WorkspaceFileLibrary } from "@/components/workspace-file-library";
import { workspaceRoleCanManageFiles } from "@/lib/workspace-roles";

export default async function WorkspaceFilesPage() {
  const { locale } = await getPreferences();
  const context = await requireWorkspaceSection("files");
  const canManageFiles = workspaceRoleCanManageFiles(context.membership.role);

  const [files, attachments] = await Promise.all([
    getPrisma().workspaceFile.findMany({
      where: { workspaceId: context.workspace.id },
      select: { id: true, fileName: true, contentType: true, size: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    getPrisma().eventAttachment.findMany({
      where: { event: { workspaceId: context.workspace.id, archivedAt: null } },
      select: {
        id: true,
        eventId: true,
        fileName: true,
        contentType: true,
        size: true,
        createdAt: true,
        event: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return localizeNode((
    <div className="venuguestpass-page">
      <div className="page-heading-row">
        <div>
          <div className="page-kicker">WORKSPACE</div>
          <h1>Workspace files</h1>
          <p>Shared files and attachments from your events.</p>
        </div>
      </div>
      <WorkspaceFileLibrary
        attachments={attachments.map((attachment) => ({
          id: attachment.id,
          eventId: attachment.eventId,
          eventName: attachment.event.name,
          fileName: attachment.fileName,
          contentType: attachment.contentType,
          size: attachment.size,
          createdAt: attachment.createdAt,
        }))}
        files={files}
        canManage={canManageFiles}
      />
    </div>
  ), locale);
}
