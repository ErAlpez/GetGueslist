# Guestlist

Guestlist is an event-management SaaS foundation built with Next.js App Router, TypeScript, PostgreSQL, Prisma, and Better Auth.

## Local setup

Requirements: Node.js 22.18+ and a PostgreSQL database.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and set `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `TICKET_SIGNING_SECRET`. Both secrets must be independently generated random values of at least 32 characters.

   ```bash
   cp .env.example .env
   ```

   `BETTER_AUTH_URL` (or `NEXT_PUBLIC_APP_URL`) should point to the publicly accessible application. `RESEND_API_KEY` and a verified `EMAIL_FROM` are required for verification, password-reset, and registration ticket emails. Ticket emails include the QR code and a link to the digital ticket. If sending fails, registration still succeeds and the ticket page displays a warning; ticket emails are not retried automatically. Without email configuration, authentication links are only printed in development.

3. Generate the Prisma client and apply the initial migration:

   ```bash
   npm run db:generate
   npm run db:migrate -- --name init
   npm run db:seed
   ```

   The seed creates the initial plan catalog and role-permission mappings. If `ENABLE_LOCAL_DEMO=true` is set (as in `.env.example`), it also creates a verified demo login: `demo@guestlist.local` / `GuestlistDemo123!`, a sample event with 20 guests, and their QR tickets. The login page includes a one-click demo sign-in while running in development. The demo account and sample data are never created when `NODE_ENV=production`. Signup also ensures the Free plan exists before creating a personal workspace.

   Demo sign-in requires a reachable PostgreSQL database. If the account cannot sign in, confirm the migration completed and rerun `npm run db:seed`; a successful seed prints `Seeded local demo account`.

4. Start the development server:

   ```bash
   npm run dev
   ```

   Restart the development server after regenerating the Prisma client so it loads the updated schema.

   Visit `http://localhost:3000`.

   The experimental React debug channel is disabled so development pages can hydrate when the development WebSocket is unavailable. React server debug-channel tooling is unavailable while this setting is disabled.

## Implemented foundation

- Public landing page, pricing overview, and FAQ.
- Outfit headings with Inter body typography, saved light/dark theme, and language selection for English, Dutch, Spanish, Arabic, French, Japanese, Indonesian, Vietnamese, and Thai.
- Subtle scroll and hover motion with reduced-motion support.
- Email/password signup, sign-in, email verification, password reset, and database-backed sessions through Better Auth.
- Personal workspace creation and a multi-tenant relational data model.
- Database-backed overview and event creation, editing, publishing, duplication, archiving, and protected deletion.
- Manual attendee registration, CSV export, unique signed QR tickets, public ticket view, and QR/webcam or manual check-in. Each ticket has a random, unique eight-digit display ID; existing signed QR links remain valid. Manual lookup accepts a name, email, display ID, or legacy ticket ID.
- Guestlist and Reports registration-date filters use the same inclusive date-range calendar, including for CSV export.
- Event start, end, and optional registration deadline use date pickers in the event's selected timezone. New or changed start dates begin at midnight; end and deadline dates last through the end of the day. Existing times are preserved when their dates and timezone are unchanged.
- Event managers can upload, replace, or remove a logo in the registration form editor. JPEG, PNG, and WebP files up to 8 MB are resized and stored with the event's branding; the logo appears on its public registration page.
- Public registration includes the same guest categories as manual registration, defaulting to General.
- Registration notifications show the newest 20 registrations from the last 30 days; older entries leave the list without deleting activity history. Seen status is per user across devices. Opening the panel marks its entries as seen; their highlight remains for ten seconds.
- Manual and public registration collect optional age and gender per event registration; existing company and position data remain available in guestlist exports. Apply database migrations before using these fields.
- Guestlist, Reports, and Tickets exports show download progress when available and allow cancellation.
- Tenant-scoped attendance reporting, subscription usage display, billing schema, and workspace settings.
- Server-side event and attendee limits based on the workspace plan.

## Configuration and integration status

- **PostgreSQL:** required for authentication and all private workspace pages.
- **Email:** Resend delivery is supported when `RESEND_API_KEY` and `EMAIL_FROM` are configured. Configure them before production.
- **Subscription payments:** not connected. Plan checkout buttons remain disabled, and no real or simulated payment is made.
- **Ticket payments:** not connected and intentionally separate from SaaS subscriptions.
- **QR signing:** `TICKET_SIGNING_SECRET` signs ticket URLs. Rotating it invalidates existing tickets; plan a key-rotation strategy before production.
- **General file uploads, NFC, offline scanning, workspace switching/invitations, and Super Admin plan management:** not implemented in this foundation. Event registration logos and custom registration-form editing are supported.

## Validation

```bash
npm run lint
npx tsc --noEmit
npm run build
```
