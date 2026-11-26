import "server-only";

import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

const dayInMs = 24 * 60 * 60 * 1000;
const hourInMs = 60 * 60 * 1000;
const retentionPeriodInMs = 7 * dayInMs;

export type SuperAdminHealthStatus = "healthy" | "attention" | "not-configured" | "unknown";

export type SuperAdminHealthServiceId =
  | "database"
  | "billing"
  | "resend"
  | "file-storage"
  | "rate-limiting";

export type SuperAdminHealthCheck = {
  id: SuperAdminHealthServiceId;
  name: string;
  provider: string;
  status: SuperAdminHealthStatus;
  label: string;
  detail: string;
  latencyMs: number | null;
};

const serviceDefinitions: Array<Pick<SuperAdminHealthCheck, "id" | "name" | "provider">> = [
  { id: "database", name: "Database", provider: "PostgreSQL" },
  { id: "billing", name: "Billing", provider: "Paddle" },
  { id: "resend", name: "Email delivery", provider: "Resend" },
  { id: "file-storage", name: "File storage", provider: "Supabase Storage" },
  { id: "rate-limiting", name: "Rate limiting", provider: "Better Auth · PostgreSQL" },
];

function elapsedMilliseconds(startedAt: number) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function statusFromValue(value: string): SuperAdminHealthStatus {
  if (value === "healthy" || value === "attention" || value === "not-configured") return value;
  return "unknown";
}

function checkBillingConfiguration(): SuperAdminHealthCheck {
  const service = serviceDefinitions[1];
  const provider = process.env.PAYMENT_PROVIDER?.trim().toLowerCase() || "paddle";
  if (provider !== "paddle") {
    return {
      ...service,
      status: "attention",
      label: "Unsupported provider",
      detail: `PAYMENT_PROVIDER is set to an unsupported value: ${provider}.`,
      latencyMs: null,
    };
  }
  const apiKey = process.env.PADDLE_API_KEY?.trim();
  const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET?.trim();
  const environment = process.env.PADDLE_ENVIRONMENT?.trim().toLowerCase() || "live";
  if (environment !== "sandbox" && environment !== "live") {
    return {
      ...service,
      status: "attention",
      label: "Invalid configuration",
      detail: 'PADDLE_ENVIRONMENT must be either "sandbox" or "live".',
      latencyMs: null,
    };
  }
  const priceKeys = [
    "PADDLE_PRICE_STARTER_MONTHLY",
    "PADDLE_PRICE_STARTER_ANNUAL",
    "PADDLE_PRICE_PROFESSIONAL_MONTHLY",
    "PADDLE_PRICE_PROFESSIONAL_ANNUAL",
    "PADDLE_ONE_TIME_PRICE_STARTER_MONTHLY",
    "PADDLE_ONE_TIME_PRICE_STARTER_ANNUAL",
    "PADDLE_ONE_TIME_PRICE_PROFESSIONAL_MONTHLY",
    "PADDLE_ONE_TIME_PRICE_PROFESSIONAL_ANNUAL",
  ];
  const checkoutConfigured = Boolean(process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN?.trim())
    && priceKeys.every((key) => process.env[key]?.trim().startsWith("pri_"));

  if (!apiKey || !webhookSecret || !checkoutConfigured) {
    return {
      ...service,
      status: "not-configured",
      label: "Incomplete configuration",
      detail: "Paddle API, checkout, and webhook settings must all be configured.",
      latencyMs: null,
    };
  }

  return {
    ...service,
    status: "unknown",
    label: "Configured · API not probed",
    detail: "Paddle credentials are configured. This monitor does not create transactions or require additional API read permissions.",
    latencyMs: null,
  };
}

