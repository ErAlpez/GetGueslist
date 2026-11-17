import { toBuffer } from "qrcode";
import { formatEventDateRange } from "@/lib/datetime";
import { translate, type Locale } from "@/lib/localization";

type AuthEmail = {
  to: string;
  subject: string;
  url: string;
};

type FeedbackEmail = {
  rating: number;
  message: string;
  email: string;
  workspaceName: string;
};

type TicketEmail = {
  to: string;
  guestName: string;
  eventName: string;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  ticketId: string;
  ticketUrl: string;
  locale: Locale;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

export async function sendAuthEmail({ to, subject, url }: AuthEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "development") {
      console.info(`[Guestlist email preview] ${subject} for ${to}: ${url}`);
      return;
    }

    throw new Error("Set RESEND_API_KEY and EMAIL_FROM to enable email delivery.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html: `<p>Continue securely with Guestlist:</p><p><a href="${escapeHtml(url)}">${escapeHtml(subject)}</a></p>`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Email delivery failed with status ${response.status}.`);
  }
}

export async function sendTicketEmail({ to, guestName, eventName, startsAt, endsAt, timeZone, ticketId, ticketUrl, locale }: TicketEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Set RESEND_API_KEY and EMAIL_FROM to enable ticket email delivery.");

  const dates = formatEventDateRange(startsAt, endsAt, timeZone, locale);
  const qr = await toBuffer(ticketUrl, {
    width: 320,
    margin: 4,
    errorCorrectionLevel: "M",
    color: { dark: "#244b3e", light: "#ffffff" },
  });
  const label = (text: string) => escapeHtml(translate(locale, text));
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      from,
      to: [to],
      subject: translate(locale, "Your digital event ticket"),
      html: `<h1>${label("Your digital event ticket")}</h1><p>${escapeHtml(guestName)}</p><h2>${escapeHtml(eventName)}</h2><p>${escapeHtml(dates.start)} - ${escapeHtml(dates.end)}</p><p>${label("Ticket ID")}: ${escapeHtml(ticketId)}</p><p><img src="cid:ticket-qr" width="320" height="320" alt="${label("QR ticket code")}" /></p><p>${label("Present this QR code at check-in")}</p><p><a href="${escapeHtml(ticketUrl)}">${label("Open digital ticket")}</a></p><p>${label("Keep this ticket private. It grants entry to the event.")}</p>`,
      text: `${translate(locale, "Your digital event ticket")}\n${guestName}\n${eventName}\n${dates.start} - ${dates.end}\n${translate(locale, "Ticket ID")}: ${ticketId}\n${translate(locale, "Open digital ticket")}: ${ticketUrl}\n${translate(locale, "Keep this ticket private. It grants entry to the event.")}`,
      attachments: [{ filename: "ticket-qr.png", content: qr.toString("base64"), content_id: "ticket-qr" }],
    }),
  });
  if (!response.ok) throw new Error(`Ticket email delivery failed with status ${response.status}.`);
}

export async function sendFeedbackEmail({ rating, message, email, workspaceName }: FeedbackEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "development") {
      console.info(`[Guestlist feedback preview] ${rating}/5 from ${email} (${workspaceName}): ${message}`);
      return;
    }

    throw new Error("Feedback delivery is unavailable. Please try again later.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: ["hello@guestlist.app"],
      reply_to: email,
      subject: `Guestlist feedback: ${rating}/5`,
      html: `<p><strong>Rating:</strong> ${rating}/5</p><p><strong>From:</strong> ${escapeHtml(email)}</p><p><strong>Workspace:</strong> ${escapeHtml(workspaceName)}</p><hr /><p>${escapeHtml(message).replace(/\r?\n/g, "<br />")}</p>`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Feedback delivery failed with status ${response.status}.`);
  }
}

