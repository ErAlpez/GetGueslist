import "server-only";

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export function getPrisma() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to use VenuGuestPass's database.");
  }

  globalForPrisma.prisma ??= new PrismaClient();
  return globalForPrisma.prisma;
}
