import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";
import { getCurrentSession } from "@/lib/auth";
import { getPreferences } from "@/lib/preferences";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How VenuGuestPass handles information for people registering for or attending events.",
  robots: { index: true, follow: true },
};

export default async function PrivacyPage() {
  const [{ locale }, session] = await Promise.all([getPreferences(), getCurrentSession()]);

  return (
    <LegalDocument locale={locale} session={session} title="Privacy Policy">
      <p>
        This policy explains how VenuGuestPass handles information when you view event details, register or RSVP, receive a
        ticket, or check in to an event. VenuGuestPass provides tools that event organizers use to manage attendance.
      </p>

      <section>
        <h2>1. VenuGuestPass and event organizers</h2>
        <p>
          The event organizer decides which details are requested for an event and how they are used. VenuGuestPass handles
          registration and attendance information to provide the service. For questions about an event’s requirements or
          the organizer’s use of your information, contact that organizer.
        </p>
      </section>

      <section>
        <h2>2. Information handled</h2>
        <ul>
          <li>
            <strong>Registration details:</strong> information you provide, such as your name, email address, phone number,
            and answers to an organizer’s registration questions.
          </li>
          <li>
            <strong>Event attendance information:</strong> the event you register for, your RSVP, ticket or registration
            status and check-in record.
          </li>
          <li>
            <strong>Account and technical information:</strong> if you use a VenuGuestPass account, account and sign-in
            records, session identifiers, and technical details such as your browser and IP address that help operate
            and protect the service.
          </li>
          <li>
            <strong>Messages and preferences:</strong> information you include when contacting support, along with
            language and appearance preferences.
          </li>
          <li>
            <strong>Owner reviews:</strong> an owner’s rating and message, workspace name, and choice about public display.
            A review is not published unless the owner opts in and a VenuGuestPass administrator approves it.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. How information is used</h2>
        <p>We use information as needed to:</p>
        <ul>
          <li>Record and manage event registrations, RSVPs, tickets, and check-ins for organizers.</li>
          <li>Send event-related messages and, when applicable, account verification or recovery messages.</li>
          <li>Provide support, maintain the service, and diagnose technical problems.</li>
          <li>Protect the service, prevent misuse, and meet legal obligations.</li>
        </ul>
      </section>

      <section>
        <h2>4. Cookies and similar storage</h2>
        <p>
          VenuGuestPass uses authentication cookies to keep a signed-in session working. It also stores the
          <code> guestlist-locale </code> and <code> guestlist-theme </code> preference cookies so the selected language
          and appearance can be remembered. These preference cookies are set for one year and use the Lax SameSite
          attribute.
        </p>
        <p>
          When you use offline attendee tools, the most recently viewed attendee page and queued guest-registration
          details are saved in this browser on this device. Queued registrations are removed after the server confirms
          them or when you sign out. Avoid using offline attendee tools on a shared device.
        </p>
        <p>
          Third-party analytics is optional and off by default. If Plausible Analytics is configured and you opt in,
          its script receives page views only on the public home and legal pages. We do not send guest names, email
          addresses, or workspace account details to Plausible. You can change this choice using the Privacy choices
          control on those pages.
        </p>
        <p>
          We also count page views on the public home and legal pages using first-party, daily aggregate statistics.
          We do not set analytics cookies, create unique visitor identifiers, or store full IP addresses for this
          measurement. On Vercel hosting, the aggregate may include the country code supplied by Vercel; on other
          hosts, location is recorded as unknown.
        </p>
      </section>

      <section>
        <h2>5. When information is shared</h2>
        <p>Information may be shared only as needed with:</p>
        <ul>
          <li>Event organizers and people they authorize to manage registrations and attendance.</li>
          <li>
            Service providers that support the operation and security of VenuGuestPass, including delivery of transactional
            emails and storage of workspace files. If enabled by your opt-in, Plausible Analytics also receives public-page
            view events.
          </li>
          <li>
            If a workspace owner opts in and an administrator approves a 5-star review, the review message, owner name,
            and workspace name are displayed on the public homepage.
          </li>
          <li>Authorities or other parties when disclosure is required by law or needed to protect rights and safety.</li>
        </ul>
        <p>We do not sell personal information for money as part of the current VenuGuestPass service.</p>
      </section>

      <section>
        <h2>6. Retention and deletion</h2>
        <p>
          VenuGuestPass retains information for as long as needed to provide the service, support event records, protect the
          service, and meet legal obligations. For requests about registration or attendance information, contact the
          event organizer; we may coordinate with them to respond.
        </p>
      </section>

      <section>
        <h2>7. Security</h2>
        <p>
          VenuGuestPass uses technical and organizational measures intended to protect information. No online service can
          promise absolute security.
        </p>
      </section>

      <section>
        <h2>8. Your privacy choices</h2>
        <p>
          You may have privacy rights under applicable law, including rights to request access to, correction of, or
          deletion of your information. Contact the event organizer first about registration or attendance information.
          For questions about VenuGuestPass or your account, use the contact email below. Workspace owners may also ask
          us to hide a published review. We may need to verify your request.
        </p>
      </section>
    </LegalDocument>
  );
}
