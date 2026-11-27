import { toBuffer } from "qrcode";
import { formatEventDateRange } from "@/lib/datetime";
import { translate, type Locale } from "@/lib/localization";
import { sendResendEmail } from "@/lib/api";

type AuthEmail = {
  to: string;
  subject: string;
  url: string;
  message?: string;
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

type AutomatedReminderEmail = {
  to: string;
  guestName: string;
  eventName: string;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  ticketId: string;
  ticketUrl: string;
};

type AutomatedFollowupEmail = {
  to: string;
  guestName: string;
  eventName: string;
  feedbackUrl: string;
};

type AttendanceCertificateEmail = {
  to: string;
  guestName: string;
  eventName: string;
  certificateUrl: string;
  certificatePdf: Uint8Array;
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

export async function sendAuthEmail({ to, subject, url, message }: AuthEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "development") {
      console.info(`[VenuGuestPass email preview] ${subject} for ${to}: ${url}`);
      return;
    }

    throw new Error("Set RESEND_API_KEY and EMAIL_FROM to enable email delivery.");
  }

  const response = await sendResendEmail(apiKey, from, {
      to: [to],
      subject,
      html: `${message ? `<p>${escapeHtml(message).replace(/\r?\n/g, "<br />")}</p>` : ""}<p>Continue securely with VenuGuestPass:</p><p><a href="${escapeHtml(url)}">${escapeHtml(subject)}</a></p>`,
      ...(message ? { text: `${message}\n\n${subject}: ${url}` } : {}),
  }, { signal: AbortSignal.timeout(10_000) });

  if (!response.ok) {
    throw new Error(`Email delivery failed with status ${response.status}.`);
  }
}

export async function sendSignInOTPEmail(to: string, otp: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "development") {
      console.info(`[VenuGuestPass sign-in code preview] ${to}: ${otp}`);
      return;
    }

    throw new Error("Set RESEND_API_KEY and EMAIL_FROM to enable sign-in code delivery.");
  }

  const subject = "Your VenuGuestPass sign-in code";
  const text = `Your sign-in code is ${otp}. It expires in 5 minutes. If you did not request it, you can ignore this email.`;
  const response = await sendResendEmail(apiKey, from, {
    to: [to],
    subject,
    html: `<p>Use this one-time code to finish signing in:</p><p style="font-size:24px;font-weight:700;letter-spacing:6px">${escapeHtml(otp)}</p><p>This code expires in 5 minutes. If you did not request it, you can ignore this email.</p>`,
    text,
  }, { signal: AbortSignal.timeout(10000) });

  if (!response.ok) {
    throw new Error(`Sign-in code delivery failed with status ${response.status}.`);
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
  const response = await sendResendEmail(apiKey, from, {
    to: [to],
    subject: translate(locale, "Your digital event ticket"),
    signal: AbortSignal.timeout(10000),
    html: `<h1>${label("Your digital event ticket")}</h1><p>${escapeHtml(guestName)}</p><h2>${escapeHtml(eventName)}</h2><p>${escapeHtml(dates.start)} - ${escapeHtml(dates.end)}</p><p>${label("Ticket ID")}: ${escapeHtml(ticketId)}</p><p><img src="cid:ticket-qr" width="320" height="320" alt="${label("QR ticket code")}" /></p><p>${label("Present this QR code at check-in")}</p><p><a href="${escapeHtml(ticketUrl)}">${label("Open digital ticket")}</a></p><p>${label("Keep this ticket private. It grants entry to the event.")}</p>`,
    text: `${translate(locale, "Your digital event ticket")}\n${guestName}\n${eventName}\n${dates.start} - ${dates.end}\n${translate(locale, "Ticket ID")}: ${ticketId}\n${translate(locale, "Open digital ticket")}: ${ticketUrl}\n${translate(locale, "Keep this ticket private. It grants entry to the event.")}`,
    attachments: [{ filename: "ticket-qr.png", content: qr.toString("base64"), content_id: "ticket-qr" }],
  }, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Ticket email delivery failed with status ${response.status}.`);
}

export async function sendAutomatedReminderEmail({
  to,
  guestName,
  eventName,
  startsAt,
  endsAt,
  timeZone,
  ticketId,
  ticketUrl,
}: AutomatedReminderEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Set RESEND_API_KEY and EMAIL_FROM to enable automated reminder emails.");

  const dates = formatEventDateRange(startsAt, endsAt, timeZone, "en");
  const qr = await toBuffer(ticketUrl, {
    width: 320,
    margin: 4,
    errorCorrectionLevel: "M",
    color: { dark: "#244b3e", light: "#ffffff" },
  });
  const response = await sendResendEmail(apiKey, from, {
    to: [to],
    subject: "Your event is tomorrow",
    html: `<h1>Your event is coming up</h1><p>Hello ${escapeHtml(guestName)},</p><p><strong>${escapeHtml(eventName)}</strong> starts tomorrow.</p><p>${escapeHtml(dates.start)} - ${escapeHtml(dates.end)}</p><p>Your ticket ID is ${escapeHtml(ticketId)}. Present the attached QR code at check-in.</p><p><img src="cid:ticket-qr" width="320" height="320" alt="QR ticket code" /></p><p><a href="${escapeHtml(ticketUrl)}">Open your digital ticket</a></p><p>Keep this ticket private. It grants entry to the event.</p>`,
    text: `Your event is coming up\nHello ${guestName},\n${eventName} starts tomorrow.\n${dates.start} - ${dates.end}\nYour ticket ID is ${ticketId}. Present the attached QR code at check-in.\nOpen your digital ticket: ${ticketUrl}\nKeep this ticket private. It grants entry to the event.`,
    attachments: [{ filename: "ticket-qr.png", content: qr.toString("base64"), content_id: "ticket-qr" }],
  }, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Automated reminder email delivery failed with status ${response.status}.`);
}

