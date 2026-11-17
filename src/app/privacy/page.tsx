import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";
import { getCurrentSession } from "@/lib/auth";
import { getPreferences } from "@/lib/preferences";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Guestlist handles information for people registering for or attending events.",
  robots: { index: true, follow: true },
};

export default async function PrivacyPage() {
  const [{ locale }, session] = await Promise.all([getPreferences(), getCurrentSession()]);

  return (
    <LegalDocument locale={locale} session={session} title="Privacy Policy">
      <p>
        This policy explains how Guestlist handles information when you view event details, register or RSVP, receive a
        ticket, or check in to an event. Guestlist provides tools that event organizers use to manage attendance.
      </p>

      <section>
        <h2>1. Guestlist and event organizers</h2>
        <p>
          The event organizer decides which details are requested for an event and how they are used. Guestlist handles
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
            status, check-in record, and any payment status provided to Guestlist.
          </li>
          <li>
            <strong>Account and technical information:</strong> if you use a Guestlist account, account and sign-in
            records, session identifiers, and technical details such as your browser and IP address that help operate
            and protect the service.
          </li>
          <li>
            <strong>Messages and preferences:</strong> information you include when contacting support, along with
            language and appearance preferences.
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
          Guestlist uses authentication cookies to keep a signed-in session working. It also stores the
          <code> guestlist-locale </code> and <code> guestlist-theme </code> preference cookies so the selected language
          and appearance can be remembered. These preference cookies are set for one year and use the Lax SameSite
          attribute.
        </p>
        <p>
          Guestlist does not use advertising or third-party analytics cookies for event registration.
        </p>
      </section>

      <section>
        <h2>5. When information is shared</h2>
        <p>Information may be shared only as needed with:</p>
        <ul>
          <li>Event organizers and people they authorize to manage registrations and attendance.</li>
          <li>
            Service providers that support the operation and security of Guestlist, including delivery of transactional
            emails.
          </li>
          <li>Authorities or other parties when disclosure is required by law or needed to protect rights and safety.</li>
        </ul>
        <p>We do not sell personal information for money as part of the current Guestlist service.</p>
      </section>

      <section>
        <h2>6. Retention and deletion</h2>
        <p>
          Guestlist retains information for as long as needed to provide the service, support event records, protect the
          service, and meet legal obligations. For requests about registration or attendance information, contact the
          event organizer; we may coordinate with them to respond.
        </p>
      </section>

      <section>
        <h2>7. Security</h2>
        <p>
          Guestlist uses technical and organizational measures intended to protect information. No online service can
          promise absolute security.
        </p>
      </section>

      <section>
        <h2>8. Your privacy choices</h2>
        <p>
          You may have privacy rights under applicable law, including rights to request access to, correction of, or
          deletion of your information. Contact the event organizer first about registration or attendance information.
          For questions about Guestlist or your account, use the contact email below. We may need to verify your request.
        </p>
      </section>
    </LegalDocument>
  );
}
