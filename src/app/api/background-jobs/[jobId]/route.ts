import { getBackgroundJobView } from "@/lib/background-jobs";
import { getWorkspaceContext } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const context = await getWorkspaceContext();
  if (!context) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const { jobId } = await params;
  const job = await getBackgroundJobView(jobId, context.workspace.id, context.user.id);
  if (!job) return Response.json({ error: "Job not found." }, { status: 404 });

  return Response.json(job, { headers: { "Cache-Control": "private, no-store" } });
}
