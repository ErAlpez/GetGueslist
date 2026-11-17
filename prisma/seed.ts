import { createHash, createHmac } from "node:crypto";
import { PrismaClient, WorkspaceRole } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";

const prisma = new PrismaClient();

const plans = [
  {
    code: "FREE",
    name: "Free",
    description: "For getting started",
    monthlyPriceCents: 0,
    yearlyPriceCents: 0,
    activeEventLimit: 1,
    attendeePerEventLimit: 50,
    features: ["basic_guestlist", "qr_tickets", "basic_attendance"],
  },
  {
    code: "STARTER",
    name: "Starter",
    description: "For growing event programs",
    monthlyPriceCents: null,
    yearlyPriceCents: null,
    activeEventLimit: 3,
    attendeePerEventLimit: 500,
    features: ["custom_forms", "qr_tickets", "import_export", "basic_reports"],
  },
  {
    code: "PROFESSIONAL",
    name: "Professional",
    description: "For teams running events at scale",
    monthlyPriceCents: null,
    yearlyPriceCents: null,
    activeEventLimit: 10,
    attendeePerEventLimit: 2000,
    features: ["qr_tickets", "nfc", "team_collaboration", "badges", "advanced_reports"],
  },
  {
    code: "ENTERPRISE",
    name: "Enterprise",
    description: "Custom limits and support",
    monthlyPriceCents: null,
    yearlyPriceCents: null,
    activeEventLimit: null,
    attendeePerEventLimit: null,
    features: ["custom_limits", "advanced_permissions", "custom_branding", "integrations"],
  },
];

const permissions = [
  { code: "workspace.manage", description: "Manage workspace settings and members" },
  { code: "events.manage", description: "Create, update, publish, and archive events" },
  { code: "attendees.manage", description: "Manage attendee registrations and guestlists" },
  { code: "checkin.perform", description: "Validate tickets and record attendance" },
  { code: "billing.manage", description: "View and manage subscription settings" },
];

const demoGuests = [
  ["Alex", "Morgan"],
  ["Jordan", "Lee"],
  ["Taylor", "Reed"],
  ["Casey", "Nguyen"],
  ["Riley", "Patel"],
  ["Avery", "Brooks"],
  ["Quinn", "Rivera"],
  ["Jamie", "Kim"],
  ["Skyler", "Bennett"],
  ["Parker", "Diaz"],
  ["Drew", "Campbell"],
  ["Rowan", "Cruz"],
  ["Emerson", "Wong"],
  ["Finley", "Turner"],
  ["Reese", "Shah"],
  ["Cameron", "Foster"],
  ["Dakota", "Price"],
  ["Sage", "Baker"],
  ["Elliot", "Ward"],
  ["Robin", "Bell"],
];

