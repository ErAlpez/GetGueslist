import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";
import { getCurrentSession } from "@/lib/auth";
import { getPreferences } from "@/lib/preferences";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms for people registering for or attending events through Guestlist.",
  robots: { index: true, follow: true },
};

export default async function TermsPage() {
  const [{ locale }, session] = await Promise.all([getPreferences(), getCurrentSession()]);

  return (
    <LegalDocument locale={locale} session={session} title="Terms of Service">
      <p>
        These Terms apply when you use Guestlist to view event information, register or RSVP, access a ticket, or check
        in to an event.
      </p>

      <section>
        <h2>1. Using Guestlist</h2>
        <p>
          By using Guestlist for an event, you agree to these Terms. Provide accurate information when registering and
          use the service only for its intended event-related purposes.
        </p>
      </section>

      <section>
        <h2>2. Registration, tickets, and check-in</h2>
        <p>
          Event organizers set registration requirements and decide whether to approve registrations or admit attendees.
          Keep ticket links and QR codes private. A ticket may be checked or rejected by the organizer under that
          event’s conditions.
        </p>
      </section>

      <section>
        <h2>3. Event organizers</h2>
        <p>
          Guestlist provides tools that organizers use to manage event attendance and is not the event organizer.
          Organizers are responsible for event details, admission decisions, cancellations, refunds, and responding to
          event-related questions. Contact the organizer for help with an event or its requirements.
        </p>
      </section>

      <section>
        <h2>4. Your information</h2>
        <p>
          The <a href="/privacy">Privacy Policy</a> explains how Guestlist handles information. The event organizer may
          also have its own privacy information and requirements for the event.
        </p>
      </section>

      <section>
        <h2>5. Acceptable use</h2>
        <p>You may not use Guestlist to:</p>
        <ul>
          <li>Break the law, infringe another person’s rights, or engage in fraud.</li>
          <li>Misuse another attendee’s information or ticket.</li>
          <li>Interfere with the service or attempt unauthorized access to accounts or systems.</li>
        </ul>
      </section>

      <section>
        <h2>6. Service availability and access</h2>
        <p>
          Guestlist may not always be available or error-free. We may restrict access when needed to protect users or
          the service, prevent misuse, or comply with law. Nothing in these Terms limits rights that cannot be limited
          under applicable law.
        </p>
      </section>
    </LegalDocument>
  );
}
