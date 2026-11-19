export const trackedPublicPaths = ["/", "/privacy", "/terms"] as const;

export function isTrackedPublicPath(path: unknown): path is (typeof trackedPublicPaths)[number] {
  return typeof path === "string" && trackedPublicPaths.some((trackedPath) => trackedPath === path);
}

export function normalizeCountryCode(value: string | null): string {
  const countryCode = value?.trim().toUpperCase() ?? "";
  return /^[A-Z]{2}$/.test(countryCode) ? countryCode : "XX";
}
