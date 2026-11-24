# VenuGuestPass

VenuGuestPass is an event-management SaaS foundation built with Next.js App Router, TypeScript, PostgreSQL, Prisma, and Better Auth.

## Local setup

Requirements: Node.js 22.18+ and a PostgreSQL database.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and set `DATABASE_URL`, `DIRECT_URL`, `BETTER_AUTH_SECRET`, and `TICKET_SIGNING_SECRET`. For Supabase, use the ORM-provided transaction-pooler URL for `DATABASE_URL` and session-pooler URL for `DIRECT_URL`; Prisma migrations use `DIRECT_URL`. Both secrets must be independently generated random values of at least 32 characters. Configure both database URLs in your production environment.

   ```bash
   cp .env.example .env
   ```

   `BETTER_AUTH_URL` (or `NEXT_PUBLIC_APP_URL`) should point to the publicly accessible application. `RESEND_API_KEY` and a verified `EMAIL_FROM` are required for verification, password-reset, registration ticket, attendance certificate, and automated follow-up emails. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to monitor the external Supabase Storage project; keep the service-role key server-side. Set `CRON_SECRET` to a separate random value of at least 32 characters to protect the scheduled endpoints. Ticket emails include the QR code and a link to the digital ticket. If sending fails, registration still succeeds and the ticket page displays a warning; ticket emails are not retried automatically. A personalized attendance certificate is emailed after the first successful check-in when the guest has an email address. Certificate delivery failures do not undo check-in; checked-in guests can download the PDF from their ticket page. Without email configuration, authentication links are only printed in development.

3. Generate the Prisma client and apply the initial migration:

   ```bash
   npm run db:generate
   npm run db:migrate -- --name init
   npm run db:seed
   ```

   The seed creates the initial plan catalog and role-permission mappings. If `ENABLE_LOCAL_DEMO=true` is set (as in `.env.example`), it also creates a verified demo login: `demo@venuguestpass.local` / `VenuGuestPassDemo123!`, a sample event with 20 guests, and their QR tickets. The demo login is available at `/login/demo` while running in development. The demo account and sample data are never created when `NODE_ENV=production`. Signup also ensures the Free plan exists before creating a personal workspace.

   Demo sign-in requires a reachable PostgreSQL database. If the account cannot sign in, confirm the migration completed and rerun `npm run db:seed`; a successful seed prints `Seeded local demo account`.

   Vercel Preview deployments from the `paddle-sandbox-preview` branch apply pending migrations and seed plan and role records before building. This is limited to that Preview branch; Production builds do not run this step. Demo-account seeding is disabled by this step. Preview authentication uses Vercel's branch URL instead of a shared Production `BETTER_AUTH_URL`.

4. Start the development server:

   ```bash
   npm run dev
   ```

   The `dev` script regenerates Prisma Client before starting. Restart the development server after changing the Prisma schema so the running process loads the updated client.

   Visit `http://localhost:3000`.

   The experimental React debug channel is disabled so development pages can hydrate when the development WebSocket is unavailable. React server debug-channel tooling is unavailable while this setting is disabled.

## Implemented foundation

- Public landing page, pricing overview, and FAQ.
- Outfit headings with Inter body typography, saved light/dark theme, and language selection for English, Dutch, Spanish, Arabic, French, Japanese, Indonesian, Vietnamese, and Thai.
- Subtle scroll and hover motion with reduced-motion support.
- Email/password signup, sign-in, email verification, password reset, and database-backed sessions through Better Auth.
- Personal workspace creation and a multi-tenant relational data model.
- Database-backed overview and event creation, editing, publishing, duplication, archiving, and protected deletion.
- Manual attendee registration, CSV export, unique signed QR tickets, public ticket view, and QR/webcam or manual check-in. Checked-in guests can download a personalized attendance certificate, and the PDF is automatically emailed when an attendee email is available. Each ticket has a random, unique eight-digit display ID; existing signed QR links remain valid. Manual lookup accepts a name, email, display ID, or legacy ticket ID.
- Attendees and Reports registration-date filters use the same inclusive date-range calendar, including for CSV export.
- Event start, end, and optional registration deadline use date pickers in the event's selected timezone. New or changed start dates begin at midnight; end and deadline dates last through the end of the day. Existing times are preserved when their dates and timezone are unchanged.
- Event managers can upload, replace, or remove a logo in the registration form editor. JPEG, PNG, WebP, or AVIF files up to 8 MB are resized and stored as AVIF with the event's branding; the logo appears on its public registration page.
- Public registration includes the same guest categories as manual registration, defaulting to General.
- Registration notifications show the newest 20 registrations from the last 30 days; older entries leave the list without deleting activity history. Seen status is per user across devices. Opening the panel marks its entries as seen; their highlight remains for ten seconds.
- Manual and public registration collect optional age and gender per event registration; existing company and position data remain available in guestlist exports. Apply database migrations before using these fields.
- Attendees, Reports, and Tickets exports show download progress when available and allow cancellation.
- Tenant-scoped attendance reporting, subscription usage display, billing schema, and workspace settings.
- Server-side event and attendee limits based on the workspace plan. Feature-specific gates cover custom forms, event branding, and CSV exports; additional paid-feature gates can be added through the shared plan feature catalog.
- Workspace switching for users with multiple memberships, plus email invitations, pending-invite management, role assignment, and member removal.
- Offline check-in queues for browser and paired-phone scanners; queued entrance scans sync automatically when connectivity returns. Checkpoint claims require an active connection. Web NFC detection and ticket-tag reading are available in supported browsers.
- Event modules are configurable from event settings: Invitations can send registration emails, RSVP collects attendance responses, Meals collects meal preferences, Sessions collects session selections, and NFC check-in gates Web NFC scanning for supported devices.
- Event managers can create named session, meal, or swag checkpoints with optional hard capacity limits. The existing ticket QR can claim each checkpoint once per guest, after main entrance check-in; claim totals and capacity are shown in event settings.
- Event managers can run a full-screen live raffle from an event. Only checked-in guests enter the draw, each winner is stored and excluded from later spins, and resetting the raffle makes previous winners eligible again. Apply the event-raffle database migration before using this feature.
- Max-plan events automatically send a QR ticket reminder 24 hours before the event and a feedback email two hours after it ends to guests who checked in. Delivery is persisted and retried; feedback responses are available to event managers on the event page. Apply the automated-followups migration before using this feature.

