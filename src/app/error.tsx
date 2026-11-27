"use client";

import { useEffect } from "react";
import { showPageErrorToast } from "@/components/toast-provider";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
    showPageErrorToast("Page could not be loaded. Please try again.");
  }, [error]);

  return (
    <main className="page-error" role="alert">
      <h1>Something went wrong</h1>
      <p>The page could not be loaded. Please try again.</p>
      <button className="button button-dark app-primary-button" onClick={retry} type="button">
        Try again
      </button>
    </main>
  );
}
