import "server-only";

import { Buffer } from "node:buffer";

type SupabaseStorageConfig = {
  origin: string;
  bucket: string;
  serviceRoleKey: string;
};

export class SupabaseStorageError extends Error {
  constructor(operation: string, status?: number) {
    super(status === undefined
      ? `Supabase Storage ${operation} failed.`
      : `Supabase Storage ${operation} failed with HTTP ${status}.`);
    this.name = "SupabaseStorageError";
  }
}

function getSupabaseStorageConfig(): SupabaseStorageConfig {
  const projectUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "workspace-files";
  if (!projectUrl || !serviceRoleKey) {
    throw new SupabaseStorageError("is not configured");
  }

  const parsedUrl = new URL(projectUrl);
  const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(parsedUrl.hostname);
  if (
    (parsedUrl.protocol !== "https:" && !(parsedUrl.protocol === "http:" && localHost)) ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    throw new SupabaseStorageError("has an invalid project URL");
  }
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(bucket)) {
    throw new SupabaseStorageError("has an invalid bucket name");
  }

  return { origin: parsedUrl.origin, bucket, serviceRoleKey };
}

function encodeObjectPath(path: string) {
  const segments = path.split("/");
  if (segments.length < 2 || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new SupabaseStorageError("received an invalid object path");
  }
  return segments.map((segment) => encodeURIComponent(segment)).join("/");
}

function apiUrl(config: SupabaseStorageConfig, path: string) {
  return new URL(`/storage/v1/object/${path}`, config.origin);
}

function authHeaders(config: SupabaseStorageConfig) {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
  };
}

export async function uploadSupabaseObject(
  path: string,
  bytes: Uint8Array,
  contentType: string,
  fetcher: typeof fetch = fetch,
) {
  const config = getSupabaseStorageConfig();
  const response = await fetcher(
    apiUrl(config, `${encodeURIComponent(config.bucket)}/${encodeObjectPath(path)}`),
    {
      method: "POST",
      headers: {
        ...authHeaders(config),
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: Buffer.from(bytes),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) throw new SupabaseStorageError("upload", response.status);
}

export async function downloadSupabaseObject(path: string, fetcher: typeof fetch = fetch) {
  const config = getSupabaseStorageConfig();
  const response = await fetcher(
    apiUrl(config, `authenticated/${encodeURIComponent(config.bucket)}/${encodeObjectPath(path)}`),
    {
      headers: authHeaders(config),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) throw new SupabaseStorageError("download", response.status);
  return new Uint8Array(await response.arrayBuffer());
}

export async function deleteSupabaseObject(path: string, fetcher: typeof fetch = fetch) {
  const config = getSupabaseStorageConfig();
  const response = await fetcher(
    apiUrl(config, encodeURIComponent(config.bucket)),
    {
      method: "DELETE",
      headers: {
        ...authHeaders(config),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: [path] }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) throw new SupabaseStorageError("delete", response.status);
}