export async function sendAutomatedFollowupEmail({
  to,
  guestName,
  eventName,
  feedbackUrl,
}: AutomatedFollowupEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Set RESEND_API_KEY and EMAIL_FROM to enable automated follow-up emails.");

  const response = await sendResendEmail(apiKey, from, {
    to: [to],
    subject: "How was your event?",
    html: `<h1>Thank you for attending</h1><p>Hello ${escapeHtml(guestName)},</p><p>We hope you enjoyed <strong>${escapeHtml(eventName)}</strong>. Please share your feedback using the short form below.</p><p><a href="${escapeHtml(feedbackUrl)}">Share event feedback</a></p>`,
    text: `Thank you for attending\nHello ${guestName},\nWe hope you enjoyed ${eventName}. Please share your feedback using the short form below.\nShare event feedback: ${feedbackUrl}`,
  }, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Automated follow-up email delivery failed with status ${response.status}.`);
}

export async function sendAttendanceCertificateEmail({
  to,
  guestName,
  eventName,
  certificateUrl,
  certificatePdf,
}: AttendanceCertificateEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Set RESEND_API_KEY and EMAIL_FROM to enable certificate email delivery.");

  const response = await sendResendEmail(apiKey, from, {
    to: [to],
    subject: `Your certificate for ${eventName}`,
    html: `<h1>Your attendance certificate</h1><p>${escapeHtml(guestName)}, thank you for attending <strong>${escapeHtml(eventName)}</strong>.</p><p>Your personalized certificate is attached. You can also <a href="${escapeHtml(certificateUrl)}">download it from your ticket page</a>.</p>`,
    text: `Your attendance certificate\n${guestName}, thank you for attending ${eventName}.\nYour personalized certificate is attached. Download it from your ticket page: ${certificateUrl}`,
    attachments: [{
      filename: "attendance-certificate.pdf",
      content: Buffer.from(certificatePdf).toString("base64"),
    }],
  }, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Certificate email delivery failed with status ${response.status}.`);
}

export async function sendFeedbackEmail({ rating, message, email, workspaceName }: FeedbackEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "development") {
      console.info(`[VenuGuestPass feedback preview] ${rating}/5 from ${email} (${workspaceName}): ${message}`);
      return;
    }

    throw new Error("Feedback delivery is unavailable. Please try again later.");
  }

  const response = await sendResendEmail(apiKey, from, {
    to: ["support@venuguestpass.com"],
    reply_to: email,
    subject: `VenuGuestPass feedback: ${rating}/5`,
    html: `<p><strong>Rating:</strong> ${rating}/5</p><p><strong>From:</strong> ${escapeHtml(email)}</p><p><strong>Workspace:</strong> ${escapeHtml(workspaceName)}</p><hr /><p>${escapeHtml(message).replace(/\r?\n/g, "<br />")}</p>`,
  });

  if (!response.ok) {
    throw new Error(`Feedback delivery failed with status ${response.status}.`);
  }
}

