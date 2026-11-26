"use server";

import { getPrisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/super-admin";
import {
  getSuperAdminHealthDashboard,
  runSuperAdminHealthChecks,
} from "@/lib/super-admin-health";

export async function refreshSystemHealthAction() {
  await requireSuperAdmin();
  const prisma = getPrisma();
  await runSuperAdminHealthChecks(fetch, prisma);
  return getSuperAdminHealthDashboard(prisma);
}
