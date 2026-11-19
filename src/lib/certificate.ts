import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import PDFDocument from "pdfkit";
import fontkit from "@pdf-lib/fontkit";
import sharp from "sharp";
import { eventLogoPrefix } from "@/lib/event-logo";

type AttendanceCertificateInput = {
  attendeeName: string;
  eventName: string;
  eventStartsAt: Date;
  eventEndsAt: Date;
  checkedInAt: Date;
  timeZone: string;
  eventLogo?: string | null;
};

export class CertificateTextError extends Error {}

const resolvePackage = createRequire(`${process.cwd()}/package.json`);

const fontPaths = [
  ["venuguestpass-latin", "@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff"],
  ["venuguestpass-latin-ext", "@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff"],
  ["venuguestpass-vietnamese", "@fontsource/noto-sans/files/noto-sans-vietnamese-400-normal.woff"],
  ["venuguestpass-arabic", "@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff"],
  ["venuguestpass-japanese", "@fontsource/noto-sans-jp/files/noto-sans-jp-japanese-400-normal.woff"],
  ["venuguestpass-thai", "@fontsource/noto-sans-thai/files/noto-sans-thai-thai-400-normal.woff"],
  ["venuguestpass-cyrillic", "@fontsource/noto-sans/files/noto-sans-cyrillic-400-normal.woff"],
  ["venuguestpass-cyrillic-ext", "@fontsource/noto-sans/files/noto-sans-cyrillic-ext-400-normal.woff"],
  ["venuguestpass-greek", "@fontsource/noto-sans/files/noto-sans-greek-400-normal.woff"],
  ["venuguestpass-greek-ext", "@fontsource/noto-sans/files/noto-sans-greek-ext-400-normal.woff"],
  ["venuguestpass-devanagari", "@fontsource/noto-sans/files/noto-sans-devanagari-400-normal.woff"],
  ["certificate-outfit-regular", "./src/lib/fonts/Outfit-Regular.ttf"],
  ["certificate-outfit-medium", "./src/lib/fonts/Outfit-Medium.ttf"],
  ["certificate-libre-baskerville-bold", "./src/lib/fonts/LibreBaskerville-Bold.ttf"],
  ["certificate-libre-baskerville-bold-italic", "./src/lib/fonts/LibreBaskerville-BoldItalic.ttf"],
  ["certificate-monte-carlo", "./src/lib/fonts/MonteCarlo-Regular.ttf"],
] as const;

type FontResource = {
  name: string;
  bytes: Buffer;
  characterSet: Set<number>;
};

type CertificateFrameSlices = {
  topLeft: Buffer;
  topRight: Buffer;
  bottomLeft: Buffer;
  bottomRight: Buffer;
  topRule: Buffer;
  bottomRule: Buffer;
  leftRule: Buffer;
  rightRule: Buffer;
};

type CertificateLogo = {
  bytes: Buffer;
  width: number;
  height: number;
};

let fontResourcesPromise: Promise<FontResource[]> | undefined;
let certificateFramePromise: Promise<CertificateFrameSlices> | undefined;

function getFontResources() {
  fontResourcesPromise ??= Promise.all(fontPaths.map(async ([name, packagePath]) => {
    const bytes = await readFile(resolvePackage.resolve(packagePath));
    const font = fontkit.create(bytes);
    return { name, bytes, characterSet: new Set(font.characterSet) };
  }));
  return fontResourcesPromise;
}

function getCertificateFrame() {
  certificateFramePromise ??= Promise.all([
    readFile(resolvePackage.resolve("./src/lib/certificate-frame/top-left.png")),
    readFile(resolvePackage.resolve("./src/lib/certificate-frame/top-right.png")),
    readFile(resolvePackage.resolve("./src/lib/certificate-frame/bottom-left.png")),
    readFile(resolvePackage.resolve("./src/lib/certificate-frame/bottom-right.png")),
    readFile(resolvePackage.resolve("./src/lib/certificate-frame/top-rule.png")),
    readFile(resolvePackage.resolve("./src/lib/certificate-frame/bottom-rule.png")),
    readFile(resolvePackage.resolve("./src/lib/certificate-frame/left-rule.png")),
    readFile(resolvePackage.resolve("./src/lib/certificate-frame/right-rule.png")),
  ]).then(([topLeft, topRight, bottomLeft, bottomRight, topRule, bottomRule, leftRule, rightRule]) => ({
    topLeft,
    topRight,
    bottomLeft,
    bottomRight,
    topRule,
    bottomRule,
    leftRule,
    rightRule,
  }));
  return certificateFramePromise;
}

