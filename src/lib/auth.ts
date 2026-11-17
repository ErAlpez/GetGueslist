import "server-only";

import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { getPrisma } from "@/lib/prisma";

function getTrustedOrigins(baseURL: string) {
  const parsedBaseURL = new URL(baseURL);
  const origins = new Set([parsedBaseURL.origin]);
  const loopbackHosts = ["localhost", "127.0.0.1", "[::1]"];

  if (
    process.env.NODE_ENV === "development"
    && parsedBaseURL.protocol === "http:"
    && loopbackHosts.includes(parsedBaseURL.hostname)
  ) {
    loopbackHosts.forEach((hostname) => {
      const localURL = new URL(parsedBaseURL);
      localURL.hostname = hostname;
      origins.add(localURL.origin);
    });
  }

  return [...origins];
}

function createAuth(secret: string) {
  const prisma = getPrisma();
  const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

  return betterAuth({
    appName: "Guestlist",
    baseURL,
    secret,
    trustedOrigins: getTrustedOrigins(baseURL),
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    user: {
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: async ({ user, url }) => {
          const { sendAuthEmail } = await import("@/lib/email");
          await sendAuthEmail({
            to: user.email,
            subject: "Confirm your Guestlist email change",
            url,
          });
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        const { sendAuthEmail } = await import("@/lib/email");
        await sendAuthEmail({
          to: user.email,
          subject: "Reset your Guestlist password",
          url,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        const { sendAuthEmail } = await import("@/lib/email");
        await sendAuthEmail({
          to: user.email,
          subject: "Verify your Guestlist email",
          url,
        });
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (createdUser) => {
            const freePlan = await prisma.plan.upsert({
              where: { code: "FREE" },
              create: {
                code: "FREE",
                name: "Free",
                description: "For getting started",
                activeEventLimit: 1,
                attendeePerEventLimit: 50,
                features: ["basic_guestlist", "qr_tickets", "basic_attendance"],
              },
              update: {},
            });

            const workspace = await prisma.workspace.create({
              data: {
                name: `${createdUser.name}'s workspace`,
                slug: `${createdUser.id}-workspace`,
                ownerId: createdUser.id,
                members: {
                  create: {
                    userId: createdUser.id,
                    role: "OWNER",
                  },
                },
                subscription: {
                  create: {
                    planId: freePlan.id,
                    status: "ACTIVE",
                  },
                },
              },
            });

            await prisma.activityLog.create({
              data: {
                workspaceId: workspace.id,
                actorId: createdUser.id,
                action: "workspace.created",
                entityType: "workspace",
                entityId: workspace.id,
              },
            });
          },
        },
      },
    },
    advanced: {
      useSecureCookies: process.env.NODE_ENV === "production",
    },
    plugins: [nextCookies()],
  });
}

let authInstance: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be set to a random value of at least 32 characters.");
  }

  if (!authInstance) authInstance = createAuth(secret);
  return authInstance;
}

export async function getCurrentSession() {
  return getAuth().api.getSession({ headers: await headers() });
}
