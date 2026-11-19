import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin } from "lucide-react";
import { EventFeedbackForm } from "@/components/event-feedback-form";
import { getEventFeedbackTicket } from "@/lib/event-feedback";
import { formatEventDateRange } from "@/lib/datetime";
import { getPreferences } from "@/lib/preferences";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return {
    title: "Event feedback",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

type EventFeedbackPageProps = {
  params: Promise<{ token: string }>;
};

export default async function EventFeedbackPage({ params }: EventFeedbackPageProps) {
  const [{ locale }, { token }] = await Promise.all([getPreferences(), params]);
  const ticket = await getEventFeedbackTicket(token);
  if (!ticket) notFound();

  const event = ticket.registration.event;
  const dates = formatEventDateRange(event.startsAt, event.endsAt, event.timezone, locale);
  const feedback = ticket.registration.feedback;

  return (
    <main className="public-feedback-page">
      <div className="public-feedback-wrap">
        <Link className="public-feedback-brand" href="/">VenuGuestPass</Link>
        <article className="public-feedback-card">
          <header className="public-feedback-heading">
            <span className="public-feedback-kicker">EVENT FEEDBACK</span>
            <h1>How was your experience?</h1>
            <p>Thank you for attending. Your feedback helps the event team improve.</p>
          </header>
          <section className="public-feedback-event">
            <h2>{event.name}</h2>
            <span><CalendarDays size={16} />{dates.start} - {dates.end}</span>
            {event.venue && <span><MapPin size={16} />{event.venue}</span>}
          </section>
          {feedback ? (
            <div className="public-feedback-existing" role="status">
              <strong>Thank you for your feedback.</strong>
              <span>Your rating: {feedback.rating} / 5</span>
              {feedback.message && <p>{feedback.message}</p>}
            </div>
          ) : (
            <EventFeedbackForm token={token} />
          )}
        </article>
        <p className="public-feedback-footer">Your response is shared with the event organizers.</p>
      </div>
    </main>
  );
}