async function getCertificateLogo(eventLogo: string | null | undefined): Promise<CertificateLogo | null> {
  if (!eventLogo) return null;

  const encodedLogo = eventLogo.startsWith(eventLogoPrefix)
    ? eventLogo.slice(eventLogoPrefix.length)
    : null;
  if (!encodedLogo || !/^[A-Za-z0-9+/]+={0,2}$/.test(encodedLogo)) {
    throw new Error("Certificate event logo must be a valid WebP data URI.");
  }

  const { data, info } = await sharp(Buffer.from(encodedLogo, "base64"), {
    limitInputPixels: 512 * 512,
  }).png().toBuffer({ resolveWithObject: true });
  if (!info.width || !info.height) {
    throw new Error("Certificate event logo has invalid dimensions.");
  }
  return { bytes: data, width: info.width, height: info.height };
}

function formatCertificateDateRange(startsAt: Date, endsAt: Date, timeZone: string) {
  const yearFormatter = new Intl.DateTimeFormat("en", { year: "numeric", timeZone });
  const sameYear = yearFormatter.format(startsAt) === yearFormatter.format(endsAt);
  const formatDate = (date: Date, includeYear: boolean) => new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: includeYear ? "numeric" : undefined,
    timeZone,
  }).format(date);

  return `${formatDate(startsAt, !sameYear)} – ${formatDate(endsAt, true)}`;
}

function getTextRuns(text: string, fonts: FontResource[]) {
  const hasArabic = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/u.test(text);
  if (hasArabic && /\p{Script=Latin}/u.test(text)) {
    throw new CertificateTextError("Certificate text cannot mix Arabic and Latin scripts.");
  }

  const codePoints = Array.from(text, (character) => character.codePointAt(0)!);
  const wholeFont = fonts.find((font) => codePoints.every((codePoint) => font.characterSet.has(codePoint)));
  if (wholeFont) return [{ name: wholeFont.name, text }];

  const runs: Array<{ name: string; text: string }> = [];
  for (const character of Array.from(text)) {
    const codePoint = character.codePointAt(0)!;
    const font = fonts.find((candidate) => candidate.characterSet.has(codePoint));
    if (!font) {
      throw new CertificateTextError("Certificate fonts do not support all characters in the attendee or event name.");
    }
    const previous = runs[runs.length - 1];
    if (previous?.name === font.name) previous.text += character;
    else runs.push({ name: font.name, text: character });
  }
  return runs;
}

function getPreferredTextRuns(text: string, fonts: FontResource[], preferredFontName: string) {
  const preferredFont = fonts.find((font) => font.name === preferredFontName);
  const codePoints = Array.from(text, (character) => character.codePointAt(0)!);
  if (preferredFont && codePoints.every((codePoint) => preferredFont.characterSet.has(codePoint))) {
    return [{ name: preferredFont.name, text }];
  }
  return getTextRuns(text, fonts);
}

