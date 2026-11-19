import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

function getStorageConfig() {
  const projectUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "workspace-files";
  if (!projectUrl || !serviceRoleKey) {
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before migrating attachments.");
  }

  const parsedUrl = new URL(projectUrl);
  const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(parsedUrl.hostname);
  if (
    (parsedUrl.protocol !== "https:" && !(parsedUrl.protocol === "http:" && localHost)) ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    throw new Error("SUPABASE_URL must be an HTTPS project URL without embedded credentials.");
  }
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(bucket)) {
    throw new Error("SUPABASE_STORAGE_BUCKET has an invalid name.");
  }

  return { origin: parsedUrl.origin, bucket, serviceRoleKey };
}

function encodeObjectPath(path) {
  const segments = path.split("/");
  if (segments.length < 2 || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("An attachment has an invalid storage path.");
  }
  return segments.map((segment) => encodeURIComponent(segment)).join("/");
}

async function uploadAttachment(config, path, data, contentType) {
  const url = new URL(
    `/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeObjectPath(path)}`,
    config.origin,
  );
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: data,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Supabase Storage upload failed with HTTP ${response.status}.`);
}

async function main() {
  if (dryRun) {
    const pending = await prisma.eventAttachment.count({ where: { storagePath: null } });
    console.info(`Dry run: ${pending} event attachment(s) are pending migration.`);
    return;
  }

  const config = getStorageConfig();
  let migrated = 0;
  while (true) {
    const attachments = await prisma.eventAttachment.findMany({
      where: { storagePath: null },
      orderBy: { id: "asc" },
      take: 25,
      select: {
        id: true,
        eventId: true,
        fileName: true,
        contentType: true,
        data: true,
        event: { select: { workspaceId: true } },
      },
    });
    if (attachments.length === 0) break;

    for (const attachment of attachments) {
      if (!attachment.data) {
        throw new Error(`Attachment ${attachment.id} has no database data and no Supabase storage path.`);
      }
      const path = `workspaces/${attachment.event.workspaceId}/events/${attachment.eventId}/${attachment.id}/${attachment.fileName}`;
      await uploadAttachment(config, path, attachment.data, attachment.contentType);
      await prisma.eventAttachment.update({
        where: { id: attachment.id },
        data: { storagePath: path, data: null },
      });
      migrated += 1;
    }
  }

  console.info(`Migrated ${migrated} event attachment(s) to the private Supabase Storage bucket.`);
}

main()
  .catch((error) => {
    console.error("Event attachment migration failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
