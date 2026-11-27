import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";
import { getCurrentSession } from "@/lib/auth";
import { getPreferences } from "@/lib/preferences";

export const metadata: Metadata = {
  title: "Refund and Cancellation Policy",
  description: "Refund and cancellation terms for VenuGuestPass paid plans.",
  robots: { index: true, follow: true },
};

export default async function RefundPolicyPage() {
  const [{ locale }, session] = await Promise.all([getPreferences(), getCurrentSession()]);

  return (
    <LegalDocument locale={locale} session={session} title="Refund and Cancellation Policy">
      <p>
        This policy applies to paid VenuGuestPass plans. Payments for paid plans are processed through Paddle.
      </p>

      <section>
        <h2>1. Refunds</h2>
        <p>
          Except where a refund is required by applicable law, paid plan purchases are non-refundable. We do not provide
          partial refunds for unused time, a change of plan, or cancellation before the end of a paid period.
        </p>
      </section>

      <section>
        <h2>2. Cancellation and access</h2>
        <p>
          If you cancel a renewal, the cancellation applies to future renewals and does not remove access you have already
          paid for. Paid plan features remain available until the end of the paid access period shown in your account.
          After that period ends, access follows the plan then available to your workspace.
        </p>
      </section>

      <section>
        <h2>3. Billing questions</h2>
        <p>
          If you believe a charge is incorrect or need help with cancellation, contact{" "}
          <a href="mailto:support@venuguestpass.com">support@venuguestpass.com</a> and include your workspace name and relevant
          transaction details. Do not send full payment card numbers by email.
        </p>
      </section>

      <section>
        <h2>4. Event ticket refunds</h2>
        <p>
          VenuGuestPass provides event-management tools and is not the event organizer. Contact the event organizer about
          refunds or cancellations for an event ticket or registration.
        </p>
      </section>
    </LegalDocument>
  );
}