export async function generateAttendanceCertificate(input: AttendanceCertificateInput) {
  const [fonts, certificateFrame, eventLogo] = await Promise.all([
    getFontResources(),
    getCertificateFrame(),
    getCertificateLogo(input.eventLogo),
  ]);
  const document = new PDFDocument({ size: "A4", layout: "landscape", margin: 0 });
  const chunks: Buffer[] = [];
  const complete = new Promise<Buffer>((resolve, reject) => {
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const centerX = pageWidth / 2;
  const margin = 14;
  const cornerSize = 108;
  const contentWidth = pageWidth - 2 * (margin + cornerSize);
  const contentX = (pageWidth - contentWidth) / 2;
  const dates = formatCertificateDateRange(input.eventStartsAt, input.eventEndsAt, input.timeZone);
  const issuedDate = new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeZone: input.timeZone,
  }).format(input.checkedInAt);

  for (const font of fonts) document.registerFont(font.name, font.bytes);
  document.rect(0, 0, pageWidth, pageHeight).fill("#fbfaf5");
  drawCertificateFrame(document, certificateFrame, pageWidth, pageHeight, margin, cornerSize);
  const attendeeRuns = getPreferredTextRuns(input.attendeeName, fonts, "certificate-monte-carlo");
  const eventRuns = getPreferredTextRuns(input.eventName, fonts, "certificate-outfit-regular");

  if (eventLogo) {
    const pixelsToPoints = 72 / 96;
    const maxLogoWidth = 200 * pixelsToPoints;
    const maxLogoHeight = 54 * pixelsToPoints;
    const scale = Math.min(maxLogoWidth / eventLogo.width, maxLogoHeight / eventLogo.height);
    const logoWidth = eventLogo.width * scale;
    const logoHeight = eventLogo.height * scale;
    document.image(eventLogo.bytes, centerX - logoWidth / 2, 57.5 + (maxLogoHeight - logoHeight) / 2, {
      width: logoWidth,
      height: logoHeight,
    });
  } else {
    document.font("certificate-outfit-medium").fillColor("#2f4a3a").fontSize(9.5)
      .text("VENUGUESTPASS", margin, 70, {
        width: pageWidth - margin * 2,
        align: "center",
        characterSpacing: 1.2,
      });
  }
  drawArchedTitle(document, centerX, 116, 1050, 24, "#2f4a3a");
  drawCertificateLabel(document, "PROUDLY PRESENTED TO", contentX, 186, contentWidth);
  drawCenteredText(document, attendeeRuns, fonts, 70, contentX, 192, contentWidth, "#2f4a3a");
  drawDivider(document, centerX, 307, 160, "#b8964f");
  drawCertificateLabel(document, "IN RECOGNITION OF PARTICIPATION IN", contentX, 340, contentWidth);
  drawCenteredText(document, eventRuns, fonts, 24, contentX, 362, contentWidth, "#2f4a3a");
  drawCertificateLabel(document, "EVENT DATES", contentX, 424, contentWidth);
  document.font("certificate-outfit-regular").fillColor("#2f4a3a").fontSize(12)
    .text(dates, contentX, 441, { width: contentWidth, align: "center" });
  drawCertificateLabel(document, "ATTENDANCE VERIFIED", contentX, 487, contentWidth);
  document.font("certificate-outfit-regular").fillColor("#6b7568").fontSize(12)
    .text(`Issued ${issuedDate}`, contentX, 507, { width: contentWidth, align: "center" });

  document.end();
  return complete;
}

function drawCertificateLabel(document: PDFKit.PDFDocument, label: string, x: number, y: number, width: number) {
  document.font("certificate-outfit-medium").fillColor("#b8964f").fontSize(7.3)
    .text(label, x, y, { width, align: "center", characterSpacing: 2.2 });
}

function drawArchedTitle(
  document: PDFKit.PDFDocument,
  centerX: number,
  centerY: number,
  radius: number,
  fontSize: number,
  color: string,
) {
  const parts = [
    { text: "CERTIFICATE ", fontName: "certificate-libre-baskerville-bold" },
    { text: "of", fontName: "certificate-libre-baskerville-bold-italic" },
    { text: " ATTENDANCE", fontName: "certificate-libre-baskerville-bold" },
  ];
  const glyphs = parts.flatMap(({ text, fontName }) =>
    Array.from(text, (character) => {
      document.font(fontName).fontSize(fontSize);
      return { character, fontName, width: document.widthOfString(character) };
    }),
  );
  const totalWidth = glyphs.reduce((width, glyph) => width + glyph.width, 0);
  let cursorX = -totalWidth / 2;

  for (const glyph of glyphs) {
    const midpoint = cursorX + glyph.width / 2;
    const curveOffset = radius - Math.sqrt(radius ** 2 - midpoint ** 2);
    const angle = Math.asin(midpoint / radius) * (180 / Math.PI);
    document.save();
    document.translate(centerX + midpoint, centerY + curveOffset);
    document.rotate(angle);
    document.font(glyph.fontName).fontSize(fontSize).fillColor(color)
      .text(glyph.character, -glyph.width / 2, 0, { lineBreak: false });
    document.restore();
    cursorX += glyph.width;
  }
}

