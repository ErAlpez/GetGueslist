import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { CalendarDays, Clock3, MapPin } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { PublicRegistrationForm } from "@/components/public-registration-form";
import { getPrisma } from "@/lib/prisma";
import {
  isRegistrationQuestionType,
  readRegistrationQuestionOptions,
} from "@/lib/registration-form";
import { getPreferences } from "@/lib/preferences";
import { readEventLogo } from "@/lib/event-logo";
import { localizeNode } from "@/lib/localization";
import { formatEventDate, formatEventDateRange } from "@/lib/datetime";

type PublicRegistrationPageProps = {
  params: Promise<{ eventId: string }>;
};

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Event registration",
  robots: { index: false, follow: false },
};

export default async function PublicRegistrationPage({ params }: PublicRegistrationPageProps) {
  const [{ eventId }, { locale }] = await Promise.all([params, getPreferences()]);
  const event = await getPrisma().event.findFirst({
    where: { id: eventId, archivedAt: null },
    include: {
      settings: true,
      modules: { where: { key: { in: ["rsvp", "meals", "sessions"] } } },
      registrationForm: {
        include: { questions: { orderBy: { position: "asc" } } },
      },
    },
  });
  if (!event || event.visibility === "INVITE_ONLY") notFound();

  const now = new Date();
  const canRegister =
    ["PUBLISHED", "REGISTRATION_OPEN", "ONGOING"].includes(event.status) &&
    event.settings?.allowRegistration !== false &&
    event.settings?.requireApproval !== true &&
    event.registrationForm?.published !== false &&
    event.endsAt > now &&
    (!event.registrationDeadline || event.registrationDeadline > now);
  const registrationQuestions = event.registrationForm?.questions.flatMap((question) => {
    if (!isRegistrationQuestionType(question.type)) return [];
    return [{
      id: question.id,
      label: question.label,
      type: question.type,
      required: question.required,
      options: readRegistrationQuestionOptions(question.options),
    }];
  }) ?? [];
  const direction = locale === "ar" ? "rtl" : "ltr";
  const eventLogo = readEventLogo(event.settings?.customBranding);
  const eventDates = formatEventDateRange(event.startsAt, event.endsAt, event.timezone, locale);
  const rsvpModule = (event.modules ?? []).find((module) => module.key === "rsvp");
  const mealModule = (event.modules ?? []).find((module) => module.key === "meals");
  const sessionModule = (event.modules ?? []).find((module) => module.key === "sessions");
  const readObject = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const mealSettings = readObject(mealModule?.settings);
  const mealOptions = Array.isArray(mealSettings.options)
    ? mealSettings.options.filter((option): option is string => typeof option === "string")
    : [];
  const sessionSettings = readObject(sessionModule?.settings);
  let sessionOptions: Array<{ id: string; name: string; startsAt?: string }> = [];
  try {
    if (typeof sessionSettings.sessionsJson === "string") {
      const parsed = JSON.parse(sessionSettings.sessionsJson);
      if (Array.isArray(parsed)) {
        sessionOptions = parsed.flatMap((session) => {
          if (!session || typeof session !== "object") return [];
          const value = session as Record<string, unknown>;
          if (typeof value.name !== "string") return [];
          return [{
            id: typeof value.id === "string" ? value.id : value.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            name: value.name,
            startsAt: typeof value.startsAt === "string" ? value.startsAt : undefined,
          }];
        });
      }
    }
  } catch {
    sessionOptions = [];
  }

  return localizeNode((
    <main className="public-registration-page" dir={direction} lang={locale}>
      <div className="public-registration-wrap">
        <Link className="public-registration-brand" href="/">
          <BrandMark /><span>VenuGuestPass</span>
        </Link>
        <section className="public-registration-card">
          <div className="public-registration-heading">
            {eventLogo && <Image alt="" className="public-registration-event-logo" height={100} src={eventLogo} unoptimized width={200} />}
            <span className="public-registration-kicker">{canRegister ? "Registration open" : "Event registration"}</span>
            <h1>{event.name}</h1>
            <p>{event.description || "Complete your details to register for this event."}</p>
          </div>
          <div className="public-registration-meta">
            <div className="public-registration-meta-item">
              <CalendarDays aria-hidden="true" size={15} />
              <div><strong>{"Date"}{":"}</strong>{" "}<time dateTime={event.startsAt.toISOString()}>{eventDates.start}</time>{" - "}<time dateTime={event.endsAt.toISOString()}>{eventDates.end}</time></div>
            </div>
            {event.registrationDeadline && (
              <div className="public-registration-meta-item">
                <Clock3 aria-hidden="true" size={15} />
                <div><strong>{"Registration deadline"}{":"}</strong>{" "}<time dateTime={event.registrationDeadline.toISOString()}>{formatEventDate(event.registrationDeadline, event.timezone, locale)}</time></div>
              </div>
            )}
            {(event.venue || event.address) && (
              <div className="public-registration-meta-item">
                <MapPin aria-hidden="true" size={15} />
                <div className="public-registration-meta-location">
                  {event.venue && <div><strong>{"Venue"}{":"}</strong>{" "}{event.venue}</div>}
                  {event.address && <div><strong>{"Address"}{":"}</strong>{" "}{event.address}</div>}
                </div>
              </div>
            )}
          </div>
          {canRegister ? (
            <>
              <div className="public-registration-form-heading">
                <h2>Register for this event</h2>
                <p>Complete the form to receive your ticket.</p>
              </div>
              <PublicRegistrationForm
                eventId={event.id}
                mealOptions={mealModule?.enabled ? mealOptions : []}
                questions={registrationQuestions}
                rsvp={rsvpModule?.enabled ? {
                  allowMaybe: readObject(rsvpModule.settings).allowMaybe !== false,
                } : null}
                sessions={sessionModule?.enabled ? sessionOptions : []}
              />
            </>
          ) : (
            <p className="public-registration-closed" role="status">
              {event.settings?.requireApproval
                ? "This event requires organizer approval. Please contact the organizer."
                : "Registration is not available for this event."}
            </p>
          )}
        </section>
        <p className="public-registration-footer">Powered by <strong>VenuGuestPass</strong></p>
      </div>
    </main>
  ), locale);
}
