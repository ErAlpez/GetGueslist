import { getAttendeeExportDownload } from "@/lib/background-jobs";
import { getWorkspaceContext } from "@/lib/workspace";
import { workspaceHasFeature } from "@/lib/plan-features";
import { workspaceRoleCanAccessSection } from "@/lib/workspace-roles";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const context = await getWorkspaceContext();
  if (!context) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }
  if (!workspaceRoleCanAccessSection(context.membership.role, "attendees")) {
    return Response.json({ error: "You don’t have permission to download attendee exports." }, { status: 403 });
  }
  if (!workspaceHasFeature(context.subscription, "csv_exports")) {
    return Response.json({ error: "CSV exports require the Starter plan or higher." }, { status: 403 });
  }

  const { jobId } = await params;
  const download = await getAttendeeExportDownload(jobId, context.workspace.id, context.user.id);
  if (!download) return Response.json({ error: "This export is unavailable or has expired." }, { status: 404 });
  if (!download.eventId && !workspaceHasFeature(context.subscription, "workspace_exports")) {
    return Response.json({ error: "Workspace-wide CSV exports require the Max plan." }, { status: 403 });
  }

  return new Response(download.bytes, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="attendees-export.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
