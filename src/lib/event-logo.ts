import type { Prisma } from "@prisma/client";

export const maxEventLogoDataLength = 300_000;
export const eventLogoInputPrefix = "data:image/webp;base64,";
export const eventLogoPrefix = "data:image/avif;base64,";

export function readEventLogo(branding: Prisma.JsonValue | null | undefined): string | null {
  if (!branding || typeof branding !== "object" || Array.isArray(branding)) return null;
  const logo = branding.logo;
  return typeof logo === "string" &&
    logo.length <= maxEventLogoDataLength &&
    /^data:image\/(?:avif|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(logo)
    ? logo
    : null;
}