## Configuration and integration status

- **PostgreSQL:** required for authentication and all private workspace pages.
- **Email:** Resend delivery is supported when `RESEND_API_KEY` and `EMAIL_FROM` are configured. Configure them before production.
- **Automated follow-ups and system health:** Apply the `system_health_monitoring` migration. Vercel Cron runs the follow-up and system-health endpoints once daily (at 00:00 and 01:00 UTC) and requires `CRON_SECRET`. Hobby timing is approximate (up to 59 minutes of jitter), so reminders may be sent up to an hour before their nominal 24-hour reminder time or close to the event; retries wait for the next run and health samples are daily. Vercel Pro or Enterprise can use a more frequent schedule for more timely reminders, monitoring, and retries. Health samples are retained for seven days; Super Admin shows rolling 24-hour availability, failed probes, average latency, and an hourly trend. Configure Supabase credentials to enable its storage check.
- **Subscription payments:** Paddle is the only supported provider. New checkouts use one-time monthly/yearly prices for manual renewals. Customers pay again on or after the renewal date; access expires and returns to Free if they do not renew. Configure the four `PADDLE_ONE_TIME_PRICE_*` IDs and a publicly reachable HTTPS webhook. Existing recurring subscriptions continue to renew automatically unless the customer turns off auto-renew in Subscription & billing. The existing recurring `PADDLE_PRICE_*` IDs remain for those subscriptions and their upgrades; the `PADDLE_API_KEY` needs `subscription.write` for subscription upgrades and cancellations.
- **Ticket payments:** removed; events use free registration and tickets.
- **QR signing:** `TICKET_SIGNING_SECRET` signs ticket URLs. Rotating it invalidates existing tickets; plan a key-rotation strategy before production.
- **PWA/offline:** an installable app shell, offline page fallback, and connection banner are available. Offline attendee-list snapshots and manual guest registrations are supported as described below; other private workspace pages are not cached.
- **File storage:** event attachments and shared workspace files use a private Supabase Storage bucket when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured. Create a private `workspace-files` bucket (or set `SUPABASE_STORAGE_BUCKET`) before enabling uploads. Attachments are limited to 2 MB and 10 per event; the shared library allows 100 files per workspace. Raster images are resized, compressed, and stored as AVIF; PDFs remain PDFs. Re-uploading a same-name file in the same event or workspace replaces the prior file and cleans up its old storage object. Apply pending schema changes with `npx prisma migrate deploy` before enabling uploads. To migrate existing profile photos, event logos, and stored images, run `npm run db:images:avif` for a dry run, then `npm run db:images:avif -- --apply` to apply it; the script updates the database and replaces old storage objects only after conversion succeeds. To move legacy PostgreSQL attachment blobs, run `node --env-file-if-exists=.env scripts/migrate-event-attachments-to-supabase.mjs`; use `--dry-run` first. The script only clears each database blob after its upload succeeds.
- **Super Admin:** plan catalog editing, manual workspace subscription management, platform analytics, and review moderation are available only to verified emails listed in `SUPER_ADMIN_EMAILS` as a comma-separated server-side environment variable. Plan codes are immutable after creation; deactivate plans instead of deleting plans with subscriber history. Admin edits are audit logged. Dashboard analytics include signups, subscriptions, recorded paid invoices, aggregate public-page views/country codes, account/workspace totals, and recent admin activity.
- **Owner reviews:** owners can opt in to public display when leaving feedback. Only opted-in 5-star reviews approved in Super Admin plan management are shown on the homepage; other feedback remains private.
- **Website analytics:** first-party daily aggregate counts cover only the public home and legal pages. Optional Plausible page-view tracking loads only after opt-in and only on those public pages; configure `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` to enable it. The first-party aggregate does not use analytics cookies, visitor identifiers, or full IP addresses. Country codes are read only from Vercel's trusted country header; other hosting environments record location as unknown.
- **PWA/offline:** the last loaded attendee page is saved on the device for offline viewing. Manual guest registrations can be queued offline and are validated by the server before being committed; conflicting or rejected entries remain in the queue for review. Offline data is cleared on sign-out. Other workspace pages and edits are not available offline.
- **Other supported features:** Profile photos, event logos, event attachments, workspace switching/invitations, offline check-in queues, and Web NFC foundations.

## Validation

```bash
npm run lint
npx tsc --noEmit
npm run build
```