function drawCertificateFrame(
  document: PDFKit.PDFDocument,
  frame: CertificateFrameSlices,
  pageWidth: number,
  pageHeight: number,
  margin: number,
  cornerSize: number,
) {
  const scale = cornerSize / 180;
  const rightCornerX = pageWidth - margin - cornerSize;
  const lowerCornerY = pageHeight - margin - cornerSize;
  document.image(frame.topLeft, margin, margin, { width: cornerSize, height: cornerSize });
  document.image(frame.topRight, rightCornerX, margin, { width: cornerSize, height: cornerSize });
  document.image(frame.bottomLeft, margin, lowerCornerY, { width: cornerSize, height: cornerSize });
  document.image(frame.bottomRight, rightCornerX, lowerCornerY, { width: cornerSize, height: cornerSize });
  const ruleX = margin + cornerSize;
  const ruleWidth = pageWidth - ruleX * 2;
  const topRuleHeight = 21 * scale;
  const bottomRuleHeight = 26 * scale;
  const sideRuleWidth = 21 * scale;
  const sideRuleHeight = pageHeight - 2 * (margin + cornerSize);
  document.image(frame.topRule, ruleX, margin, { width: ruleWidth, height: topRuleHeight });
  document.image(frame.bottomRule, ruleX, pageHeight - margin - bottomRuleHeight, {
    width: ruleWidth,
    height: bottomRuleHeight,
  });
  document.image(frame.leftRule, margin, margin + cornerSize, {
    width: sideRuleWidth,
    height: sideRuleHeight,
  });
  document.image(frame.rightRule, pageWidth - margin - sideRuleWidth, margin + cornerSize, {
    width: sideRuleWidth,
    height: sideRuleHeight,
  });
}

function drawCenteredText(
  document: PDFKit.PDFDocument,
  runs: Array<{ name: string; text: string }>,
  fonts: FontResource[],
  maxSize: number,
  x: number,
  y: number,
  maxWidth: number,
  color: string,
) {
  const widthAtMaxSize = runs.reduce((width, run) => {
    document.font(run.name).fontSize(maxSize);
    return width + document.widthOfString(run.text);
  }, 0);
  const fontSize = widthAtMaxSize > 0
    ? Math.min(maxSize, Math.max(9, maxSize * maxWidth / widthAtMaxSize))
    : maxSize;
  const widthAtFontSize = runs.reduce((width, run) => {
    document.font(run.name).fontSize(fontSize);
    return width + document.widthOfString(run.text);
  }, 0);
  let cursorX = x + (maxWidth - widthAtFontSize) / 2;

  for (const run of runs) {
    const font = fonts.find((candidate) => candidate.name === run.name);
    if (!font) throw new Error("Certificate font could not be loaded.");
    document.font(run.name).fontSize(fontSize).fillColor(color);
    document.text(run.text, cursorX, y, { lineBreak: false });
    cursorX += document.widthOfString(run.text);
  }

  return fontSize;
}

function drawDiamond(document: PDFKit.PDFDocument, x: number, y: number, radius: number, color: string) {
  document.moveTo(x, y - radius)
    .lineTo(x + radius, y)
    .lineTo(x, y + radius)
    .lineTo(x - radius, y)
    .closePath()
    .fill(color);
}

function drawDivider(document: PDFKit.PDFDocument, centerX: number, y: number, width: number, color: string) {
  document.lineWidth(0.7).strokeColor(color)
    .moveTo(centerX - width / 2, y).lineTo(centerX - 9, y)
    .moveTo(centerX + 9, y).lineTo(centerX + width / 2, y)
    .stroke();
  drawDiamond(document, centerX, y, 3.2, color);
}