function getDemoTicketTokenHash(ticketId: string, secret: string) {
  const token = `${ticketId}.${createHmac("sha256", secret).update(ticketId).digest("base64url")}`;
  return createHash("sha256").update(token).digest("hex");
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Copy .env.example to .env and configure a reachable PostgreSQL database before seeding.");
  }

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      create: plan,
      update: {
        name: plan.name,
        description: plan.description,
        monthlyPriceCents: plan.monthlyPriceCents,
        yearlyPriceCents: plan.yearlyPriceCents,
        activeEventLimit: plan.activeEventLimit,
        attendeePerEventLimit: plan.attendeePerEventLimit,
        features: plan.features,
      },
    });
  }

  const savedPermissions = await Promise.all(permissions.map((permission) =>
    prisma.permission.upsert({
      where: { code: permission.code },
      create: permission,
      update: { description: permission.description },
    }),
  ));
  const roleGrants: Array<{ role: WorkspaceRole; codes: string[] }> = [
    { role: "OWNER", codes: permissions.map((permission) => permission.code) },
    { role: "ADMIN", codes: ["workspace.manage", "events.manage", "attendees.manage", "checkin.perform"] },
    { role: "MANAGER", codes: ["events.manage", "attendees.manage", "checkin.perform"] },
    { role: "CHECKIN", codes: ["checkin.perform"] },
    { role: "VIEWER", codes: [] },
  ];
  const assignments = roleGrants.flatMap(({ role, codes }) =>
    codes.flatMap((code) => {
      const permission = savedPermissions.find((item) => item.code === code);
      return permission ? [{ role, permissionId: permission.id }] : [];
    }),
  );
  await prisma.rolePermission.createMany({ data: assignments, skipDuplicates: true });

  if (process.env.NODE_ENV !== "production" && process.env.ENABLE_LOCAL_DEMO === "true") {
    const ticketSigningSecret = process.env.TICKET_SIGNING_SECRET;
    if (!ticketSigningSecret || ticketSigningSecret.length < 32) {
      throw new Error("TICKET_SIGNING_SECRET must be set to a random value of at least 32 characters to seed demo tickets.");
    }

    const email = "demo@guestlist.local";
    const password = "GuestlistDemo123!";
    const conflictingUser = await prisma.user.findUnique({ where: { email } });
    if (conflictingUser && conflictingUser.id !== "guestlist-demo-user") {
      throw new Error(`Demo email ${email} is already assigned to a non-demo account.`);
    }

    const user = await prisma.user.upsert({
      where: { id: "guestlist-demo-user" },
      create: {
        id: "guestlist-demo-user",
        name: "Guestlist Demo",
        email,
        emailVerified: true,
      },
      update: { name: "Guestlist Demo", email, emailVerified: true },
    });
    const passwordHash = await hashPassword(password);

    await prisma.account.upsert({
      where: { id: "guestlist-demo-account" },
      create: {
        id: "guestlist-demo-account",
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: passwordHash,
      },
      update: { accountId: user.id, userId: user.id, password: passwordHash },
    });

    const freePlan = await prisma.plan.findUniqueOrThrow({ where: { code: "FREE" } });
    const workspace = await prisma.workspace.upsert({
      where: { slug: "guestlist-demo" },
      create: {
        id: "guestlist-demo-workspace",
        name: "Guestlist Demo",
        slug: "guestlist-demo",
        ownerId: user.id,
      },
      update: { ownerId: user.id },
    });

    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
      create: { workspaceId: workspace.id, userId: user.id, role: "OWNER" },
      update: { role: "OWNER" },
    });
    await prisma.subscription.upsert({
      where: { workspaceId: workspace.id },
      create: { workspaceId: workspace.id, planId: freePlan.id, status: "ACTIVE" },
      update: { planId: freePlan.id, status: "ACTIVE" },
    });

    const startsAt = new Date();
    startsAt.setUTCDate(startsAt.getUTCDate() + 7);
    startsAt.setUTCHours(18, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
    const event = await prisma.event.upsert({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug: "guestlist-demo-showcase" } },
      create: {
        id: "guestlist-demo-event",
        workspaceId: workspace.id,
        name: "Guestlist Demo Showcase",
        slug: "guestlist-demo-showcase",
        description: "A sample event populated with demo guests and QR tickets.",
        category: "Networking",
        type: "Showcase",
        format: "PHYSICAL",
        visibility: "PRIVATE",
        status: "REGISTRATION_OPEN",
        startsAt,
        endsAt,
        timezone: "Asia/Manila",
        venue: "The Greenhouse",
        capacity: 50,
        settings: { create: { allowRegistration: true } },
        modules: {
          create: [
            { key: "guest_registration", enabled: true },
            { key: "qr_ticketing", enabled: true },
            { key: "attendance", enabled: true },
          ],
        },
        registrationForm: { create: { published: true } },
      },
      update: {
        name: "Guestlist Demo Showcase",
        description: "A sample event populated with demo guests and QR tickets.",
        status: "REGISTRATION_OPEN",
        startsAt,
        endsAt,
        timezone: "Asia/Manila",
        venue: "The Greenhouse",
        capacity: 50,
      },
    });

    await prisma.eventSettings.upsert({
      where: { eventId: event.id },
      create: { eventId: event.id, allowRegistration: true },
      update: { allowRegistration: true },
    });

    const categories = ["VIP", "SPEAKER", "SPONSOR", "ORGANIZER", "MEDIA", "GENERAL"] as const;
    await Promise.all(demoGuests.map(async ([firstName, lastName], index) => {
      const number = String(index + 1).padStart(2, "0");
      const attendeeId = `guestlist-demo-attendee-${number}`;
      const attendee = await prisma.attendee.upsert({
        where: { id: attendeeId },
        create: {
          id: attendeeId,
          workspaceId: workspace.id,
          firstName: `Guest ${number}`,
          lastName,
          email: `guest${number}@example.test`,
          company: `${firstName} Demo Group`,
        },
        update: {
          workspaceId: workspace.id,
          firstName: `Guest ${number}`,
          lastName,
          email: `guest${number}@example.test`,
          company: `${firstName} Demo Group`,
        },
      });
      const registrationId = `guestlist-demo-registration-${number}`;
      const registeredAt = new Date(Date.now() - index * 24 * 60 * 60 * 1000);
      const registration = await prisma.eventRegistration.upsert({
        where: { eventId_attendeeId: { eventId: event.id, attendeeId: attendee.id } },
        create: {
          id: registrationId,
          eventId: event.id,
          attendeeId: attendee.id,
          category: categories[index % categories.length],
          rsvpStatus: "ACCEPTED",
          registrationSource: "demo",
          registeredAt,
        },
        update: {
          category: categories[index % categories.length],
          rsvpStatus: "ACCEPTED",
          registrationSource: "demo",
          registeredAt,
        },
      });
      const ticketId = `guestlist-demo-ticket-${number}`;
      await prisma.ticket.upsert({
        where: { registrationId: registration.id },
        create: {
          id: ticketId,
          registrationId: registration.id,
          tokenHash: getDemoTicketTokenHash(ticketId, ticketSigningSecret),
          status: "ACTIVE",
        },
        update: {
          tokenHash: getDemoTicketTokenHash(ticketId, ticketSigningSecret),
          status: "ACTIVE",
        },
      });
    }));

    console.info(`Seeded local demo account: ${email}`);
    console.info(`Seeded ${demoGuests.length} sample guests for ${event.name}.`);
  }
}

main()
  .catch((error: unknown) => {
    console.error("Could not seed subscription plans:", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
