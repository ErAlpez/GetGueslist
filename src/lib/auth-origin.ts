export function resolveAuthBaseURL(environment: NodeJS.ProcessEnv = process.env) {
  const previewHost = environment.VERCEL_ENV === "preview"
    ? environment.VERCEL_BRANCH_URL ?? environment.VERCEL_URL
    : undefined;

  if (previewHost) return `https://${previewHost}`;
  return environment.BETTER_AUTH_URL ?? "http://localhost:3000";
}

export function getTrustedAuthOrigins(
  baseURL: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const parsedBaseURL = new URL(baseURL);
  const origins = new Set([parsedBaseURL.origin]);
  const loopbackHosts = ["localhost", "127.0.0.1", "[::1]"];

  if (environment.VERCEL_ENV === "preview") {
    for (const hostname of [environment.VERCEL_BRANCH_URL, environment.VERCEL_URL]) {
      if (hostname) origins.add(new URL(`https://${hostname}`).origin);
    }
  }

  if (environment.NODE_ENV === "development") {
    const port = parsedBaseURL.port || environment.PORT || "3000";
    for (const protocol of ["http:", "https:"]) {
      for (const hostname of loopbackHosts) {
        origins.add(new URL(`${protocol}//${hostname}:${port}`).origin);
      }
    }
  }

  return [...origins];
}
