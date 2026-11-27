"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Upload, X } from "lucide-react";
import { beginBackgroundJobToast, watchBackgroundJob } from "@/components/background-job-toast";
import { updateToast } from "@/components/toast-provider";
import {
  importGuestsFromCsvAction,
  previewGuestCsvImportAction,
  type GuestCsvImportState,
  type GuestCsvPreviewState,
} from "@/app/dashboard/attendees/actions";

const csvTemplate = [
  "First name,Last name,Email,Phone,Company,Position,Category",
  "Jordan,Lee,jordan@example.com,+639171234567,Acme,Designer,GENERAL",
  "Taylor,Reed,taylor@example.com,,,,VIP",
].join("\r\n");
const csvTemplateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csvTemplate)}`;

export function GuestCsvImport({
  events,
  initialEventId,
}: {
  events: Array<{ id: string; name: string }>;
  initialEventId: string;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [eventId, setEventId] = useState(initialEventId);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<GuestCsvPreviewState | null>(null);
  const [result, setResult] = useState<GuestCsvImportState | null>(null);
  const [actionError, setActionError] = useState("");
  const [pendingAction, setPendingAction] = useState<"preview" | "import" | null>(null);
  const isPending = pendingAction !== null;
  const [jobRunning, setJobRunning] = useState(false);
  const isBusy = isPending || jobRunning;
  const [isOpen, setIsOpen] = useState(false);

  const runPreview = () => {
    if (!eventId || !file) {
      setActionError(!eventId ? "Choose an event first." : "Choose a CSV file first.");
      return;
    }

    setActionError("");
    setResult(null);
    setPendingAction("preview");
    void (async () => {
      try {
        const formData = new FormData();
        formData.set("eventId", eventId);
        formData.set("file", file);
        setPreview(await previewGuestCsvImportAction(formData));
      } catch (error) {
        console.error("Could not preview guest CSV:", error);
        setActionError("Could not preview this file. Check your connection and try again.");
      } finally {
        setPendingAction(null);
      }
    })();
  };

  const runImport = () => {
    if (!eventId || !file || jobRunning) return;

    setActionError("");
    setResult(null);
    setPendingAction("import");
    setJobRunning(true);
    const toastId = beginBackgroundJobToast("Importing guests...");
    void (async () => {
      try {
        const formData = new FormData();
        formData.set("eventId", eventId);
        formData.set("file", file);
        const queued = await importGuestsFromCsvAction(formData);
        if (queued.error) {
          updateToast(toastId, queued.error, "error");
          setResult(queued);
          setPendingAction(null);
          return;
        }
        if (!queued.jobId) throw new Error("Could not queue the guest import.");
        setPendingAction(null);
        const completed = await watchBackgroundJob(queued.jobId, toastId, (job) => {
          const result = readImportResult(job.result);
          if (!result) return "Guest import completed.";
          return `Imported ${result.importedCount} ${result.importedCount === 1 ? "guest" : "guests"}${result.skippedRows.length ? `; ${result.skippedRows.length} row${result.skippedRows.length === 1 ? "" : "s"} skipped` : ""}.`;
        });
        if (completed.status === "FAILED") {
          setResult({ error: completed.error ?? "The guest import could not be completed." });
          return;
        }

        const importResult = readImportResult(completed.result);
        if (!importResult) throw new Error("The guest import result was invalid.");
        setResult(importResult);
        if (importResult.importedCount) {
          setFile(null);
          setPreview(null);
          if (fileInput.current) fileInput.current.value = "";
          router.refresh();
        }
      } catch (error) {
        console.error("Could not import guest CSV:", error);
        const message = "Could not import this file. Check your connection and try again.";
        updateToast(toastId, message, "error");
        setActionError(message);
      } finally {
        setPendingAction(null);
        setJobRunning(false);
      }
    })();
  };

  const rows = preview?.rows ?? [];
  const readyCount = rows.filter((row) => row.error === null).length;
  const skippedCount = rows.length - readyCount;
  const issueRows = result?.skippedRows ?? [];

  return (
    <div className="guest-csv-import">
      <button
        aria-expanded={isOpen}
        className="button button-light guest-csv-import-trigger"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        {isOpen ? <X size={14} /> : <Upload size={14} />}
        {isOpen ? "Close import" : "Import CSV"}
      </button>
      {isOpen && (
        <section aria-label="Import guests from CSV" className="guest-csv-import-popover">
          <div className="guest-csv-import-heading">
            <div><strong>Import guests</strong><p>Upload a CSV to create registrations and QR tickets.</p></div>
            <a download="attendees-import-template.csv" href={csvTemplateHref}>Download template</a>
          </div>
          <p className="guest-csv-import-help">
            Required columns: First name, Last name, Email. Phone, Company, Position, and Category are optional.
            Up to 1,000 guests per file; existing contacts are reused, and guests already registered are skipped.
            QR tickets are created but aren’t emailed automatically.
          </p>
          <label className="guest-csv-import-field">
            Event
            <select
              disabled={isBusy || events.length === 0}
              onChange={(event) => {
                setEventId(event.target.value);
                setPreview(null);
                setResult(null);
                setActionError("");
              }}
              value={eventId}
            >
              <option value="">Choose an event</option>
              {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
            </select>
          </label>
          <label className="guest-csv-import-field">
            CSV file
            <input
              accept=".csv,text/csv"
              disabled={isBusy}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPreview(null);
                setResult(null);
                setActionError("");
              }}
              ref={fileInput}
              type="file"
            />
          </label>
          <button
            className="button button-light guest-csv-import-preview"
            disabled={isBusy || !eventId || !file}
            onClick={runPreview}
            type="button"
          >
            {isPending && pendingAction === "preview" && <LoaderCircle className="spin" size={14} />}
            Preview guests
          </button>

          {preview?.error && <p className="form-message form-error" role="alert">{preview.error}</p>}
          {preview?.rows && (
            <div className="guest-csv-preview">
              <p className="guest-csv-preview-summary" role="status">
                {readyCount} ready to import · {skippedCount} will be skipped
              </p>
              <div className="guest-csv-preview-scroll">
                <table>
                  <thead><tr><th>Row</th><th>Guest</th><th>Email</th><th>Category</th><th>Result</th></tr></thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td>{row.rowNumber}</td>
                        <td>{[row.firstName, row.lastName].filter(Boolean).join(" ") || "—"}</td>
                        <td>{row.email || "—"}</td>
                        <td>{row.category.replaceAll("_", " ")}</td>
                        <td className={row.error ? "guest-csv-row-error" : "guest-csv-row-ready"}>
                          {row.error ?? "Ready"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                className="button button-dark app-primary-button guest-csv-import-submit"
                data-toast-managed="true"
                disabled={isBusy || readyCount === 0}
                onClick={runImport}
                type="button"
              >
                {(pendingAction === "import" || jobRunning) && <LoaderCircle className="spin" size={14} />}
                Import {readyCount} {readyCount === 1 ? "guest" : "guests"}
              </button>
            </div>
          )}

          {result?.error && <p className="form-message form-error" role="alert">{result.error}</p>}
          {result?.importedCount !== undefined && !result.error && (
            <>
              {result.importedCount === 0 && <p className="form-message" role="status">No guests were imported.</p>}
              {issueRows.length > 0 && (
                <details className="guest-csv-import-issues">
                  <summary>{issueRows.length} row{issueRows.length === 1 ? "" : "s"} skipped</summary>
                  <ul>{issueRows.map((issue) => <li key={`${issue.rowNumber}:${issue.message}`}>Row {issue.rowNumber}: {issue.message}</li>)}</ul>
                </details>
              )}
            </>
          )}
          {actionError && <p className="form-message form-error" role="alert">{actionError}</p>}
        </section>
      )}
    </div>
  );
}

function readImportResult(value: unknown): { importedCount: number; skippedRows: Array<{ rowNumber: number; message: string }> } | null {
  if (typeof value !== "object" || value === null || !("importedCount" in value) || !("skippedRows" in value)) {
    return null;
  }
  const { importedCount, skippedRows } = value;
  if (
    typeof importedCount !== "number"
    || !Array.isArray(skippedRows)
    || !skippedRows.every((issue) => typeof issue === "object" && issue !== null
      && "rowNumber" in issue && typeof issue.rowNumber === "number"
      && "message" in issue && typeof issue.message === "string")
  ) {
    return null;
  }
  return { importedCount, skippedRows };
}
