import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { convertImageToAvif } from "../src/lib/image-optimization.ts";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const imageContentTypes = ["image/jpeg", "image/png", "image/webp"];
const dataImagePattern = /^data:image\/[A-Za-z0-9.+-]+;base64,([A-Za-z0-9+/]+={0,2})$/;
const maxStoredImageBytes = 2 * 1024 * 1024;
const maxEventLogoDataLength = 300_000;
const maxProfilePhotoBytes = 100_000;

function getStorageConfig() {
  const projectUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "workspace-files";
  if (!projectUrl || !serviceRoleKey) {
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before migrating stored images.");
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
    throw new Error("An image has an invalid storage path.");
  }
  return segments.map((segment) => encodeURIComponent(segment)).join("/");
}

function objectUrl(config, path) {
  return new URL(`/storage/v1/object/${path}`, config.origin);
}

function authHeaders(config) {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
  };
}

async function uploadObject(config, path, bytes, contentType = "image/avif") {
  const response = await fetch(
    objectUrl(config, `${encodeURIComponent(config.bucket)}/${encodeObjectPath(path)}`),
    {
      method: "POST",
      headers: {
        ...authHeaders(config),
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: bytes,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) throw new Error(`Supabase Storage upload failed with HTTP ${response.status}.`);
}

async function downloadObject(config, path) {
  const response = await fetch(
    objectUrl(config, `authenticated/${encodeURIComponent(config.bucket)}/${encodeObjectPath(path)}`),
    {
      headers: authHeaders(config),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) throw new Error(`Supabase Storage download failed with HTTP ${response.status}.`);
  return new Uint8Array(await response.arrayBuffer());
}

async function deleteObject(config, path) {
  const response = await fetch(
    objectUrl(config, encodeURIComponent(config.bucket)),
    {
      method: "DELETE",
      headers: { ...authHeaders(config), "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [path] }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) throw new Error(`Supabase Storage delete failed with HTTP ${response.status}.`);
}

function decodeImageDataUri(value) {
  if (typeof value !== "string") return null;
  const match = dataImagePattern.exec(value);
  if (!match) return null;
  const bytes = Buffer.from(match[1], "base64");
  return bytes.toString("base64") === match[1] ? bytes : null;
}

function isAvifDataUri(value) {
  return typeof value === "string" && /^data:image\/avif;base64,/i.test(value);
}

function avifDataUri(bytes) {
  return `data:image/avif;base64,${bytes.toString("base64")}`;
}

async function convertDataImage(value, { maxDimension, quality, maxBytes, maxDataLength }) {
  if (isAvifDataUri(value)) return null;
  if (typeof value !== "string" || !value.startsWith("data:image/")) return null;
  const bytes = decodeImageDataUri(value);
  if (!bytes) throw new Error("A stored image has an invalid data URI.");
  const avif = await convertImageToAvif(bytes, { maxDimension, quality });
  if (maxBytes && avif.length > maxBytes) throw new Error("A converted image exceeds its size limit.");
  const dataUri = avifDataUri(avif);
  if (maxDataLength && dataUri.length > maxDataLength) {
    throw new Error("A converted image data URI exceeds its size limit.");
  }
  return dataUri;
}

function migratedPath(path, fileName) {
  const separator = path.lastIndexOf("/");
  if (separator <= 0 || separator === path.length - 1) {
    throw new Error("An image has an invalid storage path.");
  }
  return `${path.slice(0, separator + 1)}${randomUUID()}/${fileName}`;
}

async function migrateStoredFile({
  config,
  model,
  record,
  workspaceId,
  options,
}) {
  const originalBytes = record.storagePath
    ? await downloadObject(config, record.storagePath)
    : record.data;
  if (!originalBytes) throw new Error(`Image file ${record.id} has no stored bytes.`);

  const avif = await convertImageToAvif(originalBytes, options);
  if (avif.length > maxStoredImageBytes) {
    throw new Error(`Image file ${record.id} exceeds the 2 MB storage limit after conversion.`);
  }
  const fileName = `${record.originalFileName.replace(/\.[^.]*$/, "") || "image"}.avif`;
  const storagePath = record.storagePath
    ? migratedPath(record.storagePath, fileName)
    : model === "eventAttachment"
      ? `workspaces/${workspaceId}/events/${record.eventId}/${record.id}/${randomUUID()}/${fileName}`
      : `workspaces/${workspaceId}/files/${record.id}/${randomUUID()}/${fileName}`;

  await uploadObject(config, storagePath, avif);
  const where = {
    id: record.id,
    storagePath: record.storagePath,
    contentType: record.contentType,
    size: record.size,
    fileName: record.fileName,
    originalFileName: record.originalFileName,
  };
  const data = {
    fileName,
    contentType: "image/avif",
    size: avif.length,
    storagePath,
  };
  if (model === "eventAttachment") {
    where.data = record.data;
    data.data = null;
  }
  const updated = await prisma[model].updateMany({
    where,
    data,
  });
  if (updated.count !== 1) {
    await deleteObject(config, storagePath);
    throw new Error(`Image file ${record.id} changed during migration; its original was left intact.`);
  }

  if (record.storagePath) {
    try {
      await deleteObject(config, record.storagePath);
    } catch (error) {
      try {
        await uploadObject(config, record.storagePath, originalBytes, record.contentType);
        const restoreData = {
          fileName: record.fileName,
          contentType: record.contentType,
          size: record.size,
          storagePath: record.storagePath,
        };
        if (model === "eventAttachment") restoreData.data = record.data;
        const restored = await prisma[model].updateMany({
          where: { id: record.id, storagePath, contentType: "image/avif" },
          data: restoreData,
        });
        if (restored.count !== 1) throw new Error("The migrated image changed before rollback.");
        await deleteObject(config, storagePath);
      } catch (restoreError) {
        throw new Error(`Could not safely roll back image file ${record.id}.`, { cause: restoreError });
      }
      throw new Error(`Could not remove the previous image file ${record.id}.`, { cause: error });
    }
  }
}

async function countPending() {
  const [profileRows, eventSettings, eventAttachments, workspaceFiles] = await Promise.all([
    prisma.user.findMany({
      where: { image: { startsWith: "data:image/" } },
      select: { image: true },
    }),
    prisma.eventSettings.findMany({
      select: { customBranding: true },
    }),
    prisma.eventAttachment.count({ where: { contentType: { in: imageContentTypes } } }),
    prisma.workspaceFile.count({ where: { contentType: { in: imageContentTypes } } }),
  ]);
  const profiles = profileRows.filter(({ image }) => !isAvifDataUri(image)).length;
  const logos = eventSettings.filter(({ customBranding }) =>
    customBranding && typeof customBranding === "object" && !Array.isArray(customBranding) &&
    typeof customBranding.logo === "string" &&
    customBranding.logo.startsWith("data:image/") && !isAvifDataUri(customBranding.logo),
  ).length;
  return { profiles, logos, eventAttachments, workspaceFiles };
}

async function migrateInlineImages() {
  let migrated = 0;
  const users = await prisma.user.findMany({
    where: { image: { startsWith: "data:image/" } },
    select: { id: true, image: true },
  });
  for (const user of users) {
    const image = await convertDataImage(user.image, {
      maxDimension: 256,
      quality: 60,
      maxBytes: maxProfilePhotoBytes,
    });
    if (!image) continue;
    await prisma.user.updateMany({
      where: { id: user.id, image: user.image },
      data: { image },
    }).then((result) => {
      if (result.count !== 1) throw new Error(`Profile photo ${user.id} changed during migration.`);
    });
    migrated += 1;
  }

  const settings = await prisma.eventSettings.findMany({
    select: { eventId: true, customBranding: true },
  });
  for (const setting of settings) {
    const branding = setting.customBranding;
    if (!branding || typeof branding !== "object" || Array.isArray(branding) ||
        typeof branding.logo !== "string") continue;
    const logo = await convertDataImage(branding.logo, {
      maxDimension: 512,
      quality: 65,
      maxDataLength: maxEventLogoDataLength,
    });
    if (!logo) continue;
    const result = await prisma.eventSettings.updateMany({
      where: { eventId: setting.eventId, customBranding: { equals: branding } },
      data: { customBranding: { ...branding, logo } },
    });
    if (result.count !== 1) throw new Error(`Event logo ${setting.eventId} changed during migration.`);
    migrated += 1;
  }
  return migrated;
}

async function migrateStoredImages(config, model, options) {
  let migrated = 0;
  while (true) {
    const records = model === "eventAttachment"
      ? await prisma.eventAttachment.findMany({
          where: { contentType: { in: imageContentTypes } },
          orderBy: { id: "asc" },
          take: 25,
          select: {
            id: true,
            eventId: true,
            fileName: true,
            originalFileName: true,
            contentType: true,
            size: true,
            data: true,
            storagePath: true,
            event: { select: { workspaceId: true } },
          },
        })
      : await prisma.workspaceFile.findMany({
          where: { contentType: { in: imageContentTypes } },
          orderBy: { id: "asc" },
          take: 25,
          select: {
            id: true,
            workspaceId: true,
            fileName: true,
            originalFileName: true,
            contentType: true,
            size: true,
            storagePath: true,
          },
        });
    if (records.length === 0) break;

    for (const record of records) {
      await migrateStoredFile({
        config,
        model,
        record,
        workspaceId: model === "eventAttachment" ? record.event.workspaceId : record.workspaceId,
        options,
      });
      migrated += 1;
    }
  }
  return migrated;
}

async function main() {
  const pending = await countPending();
  if (!apply) {
    console.info("Dry run: images eligible for AVIF migration:", pending);
    console.info("No data or storage objects were changed. Re-run with --apply to migrate them.");
    return;
  }

  const config = getStorageConfig();
  const inline = await migrateInlineImages();
  const attachments = await migrateStoredImages(config, "eventAttachment", { maxDimension: 2048, quality: 60 });
  const workspaceFiles = await migrateStoredImages(config, "workspaceFile", { maxDimension: 2048, quality: 60 });
  console.info(`Migrated ${inline} inline image(s), ${attachments} event attachment(s), and ${workspaceFiles} workspace file(s) to AVIF.`);
}

main()
  .catch((error) => {
    console.error("Existing image AVIF migration failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
