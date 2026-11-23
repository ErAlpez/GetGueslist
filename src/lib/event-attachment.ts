export const maxEventAttachmentBytes = 2 * 1024 * 1024;
export const maxEventAttachmentsPerEvent = 10;

const extensionByContentType: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export function detectEventAttachmentContentType(bytes: Uint8Array): string | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (
    bytes.length >= 16 &&
    ascii(4, 8) === "ftyp" &&
    (["avif", "avis"].includes(ascii(8, 12)) ||
      Array.from({ length: Math.floor((Math.min(bytes.length, 64) - 16) / 4) }, (_, index) =>
        ascii(16 + index * 4, 20 + index * 4),
      ).some((brand) => brand === "avif" || brand === "avis"))
  ) {
    return "image/avif";
  }
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return "application/pdf";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function normalizeEventAttachmentFileName(fileName: string, contentType: string): string {
  const extension = extensionByContentType[contentType];
  if (!extension) throw new Error("Unsupported event attachment content type.");

  const basename = fileName.replaceAll("\\", "/").split("/").pop() ?? "";
  const safeName = basename.replace(/[\u0000-\u001f\u007f]/g, "_").trim();
  const stem = (safeName.replace(/\.[^.]*$/, "") || "attachment").slice(0, 150);
  return `${stem}.${extension}`;
}

export function normalizeEventAttachmentOriginalFileName(fileName: string): string {
  const basename = fileName.replaceAll("\\", "/").split("/").pop() ?? "";
  const safeName = basename.replace(/[\u0000-\u001f\u007f]/g, "_").trim();
  return (safeName || "attachment").slice(0, 180);
}

export function eventAttachmentContentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 120) || "attachment";
  const encodedName = encodeURIComponent(fileName).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodedName}`;
}
