import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { normalizeCountryCode, trackedPublicPaths } from "@/lib/website-analytics";

const viewInput = z.object({ path: z.enum(trackedPublicPaths) });

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const requestHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string | null = null;
  try {
    originHost = origin ? new URL(origin).host : null;
  } catch {
    originHost = null;
  }
  if (!requestHost || !originHost || originHost !== requestHost.toLowerCase()) {
    return new Response(null, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 512) {
    return new Response(null, { status: 413, headers: { "Cache-Control": "no-store" } });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return new Response(null, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const parsed = viewInput.safeParse(body);
  if (!parsed.success) {
    return new Response(null, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const countryCode = process.env.VERCEL === "1"
    ? normalizeCountryCode(request.headers.get("x-vercel-ip-country"))
    : "XX";

  await getPrisma().websiteDailyStat.upsert({
    where: {
      date_path_countryCode: {
        date,
        path: parsed.data.path,
        countryCode,
      },
    },
    create: {
      date,
      path: parsed.data.path,
      countryCode,
      views: 1,
    },
    update: { views: { increment: 1 } },
  });

  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
