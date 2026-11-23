import "server-only";

import { prismaAdapter } from "@better-auth/prisma-adapter";
import { APIError, betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { headers } from "next/headers";
import { getPrisma } from "@/lib/prisma";

function getTrustedOrigins(baseURL: string) {
  const parsedBaseURL = new URL(baseURL);
  const origins = new Set([parsedBaseURL.origin]);
  const loopbackHosts = ["localhost", "127.0.0.1", "[::1]"];

  if (process.env.NODE_ENV === "development") {
    const port = parsedBaseURL.port || process.env.PORT || "3000";
    for (const protocol of ["http:", "https:"]) {
      for (const hostname of loopbackHosts) {
        origins.add(new URL(`${protocol}//${hostname}:${port}`).origin);
      }
    }
  }

  return [...origins];
}

function createAuth(secret: string) {
  const prisma = getPrisma();
  const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

  return betterAuth({
    appName: "VenuGuestPass",
    baseURL,
    secret,
    trustedOrigins: getTrustedOrigins(baseURL),
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 10,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 15 * 60, max: 5 },
        "/two-factor/send-otp": { window: 60, max: 3 },
        "/two-factor/verify-otp": { window: 15 * 60, max: 10 },
      },
    },
    user: {
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: async ({ user, url }) => {
          const { sendAuthEmail } = await import("@/lib/email");
          await sendAuthEmail({
            to: user.email,
            subject: "Confirm your VenuGuestPass email change",
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
          subject: "Reset your VenuGuestPass password",
          url,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: false,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => {
        const { sendAuthEmail } = await import("@/lib/email");
        await sendAuthEmail({
          to: user.email,
          subject: "Verify your VenuGuestPass email",
          url,
        });
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (createdUser) => ({
            data: {
              ...createdUser,
              twoFactorEnabled: true,
            },
          }),
          after: async (createdUser) => {
            await prisma.twoFactor.create({
              data: {
                id: createdUser.id,
                userId: createdUser.id,
                secret: "",
                backupCodes: "",
              },
            });

            const freePlan = await prisma.plan.upsert({
              where: { code: "FREE" },
              create: {
                code: "FREE",
                name: "Free",
                description: "For getting started",
                activeEventLimit: 1,
                attendeePerEventLimit: 50,
                features: [
                  "public_registration",
                  "basic_guestlist",
                  "qr_tickets",
                  "checkin_options",
                  "basic_attendance",
                  "registration_notifications",
                  "live_raffle",
                  "e_certificates",
                  "event_checkpoints",
                ],
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
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/two-factor/disable") {
          throw APIError.from("FORBIDDEN", {
            code: "TWO_FACTOR_REQUIRED",
            message: "Email verification is required for every sign-in.",
          });
        }
      }),
    },
    advanced: {
      useSecureCookies: process.env.NODE_ENV === "production",
    },
    plugins: [
      twoFactor({
        issuer: "VenuGuestPass",
        totpOptions: { disable: true },
        otpOptions: {
          period: 5,
          digits: 6,
          allowedAttempts: 5,
          storeOTP: "hashed",
          sendOTP: async ({ user, otp }) => {
            const { sendSignInOTPEmail } = await import("@/lib/email");
            await sendSignInOTPEmail(user.email, otp);
          },
        },
        accountLockout: {
          maxFailedAttempts: 5,
          durationSeconds: 15 * 60,
        },
      }),
      nextCookies(),
    ],
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