async function checkDatabase(): Promise<SuperAdminHealthCheck> {
  const service = serviceDefinitions[0];
  if (!process.env.DATABASE_URL) {
    return {
      ...service,
      status: "not-configured",
      label: "Not configured",
      detail: "DATABASE_URL is missing.",
      latencyMs: null,
    };
  }

  const startedAt = performance.now();
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return {
      ...service,
      status: "healthy",
      label: "Healthy",
      detail: "PostgreSQL connection check passed.",
      latencyMs: elapsedMilliseconds(startedAt),
    };
  } catch (error) {
    console.error("Super Admin database health check failed.", error);
    return {
      ...service,
      status: "attention",
      label: "Unavailable",
      detail: "The connection check failed. Review server logs for details.",
      latencyMs: elapsedMilliseconds(startedAt),
    };
  }
}

async function checkResend(fetcher: typeof fetch): Promise<SuperAdminHealthCheck> {
  const service = serviceDefinitions[2];
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const sender = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !sender) {
    return {
      ...service,
      status: "not-configured",
      label: "Not configured",
      detail: "Set both RESEND_API_KEY and EMAIL_FROM to enable email delivery.",
      latencyMs: null,
    };
  }

  const startedAt = performance.now();
  try {
    const response = await fetcher("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    const latencyMs = elapsedMilliseconds(startedAt);
    if (!response.ok) {
      return {
        ...service,
        status: "attention",
        label: "Unavailable",
        detail: `Resend returned HTTP ${response.status}.`,
        latencyMs,
      };
    }

    return {
      ...service,
      status: "healthy",
      label: "API reachable",
      detail: "Resend accepted the API key. This check does not send email.",
      latencyMs,
    };
  } catch (error) {
    console.error("Super Admin Resend health check failed.", error);
    return {
      ...service,
      status: "attention",
      label: "Unavailable",
      detail: "Could not reach the Resend API.",
      latencyMs: elapsedMilliseconds(startedAt),
    };
  }
}

function getSupabaseStorageEndpoint(): URL | null {
  const projectUrl = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!projectUrl) return null;

  const endpoint = new URL(projectUrl);
  const isLocalHost = ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && isLocalHost)) {
    throw new Error("Supabase URL must use HTTPS.");
  }
  if (endpoint.username || endpoint.password) throw new Error("Supabase URL must not include credentials.");

  return new URL("/storage/v1/bucket", endpoint.origin);
}

