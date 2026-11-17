"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Languages, Moon, Sun } from "lucide-react";
import { locales } from "@/lib/localization";
import { usePreferences } from "@/components/preferences-provider";

export function PreferenceControls() {
  return (
    <div className="preference-controls">
      <LanguageControl />
      <ThemeToggle />
    </div>
  );
}

export function LanguageControl() {
  const { locale, setLocale, t } = usePreferences();
  const [languageOpen, setLanguageOpen] = useState(false);
  const languageControlRef = useRef<HTMLDivElement>(null);
  const languageTriggerRef = useRef<HTMLButtonElement>(null);
  const languageOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedLocale = locales.find((item) => item.code === locale) ?? locales[0];

  useEffect(() => {
    if (!languageOpen) return;

    languageOptionRefs.current[locales.findIndex((item) => item.code === locale)]?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !languageControlRef.current?.contains(event.target)) {
        setLanguageOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setLanguageOpen(false);
        languageTriggerRef.current?.focus();
      }
    }

    function handleFocusIn(event: FocusEvent) {
      if (event.target instanceof Node && !languageControlRef.current?.contains(event.target)) {
        setLanguageOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, [languageOpen, locale]);

  return (
    <div className={`language-control${languageOpen ? " is-open" : ""}`} ref={languageControlRef}>
      <button
        aria-controls="language-options"
        aria-expanded={languageOpen}
        aria-haspopup="listbox"
        aria-label={`${t("Choose language")}: ${selectedLocale.name}`}
        className="language-trigger"
        onClick={() => setLanguageOpen((current) => !current)}
        ref={languageTriggerRef}
        type="button"
      >
        <span aria-hidden="true" className="language-trigger-icon"><Languages size={15} /></span>
        <span aria-hidden="true" className="language-trigger-code">{selectedLocale.code.toUpperCase()}</span>
        <span className="language-trigger-name">{selectedLocale.name}</span>
        <ChevronDown aria-hidden="true" className="language-trigger-chevron" size={13} />
      </button>
      {languageOpen && (
        <div className="language-popover">
          <div className="language-popover-heading">
            <span aria-hidden="true" className="language-popover-mark"><Languages size={15} /></span>
            <span>
              <strong>{t("Choose language")}</strong>
              <small>{selectedLocale.name}</small>
            </span>
          </div>
          <div aria-label={t("Choose language")} className="language-options" id="language-options" role="listbox">
            {locales.map((item, index) => (
              <button
                aria-selected={locale === item.code}
                className="language-option"
                key={item.code}
                onClick={() => {
                  setLocale(item.code);
                  setLanguageOpen(false);
                  languageTriggerRef.current?.focus();
                }}
                onKeyDown={(event) => {
                  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
                  event.preventDefault();
                  const nextIndex = event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? locales.length - 1
                      : (index + (event.key === "ArrowDown" ? 1 : -1) + locales.length) % locales.length;
                  languageOptionRefs.current[nextIndex]?.focus();
                }}
                ref={(element) => {
                  languageOptionRefs.current[index] = element;
                }}
                role="option"
                tabIndex={locale === item.code ? 0 : -1}
                type="button"
              >
                <span aria-hidden="true" className="language-option-code">{item.code.toUpperCase()}</span>
                <span className="language-option-name">{item.name}</span>
                {locale === item.code && <Check aria-hidden="true" className="language-option-check" size={15} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ThemeToggle() {
  const { theme, toggleTheme, t } = usePreferences();

  return (
    <button
      aria-label={t(theme === "dark" ? "Use light theme" : "Use dark theme")}
      className="theme-toggle"
      onClick={toggleTheme}
      title={t(theme === "dark" ? "Use light theme" : "Use dark theme")}
      type="button"
    >
      {theme === "dark" ? <Sun aria-hidden="true" size={16} /> : <Moon aria-hidden="true" size={16} />}
    </button>
  );
}
