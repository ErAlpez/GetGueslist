"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { isTrackedPublicPath } from "@/lib/website-analytics";
import { usePreferences } from "@/components/preferences-provider";

const consentKey = "venguestpass-analytics-consent-v1";
const consentChangeEvent = "venguestpass-analytics-consent-change";
const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim() ?? "";

type ConsentChoice = "accepted" | "rejected" | null;

declare global {
  interface Window {
    plausible?: (eventName: "pageview", options?: { url: string }) => void;
  }
}

function getConsentSnapshot(): ConsentChoice {
  try {
    const stored = window.localStorage.getItem(consentKey);
    return stored === "accepted" || stored === "rejected" ? stored : null;
  } catch (error) {
    console.error("Analytics consent could not be read from this device.", error);
    return null;
  }
}

function subscribeToConsent(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(consentChangeEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(consentChangeEvent, onChange);
  };
}

export function AnalyticsConsent() {
  const { t } = usePreferences();
  const pathname = usePathname();
  const consent = useSyncExternalStore(subscribeToConsent, getConsentSnapshot, () => undefined);
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptError, setScriptError] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const isPublicPage = isTrackedPublicPath(pathname);
  const configured = /^[A-Za-z0-9.-]+$/.test(plausibleDomain);

  useEffect(() => {
    if (consent !== "accepted" || !isPublicPage || !scriptReady) return;
    window.plausible?.("pageview", { url: `${window.location.origin}${pathname}` });
  }, [consent, isPublicPage, pathname, scriptReady]);

  function chooseConsent(value: "accepted" | "rejected") {
    try {
      window.localStorage.setItem(consentKey, value);
    } catch (error) {
      console.error("Analytics consent could not be saved on this device.", error);
      setStorageError(true);
    }
    window.dispatchEvent(new Event(consentChangeEvent));
  }

  if (consent === undefined || !configured || !isPublicPage) return null;

  return (
    <>
      {consent === "accepted" && (
        <Script
          data-domain={plausibleDomain}
          id="plausible-analytics"
          onError={() => {
            console.error("Plausible Analytics script failed to load.");
            setScriptError(true);
          }}
          onReady={() => setScriptReady(true)}
          src="https://plausible.io/js/script.manual.js"
          strategy="afterInteractive"
        />
      )}
      {consent === null ? (
        <aside aria-labelledby="analytics-consent-title" className="analytics-consent-banner" role="dialog">
          <div>
            <strong id="analytics-consent-title">{t("Privacy choices")}</strong>
            <p>{t("Allow Plausible Analytics to receive page views on public pages? It is off unless you opt in.")}</p>
            {storageError && <small role="status">{t("Your choice could not be saved on this device.")}</small>}
          </div>
          <div className="analytics-consent-actions">
            <button onClick={() => chooseConsent("rejected")} type="button">{t("Decline")}</button>
            <button onClick={() => chooseConsent("accepted")} type="button">{t("Allow analytics")}</button>
          </div>
        </aside>
      ) : (
        <button
          className="analytics-privacy-button"
          onClick={() => {
            try {
              window.localStorage.removeItem(consentKey);
            } catch (error) {
              console.error("Analytics preference could not be reopened on this device.", error);
              setStorageError(true);
            }
            window.dispatchEvent(new Event(consentChangeEvent));
          }}
          type="button"
        >
          {t("Privacy choices")}
        </button>
      )}
      {scriptError && consent === "accepted" && (
        <span className="analytics-script-error" role="status">{t("Analytics could not be loaded.")}</span>
      )}
    </>
  );
}