async function checkSupabaseStorage(fetcher: typeof fetch): Promise<SuperAdminHealthCheck> {
  const service = serviceDefinitions[3];
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  let endpoint: URL | null;
  try {
    endpoint = getSupabaseStorageEndpoint();
  } catch (error) {
    console.error("Super Admin Supabase configuration is invalid.", error);
    return {
      ...service,
      status: "attention",
      label: "Invalid configuration",
      detail: "Set SUPABASE_URL to an HTTPS project URL.",
      latencyMs: null,
    };
  }

  if (!endpoint || !serviceRoleKey) {
    return {
      ...service,
      status: "not-configured",
      label: "Not configured",
      detail: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to check storage.",
      latencyMs: null,
    };
  }

  const startedAt = performance.now();
  try {
    const response = await fetcher(endpoint, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    const latencyMs = elapsedMilliseconds(startedAt);
    if (!response.ok) {
      return {
        ...service,
        status: "attention",
        label: "Unavailable",
        detail: `Supabase Storage returned HTTP ${response.status}.`,
        latencyMs,
      };
    }

    return {
      ...service,
      status: "healthy",
      label: "API reachable",
      detail: "Supabase Storage is reachable; this app still stores event attachments in PostgreSQL.",
      latencyMs,
    };
  } catch (error) {
    console.error("Super Admin Supabase Storage health check failed.", error);
    return {
      ...service,
      status: "attention",
      label: "Unavailable",
      detail: "Could not reach the Supabase Storage API.",
      latencyMs: elapsedMilliseconds(startedAt),
    };
  }
}

export async function collectSuperAdminHealthChecks(fetcher: typeof fetch = fetch): Promise<SuperAdminHealthCheck[]> {
  const [database, resend, storage] = await Promise.all([
    checkDatabase(),
    checkResend(fetcher),
    checkSupabaseStorage(fetcher),
  ]);

  return [
    database,
    checkBillingConfiguration(),
    resend,
    storage,
    {
      ...serviceDefinitions[4],
      status: database.status === "healthy" ? "unknown" : database.status,
      label: database.status === "healthy" ? "Configured · DB-backed" : database.label,
      detail: database.status === "healthy"
        ? "Better Auth rate limiting is enabled and stored in PostgreSQL. Database availability is reported separately."
        : "Better Auth rate limiting uses PostgreSQL, but its database backend is unavailable or not configured.",
      latencyMs: null,
    },
  ];
}

export async function runSuperAdminHealthChecks(
  fetcher: typeof fetch = fetch,
  prisma: PrismaClient = getPrisma(),
  checkedAt = new Date(),
) {
  const checks = await collectSuperAdminHealthChecks(fetcher);
  const run = await prisma.systemHealthRun.create({
    data: {
      checkedAt,
      checks: {
        create: checks.map(({ id, status, label, latencyMs, detail }) => ({
          service: id,
          status,
          label,
          latencyMs,
          detail,
        })),
      },
    },
    select: { id: true, checkedAt: true },
  });
  await prisma.systemHealthRun.deleteMany({
    where: { checkedAt: { lt: new Date(checkedAt.getTime() - retentionPeriodInMs) } },
  });

  return { checkedAt: run.checkedAt, checks };
}

function summarizeChecks(checks: Array<{ status: string; latencyMs: number | null }>) {
  const monitored = checks.filter(({ status }) => status === "healthy" || status === "attention");
  const healthyCount = monitored.filter(({ status }) => status === "healthy").length;
  const latencySamples = checks.flatMap(({ latencyMs }) => latencyMs === null ? [] : [latencyMs]);

  return {
    observedChecks: monitored.length,
    failedChecks: monitored.length - healthyCount,
    availabilityPercent: monitored.length
      ? Math.round((healthyCount / monitored.length) * 1000) / 10
      : null,
    averageLatencyMs: latencySamples.length
      ? Math.round(latencySamples.reduce((total, latencyMs) => total + latencyMs, 0) / latencySamples.length)
      : null,
  };
}

export async function getSuperAdminHealthDashboard(
  prisma: PrismaClient = getPrisma(),
  now = new Date(),
) {
  const since = new Date(now.getTime() - dayInMs);
  const runs = await prisma.systemHealthRun.findMany({
    where: { checkedAt: { gte: since } },
    include: { checks: true },
    orderBy: { checkedAt: "desc" },
  });
  const samples = runs.flatMap((run) => run.checks.map((check) => ({ ...check, checkedAt: run.checkedAt })));
  const latestByService = new Map<string, (typeof samples)[number]>();
  for (const sample of samples) {
    if (!latestByService.has(sample.service)) latestByService.set(sample.service, sample);
  }

  const services = serviceDefinitions.map((service) => {
    const serviceSamples = samples.filter((sample) => sample.service === service.id);
    const latest = latestByService.get(service.id);
    return {
      ...service,
      status: latest ? statusFromValue(latest.status) : "unknown" as const,
      label: latest?.label ?? "No check in last 24 hours",
      detail: latest?.detail ?? "No check was recorded for this service in the last 24 hours.",
      lastCheckedAt: latest?.checkedAt ?? null,
      ...summarizeChecks(serviceSamples),
      sampleCount: serviceSamples.length,
    };
  });

  const summary = summarizeChecks(samples);
  const windowStart = since.getTime();
  const hourlyAvailability = Array.from({ length: 24 }, (_, index) => {
    const startedAt = new Date(windowStart + index * hourInMs);
    const endedAt = new Date(startedAt.getTime() + hourInMs);
    const hourlyChecks = samples.filter((sample) =>
      sample.checkedAt >= startedAt &&
      sample.checkedAt < endedAt &&
      (sample.status === "healthy" || sample.status === "attention"),
    );
    return {
      startedAt,
      ...summarizeChecks(hourlyChecks),
    };
  });

  return {
    ...summary,
    runCount: runs.length,
    lastCheckedAt: runs[0]?.checkedAt ?? null,
    services,
    hourlyAvailability,
  };
}

export type SuperAdminHealthDashboard = Awaited<ReturnType<typeof getSuperAdminHealthDashboard>>;
