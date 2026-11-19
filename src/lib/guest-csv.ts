import { z } from "zod";
import { attendeeCategories } from "@/lib/attendee-categories";

export type ParsedGuestCsvRow = {
  rowNumber: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  position: string;
  category: (typeof attendeeCategories)[number];
  error: string | null;
};

type CsvRecord = {
  lineNumber: number;
  cells: string[];
};

const maxCsvBytes = 900_000;
const maxCsvRows = 1_000;

const guestRowSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(100, "First name must be 100 characters or fewer."),
  lastName: z.string().trim().min(1, "Last name is required.").max(100, "Last name must be 100 characters or fewer."),
  email: z.string().trim().pipe(z.email("Enter a valid email address.")).transform((value) => value.toLowerCase()),
  phone: z.string().trim().max(40, "Phone must be 40 characters or fewer."),
  company: z.string().trim().max(120, "Company must be 120 characters or fewer."),
  position: z.string().trim().max(120, "Position must be 120 characters or fewer."),
  category: z.string().trim().transform((value) => (value || "GENERAL").replace(/[\s-]+/g, "_").toUpperCase())
    .pipe(z.enum(attendeeCategories)),
});

function parseCsvRecords(text: string): { records?: CsvRecord[]; error?: string } {
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let lineNumber = 1;
  let recordLineNumber = 1;

  const finishRecord = () => {
    cells.push(cell);
    if (cells.some((value) => value.trim() !== "")) records.push({ lineNumber: recordLineNumber, cells });
    cells = [];
    cell = "";
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else if (character === "\r" || character === "\n") {
        cell += "\n";
        if (character === "\r" && text[index + 1] === "\n") index += 1;
        lineNumber += 1;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') {
      if (cell.length > 0) return { error: `Unexpected quote on line ${lineNumber}.` };
      quoted = true;
    } else if (character === ",") {
      cells.push(cell);
      cell = "";
    } else if (character === "\r" || character === "\n") {
      finishRecord();
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      lineNumber += 1;
      recordLineNumber = lineNumber;
    } else {
      cell += character;
    }
  }

  if (quoted) return { error: "The CSV contains an unclosed quoted field." };
  if (cells.length > 0 || cell.length > 0) finishRecord();
  return { records };
}

function normalizeHeader(value: string) {
  return value.trim().replace(/^\uFEFF/, "").toLowerCase().replace(/[\s_-]+/g, "");
}

export function parseGuestCsv(text: string): { rows?: ParsedGuestCsvRow[]; error?: string } {
  if (new TextEncoder().encode(text).byteLength > maxCsvBytes) {
    return { error: "CSV files must be 900 KB or smaller." };
  }

  const parsed = parseCsvRecords(text);
  if (!parsed.records) return { error: parsed.error ?? "Could not read the CSV file." };

  const [headerRecord, ...dataRecords] = parsed.records;
  if (!headerRecord) return { error: "The CSV file is empty." };
  if (dataRecords.length === 0) return { error: "The CSV has headers but no guest rows." };
  if (dataRecords.length > maxCsvRows) return { error: "Import up to 1,000 guests per CSV file." };

  const headers = headerRecord.cells.map(normalizeHeader);
  if (new Set(headers).size !== headers.length) {
    return { error: "The CSV contains duplicate column names." };
  }

  const requiredHeaders = ["firstname", "lastname", "email"];
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length) {
    return { error: "Include First name, Last name, and Email columns in the CSV." };
  }

  const headerIndex = (name: string) => headers.indexOf(name);
  const seenEmails = new Map<string, number>();
  const rows = dataRecords.map(({ cells, lineNumber }): ParsedGuestCsvRow => {
    const getValue = (column: string) => {
      const index = headerIndex(column);
      return index < 0 ? "" : cells[index] ?? "";
    };

    if (cells.length > headers.length && cells.slice(headers.length).some((value) => value.trim() !== "")) {
      return {
        rowNumber: lineNumber,
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        company: "",
        position: "",
        category: "GENERAL",
        error: "This row has more columns than the header.",
      };
    }

    const candidate = {
      firstName: getValue("firstname"),
      lastName: getValue("lastname"),
      email: getValue("email"),
      phone: getValue("phone"),
      company: getValue("company"),
      position: getValue("position"),
      category: getValue("category"),
    };
    const validation = guestRowSchema.safeParse(candidate);

    if (!validation.success) {
      return {
        rowNumber: lineNumber,
        firstName: candidate.firstName.trim(),
        lastName: candidate.lastName.trim(),
        email: candidate.email.trim(),
        phone: candidate.phone.trim(),
        company: candidate.company.trim(),
        position: candidate.position.trim(),
        category: "GENERAL",
        error: validation.error.issues[0]?.message ?? "Check this row’s values.",
      };
    }

    const guest = validation.data;
    const duplicateLine = seenEmails.get(guest.email);
    if (duplicateLine) {
      return {
        rowNumber: lineNumber,
        ...guest,
        error: `This email is already listed on row ${duplicateLine}.`,
      };
    }
    seenEmails.set(guest.email, lineNumber);

    return { rowNumber: lineNumber, ...guest, error: null };
  });

  return { rows };
}
